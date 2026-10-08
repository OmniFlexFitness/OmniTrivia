import { AnswerMargin, Question, Category, QuestionType, CategoryContent, PinTarget } from '../types';
import { CATEGORIES, DEFAULT_QUESTION_BANK } from '../constants';
import { unplayableReason } from './questionQuality';
import { parseQuestionType } from './questionTypes';
import { MAP_FRAMES, MAP_PREFIX, geoFromPinTarget, geoPinTarget, mapKeyFor } from './mapProjection';

/**
 * What a spreadsheet puts between cells when it saves as text. Excel writes
 * semicolons where the decimal mark is a comma, and tab-separated values is a
 * download option in Google Sheets and Excel both.
 */
type Delimiter = ',' | ';' | '\t';
const DELIMITERS: readonly Delimiter[] = [',', ';', '\t'];

// Simple CSV parser that handles quoted fields
const parseCSVLine = (line: string, delimiter: Delimiter = ','): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && inQuotes && line[i + 1] === '"') {
            // A doubled quote inside a quoted field is one literal quote: how
            // Excel and Google Sheets write `the "quiet" one` into a CSV.
            current += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
};

const REQUIRED_COLUMNS = ['category', 'question', 'correctanswer'];

/** A header line's column names, the way the columns are looked up. */
const headings = (line: string, delimiter: Delimiter): string[] =>
    parseCSVLine(line.toLowerCase(), delimiter).map((name) => name.replace(/\s/g, ''));

/**
 * Which delimiter a file uses, and its column names split by it: the one that
 * finds the required columns in the header row. A comma inside one heading
 * cannot outvote the tabs between them, and one inside quotes is not a
 * delimiter at all. When none finds them, the one that splits the header into
 * most cells, so the error names the column that is really missing.
 *
 * Quotes are read the same way whatever the delimiter, so a cell cut by a
 * line break comes up short and is left out in any of them. Excel quotes a
 * cell in a tab-separated file the way it does in a CSV. Google Sheets writes
 * one as it stands, and the quotation marks in it are read as quoting and
 * dropped: the text survives, the marks do not.
 */
const detectDelimiter = (header: string): { delimiter: Delimiter; names: string[] } => {
    const splits = DELIMITERS.map((delimiter) => ({ delimiter, names: headings(header, delimiter) }));
    return (
        splits.find(({ names }) => REQUIRED_COLUMNS.every((column) => names.includes(column))) ??
        splits.reduce((best, split) => (split.names.length > best.names.length ? split : best))
    );
};

/**
 * Case, surrounding whitespace and repeated spaces ignored.
 *
 * Deliberately the same comparison the scoring service makes, so an answer the
 * importer treats as matching is an answer the game marks correct.
 */
const normalize = (value: string): string =>
    value.toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * The same, minus the two things that stop a hand-written answer key matching
 * the option it points at: a parenthetical gloss ("Tampa (Ybor City)") and a
 * leading article ("The Nile" against an option that just reads "Nile").
 */
const loosen = (value: string): string =>
    normalize(value.replace(/\([^)]*\)/g, ' ')).replace(/^(the|a|an)\s+/, '');

/**
 * Which option the `correctAnswer` cell means.
 *
 * Exact match first. Failing that, an answer key written more fully than the
 * option it points at is resolved — "The Nile" for "Nile", "Tampa (Ybor City)"
 * for "Tampa", "Old Town Road by Lil Nas X" for "Old Town Road" — but only
 * when exactly one option can possibly be meant, it is there in whole words,
 * and it is more than a letter, a two-letter code or a number.
 *
 * Returning -1 matters as much as the matching does. This used to fall back to
 * the first option, so a mismatch in the answer column did not fail the import:
 * it quietly made option 1 correct, and the first anyone knew about it was a
 * room being told the Amazon is the longest river.
 */
const resolveCorrectIndex = (options: string[], correctAnswer: string): number => {
    const exact = options.findIndex(
        (option) => normalize(option) === normalize(correctAnswer),
    );
    if (exact !== -1) return exact;

    const answer = loosen(correctAnswer);
    if (!answer) return -1;

    const loose = options.map(loosen);
    const only = (hits: number[]): number => (hits.length === 1 ? hits[0] : -1);

    const equal = only(
        loose.reduce<number[]>(
            (hits, option, i) => (option === answer ? [...hits, i] : hits),
            [],
        ),
    );
    if (equal !== -1) return equal;

    // Being part of something longer counts in whole words — "Old Town Road"
    // in "Old Town Road by Lil Nas X", not "USA" in Jerusalem or "Art" in
    // Mozart — and only for something long enough to mean one thing. "B" is
    // a word of "Vitamin B", "1" of "1 million" and "UN" of "UN Security
    // Council", so a letter, a two-letter code or a bare number never matches
    // that way, whichever side it is on.
    const words = (value: string): string[] => value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const within = (part: string, whole: string): boolean => {
        const needle = words(part);
        // Counted without punctuation, so "U.S." is as short as "US".
        const letters = needle.join('');
        if (letters.length <= 2 || !/\p{L}/u.test(letters)) return false;
        const haystack = words(whole);
        return (
            needle.length > 0 &&
            haystack.some((_, start) => needle.every((word, i) => haystack[start + i] === word))
        );
    };
    return only(
        loose.reduce<number[]>(
            (hits, option, i) =>
                within(answer, option) || within(option, answer) ? [...hits, i] : hits,
            [],
        ),
    );
};

/**
 * An answer that names an option by its place instead of its text — "B",
 * "b)", "(2)", "Option 3" — which is how a printed answer key is written, and
 * means nothing once the options are shuffled. Only called once the answer
 * has matched no option, so a question whose options really are A, B and AB
 * is not caught by it.
 */
const isOptionPosition = (answer: string, optionCount: number): boolean => {
    const match = answer.trim().match(/^(?:option\s*)?\(?([a-z]|\d{1,2})[).:]{0,2}$/i);
    if (!match) return false;
    const position = /\d/.test(match[1])
        ? Number(match[1])
        : match[1].toLowerCase().charCodeAt(0) - 96;
    return position >= 1 && position <= optionCount;
};

const POSITION_ANSWER = "the answer is an option's letter or number — write the option itself";

/**
 * A bare answer cell turned into the spellings a typed answer will accept.
 *
 * The answer as written comes first, because that is what the reveal puts on
 * the big screen. What follows is how a player is actually going to type it:
 * one item out of a list ("name as many as you can" is a round nobody answers
 * in full), the answer without its parenthetical gloss, and the gloss alone.
 */
export const acceptedSpellings = (correctAnswer: string): string[] => {
    const canonical = correctAnswer.trim();
    if (!canonical) return [];

    const spellings = [canonical];
    const add = (value: string): void => {
        const trimmed = value.trim();
        if (
            trimmed.length > 1 &&
            !spellings.some((existing) => normalize(existing) === normalize(trimmed))
        ) {
            spellings.push(trimmed);
        }
    };

    // A list answer accepts any one of its items. Marking a player wrong for
    // naming three theme parks out of ten is worse than marking them right,
    // and the host has the full list on the reveal either way. Skipped when the
    // commas are thousands separators rather than list separators.
    if (/[,;]/.test(canonical) && !/\d[,.]\d/.test(canonical)) {
        canonical.split(/[,;]/).forEach(add);
    }

    add(canonical.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' '));
    const gloss = canonical.match(/\(([^)]*)\)/);
    if (gloss) add(gloss[1]);

    return spellings;
};

/** A row an import read and then refused to play, and why. */
export interface SkippedRow {
    /** 1-based, counting the header, so it matches the row number in a sheet. */
    row: number;
    question: string;
    reason: string;
}

export interface ImportReport {
    contents: { [categoryId: string]: CategoryContent };
    /**
     * Rows that parsed but were eliminated as unplayable — placeholder answers,
     * or nothing to choose between. Reported so the host is told how much of
     * their file was left out, rather than finding out from a short round.
     */
    skipped: SkippedRow[];
}

/**
 * An icon and a colour for a category the app has never heard of.
 *
 * The wheel shows a category as its icon and its colour and nothing else — the
 * name is only announced once it stops — so every imported category needs
 * both, and they need to differ. Every one of them used to arrive as a grey ❓,
 * which on a names-free wheel is three identical slices.
 *
 * The icon comes from what the name is about where that is obvious, and from
 * a stable hash of the name where it is not; the colour always from the hash.
 * Stable matters: the host, the projector and every phone draw the same slice.
 */
const CATEGORY_ICON_RULES: [RegExp, string][] = [
    [/women in sport/, '🏆'],
    [/rom-?com|romance|love/, '💘'],
    [/sitcom/, '🛋️'],
    [/reality/, '🌹'],
    [/video game|gaming/, '🎮'],
    [/movie|film|cinema/, '🎬'],
    [/binge|\btv\b|television|series|show/, '📺'],
    [/broadway|musical|theat/, '🎭'],
    [/girl group|voice|diva|hitmaker|singer|vocal/, '🎤'],
    [/music|song|band|album/, '🎵'],
    [/book club|reading/, '📖'],
    [/book|literat|novel|author|poet/, '📚'],
    [/royal|celebrit|icon|famous/, '👑'],
    [/fashion|beauty|style|makeup/, '💄'],
    [/fitness|gym|workout|strength|lift/, '🏋️'],
    [/nutrition|diet|supplement/, '🥗'],
    [/health|body|anatom|medic/, '🫀'],
    [/holiday|tradition|christmas|festiv/, '🎄'],
    [/internet|meme|social media|online/, '📡'],
    [/tech|computer|software|gadget/, '💻'],
    [/brand|everyday|product|logo/, '🏷️'],
    [/current event|news|politic/, '📰'],
    [/florida|local|hometown/, '🌴'],
    [/nature|animal|wildlife|zoo/, '🦁'],
    [/drink|cocktail|beer|wine/, '🍹'],
    [/food|cook|cuisine|kitchen/, '🍔'],
    [/general knowledge|trivia|misc|random/, '🧠'],
    [/geograph|travel|world|countr|capital/, '🌍'],
    [/histor/, '📜'],
    [/space|astronom|planet/, '🚀'],
    [/science|chem|physic|biolog/, '🔬'],
    [/sport|athlet/, '🏅'],
    [/\bpop\b/, '✨'],
    [/\bart\b|paint|design/, '🎨'],
];

const FALLBACK_CATEGORY_ICONS = ['🎲', '🧩', '💡', '🔮', '🛰️', '⚡', '🌀', '🪐', '🎯', '🧪'];

const CATEGORY_COLORS = [
    'bg-cyan-500', 'bg-fuchsia-500', 'bg-violet-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-lime-500',
    'bg-orange-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500',
];

const nameHash = (value: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

export const styleForCategory = (name: string): { icon: string; color: string } => {
    const key = name.toLowerCase().trim();
    const hash = nameHash(key);
    const rule = CATEGORY_ICON_RULES.find(([pattern]) => pattern.test(key));
    return {
        icon: rule ? rule[1] : FALLBACK_CATEGORY_ICONS[hash % FALLBACK_CATEGORY_ICONS.length],
        color: CATEGORY_COLORS[hash % CATEGORY_COLORS.length],
    };
};

/* ------------------------------------------------------------------ *
 * One row, whatever wrote it
 *
 * A spreadsheet row and a question Claude has just written arrive in the same
 * shape — a type, the question, some options, an answer — so they go through
 * the same converter. That is what keeps a generated pin question and an
 * imported one graded by exactly the same rules.
 * ------------------------------------------------------------------ */

/** A question as a row: every cell as the author typed it. */
export interface QuestionRow {
    type?: string;
    category: string;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation?: string;
    image?: string;
    margin?: string;
    unit?: string;
    timeLimit?: string;
    /**
     * What the file put between cells. It says how far a comma or a point in
     * a number can be trusted: see `readsTwoWays`.
     */
    separator?: Delimiter;
}

export type RowResult = { question: Question } | { skip: string };

/** "medium", "Med", "max", "exact" — the five margins, spelled loosely. */
export const parseMargin = (value: string | undefined): AnswerMargin | undefined => {
    const key = (value ?? '').trim().toLowerCase();
    if (!key) return undefined;
    if (/^(none|off|exact|no|0|strict)$/.test(key)) return 'none';
    if (/^(low|small|tight|narrow)$/.test(key)) return 'low';
    if (/^(medium|med|mid|normal|moderate)$/.test(key)) return 'medium';
    if (/^(high|large|wide|loose|generous)$/.test(key)) return 'high';
    if (/^(max|maximum|all|any|anything)$/.test(key)) return 'maximum';
    return undefined;
};

/** The first number in a cell — "About 384,000 km" reads as 384000. */
const leadingNumber = (value: string | undefined): number | null => {
    const match = (value ?? '').replace(/(\d),(?=\d{3}\b)/g, '$1').match(/-?\d*\.?\d+(?:e[+-]?\d+)?/i);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
};

/** "1968-1970", "1968 – 1970", "1968 to 1970", or one number for both ends. */
const numberBand = (value: string): [number, number] | null => {
    const band = value
        .replace(/(\d),(?=\d{3}\b)/g, '$1')
        .match(/^\s*(-?\d*\.?\d+)\s*(?:-|–|—|to)\s*(-?\d*\.?\d+)\s*$/i);
    if (band) {
        const low = Number(band[1]);
        const high = Number(band[2]);
        return [Math.min(low, high), Math.max(low, high)];
    }
    const single = leadingNumber(value);
    return single === null ? null : [single, single];
};

/**
 * A short unit written after the answer — "384,400 km" gives "km", "98.6 °F"
 * gives "°F". The number has to be everything before it, and a unit starts
 * like one and has no digits in it: so "1968-1970", "1968 to 1970", "98.6" and
 * "8,849" have no unit, rather than "-1970", "to 1970", ".6" and ",849".
 */
const trailingUnit = (value: string): string | undefined => {
    const match = value
        .trim()
        .match(/^(?=-?\.?\d)-?(?:\d[\d,\s]*)?(?:\.\d+)?\s*([^\d\s.,\-–—][^\d]{0,11})$/);
    return match ? match[1].trim() : undefined;
};

/**
 * Whether a number cell could mean two different numbers, so reading it would
 * be a guess. The game writes decimals with a point, and in a comma-separated
 * file a comma before exactly three digits groups thousands ("384,400"). Any
 * other comma between digits ("26,6406", "3,14", "1968,1970") is a decimal
 * comma or a typo. A file separated by semicolons or tabs may come from where
 * the comma is the decimal mark (Excel writes semicolons there), so in it any
 * comma between digits reads two ways ("3,142"), and with semicolons a point
 * before exactly three digits does too ("10.000", "1.609").
 */
const readsTwoWays = (cell: string | undefined, separator: Delimiter = ','): boolean => {
    const value = cell ?? '';
    return (
        // The same thousands rule `leadingNumber` reads by.
        /\d,(?!\d{3}\b)\d/.test(value) ||
        (separator !== ',' && /\d,\d/.test(value)) ||
        (separator === ';' && /\d\.\d{3}(?!\d)/.test(value))
    );
};

const TWO_WAY_NUMBER = 'a number reads two ways — write it with a decimal point and no thousands separator';

/**
 * "Au = Gold", "France -> Paris", "Tomato → Fruit": an item and its partner.
 * Split at the first separator, so the partner may itself contain an "=".
 */
const PAIR_SEPARATOR = /\s*(?:→|=>|->|::|=)\s*/;
export const parsePair = (value: string): [string, string] | null => {
    const match = value.match(PAIR_SEPARATOR);
    if (!match || match.index === undefined) return null;
    const left = value.slice(0, match.index).trim();
    const right = value.slice(match.index + match[0].length).trim();
    return left && right ? [left, right] : null;
};

const TRUE_WORDS = /^(true|t|yes|y|fact|correct|1)$/i;
const FALSE_WORDS = /^(false|f|no|n|fiction|incorrect|myth|0)$/i;

/** Default pin radii, when a question gives a spot but not how near counts. */
const DEFAULT_PIN_RADIUS_KM: Record<string, number> = { world: 500, usa: 150 };
const DEFAULT_PIN_RADIUS_PERCENT = 6;

/** A list cell split on pipes: "Mars|Venus" or "First | Second". */
const pipeList = (value: string): string[] =>
    value.split(/\s*[|;]\s*/).map((item) => item.trim()).filter(Boolean);

/**
 * Turn one row into a question, or say why it cannot be one.
 *
 * Everything a type needs is read here and nowhere else, so the import, the
 * question bank and generated questions all agree on what a row means. The
 * reason given for a skip is worded for a host: it ends up on the setup
 * screen when an import leaves rows out.
 */
export const rowToQuestion = (row: QuestionRow, id: string): RowResult => {
    // A dash or N/A in the type column is a sheet's way of leaving it blank.
    const typeCell = (row.type ?? '').trim().replace(/^(?:[-–—]+|n\/a)$/i, '');
    const named = parseQuestionType(typeCell);
    const options = row.options.map((o) => (o ?? '').trim()).filter((o) => o !== '');
    const answer = (row.correctAnswer ?? '').trim();
    const image = (row.image ?? '').trim();

    // A type the file names but the game does not know is left out, not
    // guessed at. It used to become multiple choice, and a row written for
    // another format then matched none of its "options" and was left out for
    // that: a reason that sends the host to the answer column instead of this.
    if (typeCell && !named) return { skip: `unknown format "${typeCell}"` };

    // What the row is, when the file does not say. A blank type column is the
    // ordinary case for a spreadsheet somebody wrote by hand.
    let type = named ?? QuestionType.MULTIPLE_CHOICE;
    if (!typeCell) {
        const lowered = options.map((o) => o.toLowerCase());
        // Only the words themselves: a typed answer may well be "Yes" or "T".
        const answerIsBoolean = /^(true|false)$/i.test(answer);
        if (options.length === 2 && lowered.includes('true') && lowered.includes('false')) {
            type = QuestionType.TRUE_FALSE;
        } else if (options.length === 0 && answerIsBoolean) {
            // "True or False: ..." with the option columns left empty, because
            // on that row the two options are the question.
            type = QuestionType.TRUE_FALSE;
        } else if (options.length === 0) {
            // No options and a written-out answer is a short answer, not a
            // broken row. A quarter of the bundled question bank is this shape.
            type = QuestionType.TYPE_ANSWER;
        }
    }

    const base = {
        id,
        category: row.category.trim(),
        text: row.question.trim(),
        explanation: (row.explanation ?? '').trim(),
        type,
    };
    const extras: Partial<Question> = {};
    if (readsTwoWays(row.timeLimit, row.separator)) return { skip: TWO_WAY_NUMBER };
    const timeLimit = leadingNumber(row.timeLimit);
    if (timeLimit !== null && timeLimit > 0) extras.timeLimit = Math.round(timeLimit);
    const margin = parseMargin(row.margin);
    if (margin) extras.margin = margin;
    const unit = (row.unit ?? '').trim();
    if (unit) extras.unit = unit;
    // Any question may carry a picture; for a pin it is the thing pinned.
    if (image && type !== QuestionType.PIN) {
        extras.image = mapKeyFor(image) ? `${MAP_PREFIX}${mapKeyFor(image)}` : image;
    }

    let finalOptions: string[] = options;
    let correctIndex = 0;

    switch (type) {
        case QuestionType.TRUE_FALSE: {
            if (!TRUE_WORDS.test(answer) && !FALSE_WORDS.test(answer)) {
                return { skip: 'true/false answer is neither True nor False' };
            }
            finalOptions = ['True', 'False'];
            correctIndex = TRUE_WORDS.test(answer) ? 0 : 1;
            break;
        }

        case QuestionType.TYPE_ANSWER:
            // A file that lists the accepted spellings itself is taken at its
            // word; one that gives only an answer column has them derived.
            finalOptions = options.length > 0 ? options : acceptedSpellings(answer);
            break;

        case QuestionType.SLIDER:
        case QuestionType.RANGE: {
            // min, max, step, low, high — or min, max, step with the answer in
            // the answer column, which is how most people write one.
            if ([...options, answer].some((cell) => readsTwoWays(cell, row.separator))) {
                return { skip: TWO_WAY_NUMBER };
            }
            const numbers = options.map((o) => leadingNumber(o));
            const [min, max] = numbers;
            let step = numbers[2];
            let band: [number, number] | null =
                numbers.length >= 5 && numbers[3] !== null && numbers[4] !== null
                    ? [numbers[3]!, numbers[4]!]
                    : numberBand(answer);
            if (min === null || min === undefined || max === null || max === undefined || !band) {
                return { skip: `${type === QuestionType.RANGE ? 'range' : 'slider'} is missing its scale` };
            }
            if (step === null || step === undefined) {
                step = [min, max, band[0], band[1]].every(Number.isInteger) ? 1 : 0.1;
            }
            finalOptions = [min, max, step, band[0], band[1]].map(String);
            if (!extras.unit) {
                const inferred = trailingUnit(answer);
                if (inferred) extras.unit = inferred;
            }
            break;
        }

        case QuestionType.NUMBER: {
            if (readsTwoWays(answer, row.separator) || readsTwoWays(options[0], row.separator)) {
                return { skip: TWO_WAY_NUMBER };
            }
            const target = leadingNumber(answer);
            if (target === null) return { skip: 'no numeric answer' };
            const tolerance = Math.abs(leadingNumber(options[0]) ?? 0);
            finalOptions = [String(target), String(tolerance)];
            if (!extras.unit) {
                const inferred = trailingUnit(answer);
                if (inferred) extras.unit = inferred;
            }
            break;
        }

        case QuestionType.PIN: {
            // The picture comes from the image column, or from the first
            // option when the sheet has no image column.
            const pictureFromOption = !image && options.length > 0 && leadingNumber(options[0]) === null;
            const picture = image || (pictureFromOption ? options[0] : '');
            const coordCells = pictureFromOption ? options.slice(1) : options;
            if (coordCells.some((cell) => readsTwoWays(cell, row.separator))) return { skip: TWO_WAY_NUMBER };
            const coords = coordCells.map((o) => leadingNumber(o));
            const mapKey = mapKeyFor(picture);
            if (!picture) return { skip: 'no picture to pin' };
            if (coords.length < 2 || coords[0] === null || coords[1] === null) {
                return { skip: 'pin target is missing' };
            }

            let pin: PinTarget | null;
            if (mapKey) {
                // On a built-in map: latitude, longitude, kilometres.
                pin = geoPinTarget(
                    MAP_FRAMES[mapKey],
                    coords[0]!,
                    coords[1]!,
                    coords[2] ?? DEFAULT_PIN_RADIUS_KM[mapKey],
                );
                if (!pin) return { skip: 'pin target is off the map' };
            } else {
                // On a picture: percent across, percent down, percent of the
                // width. A spot written as fractions (0–1) is read as one.
                const [x, y] = [coords[0]!, coords[1]!];
                const radius = coords[2] ?? null;
                const fractions = x <= 1 && y <= 1 && (radius === null || radius <= 1);
                const scale = fractions ? 1 : 100;
                pin = {
                    x: x / scale,
                    y: y / scale,
                    radius: radius === null ? DEFAULT_PIN_RADIUS_PERCENT / 100 : radius / scale,
                };
            }
            extras.pin = pin;
            extras.image = mapKey ? `${MAP_PREFIX}${mapKey}` : picture;
            finalOptions = [answer];
            break;
        }

        case QuestionType.MULTI_SELECT: {
            const wanted = pipeList(answer);
            const indices = wanted.map((one) => resolveCorrectIndex(options, one));
            if (wanted.length === 0 || indices.some((index) => index === -1)) {
                const byPosition = wanted.some(
                    (one, i) => indices[i] === -1 && isOptionPosition(one, options.length),
                );
                return { skip: byPosition ? POSITION_ANSWER : 'an answer matches none of the options' };
            }
            extras.correctIndices = [...new Set(indices)].sort((a, b) => a - b);
            correctIndex = extras.correctIndices[0];
            break;
        }

        case QuestionType.PUZZLE:
            // Items in the correct order — or, with the option columns left
            // empty, the order written out in the answer column.
            finalOptions = options.length > 0 ? options : pipeList(answer);
            break;

        case QuestionType.MATCH:
        case QuestionType.CATEGORIZE: {
            // "Item = partner" in each option column, or all of them in the
            // answer column separated by pipes.
            const cells = options.length > 0 ? options : pipeList(answer);
            const pairs = cells.map(parsePair);
            if (pairs.length === 0 || pairs.some((pair) => pair === null)) {
                return { skip: 'every option needs an "item = partner" pair' };
            }
            finalOptions = pairs.map((pair) => pair![0]);
            extras.pairs = pairs.map((pair) => pair![1]);
            break;
        }

        case QuestionType.SCRAMBLE:
            finalOptions = [answer];
            break;

        case QuestionType.MULTIPLE_CHOICE:
        default:
            correctIndex = resolveCorrectIndex(options, answer);
            if (correctIndex === -1) {
                return {
                    skip: isOptionPosition(answer, options.length)
                        ? POSITION_ANSWER
                        : 'the answer matches none of the options',
                };
            }
            break;
    }

    if (finalOptions.length === 0) return { skip: 'no options' };

    const question: Question = { ...base, options: finalOptions, correctIndex, ...extras };

    // Placeholder answers ("Placeholder 1", "Option A"), questions with
    // nothing to choose between and targets off the picture never reach a game.
    const unplayable = unplayableReason(question);
    return unplayable ? { skip: unplayable } : { question };
};

/** The category a question's name belongs to: a built-in one, or one made up. */
export const categoryFor = (categoryName: string): Category =>
    CATEGORIES.find(c => c.name.toLowerCase() === categoryName.toLowerCase()) || {
        id: categoryName.toLowerCase().replace(/\s/g, ''),
        name: categoryName,
        ...styleForCategory(categoryName),
    };

/** The header names an optional column may go by. */
const OPTIONAL_COLUMNS: Record<keyof Pick<QuestionRow, 'image' | 'margin' | 'unit' | 'timeLimit'>, string[]> = {
    image: ['image', 'picture', 'imageurl', 'media', 'map'],
    margin: ['margin', 'accuracy', 'marginofaccuracy'],
    unit: ['unit', 'units'],
    timeLimit: ['timelimit', 'time', 'seconds', 'timer'],
};

export const parseImportData = (csvData: string): { [categoryId: string]: CategoryContent } =>
    parseImportDataWithReport(csvData).contents;

export const parseImportDataWithReport = (csvData: string): ImportReport => {
    // Blank lines at either end are dropped, but not the spaces and tabs at
    // the start of the first line: in a tab-separated file a leading tab is an
    // empty first heading, and trimming it would move every heading one column
    // to the left of its cells.
    const lines = csvData.replace(/^\uFEFF/, '').split(/\r?\n/);
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length < 2) {
        throw new Error("Import data must have a header and at least one question row.");
    }

    const { delimiter, names } = detectDelimiter(lines[0]);
    const rows = lines.slice(1).map((line) => parseCSVLine(line, delimiter));

    const colMap: { [key: string]: number } = {};
    names.forEach((name, i) => {
        colMap[name] = i;
    });

    for (const col of REQUIRED_COLUMNS) {
        if (colMap[col] === undefined) {
            throw new Error(`Missing required column: ${col}. Please check your file header.`);
        }
    }

    // Read every option<N> column present, not a fixed four: a slider needs
    // five values, and puzzles and sorts can run longer than four items.
    const optionCols = Object.keys(colMap)
        .filter(key => /^option\d+$/.test(key))
        .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));

    const optionalCol = (names: string[]): number | undefined =>
        names.map((name) => colMap[name]).find((index) => index !== undefined);
    const cell = (row: string[], index: number | undefined): string =>
        index === undefined ? '' : (row[index] ?? '').trim();

    const roundsConfig: { [categoryId: string]: CategoryContent } = {};
    const skipped: SkippedRow[] = [];

    rows.forEach((row, rowIndex) => {
        try {
            const categoryName = cell(row, colMap['category']);
            const questionText = cell(row, colMap['question']);
            const correctAnswerStr = cell(row, colMap['correctanswer']);

            if (!categoryName || !questionText || !correctAnswerStr) {
                // A wholly empty line is a sheet's trailing blank row, not a
                // question anybody wrote.
                if (row.some((value) => value && value.trim() !== '')) {
                    skipped.push({
                        row: rowIndex + 2,
                        question: questionText || '(no question)',
                        reason: 'missing category, question or answer',
                    });
                }
                console.warn(`Skipping incomplete row ${rowIndex + 2}`);
                return;
            }

            const result = rowToQuestion(
                {
                    type: cell(row, colMap['type']),
                    category: categoryName,
                    question: questionText,
                    options: optionCols.map((key) => cell(row, colMap[key])),
                    correctAnswer: correctAnswerStr,
                    // A blank explanation stays blank. The reveal already hides
                    // an empty one, and filler text on a projector reads worse
                    // than a clean answer card.
                    explanation: cell(row, colMap['explanation']),
                    image: cell(row, optionalCol(OPTIONAL_COLUMNS.image)),
                    margin: cell(row, optionalCol(OPTIONAL_COLUMNS.margin)),
                    unit: cell(row, optionalCol(OPTIONAL_COLUMNS.unit)),
                    timeLimit: cell(row, optionalCol(OPTIONAL_COLUMNS.timeLimit)),
                    separator: delimiter,
                },
                `import-${categoryName}-${rowIndex}`,
            );

            if ('skip' in result) {
                skipped.push({ row: rowIndex + 2, question: questionText, reason: result.skip });
                return;
            }

            const categoryInfo = categoryFor(categoryName);
            if (!roundsConfig[categoryInfo.id]) {
                roundsConfig[categoryInfo.id] = {
                    category: categoryInfo,
                    questions: []
                };
            }
            roundsConfig[categoryInfo.id].questions.push(result.question);
        } catch (e) {
            console.error(`Error parsing row ${rowIndex + 2}:`, e);
        }
    });

    if (skipped.length > 0) {
        console.warn(
            `Left out ${skipped.length} unplayable question(s): ` +
                skipped
                    .slice(0, 5)
                    .map((entry) => `row ${entry.row} (${entry.reason})`)
                    .join(', ') +
                (skipped.length > 5 ? ', …' : ''),
        );
    }

    if (Object.keys(roundsConfig).length === 0) {
        throw new Error(
            skipped.length > 0
                ? `No playable questions in the data — all ${skipped.length} were left out (${summarizeReasons(skipped)}).`
                : "No valid questions could be parsed from the data.",
        );
    }

    return { contents: roundsConfig, skipped };
};

/** "3 with placeholder answers, 2 slider is missing its scale" — most common first. */
const summarizeReasons = (skipped: readonly SkippedRow[]): string => {
    const counts = new Map<string, number>();
    skipped.forEach((entry) => {
        const reason = entry.reason.includes('placeholder')
            ? 'with placeholder answers'
            : entry.reason === 'no options'
              ? 'with no options to choose from'
              : `— ${entry.reason}`;
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `${count} ${reason}`)
        .join(', ');
};

/** One sentence for the host about what an import left out, or null. */
export const describeSkipped = (skipped: readonly SkippedRow[]): string | null => {
    if (skipped.length === 0) return null;
    return `${skipped.length} question${skipped.length === 1 ? ' was' : 's were'} left out automatically (${summarizeReasons(skipped)}).`;
};

/** A sheet's CSV export: the tab with this id, or, with no id, the first tab. */
const sheetExportUrl = (sheetId: string, gid?: string): string =>
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid === undefined ? '' : `&gid=${gid}`}`;

/** The two things that make an export fail: the sharing, and the tab. */
const sheetFetchError = (status: number): Error =>
    new Error(
        `Failed to fetch from Google Sheet. Status: ${status}. Make sure the sheet is public ('Anyone with the link can view'), and that the link points at the tab you want: open that tab, then copy the URL from the address bar.`,
    );

/**
 * One tab of a public Google Sheet, as CSV.
 *
 * A link that names a tab (`gid=` in the query or after the `#`) gets that
 * tab. A link that names none gets tab 0, as it always has, and when there is
 * no tab 0 it gets the first tab instead.
 *
 * The second case is an Excel file kept in Drive and opened in Sheets. Its
 * share link carries no `gid`, its tabs have large random ids, and asking for
 * tab 0 is a 400. Asking for no tab at all exports the first one. That is not
 * tried first because on a native sheet "no tab" means the leftmost tab, which
 * need not be tab 0 (on the question bank they are different tabs), so links
 * that work today would start importing something else.
 */
export const fetchFromGoogleSheet = async (url: string): Promise<string> => {
    if (!url.includes('docs.google.com/spreadsheets/d/')) {
        throw new Error("Invalid Google Sheet URL.");
    }

    const sheetIdRegex = /spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const gidRegex = /gid=([0-9]+)/;

    const sheetIdMatch = url.match(sheetIdRegex);
    const gidMatch = url.match(gidRegex);

    if (!sheetIdMatch) {
        throw new Error("Could not extract Sheet ID from the URL.");
    }

    const sheetId = sheetIdMatch[1];

    if (gidMatch) {
        const response = await fetch(sheetExportUrl(sheetId, gidMatch[1]));
        if (!response.ok) throw sheetFetchError(response.status);
        return response.text();
    }

    const tabZero = await fetch(sheetExportUrl(sheetId, '0'));
    if (tabZero.ok) return tabZero.text();

    const firstTab = await fetch(sheetExportUrl(sheetId));
    if (!firstTab.ok) throw sheetFetchError(firstTab.status);
    return firstTab.text();
};

/**
 * The premade question bank, fetched.
 *
 * It is the same Google Sheet path a host can paste in by hand — the only
 * thing this adds is not having to. Which is the whole point: a host who has
 * not written a question and has no Anthropic key still has a night to run.
 */
export const fetchDefaultQuestionBank = async (): Promise<string> => {
    try {
        return await fetchFromGoogleSheet(DEFAULT_QUESTION_BANK.url);
    } catch (error: any) {
        throw new Error(
            `Could not load ${DEFAULT_QUESTION_BANK.name}. ${error?.message ?? ''} You can still import your own file.`.trim(),
        );
    }
};

const escapeCsvField = (field: string | undefined): string => {
    if (field === undefined || field === null) {
        return '';
    }
    const stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
        const escapedField = stringField.replace(/"/g, '""');
        return `"${escapedField}"`;
    }
    return stringField;
};

/** A number for a spreadsheet: no trailing noise from floating point. */
const cellNumber = (value: number, places = 4): string =>
    String(Math.round(value * 10 ** places) / 10 ** places);

/**
 * One question as the row that would import back to it.
 *
 * The inverse of `rowToQuestion`, column for column, so a game reviewed and
 * exported plays the same when it is imported again — including the types
 * whose answer lives somewhere other than the answer column.
 */
const questionToRow = (q: Question, categoryName: string): QuestionRow => {
    let options = [...q.options];
    let correctAnswer = '';
    let image = q.image ?? '';

    switch (q.type) {
        case QuestionType.SLIDER:
        case QuestionType.RANGE:
            correctAnswer = q.options[3] === q.options[4]
                ? `${q.options[3]}`
                : `${q.options[3]}-${q.options[4]}`;
            break;
        case QuestionType.NUMBER: {
            correctAnswer = q.options[0];
            const tolerance = Number(q.options[1] ?? 0);
            options = tolerance > 0 ? [String(tolerance)] : [];
            break;
        }
        case QuestionType.PIN: {
            correctAnswer = q.options[0] ?? '';
            const key = mapKeyFor(q.image);
            const pin = q.pin ?? { x: 0.5, y: 0.5, radius: 0.06 };
            if (key) {
                const geo = geoFromPinTarget(MAP_FRAMES[key], pin);
                image = key;
                options = [cellNumber(geo.lat), cellNumber(geo.lng), cellNumber(geo.km, 0)];
            } else {
                options = [pin.x * 100, pin.y * 100, pin.radius * 100].map((n) => cellNumber(n, 2));
            }
            break;
        }
        case QuestionType.MULTI_SELECT:
            correctAnswer = (q.correctIndices ?? [q.correctIndex]).map((i) => q.options[i]).join('|');
            break;
        case QuestionType.MATCH:
        case QuestionType.CATEGORIZE:
            options = q.options.map((item, i) => `${item} = ${q.pairs?.[i] ?? ''}`);
            correctAnswer = q.type === QuestionType.MATCH ? 'See the pairs' : 'See the groups';
            break;
        case QuestionType.TYPE_ANSWER:
        case QuestionType.SCRAMBLE:
            correctAnswer = q.options[0];
            break;
        case QuestionType.PUZZLE:
            correctAnswer = q.options.join('|'); // Use a pipe to separate puzzle answers
            break;
        case QuestionType.MULTIPLE_CHOICE:
        case QuestionType.TRUE_FALSE:
        default:
            correctAnswer = q.options[q.correctIndex];
            break;
    }

    return {
        type: q.type ?? QuestionType.MULTIPLE_CHOICE,
        category: categoryName,
        question: q.text,
        options,
        correctAnswer,
        explanation: q.explanation,
        image,
        margin: q.margin ?? '',
        unit: q.unit ?? '',
        timeLimit: q.timeLimit ? String(q.timeLimit) : '',
    };
};

export const exportRoundsToCSV = (roundsConfig: { [categoryId: string]: CategoryContent }): string => {
    const rowsOut = Object.values(roundsConfig).flatMap((content) =>
        content.questions.map((q) => questionToRow(q, content.category.name)),
    );
    // Five option columns at least, as the format has always had, and as many
    // more as the longest puzzle or sort needs.
    const optionCount = Math.max(5, ...rowsOut.map((row) => row.options.length));
    const optionHeaders = Array.from({ length: optionCount }, (_, i) => `option${i + 1}`);
    const header = ['type', 'category', 'question', ...optionHeaders, 'correctAnswer', 'explanation', 'image', 'margin', 'unit', 'timeLimit'];
    const lines: string[] = [header.join(',')];

    rowsOut.forEach((row) => {
        const options = [...row.options];
        while (options.length < optionCount) options.push('');
        lines.push(
            [
                row.type,
                row.category,
                row.question,
                ...options,
                row.correctAnswer,
                row.explanation,
                row.image,
                row.margin,
                row.unit,
                row.timeLimit,
            ]
                .map(escapeCsvField)
                .join(','),
        );
    });

    return lines.join('\n');
};

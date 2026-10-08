/**
 * Every question type, checked against the app's own services.
 *
 * Twelve types now share one importer, one grader and one snapshot, and each
 * of them hides its answer somewhere different — a slider's target in its
 * options, a pin's in a field of its own, a match puzzle's in the order its
 * partners are listed. The ways that goes wrong do not look broken from a
 * host's screen: a published question that quietly carries its answer, a
 * near miss that scores nothing or everything, an export that imports back as
 * a different question. So they are checked here:
 *
 *   1. A sheet using every type — and the loose spellings people type —
 *      imports as the questions it describes.
 *   2. The right answer is right, a wrong one is wrong, and a near miss earns
 *      the share of the points it should.
 *   3. Nothing published to a screen gives an answer away.
 *   4. Bots answer every type in a shape the grader accepts.
 *   5. The round engine gives each type its own clock and scores it fairly.
 *   6. Export, then import, gives back the same questions.
 *
 * Run it with `npm run check-question-types`.
 */
import "./dom-stub";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CategoryContent,
  GameMode,
  GamePhase,
  GameState,
  Player,
  Question,
  QuestionType,
} from "../../src/types";
import { REVEAL_DURATION, TIMER_DURATION } from "../../src/constants";
import {
  exportRoundsToCSV,
  parseImportData,
  parseImportDataWithReport,
} from "../../src/services/importService";
import { gradeAnswer, isAnswerCorrect } from "../../src/services/scoring";
import {
  buildSnapshot,
  categorizeGroups,
  matchChoices,
  publicOptions,
  toPublicQuestion,
} from "../../src/services/snapshot";
import { botAnswerFor } from "../../src/services/botAnswers";
import { shuffleOptions } from "../../src/services/questionSet";
import { questionSeconds, parseQuestionType, QUESTION_TYPES } from "../../src/services/questionTypes";
import {
  answerPoints,
  buildRoundLanes,
  recordLaneAnswer,
  seatForPlayer,
} from "../../src/services/lanes";
import { MAP_FRAMES, geoPinTarget, mapAspect } from "../../src/services/mapProjection";
import { questionsFromGenerated } from "../../src/services/claudeService";
import { csvCells, readWorkbook } from "./xlsx";

let failures = 0;
const check = (label: string, passed: boolean, detail = ""): void => {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
};
const section = (title: string): void => console.log(`\n${title}`);

/* ------------------------------------------------------------------ *
 * 1. Importing every type
 * ------------------------------------------------------------------ */

section("1. A sheet with every type imports as the questions it describes");

const csv = [
  "type,category,question,option1,option2,option3,option4,option5,option6,correctAnswer,explanation,image,margin,unit,timeLimit",
  "MULTIPLE_CHOICE,Science,Which planet is red?,Mars,Venus,Jupiter,Mercury,,,Mars,,,,,",
  "Select all that apply,Science,Which are gas giants?,Jupiter,Mars,Saturn,Venus,,,Jupiter|Saturn,,,,,",
  "true/false,Science,Sound travels faster in water than in air.,,,,,,,True,,,,,",
  "TF,Science,The Sun is a planet.,True,False,,,,,F,,,,,",
  "SLIDER,History,In what year did Apollo 11 land?,1950,1990,1,1969,1969,,1969,,,medium,,",
  "RANGE,Geography,How tall is Everest in metres?,5000,10000,10,,,,8849,,,,m,",
  'CLOSEST,Science,How far away is the Moon?,,,,,,,"384,400 km",,,,,',
  "PIN,Geography,Where is Paris?,48.8566,2.3522,400,,,,Paris,,world,,,",
  "Pin answer,Florida,Where is Fort Myers?,26.64,-81.87,100,,,,Fort Myers,,USA,,,",
  "PIN,Art,Where is the red square?,https://example.com/grid.png,40,30,5,,,The red square,,,,,",
  "PIN,Art,Where is the blue circle?,60,40,8,,,,The blue circle,,https://example.com/shapes.png,high,,",
  "ORDER,History,Put these in order,World War I,World War II,Korean War,Vietnam War,,,x,,,,,",
  "MATCH,Science,Match the symbol to the element,Au = Gold,Ag = Silver,Fe -> Iron,Na → Sodium,,,See the pairs,,,,,",
  "SORT,Food,Fruit or vegetable?,Tomato = Fruit,Carrot = Vegetable,Cucumber = Fruit,Potato = Vegetable,Pepper = Fruit,Onion = Vegetable,See the groups,,,,,",
  "ANAGRAM,Fitness,Unscramble this muscle,,,,,,,Hamstring,,,,,45",
  "SCRAMBLE,Geography,The Big Apple,,,,,,,New York,,,,,",
].join("\n");

const report = parseImportDataWithReport(csv);
const imported = Object.values(report.contents).flatMap((c) => c.questions);
const byText = (fragment: string): Question => {
  const found = imported.find((q) => q.text.includes(fragment));
  if (!found) throw new Error(`no question containing "${fragment}" — skipped: ${JSON.stringify(report.skipped)}`);
  return found;
};

check(
  "every row imports, none skipped",
  imported.length === 16 && report.skipped.length === 0,
  `${imported.length} imported, skipped: ${report.skipped.map((s) => s.reason).join("; ") || "none"}`,
);

const mc = byText("planet is red");
const multi = byText("gas giants");
const tfTrue = byText("Sound travels");
const tfFalse = byText("Sun is a planet");
const slider = byText("Apollo 11");
const range = byText("Everest");
const closest = byText("Moon");
const paris = byText("Paris");
const fortMyers = byText("Fort Myers");
const redSquare = byText("red square");
const blueCircle = byText("blue circle");
const order = byText("in order");
const match = byText("symbol to the element");
const sort = byText("Fruit or vegetable");
const anagram = byText("muscle");
const scramble = byText("Big Apple");

check("type aliases resolve", [
  [multi, QuestionType.MULTI_SELECT],
  [tfTrue, QuestionType.TRUE_FALSE],
  [tfFalse, QuestionType.TRUE_FALSE],
  [closest, QuestionType.NUMBER],
  [fortMyers, QuestionType.PIN],
  [order, QuestionType.PUZZLE],
  [sort, QuestionType.CATEGORIZE],
  [anagram, QuestionType.SCRAMBLE],
].every(([q, type]) => (q as Question).type === type));

check(
  "every name in the type table — the type, its label, its badge, its aliases — resolves to its own type",
  Object.values(QUESTION_TYPES).every((info) =>
    [info.type, info.label, info.badge, ...info.aliases].every((alias) => parseQuestionType(alias) === info.type),
  ),
);

check(
  "multi-select marks every correct option",
  multi.correctIndices?.map((i) => multi.options[i]).join("|") === "Jupiter|Saturn",
  multi.correctIndices?.join(","),
);
check(
  "true/false accepts T/F shorthand and an empty option row",
  tfTrue.correctIndex === 0 && tfFalse.correctIndex === 1 &&
    tfTrue.options.join("/") === "True/False",
);
check("a margin column is read", slider.margin === "medium");
check(
  "a range with its answer in the answer column becomes an exact target",
  range.options.join(",") === "5000,10000,10,8849,8849" && range.unit === "m",
  range.options.join(","),
);
check(
  "a closest-number answer written with commas and a unit reads as a number and a unit",
  closest.options[0] === "384400" && closest.unit === "km",
  `${closest.options[0]} / ${closest.unit}`,
);
check(
  "a pin on the world map is placed from latitude and longitude",
  paris.image === "map:world" &&
    Math.abs(paris.pin!.x - (2.3522 + 180) / 360) < 1e-6 &&
    paris.pin!.radius > 0,
  JSON.stringify(paris.pin),
);
check(
  "a pin on the US map lands on Fort Myers, not in the Gulf",
  fortMyers.image === "map:usa" && fortMyers.pin!.x > 0.75 && fortMyers.pin!.y > 0.85,
  JSON.stringify(fortMyers.pin),
);
check(
  "a pin picture can come from the first option when there is no image column",
  redSquare.image === "https://example.com/grid.png" &&
    Math.abs(redSquare.pin!.x - 0.4) < 1e-9 &&
    Math.abs(redSquare.pin!.radius - 0.05) < 1e-9,
  JSON.stringify(redSquare.pin),
);
check(
  "a pin picture from the image column, spot in percent",
  blueCircle.image === "https://example.com/shapes.png" &&
    Math.abs(blueCircle.pin!.y - 0.4) < 1e-9 &&
    blueCircle.margin === "high",
);
check(
  "match pairs are read on any of the separators",
  match.options.join("|") === "Au|Ag|Fe|Na" &&
    match.pairs?.join("|") === "Gold|Silver|Iron|Sodium",
);
check(
  "a sort reads its items and their groups",
  sort.options.length === 6 && categorizeGroups(sort).join("|") === "Fruit|Vegetable",
);
check("a time limit column is read", anagram.timeLimit === 45);

/* The ways a row is refused, each with a reason the host is shown. */
const refused = parseImportDataWithReport(
  [
    "type,category,question,option1,option2,option3,option4,correctAnswer",
    "TRUE_FALSE,X,Is it?,,,,,Maybe",
    "MULTI_SELECT,X,Which?,A,B,C,D,A|Z",
    "PIN,X,Where?,,,,,Somewhere",
    "PIN,X,Where on the US map is Honolulu?,usa,21.3,-157.8,,Honolulu",
    "MATCH,X,Match these,A = 1,B = 1,,,x",
    "MATCH,X,Match these too,A = 1,B,,,x",
    "CATEGORIZE,X,Sort these,A = 1,B = 1,C = 1,D = 1,x",
    "SCRAMBLE,X,Unscramble,,,,,aa",
    "SLIDER,X,How many?,10,1,1,,5",
    "MULTIPLE_CHOICE,X,Which?,A,B,C,D,E",
    "MULTIPLE_CHOICE,X,Fine one?,A,B,C,D,A",
  ].join("\n"),
);
const refusedReasons = refused.skipped.map((s) => s.reason);
check(
  "a malformed row is left out with a reason, never guessed at",
  refused.skipped.length === 10 &&
    Object.values(refused.contents).flatMap((c) => c.questions).length === 1,
  refusedReasons.join(" | "),
);

/* What a spreadsheet writes is what a spreadsheet meant. Excel and Sheets
 * write a quote inside a cell as two quotes; and an answer like 1968-1970 or
 * 98.6 is a number, not a number followed by a unit called "-1970" or ".6". */
const written = Object.values(
  parseImportDataWithReport(
    [
      "type,category,question,option1,option2,option3,option4,option5,correctAnswer,unit",
      'TYPE_ANSWER,X,"Which Beatle was ""the quiet one""?",George Harrison,,,,,George Harrison,',
      "SLIDER,X,When did Apollo 11 land?,1960,1980,1,,,1968-1970,",
      "SLIDER,X,When did Apollo 11 land?,1960,1980,1,,,1968 to 1970,",
      "NUMBER,X,Body temperature?,,,,,,98.6,",
      "NUMBER,X,Everest?,,,,,,\"8,849\",",
      "NUMBER,X,To the Moon?,,,,,,\"384,400 km\",",
      "NUMBER,X,Body temperature?,,,,,,98.6 °F,",
    ].join("\n"),
  ).contents,
).flatMap((c) => c.questions);
check(
  "a quote written into a cell survives the import",
  written[0]?.text === 'Which Beatle was "the quiet one"?',
  written[0]?.text,
);
check(
  "a number only has a unit when one is written after it",
  written.map((q) => q.unit ?? "").join("|") === "|||||km|°F" &&
    written[1]?.options.slice(3).join("-") === "1968-1970" &&
    written[2]?.options.slice(3).join("-") === "1968-1970",
  written.map((q) => JSON.stringify(q.unit ?? "")).join(" "),
);

/* A type word the game does not know used to make the row multiple choice,
 * which then left it out as "the answer matches none of the options" and sent
 * the host to the wrong column. The app's own names for its formats, as its
 * badges print them, were among the words it did not know. */
const appNames = Object.values(QUESTION_TYPES).flatMap((info) =>
  [info.label, info.badge].map((name) => [name, info.type] as const),
);
const misnamed = appNames.filter(([name, type]) => parseQuestionType(name) !== type);
check(
  "every label and badge the app shows for a format reads as that format",
  misnamed.length === 0,
  misnamed.map(([name]) => name).join(", "),
);
const commonNames: [string, QuestionType][] = [
  ["Typed answer", QuestionType.TYPE_ANSWER],
  ["Puzzle · order", QuestionType.PUZZLE],
  ["Puzzle · match", QuestionType.MATCH],
  ["Puzzle · sort", QuestionType.CATEGORIZE],
  ["Puzzle · unscramble", QuestionType.SCRAMBLE],
  ["puzzle·order", QuestionType.PUZZLE],
  ["Closest guess", QuestionType.NUMBER],
  ["Fill in the blank", QuestionType.TYPE_ANSWER],
  ["Checkboxes", QuestionType.MULTI_SELECT],
  // What other quiz tools write: Open Trivia DB's "multiple" and "boolean",
  // Quizizz's "Open-Ended", Gimkit's "Text input".
  ["multiple", QuestionType.MULTIPLE_CHOICE],
  ["boolean", QuestionType.TRUE_FALSE],
  ["MCQ", QuestionType.MULTIPLE_CHOICE],
  ["Multiple choice question", QuestionType.MULTIPLE_CHOICE],
  ["Single choice", QuestionType.MULTIPLE_CHOICE],
  ["Multi-choice", QuestionType.MULTIPLE_CHOICE],
  ["Open-Ended", QuestionType.TYPE_ANSWER],
  ["Text input", QuestionType.TYPE_ANSWER],
];
check(
  "the names people write for a format read as it",
  commonNames.every(([name, type]) => parseQuestionType(name) === type),
  commonNames.filter(([name, type]) => parseQuestionType(name) !== type).map(([name]) => name).join(", "),
);
const unknownTypes = parseImportDataWithReport(
  [
    "type,category,question,option1,option2,option3,option4,correctAnswer",
    "Puzzle · order,X,Put these in order,First,Second,Third,,x",
    "Fill in the blank,X,The capital of France is ___,,,,,Paris",
    "Quizz,X,Which is red?,Mars,Venus,Jupiter,Mercury,Mars",
    "Matchup game,X,Match these,Au = Gold,Ag = Silver,,,See the pairs",
  ].join("\n"),
);
check(
  "a type word the game does not know leaves the row out with that word, never guessed at",
  unknownTypes.skipped.map((s) => s.reason).join(" | ") ===
    'unknown format "Quizz" | unknown format "Matchup game"' &&
    Object.values(unknownTypes.contents).flatMap((c) => c.questions).map((q) => q.type).join() ===
      `${QuestionType.PUZZLE},${QuestionType.TYPE_ANSWER}`,
  unknownTypes.skipped.map((s) => `row ${s.row}: ${s.reason}`).join(" | "),
);

/* "The one option that contains the answer" is how "Old Town Road by Lil Nas
 * X" finds Old Town Road. It is also how "B" found Boston and "1" found 10. */
// An import with nothing playable throws; a report is easier to compare.
const importReport = (text: string): ReturnType<typeof parseImportDataWithReport> => {
  try {
    return parseImportDataWithReport(text);
  } catch (error: any) {
    return { contents: {}, skipped: [{ row: 0, question: "", reason: String(error?.message ?? error) }] };
  }
};
const answerKey = (options: string[], answer: string, type = "MULTIPLE_CHOICE") => {
  const result = importReport(
    [
      "type,category,question,option1,option2,option3,option4,correctAnswer",
      [type, "X", "Which?", ...options, `"${answer}"`].join(","),
      // So a refused row is reported by its own reason, not as an empty import.
      "MULTIPLE_CHOICE,Y,Filler?,Red,Green,Blue,Yellow,Red",
    ].join("\n"),
  );
  const q = Object.values(result.contents).flatMap((c) => c.questions).find((one) => one.text === "Which?");
  return q
    ? (q.correctIndices ?? [q.correctIndex]).map((i) => q.options[i]).join("|")
    : `left out: ${result.skipped[0]?.reason}`;
};
const lettersAndNumbers: [string[], string, string, string?][] = [
  [["Boston", "Chicago", "Denver", "Austin"], "B", "left out: the answer is an option's letter or number — write the option itself"],
  [["Boston", "Chicago", "Denver", "Austin"], "b)", "left out: the answer is an option's letter or number — write the option itself"],
  [["10", "20", "30", "40"], "1", "left out: the answer is an option's letter or number — write the option itself"],
  [["100", "200", "300", "400"], "30", "left out: the answer matches none of the options"],
  [["US", "UK", "UN", "EU"], "United Kingdom (UK)", "left out: the answer matches none of the options"],
  [["Mercury", "Venus", "Earth", "Mars"], "A|C", "left out: the answer is an option's letter or number — write the option itself", "MULTI_SELECT"],
  [["1969", "1970", "1971", "1972"], "69", "left out: the answer matches none of the options"],
  [["Vitamin A", "Vitamin B", "Vitamin C", "Vitamin D"], "B", "left out: the answer is an option's letter or number — write the option itself"],
  [["$5", "$10", "$15", "$20"], "$10.50", "left out: the answer matches none of the options"],
  // Part of a word is not the word.
  [["Jerusalem", "Paris", "Rome", "London"], "USA", "left out: the answer matches none of the options"],
  [["Mozart", "Bach", "Liszt", "Haydn"], "Art", "left out: the answer matches none of the options"],
  // Two options in the answer is no answer.
  [["Mars", "Venus", "Jupiter", "Mercury"], "Mars and Venus", "left out: the answer matches none of the options"],
];
const guessed = lettersAndNumbers.filter(([options, answer, expected, type]) => answerKey(options, answer, type) !== expected);
check(
  "a letter, a number, a two-letter code or part of a word in correctAnswer is never matched to an option",
  guessed.length === 0,
  guessed.map(([options, answer, , type]) => `${answer} → ${answerKey(options, answer, type)}`).join(" | "),
);
const fuller: [string[], string, string][] = [
  [["Amazon", "Nile", "Mississippi", "Yangtze"], "The Nile", "Nile"],
  [["Jacksonville", "Tampa", "Miami", "Key West"], "Tampa (Ybor City)", "Tampa"],
  [["Shape of You", "Despacito", "Old Town Road", "Rockstar"], "Old Town Road by Lil Nas X", "Old Town Road"],
  [["Shape of You", "Despacito", "Old Town Road", "Rockstar"], "Lil Nas X's Old Town Road", "Old Town Road"],
  [["The Beatles", "The Who", "Queen", "ABBA"], "Beatles", "The Beatles"],
  [["10", "20", "30", "40"], "20", "20"],
  [["A", "B", "AB", "O"], "AB", "AB"],
];
const lost = fuller.filter(([options, answer, expected]) => answerKey(options, answer) !== expected);
check(
  "an answer written more fully than its option still finds it",
  lost.length === 0,
  lost.map(([options, answer]) => `${answer} → ${answerKey(options, answer)}`).join(" | "),
);

/* A tab-separated file, or the semicolon-separated CSV Excel writes where the
 * decimal mark is a comma, used to fail with "Missing required column". */
const separated = (separator: string, rows: string[][]) =>
  importReport(rows.map((row) => row.join(separator)).join("\r\n"));
const sheetRows = [
  ["type", "category", "question", "option1", "option2", "option3", "option4", "correctAnswer", "explanation", "image"],
  ["MULTIPLE_CHOICE", "Science", "Which planet is red?", "Mars", "Venus", "Jupiter", "Mercury", "Mars", "Iron oxide, mostly.", ""],
  ["PIN", "Florida", "Pin Fort Myers.", "26.6406", "-81.8723", "120", "", "Fort Myers", "", "usa"],
  ["NUMBER", "Science", "Body temperature?", "", "", "", "", "98.6 °F", "", ""],
  ["TYPE_ANSWER", "Music", 'Which Beatle was "the quiet one"?', "George Harrison", "", "", "", "George Harrison", "", ""],
];
const comma = separated(",", sheetRows.map((row) => row.map((cell) => (/[,"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))));
const tab = separated("\t", sheetRows);
const semicolon = separated(";", sheetRows.map((row) => row.map((cell) => (/^-?\d+\.\d+(\s*\D*)$/.test(cell) ? cell.replace(".", ",") : /[;"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))));
const flat = (r: ReturnType<typeof parseImportDataWithReport>) =>
  JSON.stringify(Object.values(r.contents).flatMap((c) => c.questions).map(({ id, ...q }) => q));
check(
  "a tab-separated file imports the same as a comma-separated one",
  flat(tab) === flat(comma) && tab.skipped.length === 0 && flat(comma).includes("Iron oxide, mostly."),
  tab.skipped.map((s) => s.reason).join(" | "),
);
check(
  "a semicolon-separated file with decimal commas imports the same as a comma-separated one",
  flat(semicolon) === flat(comma) && semicolon.skipped.length === 0,
  semicolon.skipped.map((s) => s.reason).join(" | "),
);
const quotedSeparators = separated(";", [
  ["category", "question", "option1", "option2", "option3", "correctAnswer", "explanation"],
  ["X", '"Which; of these?"', "1,5", "2,5", "3,5", "2,5", "1,5 million people live there."],
]);
const quotedQuestion = Object.values(quotedSeparators.contents)[0]?.questions[0];
check(
  "a separator inside quotes, or inside one heading, does not decide the separator",
  quotedSeparators.skipped.length === 0 &&
    quotedQuestion?.text === "Which; of these?" &&
    importReport('category,question,correctAnswer,"notes; misc"\nX,Q?,A,').skipped.length === 0 &&
    importReport("category\tquestion\tcorrectAnswer\tnotes, sources, links, misc\nX\tQ?\tA\t").skipped.length === 0,
);

/* Numbers are read the way the file writes them; text is left as written. A
 * semicolon file comes from where the comma is the decimal mark and the point
 * groups thousands; anywhere, a comma that cannot group thousands is a
 * decimal mark. */
const numbersIn = (separator: string, rows: string[][]) =>
  Object.values(separated(separator, rows).contents).flatMap((c) => c.questions);
const numberHeader = ["type", "category", "question", "option1", "option2", "option3", "correctAnswer", "unit"];
const local = numbersIn(";", [
  numberHeader,
  ["RANGE", "X", "Body temperature?", "30", "45", "0,1", "36,5-37,5", ""],
  ["SLIDER", "X", "How tall is Everest?", "0", "10.000", "100", "8.849", "m"],
  ["NUMBER", "X", "Pi?", "", "", "", "ca. 3,14", ""],
  ["NUMBER", "X", "To the Moon?", "", "", "", "384,400 km", ""],
  ["TYPE_ANSWER", "X", "Which herbicide?", "", "", "", "2,4-D", ""],
  ["MULTI_SELECT", "X", "Which are under 3?", "1,5", "2,5", "3,5", "1,5|2,5", ""],
  ["MULTIPLE_CHOICE", "X", "Which is a half?", "0,5", "1,5", "2,5", "0,5", ""],
]);
const pointed = numbersIn(",", [
  numberHeader,
  ["NUMBER", "X", "To the Moon?", "", "", "", '"384,400 km"', ""],
  ["NUMBER", "X", "Fort Myers latitude?", "", "", "", '"26,6406"', ""],
]);
const pinRows = (lat: string, lng: string) => [
  [...numberHeader, "image"],
  ["PIN", "X", "Pin Fort Myers.", lat, lng, "120", "Fort Myers", "", "usa"],
];
const tabbed = numbersIn("\t", pinRows("26,6406", "-81,8723"));
const pinnedWithPoints = numbersIn(",", pinRows("26.6406", "-81.8723"));
const readAs = local.map((q) => (q.correctIndices ?? (q.type === QuestionType.MULTIPLE_CHOICE ? [q.correctIndex] : null))
  ? (q.correctIndices ?? [q.correctIndex]).map((i) => q.options[i]).join("|")
  : `${q.options.join(",")}${q.unit ? ` ${q.unit}` : ""}`);
check(
  "a semicolon file's numbers are read with a decimal comma and a thousands point, and its text is left alone",
  readAs.join(" / ") === "30,45,0.1,36.5,37.5 / 0,10000,100,8849,8849 m / 3.14,0 / 384.4,0 km / 2,4-D / 1,5|2,5 / 0,5",
  readAs.join(" / "),
);
check(
  "anywhere else a comma before three digits groups thousands, and any other is a decimal mark",
  pointed.map((q) => q.options[0]).join(" / ") === "384400 / 26.6406" &&
    tabbed[0]?.pin !== undefined &&
    JSON.stringify(tabbed[0]?.pin) === JSON.stringify(pinnedWithPoints[0]?.pin),
  `${pointed.map((q) => q.options[0]).join(" / ")} · tab pin ${JSON.stringify(tabbed[0]?.pin)}`,
);

/* Quotes. A CSV is read the way it always has been: a quoted cell can hold a
 * comma, and a cell cut by a line break comes up short and is left out, not
 * read as a question. A tab-separated file has no quoting of its own: Google
 * Sheets writes quotes as they stand, Excel quotes a cell the way a CSV does. */
const commaQuotes = importReport(
  [
    "category,question,correctAnswer,explanation",
    'Music,"Which band',
    'recorded Bohemian Rhapsody?",Queen,Fun fact',
    'X,Name the "Fab Four, of Liverpool",Beatles,',
    "X,A real question?,A real answer,",
  ].join("\n"),
);
const commaQuoted = Object.values(commaQuotes.contents).flatMap((c) => c.questions);
check(
  "in a CSV, a cell cut by a line break is left out, and a quoted phrase may hold a comma",
  commaQuoted.map((q) => `${q.text} = ${q.options[0]}`).join(" | ") ===
    "Name the Fab Four, of Liverpool = Beatles | A real question? = A real answer" &&
    commaQuotes.skipped.length === 2,
  `${commaQuoted.map((q) => `${q.text} = ${q.options[0]}`).join(" | ")} · left out: ${commaQuotes.skipped.map((s) => s.reason).join(", ")}`,
);
const tabQuotes = importReport(
  [
    "category\tquestion\tcorrectAnswer\texplanation",
    'Music\t"Hey Jude" was by which band?\tThe Beatles\t',
    'Music\t"""Let It Be"" was by which band?"\tThe Beatles\t"Recorded in 1969, released in 1970."',
    'Music\t"Unclosed start\tThe Beatles\tNot swallowed',
    'Music\t"Which band',
    'recorded Bohemian Rhapsody?"\tQueen\tFun fact',
  ].join("\n"),
);
const tabQuoted = Object.values(tabQuotes.contents).flatMap((c) => c.questions);
check(
  "in a TSV, quotes are kept as written, an Excel-quoted cell is unwrapped, and a cell cut by a line break is left out",
  tabQuoted.map((q) => `${q.text} = ${q.options[0]} (${q.explanation})`).join(" | ") ===
    '"Hey Jude" was by which band? = The Beatles () | "Let It Be" was by which band? = The Beatles (Recorded in 1969, released in 1970.) | "Unclosed start = The Beatles (Not swallowed)' &&
    tabQuotes.skipped.map((s) => s.reason).join(" | ") === "a line break inside a cell | a line break inside a cell",
  `${tabQuoted.map((q) => `${q.text} = ${q.options[0]} (${q.explanation})`).join(" | ")} · left out: ${tabQuotes.skipped.map((s) => s.reason).join(", ")}`,
);

/* ------------------------------------------------------------------ *
 * 2. Grading
 * ------------------------------------------------------------------ */

section("2. Right is right, wrong is wrong, and a near miss pays its share");

const grade = (q: Question, answer: Parameters<typeof gradeAnswer>[1]) => gradeAnswer(q, answer);
const near = (credit: number, expected: number) => Math.abs(credit - expected) < 0.011;

check("multiple choice", isAnswerCorrect(mc, 0) === (mc.options[0] === "Mars"));
check(
  "multi-select: the exact set is right; one wrong pick cancels one right one",
  grade(multi, multi.correctIndices!).correct &&
    near(grade(multi, [multi.correctIndices![0]]).credit, 0.5) &&
    grade(multi, multi.options.map((_, i) => i)).credit === 0,
);
check(
  "slider: a near miss inside the margin scores part, off it scores nothing",
  grade(slider, 1969).correct &&
    !grade(slider, 1972).correct &&
    near(grade(slider, 1972).credit, 0.5) &&
    grade(slider, 1980).credit === 0,
  `1972 → ${grade(slider, 1972).credit}`,
);
check(
  "slider with no margin is exact, as every slider was before margins",
  grade({ ...slider, margin: undefined }, 1970).credit === 0,
);
check(
  "range: a tight catch earns it all, a loose one less, a miss nothing",
  grade(range, [8800, 8900]).credit === 1 &&
    grade(range, [7000, 9500]).correct &&
    near(grade(range, [7000, 9500]).credit, 0.2) &&
    !grade(range, [9000, 9500]).correct &&
    !grade(range, [5000, 10000]).correct,
  `loose → ${grade(range, [7000, 9500]).credit}`,
);
check(
  "closest number: dead on is right, near is partial, way off is nothing",
  grade(closest, 384400).correct &&
    near(grade(closest, 400000).credit, 0.84) &&
    grade(closest, "384,400").correct &&
    grade(closest, 900000).credit === 0,
  `400,000 → ${grade(closest, 400000).credit}`,
);
{
  const world = MAP_FRAMES.world;
  const at = (lat: number, lng: number) => {
    const target = geoPinTarget(world, lat, lng, 1)!;
    return [target.x, target.y];
  };
  const berlin = grade(paris, at(52.52, 13.405));
  check(
    "pin: on target is right, the next country over is partial, another continent is nothing",
    grade(paris, at(48.86, 2.35)).correct &&
      !berlin.correct && berlin.credit > 0 && berlin.credit < 1 &&
      grade(paris, at(-33.87, 151.21)).credit === 0,
    `Berlin → ${berlin.credit}`,
  );
  check(
    "pin: distances on a built-in map use the map's own shape, whatever the phone says",
    gradeAnswer(paris, [...at(52.52, 13.405), 9]).credit === berlin.credit,
  );
}
check(
  "a miss by a hair is still worth less than a hit",
  gradeAnswer(slider, 1969.01).credit < 1 &&
    !gradeAnswer(slider, 1969.01).correct &&
    gradeAnswer(paris, [paris.pin!.x + paris.pin!.radius * 1.0001, paris.pin!.y]).credit < 1,
  `slider ${gradeAnswer(slider, 1969.01).credit}`,
);
check(
  "pin on a picture: the aspect a phone reports stretches distance down the picture",
  gradeAnswer(redSquare, [0.4, 0.33, 1]).correct && !gradeAnswer(redSquare, [0.4, 0.33, 3]).correct,
);
check(
  "order puzzle: all or nothing",
  grade(order, [...order.options]).correct &&
    grade(order, [order.options[1], order.options[0], ...order.options.slice(2)]).credit === 0,
);
check(
  "match: half right is a third of the points once guessing is taken out",
  near(
    grade(match, { Au: "Silver", Ag: "Gold", Fe: "Iron", Na: "Sodium" }).credit,
    0.33,
  ) && grade(match, { Au: "Gold", Ag: "Silver", Fe: "Iron", Na: "Sodium" }).correct,
);
check(
  "sort: putting everything in one group is no better than guessing, and scores nothing",
  grade(sort, Object.fromEntries(sort.options.map((item) => [item, "Fruit"]))).credit === 0,
);
check(
  "scramble: case and spacing do not matter, the letters do",
  grade(scramble, "new york").correct &&
    grade(scramble, "NEWYORK").correct &&
    !grade(scramble, "YORKNEW").correct,
);
check(
  "a malformed answer is wrong, not an error",
  [mc, multi, slider, range, closest, paris, order, match, sort, scramble].every((q) =>
    [null as any, undefined as any, {}, [], "", "x", 3, ["a"]].every(
      (bad) => gradeAnswer(q, bad).credit === 0,
    ),
  ),
);

/* ------------------------------------------------------------------ *
 * 3. Nothing published gives an answer away
 * ------------------------------------------------------------------ */

section("3. What reaches a screen never carries the answer");

const published = (q: Question) => JSON.stringify(toPublicQuestion(q));
check(
  "slider and range publish their scale and nothing else",
  [slider, range].every((q) => publicOptions(q).length === 3),
);
check("a closest-number question publishes no number", publicOptions(closest).length === 0 && !published(closest).includes("384400"));
check(
  "a pin question publishes its picture and not its target",
  [paris, fortMyers, redSquare].every((q) => {
    const pub = toPublicQuestion(q) as any;
    return pub.image === q.image && pub.pin === undefined && pub.options.length === 0;
  }),
);
check(
  "a match puzzle's partners are shuffled, and never shown in the answer order",
  Array.from({ length: 60 }).every((_, n) => {
    const q = { ...match, id: `match-${n}` };
    const shown = matchChoices(q);
    return shown.some((item, i) => item !== q.pairs![i]) &&
      [...shown].sort().join() === [...q.pairs!].sort().join();
  }),
);
check(
  "a sort's items are never shown in the order they were written, nor with their groups",
  Array.from({ length: 60 }).every((_, n) => {
    const q = { ...sort, id: `sort-${n}` };
    const pub = toPublicQuestion(q);
    return pub.options.join() !== q.options.join() && !("pairs" in pub);
  }),
);
check(
  "a scramble's tiles never spell the word",
  Array.from({ length: 60 }).every((_, n) => {
    const q = { ...anagram, id: `scramble-${n}` };
    const tiles = publicOptions(q);
    return tiles.join("") !== "HAMSTRING" && [...tiles].sort().join("") === [..."HAMSTRING"].sort().join("");
  }),
);
check("a scramble says how long each word is", toPublicQuestion(scramble).choices?.join(",") === "3,4");
check(
  "an order puzzle is never published in its answer order",
  Array.from({ length: 60 }).every((_, n) =>
    publicOptions({ ...order, id: `order-${n}` }).join() !== order.options.join(),
  ),
);

/* ------------------------------------------------------------------ *
 * 4. Bots
 * ------------------------------------------------------------------ */

section("4. Bots answer every type in a shape the grader accepts");

const everyType = [mc, multi, tfTrue, slider, range, closest, paris, fortMyers, redSquare, order, match, sort, anagram];
check(
  "a bot meaning to be right is right, with full credit",
  everyType.every((q) => {
    const g = gradeAnswer(q, botAnswerFor(q, true));
    return g.correct && g.credit === 1;
  }),
  everyType.filter((q) => gradeAnswer(q, botAnswerFor(q, true)).credit !== 1).map((q) => q.type).join(", "),
);
check(
  "a bot meaning to be wrong is wrong",
  everyType.every((q) => !gradeAnswer(q, botAnswerFor(q, false, () => 0.3)).correct),
  everyType.filter((q) => gradeAnswer(q, botAnswerFor(q, false, () => 0.3)).correct).map((q) => q.type).join(", "),
);
check(
  "a multi-select keeps its correct answers through the deal's shuffle",
  Array.from({ length: 40 }).every(() => {
    const dealt = shuffleOptions(multi);
    return dealt.correctIndices!.map((i) => dealt.options[i]).sort().join() === "Jupiter,Saturn" &&
      dealt.correctIndex === dealt.correctIndices![0];
  }),
);

/* ------------------------------------------------------------------ *
 * 5. The round engine
 * ------------------------------------------------------------------ */

section("5. Each type gets its own clock, and the clock is worth the same on all of them");

check(
  "a fifteen-second question pays exactly what it always has",
  answerPoints(1, TIMER_DURATION, TIMER_DURATION, 1) === 100 + TIMER_DURATION * 10 &&
    answerPoints(1, 7, TIMER_DURATION, 1) === 170,
);
check(
  "a full clock is worth the same on a thirty-second puzzle",
  answerPoints(1, 30, 30, 1) === answerPoints(1, 15, 15, 1),
);
check("half credit is half the points", answerPoints(0.5, 15, 15, 2) === 250);
check(
  "a puzzle gets longer than a true/false, and a question can set its own clock",
  questionSeconds(order) > questionSeconds(tfTrue) &&
    questionSeconds(anagram) === 45 &&
    questionSeconds({ ...mc, timeLimit: 999 }) === 120 &&
    questionSeconds(mc) === TIMER_DURATION,
);

const players: Player[] = ["p1", "p2"].map((id) => ({
  id,
  name: id,
  avatar: "🐼",
  score: 0,
  roundScore: 0,
  isBot: false,
  streak: 0,
}));
const round = [paris, slider, sort, scramble];
const start: GameState = {
  phase: GamePhase.PLAYING,
  mode: GameMode.STANDARD,
  players,
  currentPlayerId: "p1",
  isHost: true,
  gamePin: "1234",
  broadcastTitle: "Trivia",
  broadcastSubtitle: "",
  gameName: "Types",
  hostPassword: "",
  clientPin: null,
  clientPlayerId: null,
  joining: false,
  joinError: null,
  resuming: false,
  resumeError: null,
  totalRounds: 1,
  questionsPerRound: round.length,
  roundsConfig: [
    { roundNumber: 1, category: { id: "geo", name: "Geography", icon: "🌍", color: "bg-blue-500" }, questions: round },
  ],
  importPreview: null,
  currentRound: 1,
  questionsQueue: round,
  usedCategories: [],
  selectedCategory: "geo",
  bracket: [],
  championId: null,
  lanes: [],
  broadcastQuestionIndex: 0,
  broadcastRevealing: false,
  broadcastRevealSecondsLeft: REVEAL_DURATION,
  autoAdvance: true,
  losersBracket: false,
  qualifyingRounds: 0,
  botsEnabled: false,
  hostAnsweringEnabled: true,
  wheelSpinning: false,
  categoryRevealed: true,
  categoryLikes: [],
  categoryPoll: null,
  loading: false,
  error: null,
  contentWarning: null,
  initialPin: null,
  roomWarning: null,
};
let state: GameState = { ...start, lanes: buildRoundLanes(start) };
const seatOf = (id: string) => seatForPlayer(state.lanes, id)!;

check(
  "the first question's clock is the pin question's clock",
  seatOf("p1").timeLeft === questionSeconds(paris) && seatOf("p1").questionDuration === questionSeconds(paris),
  `${seatOf("p1").timeLeft}s`,
);

const parisSpot = [paris.pin!.x, paris.pin!.y, mapAspect(MAP_FRAMES.world)];
state = recordLaneAnswer(state, "p1", parisSpot);
const berlinSpot = (() => {
  const t = geoPinTarget(MAP_FRAMES.world, 52.52, 13.405, 1)!;
  return [t.x, t.y];
})();
state = recordLaneAnswer(state, "p2", berlinSpot);
const p1 = state.players.find((p) => p.id === "p1")!;
const p2 = state.players.find((p) => p.id === "p2")!;
check(
  "a pin on target scores in full, with the time bonus scaled to the pin's clock",
  p1.roundScore === answerPoints(1, questionSeconds(paris), questionSeconds(paris), 1) && p1.streak === 1,
  `${p1.roundScore} points`,
);
check(
  "a near-miss pin scores some points, but is not marked right and breaks no streak record",
  p2.roundScore > 0 && p2.roundScore < p1.roundScore && p2.streak === 0,
  `${p2.roundScore} points`,
);

// Finish the round and read the answer key the room is shown.
const ended: GameState = { ...state, phase: GamePhase.ROUND_END };
const snapshot = buildSnapshot(ended, "host");
const pinReview = snapshot.roundReview?.[0];
check(
  "the answer key counts a near miss as close, not as right",
  pinReview?.correctCount === 1 && pinReview?.closeCount === 1 && pinReview?.answeredCount === 2,
);
check(
  "the answer key carries where every pin landed, and the target to draw them against",
  pinReview?.responses?.length === 2 && Boolean(pinReview?.reveal.pin) && pinReview?.reveal.image === "map:world",
);
check(
  "a live snapshot never carries a pin's target",
  !JSON.stringify(buildSnapshot(start, "host")).includes(`"pin":`),
);

/* ------------------------------------------------------------------ *
 * 6. Export and import again
 * ------------------------------------------------------------------ */

section("6. Exporting a game and importing it again gives back the same questions");

const roundTrip = parseImportData(exportRoundsToCSV(report.contents));
const again = Object.values(roundTrip).flatMap((c: CategoryContent) => c.questions);
const same = (a: Question, b: Question | undefined): boolean => {
  if (!b) return false;
  const close = (x?: number, y?: number) => Math.abs((x ?? 0) - (y ?? 0)) < 1e-3;
  return (
    a.type === b.type &&
    a.options.join("|") === b.options.join("|") &&
    (a.pairs ?? []).join("|") === (b.pairs ?? []).join("|") &&
    (a.correctIndices ?? []).join() === (b.correctIndices ?? []).join() &&
    a.correctIndex === b.correctIndex &&
    (a.margin ?? "") === (b.margin ?? "") &&
    (a.unit ?? "") === (b.unit ?? "") &&
    (a.timeLimit ?? 0) === (b.timeLimit ?? 0) &&
    (a.image ?? "") === (b.image ?? "") &&
    close(a.pin?.x, b.pin?.x) && close(a.pin?.y, b.pin?.y) && close(a.pin?.radius, b.pin?.radius)
  );
};
const drifted = imported.filter((q) => !same(q, again.find((b) => b.text === q.text)));
check(
  "every type survives the round trip",
  drifted.length === 0 && again.length === imported.length,
  drifted.map((q) => `${q.type}: ${q.text}`).join(" / "),
);

/* ------------------------------------------------------------------ *
 * 7. What Claude writes goes through the same converter
 * ------------------------------------------------------------------ */

section("7. A generated round in every format becomes the questions it describes");

const blank = { map: "" as const, unit: "" };
const generated = questionsFromGenerated("Science", [
  { ...blank, type: QuestionType.MULTIPLE_CHOICE, text: "Which planet is largest?", options: ["Jupiter", "Saturn", "Mars", "Venus"], correctAnswer: "Jupiter", explanation: "." },
  { ...blank, type: QuestionType.MULTI_SELECT, text: "Which are mammals?", options: ["Whale", "Shark", "Bat", "Trout"], correctAnswer: "Whale | Bat", explanation: "." },
  { ...blank, type: QuestionType.TRUE_FALSE, text: "Venus spins backwards.", options: [], correctAnswer: "True", explanation: "." },
  { ...blank, type: QuestionType.TYPE_ANSWER, text: "Who proposed general relativity?", options: ["Albert Einstein", "Einstein"], correctAnswer: "Albert Einstein", explanation: "." },
  { ...blank, type: QuestionType.SLIDER, text: "When was the first Moon landing?", options: ["1950", "1990", "1", "1969", "1969"], correctAnswer: "1969", explanation: "." },
  { ...blank, type: QuestionType.RANGE, text: "How many bones in an adult?", options: ["100", "400", "1"], correctAnswer: "206", explanation: "." },
  { ...blank, type: QuestionType.NUMBER, text: "Speed of light in km/s?", options: [], correctAnswer: "299792", explanation: ".", unit: "km/s" },
  { ...blank, type: QuestionType.PIN, text: "Drop a pin on CERN.", options: ["46.2338", "6.0553", "300"], correctAnswer: "CERN, Geneva", explanation: ".", map: "world" },
  { ...blank, type: QuestionType.PIN, text: "Drop a pin on Cape Canaveral.", options: ["28.3922", "-80.6077", "100"], correctAnswer: "Cape Canaveral", explanation: ".", map: "usa" },
  { ...blank, type: QuestionType.PUZZLE, text: "Order these discoveries.", options: ["Gravity", "Electron", "DNA helix", "Higgs boson"], correctAnswer: "Gravity | Electron | DNA helix | Higgs boson", explanation: "." },
  { ...blank, type: QuestionType.MATCH, text: "Match the scientist to the field.", options: ["Darwin = Evolution", "Curie = Radioactivity", "Newton = Gravity", "Mendel = Genetics"], correctAnswer: "See the pairs", explanation: "." },
  { ...blank, type: QuestionType.CATEGORIZE, text: "Metal or non-metal?", options: ["Iron = Metal", "Carbon = Non-metal", "Copper = Metal", "Oxygen = Non-metal"], correctAnswer: "See the groups", explanation: "." },
  { ...blank, type: QuestionType.SCRAMBLE, text: "The powerhouse of the cell", options: [], correctAnswer: "Mitochondria", explanation: "." },
  // And one the converter has to refuse rather than guess at.
  { ...blank, type: QuestionType.MULTIPLE_CHOICE, text: "Broken one?", options: ["A", "B", "C", "D"], correctAnswer: "E", explanation: "." },
]);
check(
  "every well-formed generated question survives, in its own format, and a broken one is dropped",
  generated.length === 13 &&
    new Set(generated.map((q) => q.type)).size === Object.values(QuestionType).length,
  `${generated.length} kept: ${[...new Set(generated.map((q) => q.type))].join(", ")}`,
);
check(
  "a generated question's right answer grades as right",
  generated.every((q) => gradeAnswer(q, botAnswerFor(q, true)).correct),
  generated.filter((q) => !gradeAnswer(q, botAnswerFor(q, true)).correct).map((q) => q.type).join(", "),
);
check(
  "a generated pin defaults to the map it names, and a number keeps its unit",
  generated.find((q) => q.text.includes("Cape Canaveral"))?.image === "map:usa" &&
    generated.find((q) => q.type === QuestionType.NUMBER)?.unit === "km/s",
);

/* ------------------------------------------------------------------ *
 * The example file
 * ------------------------------------------------------------------ */

section("The example file covers every type");

const repoRoot = process.env.PROBE_REPO_ROOT ?? process.cwd();
const example = parseImportDataWithReport(readFileSync(join(repoRoot, "questions.example.csv"), "utf8"));
const exampleTypes = new Set(Object.values(example.contents).flatMap((c) => c.questions).map((q) => q.type));
const missing = Object.values(QuestionType).filter((type) => !exampleTypes.has(type));
check(
  "questions.example.csv has at least one of every type, and every row plays",
  missing.length === 0 && example.skipped.length === 0,
  [missing.length ? `missing ${missing.join(", ")}` : "", example.skipped.map((s) => `row ${s.row}: ${s.reason}`).join("; ")]
    .filter(Boolean)
    .join(" — "),
);

/* ------------------------------------------------------------------ *
 * The template workbook
 * ------------------------------------------------------------------ */

section("The template workbook is the example file");

// `questions.template.xlsx` is built from the example file by
// scripts/generate-template.py. A host fills it in and imports its first tab,
// so a template that drifts from what the importer reads is a broken night.
const trimEnd = (cells: string[]): string[] => {
  const copy = [...cells];
  while (copy.length > 0 && copy[copy.length - 1] === "") copy.pop();
  return copy;
};
const tabs = readWorkbook(readFileSync(join(repoRoot, "questions.template.xlsx")));
const exampleRows = readFileSync(join(repoRoot, "questions.example.csv"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "")
  .map((line) => trimEnd(csvCells(line)));
const templateRows = (tabs[0]?.rows ?? []).map(trimEnd).filter((row) => row.length > 0);
const firstDifference = exampleRows.findIndex(
  (row, i) => JSON.stringify(row) !== JSON.stringify(templateRows[i]),
);
check(
  "questions.template.xlsx opens with its Questions tab, holding questions.example.csv cell for cell",
  tabs[0]?.name === "Questions" &&
    templateRows.length === exampleRows.length &&
    firstDifference === -1,
  tabs[0]?.name !== "Questions"
    ? `first tab is "${tabs[0]?.name}"`
    : firstDifference !== -1 || templateRows.length !== exampleRows.length
      ? `row ${firstDifference === -1 ? Math.min(templateRows.length, exampleRows.length) + 1 : firstDifference + 1} differs — run python3 scripts/generate-template.py`
      : "",
);
const typeGuide = tabs.find((tab) => tab.name === "Question types")?.rows ?? [];
const misdescribed = Object.values(QuestionType).filter(
  (type) =>
    !typeGuide.some(
      (row) => row[0] === type && row.includes(`${QUESTION_TYPES[type].seconds}s`),
    ),
);
check(
  "the template's Question types tab lists every format, with the clock the game gives it",
  misdescribed.length === 0,
  misdescribed.join(", "),
);
const unreadSpellings = typeGuide.flatMap((row) =>
  (Object.values(QuestionType) as string[]).includes(row[0])
    ? (row[row.length - 1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name && !/^or leave blank$/i.test(name))
        .filter((name) => parseQuestionType(name) !== row[0])
        .map((name) => `${name} ≠ ${row[0]}`)
    : [],
);
const listedSpellings = typeGuide.filter((row) => (Object.values(QuestionType) as string[]).includes(row[0])).length;
check(
  "every other spelling the template's Question types tab lists reads as its format",
  listedSpellings === Object.values(QuestionType).length && unreadSpellings.length === 0,
  unreadSpellings.join(", ") || `${listedSpellings} formats`,
);

/* ------------------------------------------------------------------ *
 * The guide
 * ------------------------------------------------------------------ */

section("Every example in QUESTION_FORMAT.md imports as the format it is shown for");

// A host copies these rows into a sheet. One that is left out, or that comes
// in as a different format, teaches the wrong thing with the guide's
// authority behind it.
const guide = readFileSync(join(repoRoot, "QUESTION_FORMAT.md"), "utf8").split(/\r?\n/);
const examples: { heading: string; type: string | null; csv: string }[] = [];
let heading = "";
for (let i = 0; i < guide.length; i += 1) {
  if (/^#{2,3} /.test(guide[i])) heading = guide[i];
  if (guide[i].trim() === "```csv") {
    const end = guide.indexOf("```", i + 1);
    examples.push({
      heading,
      type: heading.match(/`([A-Z_]+)`/)?.[1] ?? null,
      csv: guide.slice(i + 1, end).join("\n"),
    });
    i = end;
  }
}
const misread = examples.flatMap(({ heading, type, csv }) => {
  let report: ReturnType<typeof parseImportDataWithReport>;
  try {
    report = parseImportDataWithReport(csv);
  } catch (error: any) {
    // Nothing in the block could be played at all.
    return [`${heading.replace(/^#+ /, "")}: ${error?.message ?? error}`];
  }
  const parsed = Object.values(report.contents).flatMap((c) => c.questions);
  // Outside a format's own section — the shorthand — any format will do.
  const wrongType = type ? parsed.filter((q) => q.type !== type) : [];
  return report.skipped.length > 0 || wrongType.length > 0 || parsed.length === 0
    ? [`${heading.replace(/^#+ /, "")}: ${report.skipped.map((s) => s.reason).join(", ") || wrongType.map((q) => q.type).join(", ") || "nothing read"}`]
    : [];
});
check(
  "every CSV example in the guide imports, nothing left out, as its section's format",
  new Set(examples.map((e) => e.type).filter(Boolean)).size === Object.values(QuestionType).length &&
    misread.length === 0,
  misread.length ? misread.join(" | ") : `${examples.length} examples`,
);

// The at-a-glance table promises other spellings for the type column.
const glance = guide.filter((line) => /^\| `[A-Z_]+` \|/.test(line));
const badAliases = glance.flatMap((line) => {
  const cells = line.split("|").map((cell) => cell.trim());
  const type = cells[1].replace(/`/g, "");
  const aliases = [...cells[cells.length - 2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  return aliases.filter((alias) => parseQuestionType(alias) !== type).map((alias) => `${alias} ≠ ${type}`);
});
check(
  "every other spelling the guide lists for the type column reads as its format",
  glance.length === Object.values(QuestionType).length && badAliases.length === 0,
  badAliases.join(", ") || `${glance.length} formats`,
);
check("`Sort` is the sort puzzle, as the guide warns, not putting things in order", parseQuestionType("Sort") === QuestionType.CATEGORIZE);

// The guide's table of reasons a row is left out is how a host reads the
// setup screen. The reasons added with the importer's own checks have to be
// in it, word for word as the importer gives them.
const guideReasons = guide.filter((line) => /^\| [a-z]/.test(line)).map((line) => line.split("|")[1].trim());
const importerReasons = [
  unknownTypes.skipped[0]?.reason.replace(/"[^"]*"/, '"…"'),
  answerKey(["Boston", "Chicago", "Denver", "Austin"], "B").replace(/^left out: /, ""),
  tabQuotes.skipped[0]?.reason,
];
check(
  "the guide lists the reasons an unknown format, a letter answer and a cut cell are left out for, as the importer words them",
  importerReasons.every((reason) => reason !== undefined && guideReasons.includes(reason)),
  importerReasons.filter((reason) => !guideReasons.includes(reason!)).join(" | "),
);

console.log(failures === 0 ? "\nAll question-type checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);

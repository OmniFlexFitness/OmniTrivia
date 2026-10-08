import { Question, QuestionType } from "../types";
import { TIMER_DURATION } from "../constants";

/**
 * Everything the game knows about a question type that is not how to grade
 * it: what it is called, how long it gets on the clock, how a spreadsheet may
 * spell it, and how the room is told to answer it.
 *
 * One table, so the review screen's badge, the importer's type column, the
 * clock and the big screen's caption cannot each have their own idea of what
 * a "match" question is.
 */
export interface QuestionTypeInfo {
  type: QuestionType;
  /** Plain name, for a host. */
  label: string;
  /** Short, upper-case tag for a badge. */
  badge: string;
  /** Tailwind classes for that badge. */
  tone: string;
  /** Seconds on the clock unless the question sets its own. */
  seconds: number;
  /** One line telling the room how to answer, on the big screen. */
  prompt: string;
  /**
   * Other ways a spreadsheet's `type` column may name it, besides the type,
   * its label and its badge, which are always accepted.
   */
  aliases: string[];
}

export const QUESTION_TYPES: Record<QuestionType, QuestionTypeInfo> = {
  [QuestionType.MULTIPLE_CHOICE]: {
    type: QuestionType.MULTIPLE_CHOICE,
    label: "Multiple choice",
    badge: "Multiple choice",
    tone: "bg-sky-500/20 text-sky-300",
    seconds: TIMER_DURATION,
    prompt: "Pick one",
    // "multiple" is what an Open Trivia DB export writes.
    aliases: ["MC", "MCQ", "QUIZ", "CHOICE", "MULTIPLE", "MULTI_CHOICE", "MULTIPLE_CHOICE_QUESTION", "SINGLE_CHOICE", "SINGLE_SELECT"],
  },
  [QuestionType.MULTI_SELECT]: {
    type: QuestionType.MULTI_SELECT,
    label: "Select all that apply",
    badge: "Multi-select",
    tone: "bg-cyan-500/20 text-cyan-300",
    seconds: 20,
    prompt: "Select every right answer — a wrong pick cancels a right one",
    aliases: ["MULTIPLE_SELECT", "SELECT_ALL", "SELECT_ALL_THAT_APPLY", "ALL_THAT_APPLY", "CHOOSE_ALL", "MULTI", "MULTISELECT", "CHECKBOX", "CHECKBOXES", "MULTIPLE_ANSWER", "MULTIPLE_ANSWERS"],
  },
  [QuestionType.TRUE_FALSE]: {
    type: QuestionType.TRUE_FALSE,
    label: "True or false",
    badge: "True / false",
    tone: "bg-purple-500/20 text-purple-300",
    seconds: 12,
    prompt: "True or false?",
    aliases: ["TF", "T_F", "TRUE_OR_FALSE", "TRUEFALSE", "BOOLEAN", "FACT_OR_FICTION"],
  },
  [QuestionType.TYPE_ANSWER]: {
    type: QuestionType.TYPE_ANSWER,
    label: "Typed answer",
    badge: "Type answer",
    tone: "bg-yellow-500/20 text-yellow-300",
    seconds: 20,
    prompt: "Type it on your phone",
    aliases: ["TYPE", "TYPED", "TEXT", "TEXT_INPUT", "SHORT_ANSWER", "OPEN", "OPEN_ENDED", "FREE_TEXT", "FILL_IN", "FILL_IN_THE_BLANK", "FILL_IN_THE_BLANKS", "FILL_IN_BLANK"],
  },
  [QuestionType.SLIDER]: {
    type: QuestionType.SLIDER,
    label: "Slider",
    badge: "Slider",
    tone: "bg-orange-500/20 text-orange-300",
    seconds: 20,
    prompt: "Slide to your answer",
    aliases: ["SLIDE", "SCALE"],
  },
  [QuestionType.RANGE]: {
    type: QuestionType.RANGE,
    label: "Range",
    badge: "Range",
    tone: "bg-amber-500/20 text-amber-300",
    seconds: 20,
    prompt: "Catch the answer between your two handles — the tighter, the more it pays",
    aliases: ["RANGE_SLIDER", "BRACKET", "INTERVAL", "BETWEEN"],
  },
  [QuestionType.NUMBER]: {
    type: QuestionType.NUMBER,
    label: "Closest number",
    badge: "Closest number",
    tone: "bg-lime-500/20 text-lime-300",
    seconds: 20,
    prompt: "Type a number — closest guess scores the most",
    aliases: ["CLOSEST", "CLOSEST_NUMBER", "CLOSEST_GUESS", "ESTIMATE", "NUMERIC", "GUESS", "NEAREST"],
  },
  [QuestionType.PIN]: {
    type: QuestionType.PIN,
    label: "Pin answer",
    badge: "Pin answer",
    tone: "bg-emerald-500/20 text-emerald-300",
    seconds: 25,
    prompt: "Drop your pin on your phone",
    aliases: ["PIN_ANSWER", "DROP_PIN", "MAP", "MAP_PIN", "HOTSPOT", "PIN_IT"],
  },
  [QuestionType.PUZZLE]: {
    type: QuestionType.PUZZLE,
    label: "Puzzle · order",
    badge: "Puzzle · order",
    tone: "bg-red-500/20 text-red-300",
    seconds: 30,
    prompt: "Put them in the right order",
    aliases: ["ORDER", "SEQUENCE", "SORT_ORDER", "RANK", "TIMELINE"],
  },
  [QuestionType.MATCH]: {
    type: QuestionType.MATCH,
    label: "Puzzle · match",
    badge: "Puzzle · match",
    tone: "bg-pink-500/20 text-pink-300",
    seconds: 30,
    prompt: "Pair every item with its partner",
    aliases: ["MATCHING", "PAIRS", "PAIR", "CONNECT", "MATCH_UP"],
  },
  [QuestionType.CATEGORIZE]: {
    type: QuestionType.CATEGORIZE,
    label: "Puzzle · sort",
    badge: "Puzzle · sort",
    tone: "bg-fuchsia-500/20 text-fuchsia-300",
    seconds: 30,
    prompt: "Sort every item into its group",
    aliases: ["CATEGORISE", "SORT", "GROUP", "GROUPS", "BUCKETS", "CLASSIFY"],
  },
  [QuestionType.SCRAMBLE]: {
    type: QuestionType.SCRAMBLE,
    label: "Puzzle · unscramble",
    badge: "Puzzle · unscramble",
    tone: "bg-violet-500/20 text-violet-300",
    seconds: 25,
    prompt: "Unscramble the letters",
    aliases: ["UNSCRAMBLE", "ANAGRAM", "WORD_SCRAMBLE", "JUMBLE"],
  },
};

export const typeInfo = (type: QuestionType | undefined): QuestionTypeInfo =>
  QUESTION_TYPES[type ?? QuestionType.MULTIPLE_CHOICE] ??
  QUESTION_TYPES[QuestionType.MULTIPLE_CHOICE];

/**
 * A `type` cell as the importer compares it: upper case, words joined by _.
 * The badges separate their words with "·" ("Puzzle · order"), so a host who
 * copies a badge off the review screen is read the same as one who types it.
 */
const typeKey = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/[\s/&·•:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

/**
 * Every name the `type` column may use, keyed as `typeKey` writes it and again
 * with its underscores taken out, so "multiselect" finds MULTI_SELECT. Built
 * once: an import looks a type up for every row.
 */
const TYPE_NAMES: ReadonlyMap<string, QuestionType> = (() => {
  const names = new Map<string, QuestionType>();
  for (const info of Object.values(QUESTION_TYPES)) {
    for (const name of [info.type, info.label, info.badge, ...info.aliases]) {
      const key = typeKey(name);
      for (const form of [key, key.replace(/_/g, "")]) {
        if (!names.has(form)) names.set(form, info.type);
      }
    }
  }
  return names;
})();

/**
 * The type a spreadsheet's `type` column names, or null when it names none.
 * "true/false", "True or False", "multi-select", "Pin answer", "anagram" and
 * every name the app itself shows — "Typed answer", "Puzzle · sort" — all
 * resolve.
 */
export const parseQuestionType = (value: string | undefined | null): QuestionType | null => {
  if (!value || !value.trim()) return null;
  const key = typeKey(value);
  return TYPE_NAMES.get(key) ?? TYPE_NAMES.get(key.replace(/_/g, "")) ?? null;
};

/** Shortest and longest clock a question may ask for. */
export const MIN_TIME_LIMIT = 5;
export const MAX_TIME_LIMIT = 120;

/**
 * Seconds on the clock for one question: its own `timeLimit` if it set one,
 * otherwise its type's default. A puzzle takes longer to do than a true/false
 * takes to read, and giving both fifteen seconds makes one trivial and the
 * other impossible.
 */
export const questionSeconds = (question: Question | undefined): number => {
  if (!question) return TIMER_DURATION;
  const own = question.timeLimit;
  if (typeof own === "number" && Number.isFinite(own) && own > 0) {
    return Math.round(Math.max(MIN_TIME_LIMIT, Math.min(MAX_TIME_LIMIT, own)));
  }
  return typeInfo(question.type).seconds;
};

/**
 * A number as a room reads it: thousands separated, no trailing zeros, and
 * the unit after it — "384,400 km", "1,969", "98.6 °F". Years are left without
 * a separator because "1,969" reads as a quantity, not a date.
 */
export const formatNumber = (value: number, unit?: string): string => {
  if (!Number.isFinite(value)) return "—";
  const looksLikeYear = Number.isInteger(value) && value >= 1000 && value <= 2999 && !unit;
  const text = looksLikeYear
    ? String(value)
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!unit) return text;
  // A symbol hugs the number; a word gets a space.
  return /^[%°′″'"]/.test(unit) ? `${text}${unit}` : `${text} ${unit}`;
};

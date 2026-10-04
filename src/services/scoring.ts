import { AnswerMargin, Answer, Question, QuestionType } from "../types";
import { mapAspect, mapFrameFor } from "./mapProjection";

// The answer shape moved to types.ts so the broadcast snapshot can reference it
// without pulling in game logic. Re-exported here because this module is where
// callers expect to find it.
export type { Answer };

/** Loose text match: case and surrounding/repeated whitespace are ignored. */
export const normalize = (value: string): string =>
  value.toLowerCase().trim().replace(/\s+/g, " ");

/**
 * How one answer went.
 *
 * `correct` is the verdict a player is shown — the ✓, the streak, the "got
 * it" count on the answer key. `credit` is the share of the question's points
 * it earns, from 0 to 1. For most types the two move together (right is 1,
 * wrong is 0); the "how close" types pull them apart, so a slider answer just
 * outside the target is not correct but still scores, and a range that caught
 * the answer is correct but scores less the wider it was cast.
 */
export interface Grade {
  correct: boolean;
  credit: number;
}

const WRONG: Grade = { correct: false, credit: 0 };
const RIGHT: Grade = { correct: true, credit: 1 };

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Two decimals is plenty, and it keeps a near-miss's points a clean number. */
const tidy = (credit: number): number => Math.round(clamp01(credit) * 100) / 100;

/* ------------------------------------------------------------------ *
 * Margins
 * ------------------------------------------------------------------ */

/**
 * How far past the target a near miss can land and still score, per margin.
 * Credit falls in a straight line from full at the target's edge to nothing
 * at the margin's edge.
 *
 * - SLIDER: a share of the slider's whole scale.
 * - NUMBER: a share of the answer itself — 25% of 384,400 km is a lot more
 *   room than 25% of 7 continents, which is the point.
 * - PIN:    a share of the picture's width.
 */
export const MARGIN_REACH: Record<"SLIDER" | "NUMBER" | "PIN", Record<AnswerMargin, number>> = {
  SLIDER: { none: 0, low: 0.05, medium: 0.15, high: 0.3, maximum: 1 },
  NUMBER: { none: 0, low: 0.1, medium: 0.25, high: 0.5, maximum: 1 },
  PIN: { none: 0, low: 0.05, medium: 0.1, high: 0.2, maximum: 1 },
};

/**
 * The margin a question is played with when its file does not say.
 *
 * A slider already has a target *range*, which is a margin the author chose,
 * so it stays exact — that is also how every slider written before margins
 * existed was graded. A pin gets a little give, because a fingertip on a
 * phone is not a precise instrument. A closest-number question is all about
 * getting close, so it is generous by default.
 */
export const DEFAULT_MARGIN: Partial<Record<QuestionType, AnswerMargin>> = {
  [QuestionType.SLIDER]: "none",
  [QuestionType.PIN]: "low",
  [QuestionType.NUMBER]: "medium",
};

export const MARGINS: AnswerMargin[] = ["none", "low", "medium", "high", "maximum"];

export const marginFor = (question: Question): AnswerMargin =>
  question.margin ?? DEFAULT_MARGIN[question.type ?? QuestionType.MULTIPLE_CHOICE] ?? "none";

/**
 * A miss is never worth as much as a hit: a near miss tops out a point short
 * of full, so "not quite" can never round its way up to the same score as
 * dead on.
 */
const NEAR_MISS_CEILING = 0.99;

/** Credit for landing `miss` past the target, with `reach` of margin. */
const nearMiss = (miss: number, reach: number): Grade =>
  miss <= 0
    ? RIGHT
    : reach > 0
      ? { correct: false, credit: Math.min(NEAR_MISS_CEILING, tidy(1 - miss / reach)) }
      : WRONG;

/* ------------------------------------------------------------------ *
 * Ranges
 * ------------------------------------------------------------------ */

/** A range no wider than this share of the scale earns every point. */
export const RANGE_FULL_WIDTH = 0.1;
/** Wider than this share of the scale and the range is too loose to count. */
export const RANGE_MAX_WIDTH = 0.5;
/** What a range exactly RANGE_MAX_WIDTH wide still earns. */
export const RANGE_MIN_CREDIT = 0.2;

/* ------------------------------------------------------------------ *
 * Reading answers
 * ------------------------------------------------------------------ */

/** A number out of whatever a phone sent: 384400, "384,400", " 7 ". */
export const readNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[,\s_]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const numbersOf = (answer: Answer): number[] | null =>
  Array.isArray(answer) && answer.every((value) => typeof value === "number")
    ? (answer as number[])
    : null;

const recordOf = (answer: Answer): Record<string, string> | null =>
  answer && typeof answer === "object" && !Array.isArray(answer)
    ? (answer as Record<string, string>)
    : null;

/** Letters and digits only, lower case — how a scramble is compared. */
export const scrambleKey = (value: string): string =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The value a record holds for `key`, tolerating a key typed loosely. */
const lookup = (record: Record<string, string>, key: string): string | undefined => {
  if (key in record) return record[key];
  const wanted = normalize(key);
  const found = Object.keys(record).find((candidate) => normalize(candidate) === wanted);
  return found === undefined ? undefined : record[found];
};

/**
 * A sort graded against chance: placing items no better than a coin flip
 * would earns nothing, a perfect sort earns everything, and the credit runs
 * straight between the two. Without it, dumping every item in one group of
 * two scores half the points for knowing nothing.
 */
const beyondChance = (hits: number, total: number, choices: number): Grade => {
  if (total === 0) return WRONG;
  if (hits === total) return RIGHT;
  const chance = choices > 0 ? 1 / choices : 0;
  const accuracy = hits / total;
  return {
    correct: false,
    credit: chance >= 1 ? 0 : tidy((accuracy - chance) / (1 - chance)),
  };
};

/* ------------------------------------------------------------------ *
 * Grading
 * ------------------------------------------------------------------ */

/**
 * The single source of truth for how an answer went. The points banked in
 * `lanes.ts`, the verdicts published at the end of a match and the probes in
 * `scripts/` all call this, so none of them can disagree about the same
 * answer. A malformed answer — the wrong shape for the type — is wrong, never
 * an error.
 */
export const gradeAnswer = (question: Question, answer: Answer): Grade => {
  const options = question.options;

  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      // Every option is an accepted spelling of the answer.
      return typeof answer === "string" &&
        answer.trim() !== "" &&
        options.some((option) => normalize(option) === normalize(answer))
        ? RIGHT
        : WRONG;

    case QuestionType.SLIDER: {
      // options are [min, max, step, correctLow, correctHigh]
      const [min, max, , low, high] = options.map(Number);
      const value = readNumber(answer);
      if (value === null || !Number.isFinite(low) || !Number.isFinite(high)) return WRONG;
      const span = max - min;
      const miss = value < low ? low - value : value > high ? value - high : 0;
      return nearMiss(miss, span > 0 ? MARGIN_REACH.SLIDER[marginFor(question)] * span : 0);
    }

    case QuestionType.RANGE: {
      // options are [min, max, step, correctLow, correctHigh]
      const [min, max, , low, high] = options.map(Number);
      const pair = numbersOf(answer);
      if (!pair || pair.length !== 2 || !(max > min)) return WRONG;
      if (![low, high].every(Number.isFinite)) return WRONG;
      const from = Math.min(pair[0], pair[1]);
      const to = Math.max(pair[0], pair[1]);
      const caught = from <= high && to >= low;
      const width = (to - from) / (max - min);
      if (!caught || width > RANGE_MAX_WIDTH) return WRONG;
      if (width <= RANGE_FULL_WIDTH) return RIGHT;
      const loosened = (width - RANGE_FULL_WIDTH) / (RANGE_MAX_WIDTH - RANGE_FULL_WIDTH);
      return { correct: true, credit: tidy(1 - (1 - RANGE_MIN_CREDIT) * loosened) };
    }

    case QuestionType.NUMBER: {
      // options are [answer, tolerance?]
      const target = readNumber(options[0]);
      const tolerance = Math.abs(readNumber(options[1]) ?? 0);
      const value = readNumber(answer);
      if (target === null || value === null) return WRONG;
      const miss = Math.max(0, Math.abs(value - target) - tolerance);
      const reach = MARGIN_REACH.NUMBER[marginFor(question)] * Math.max(Math.abs(target), 1);
      return nearMiss(miss, reach);
    }

    case QuestionType.PIN: {
      const target = question.pin;
      const spot = numbersOf(answer);
      if (!target || !spot || spot.length < 2) return WRONG;
      const [x, y, sentAspect] = spot;
      if (![x, y].every(Number.isFinite)) return WRONG;
      // Distances are measured in picture widths, so a step down counts the
      // same as a step across. A built-in map's shape is known here; a
      // picture's is only known to the screen that drew it, which sends it.
      const frame = mapFrameFor(question.image);
      const aspect = frame
        ? mapAspect(frame)
        : sentAspect && sentAspect > 0.05 && sentAspect < 20
          ? sentAspect
          : 1;
      const distance = Math.hypot(x - target.x, (y - target.y) * aspect);
      return nearMiss(distance - target.radius, MARGIN_REACH.PIN[marginFor(question)]);
    }

    case QuestionType.MULTI_SELECT: {
      const correct = new Set(question.correctIndices ?? [question.correctIndex]);
      const picked = numbersOf(answer);
      if (!picked || picked.length === 0 || correct.size === 0) return WRONG;
      const unique = [...new Set(picked)];
      const hits = unique.filter((index) => correct.has(index)).length;
      const misses = unique.length - hits;
      // A wrong pick cancels a right one, so ticking everything is worth
      // nothing rather than a guaranteed share.
      if (hits === correct.size && misses === 0) return RIGHT;
      return { correct: false, credit: tidy((hits - misses) / correct.size) };
    }

    case QuestionType.PUZZLE:
      // options are already in the correct order.
      return Array.isArray(answer) &&
        answer.length === options.length &&
        answer.every((item, i) => typeof item === "string" && normalize(item) === normalize(options[i]))
        ? RIGHT
        : WRONG;

    case QuestionType.MATCH: {
      const pairs = question.pairs ?? [];
      const record = recordOf(answer);
      if (!record || pairs.length !== options.length) return WRONG;
      const hits = options.filter((item, i) => {
        const given = lookup(record, item);
        return typeof given === "string" && normalize(given) === normalize(pairs[i]);
      }).length;
      return beyondChance(hits, options.length, options.length);
    }

    case QuestionType.CATEGORIZE: {
      const groups = question.pairs ?? [];
      const record = recordOf(answer);
      if (!record || groups.length !== options.length) return WRONG;
      const hits = options.filter((item, i) => {
        const given = lookup(record, item);
        return typeof given === "string" && normalize(given) === normalize(groups[i]);
      }).length;
      return beyondChance(hits, options.length, new Set(groups.map(normalize)).size);
    }

    case QuestionType.SCRAMBLE:
      return typeof answer === "string" &&
        scrambleKey(answer) !== "" &&
        scrambleKey(answer) === scrambleKey(options[0] ?? "")
        ? RIGHT
        : WRONG;

    case QuestionType.MULTIPLE_CHOICE:
    case QuestionType.TRUE_FALSE:
    default:
      return typeof answer === "number" && answer === question.correctIndex ? RIGHT : WRONG;
  }
};

/**
 * Right or wrong, and nothing about partial credit. Kept because a verdict is
 * all most callers want, and it is what every check written before partial
 * credit asks for.
 */
export const isAnswerCorrect = (question: Question, answer: Answer): boolean =>
  gradeAnswer(question, answer).correct;

import { CategoryContent, Question, QuestionType, RoundConfig } from "../types";
import { normalize } from "./scoring";

/**
 * Which questions are fit to put in front of a room.
 *
 * Two kinds of question reach a game that should never be played:
 *
 * - **Placeholders.** Generation that fails falls back to "Placeholder question
 *   #1 … Option A, Option B", and the premade bank carries rows whose wrong
 *   answers were never written — "Placeholder 1", "Placeholder 2",
 *   "Placeholder 3" sitting beside the one real answer. Played, either one
 *   hands the room the answer or asks it nothing at all.
 * - **Questions with nothing to pick from.** A multiple-choice question with
 *   one real option, or none, a slider missing its bounds, a puzzle with a
 *   single tile, a pin question with no picture, a scramble of one letter.
 *
 * Both are dropped wherever questions come in — import, generation, and once
 * more when a round is dealt — rather than flagged for a host to notice. A
 * host setting up with a room filling up does not read 400 rows.
 *
 * A typed answer shows no choices *by design* (the player types it), so it is
 * judged on its accepted spellings instead, and kept when it has one.
 */

/** Filler an author left in a cell. Matched against a whole option. */
const PLACEHOLDER_OPTION = [
  /^\s*[[(<{]?\s*(placeholder|(tbd|todo|lorem ipsum)\b|insert (an? )?(answer|option|choice) here)/i,
  /^\s*(option|answer|choice)\s*[a-f1-6]\s*$/i,
  // Two or more, so a question that is genuinely about "?" or "-" survives.
  /^\s*(\?{2,}|-{2,}|_{2,})\s*$/,
];

/** Filler in the question itself. Deliberately narrow: "placeholder" is a
 * real word a real question can use. */
const PLACEHOLDER_TEXT = [
  /^\s*[[(<{]?\s*(placeholder|tbd|todo|lorem ipsum)\b/i,
  // Generation's own fallback: "Placeholder question #1 about Science — …".
  /\bplaceholder question\b/i,
  /question generation failed/i,
];

const isBlank = (value: string | undefined | null): boolean =>
  !value || value.trim() === "";

/** An option cell that was never really written. */
export const isPlaceholderOption = (value: string | undefined | null): boolean =>
  isBlank(value) || PLACEHOLDER_OPTION.some((pattern) => pattern.test(value!));

/** A question whose wording was never really written. */
export const isPlaceholderText = (value: string | undefined | null): boolean =>
  isBlank(value) || PLACEHOLDER_TEXT.some((pattern) => pattern.test(value!));

/**
 * Why a question cannot be played, or null when it can.
 *
 * The reason is worded for a host, because it ends up in the warning on the
 * review screen and in the console when an import drops a row.
 */
export const unplayableReason = (question: Question): string | null => {
  if (isPlaceholderText(question.text)) return "placeholder question";

  const options = question.options ?? [];
  const type = question.type ?? QuestionType.MULTIPLE_CHOICE;

  switch (type) {
    case QuestionType.TYPE_ANSWER:
      // The options are the accepted spellings; the player sees none of them.
      return options.some((option) => !isPlaceholderOption(option))
        ? null
        : "no accepted answer";

    case QuestionType.SLIDER:
    case QuestionType.RANGE: {
      const [min, max, step, low, high] = options.map(Number);
      const numeric = options.length >= 5 && [min, max, low, high].every(Number.isFinite);
      if (!numeric || max <= min || !(step > 0) || low > high) {
        return `${type === QuestionType.RANGE ? "range" : "slider"} is missing its scale`;
      }
      // A target off the scale is a question nobody can get right.
      if (high < min || low > max) return "the answer is off the scale";
      return null;
    }

    case QuestionType.NUMBER: {
      const answer = String(options[0] ?? "").replace(/[,\s_]/g, "");
      return answer !== "" && Number.isFinite(Number(answer)) ? null : "no numeric answer";
    }

    case QuestionType.PIN: {
      const pin = question.pin;
      if (!question.image || isPlaceholderOption(question.image)) return "no picture to pin";
      if (
        !pin ||
        ![pin.x, pin.y, pin.radius].every(Number.isFinite) ||
        pin.x < 0 || pin.x > 1 || pin.y < 0 || pin.y > 1 || !(pin.radius > 0)
      ) {
        return "pin target is off the picture";
      }
      return null;
    }

    case QuestionType.TRUE_FALSE:
      return options.length === 2 && options.every((o) => !isPlaceholderOption(o))
        ? null
        : "no options";

    case QuestionType.PUZZLE:
      if (options.some(isPlaceholderOption)) return "placeholder options";
      if (options.length < 2) return "no options";
      // The tiles are told apart by their text, so two the same cannot both
      // be in the right place.
      return new Set(options.map((o) => o.trim().toLowerCase())).size === options.length
        ? null
        : "two items are the same";

    case QuestionType.MATCH:
    case QuestionType.CATEGORIZE: {
      const pairs = question.pairs ?? [];
      if (options.some(isPlaceholderOption) || pairs.some(isPlaceholderOption)) {
        return "placeholder options";
      }
      if (options.length < 2 || pairs.length !== options.length) return "no pairs";
      if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) {
        return "two items are the same";
      }
      // Counted the way the grader compares them — capitals and extra spaces
      // aside — which is also how a sort's buttons are merged.
      const partners = new Set(pairs.map(normalize)).size;
      if (type === QuestionType.MATCH && partners !== pairs.length) {
        return "two items share a partner";
      }
      if (type === QuestionType.CATEGORIZE && (partners < 2 || partners > 4)) {
        return "a sort needs two to four groups";
      }
      return null;
    }

    case QuestionType.SCRAMBLE: {
      // Counted in upper case, the way the tiles are made: Straße is 7 tiles.
      const letters = (options[0] ?? "").toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (isPlaceholderOption(options[0])) return "no word to scramble";
      if (letters.length < 3 || letters.length > 20) return "a scramble needs 3 to 20 letters";
      return new Set(letters).size > 1 ? null : "nothing to unscramble";
    }

    case QuestionType.MULTI_SELECT: {
      if (options.some(isPlaceholderOption)) {
        return options.every(isPlaceholderOption) ? "no options" : "placeholder options";
      }
      const correct = question.correctIndices ?? [];
      if (options.length < 3) return "no options";
      if (correct.length === 0 || correct.some((i) => i < 0 || i >= options.length)) {
        return "no correct answer";
      }
      return null;
    }

    case QuestionType.MULTIPLE_CHOICE:
    default: {
      if (options.some(isPlaceholderOption)) {
        // Every option blank or filler is a question with nothing to pick;
        // some of them is a question with the answer sticking out.
        return options.every(isPlaceholderOption) ? "no options" : "placeholder options";
      }
      if (options.length < 2) return "no options";
      if (question.correctIndex < 0 || question.correctIndex >= options.length) {
        return "no correct answer";
      }
      return null;
    }
  }
};

export const isPlayable = (question: Question): boolean =>
  unplayableReason(question) === null;

/** The questions from a list that can be played, in the order given. */
export const playableQuestions = (questions: readonly Question[]): Question[] =>
  questions.filter(isPlayable);

/** Parsed categories with their unplayable questions gone, and any category
 * left empty by that gone too. */
export const playableContents = (
  contents: readonly CategoryContent[],
): CategoryContent[] =>
  contents
    .map((content) => ({ ...content, questions: playableQuestions(content.questions) }))
    .filter((content) => content.questions.length > 0);

/**
 * A game's rounds with their unplayable questions gone.
 *
 * A round left with nothing is dropped rather than kept as a spin of the wheel
 * onto an empty category, and what is left is renumbered so every round's
 * label still matches its position.
 */
export const playableRounds = (rounds: readonly RoundConfig[]): RoundConfig[] =>
  rounds
    .map((round) => ({ ...round, questions: playableQuestions(round.questions) }))
    .filter((round) => round.questions.length > 0)
    .map((round, index) => ({ ...round, roundNumber: index + 1 }));

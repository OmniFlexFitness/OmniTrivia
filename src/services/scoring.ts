import { Answer, Question, QuestionType } from "../types";

// The answer shape moved to types.ts so the broadcast snapshot can reference it
// without pulling in game logic. Re-exported here because this module is where
// callers expect to find it.
export type { Answer };

/** Loose text match: case and surrounding/repeated whitespace are ignored. */
const normalize = (value: string): string =>
  value.toLowerCase().trim().replace(/\s+/g, " ");

/**
 * The single source of truth for whether an answer is right. Both the score in
 * GameContext and the correct/incorrect styling in QuestionCard call this, so
 * the two can never disagree about the same answer.
 */
export const isAnswerCorrect = (question: Question, answer: Answer): boolean => {
  const options = question.options;

  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      // Every option is an accepted spelling of the answer.
      return (
        typeof answer === "string" &&
        answer.trim() !== "" &&
        options.some((option) => normalize(option) === normalize(answer))
      );

    case QuestionType.SLIDER: {
      // options are [min, max, step, correctLow, correctHigh]
      const low = Number(options[3]);
      const high = Number(options[4]);
      if (!Number.isFinite(low) || !Number.isFinite(high)) return false;
      return typeof answer === "number" && answer >= low && answer <= high;
    }

    case QuestionType.PUZZLE:
      // options are already in the correct order.
      return (
        Array.isArray(answer) &&
        answer.length === options.length &&
        answer.every((item, i) => normalize(item) === normalize(options[i]))
      );

    case QuestionType.MULTIPLE_CHOICE:
    case QuestionType.TRUE_FALSE:
    default:
      return typeof answer === "number" && answer === question.correctIndex;
  }
};

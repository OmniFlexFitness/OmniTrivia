import { Answer, Question, QuestionType } from "../types";
import { mapAspect, mapFrameFor } from "./mapProjection";
import { matchChoices, categorizeGroups, scrambleLetters } from "./snapshot";
import { scrambleKey } from "./scoring";

/**
 * What a bot answers, built to be right or wrong on purpose.
 *
 * Bots stand in for the people a host is testing a bracket without, so their
 * answers have to be ones the real grader accepts — the same shape a phone
 * would send. A "wrong" answer is genuinely wrong: off the target, out of
 * order, one pair crossed. `random` is injectable so the probes can pin it.
 */
export const botAnswerFor = (
  question: Question,
  shouldBeCorrect: boolean,
  random: () => number = Math.random,
): Answer => {
  const options = question.options;
  const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];

  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      return shouldBeCorrect ? (options[0] ?? "") : "…";

    case QuestionType.SLIDER: {
      const [min, max, , low, high] = options.map(Number);
      if (shouldBeCorrect) return (low + high) / 2;
      // Miss well clear of the target, on whichever side still has room, so
      // even a generous margin does not quietly make it a near-perfect answer.
      const span = max - min;
      return low - min > max - high
        ? Math.max(min, low - span * 0.4)
        : Math.min(max, high + span * 0.4);
    }

    case QuestionType.RANGE: {
      const [min, max, , low, high] = options.map(Number);
      const span = max - min;
      if (shouldBeCorrect) {
        // A sensible bracket: a little either side of the answer.
        const pad = span * 0.03;
        return [Math.max(min, low - pad), Math.min(max, high + pad)];
      }
      // A tight bracket in the wrong place.
      const centre = low - min > max - high ? min + span * 0.05 : max - span * 0.05;
      return [centre - span * 0.02, centre + span * 0.02];
    }

    case QuestionType.NUMBER: {
      const target = Number(String(options[0]).replace(/[,\s_]/g, ""));
      if (shouldBeCorrect) return target;
      // Three times the answer, or a long way above it if the answer is 0.
      return target === 0 ? 100 : target * 3;
    }

    case QuestionType.PIN: {
      const target = question.pin ?? { x: 0.5, y: 0.5, radius: 0.05 };
      const frame = mapFrameFor(question.image);
      const aspect = frame ? mapAspect(frame) : 1;
      if (shouldBeCorrect) return [target.x, target.y, aspect];
      // The far side of the picture.
      return [target.x > 0.5 ? 0.05 : 0.95, target.y > 0.5 ? 0.05 : 0.95, aspect];
    }

    case QuestionType.MULTI_SELECT: {
      const correct = question.correctIndices ?? [question.correctIndex];
      if (shouldBeCorrect) return [...correct];
      const wrong = options.map((_, i) => i).filter((i) => !correct.includes(i));
      return wrong.length ? [pick(wrong)] : [];
    }

    case QuestionType.PUZZLE:
      return shouldBeCorrect || options.length < 2
        ? [...options]
        : [...options].reverse();

    case QuestionType.MATCH: {
      const pairs = question.pairs ?? [];
      const answer: Record<string, string> = {};
      options.forEach((item, i) => {
        answer[item] = pairs[i];
      });
      if (!shouldBeCorrect && options.length >= 2) {
        // Every partner moved along one: a sort that is wholly wrong.
        const shown = matchChoices(question);
        options.forEach((item, i) => {
          answer[item] = pairs[(i + 1) % pairs.length] ?? shown[0];
        });
      }
      return answer;
    }

    case QuestionType.CATEGORIZE: {
      const groups = question.pairs ?? [];
      const all = categorizeGroups(question);
      const answer: Record<string, string> = {};
      options.forEach((item, i) => {
        answer[item] = shouldBeCorrect
          ? groups[i]
          : (all.find((group) => group !== groups[i]) ?? groups[i]);
      });
      return answer;
    }

    case QuestionType.SCRAMBLE: {
      const word = options[0] ?? "";
      if (shouldBeCorrect) return word;
      // The letters, reversed — right tiles, wrong word.
      const reversed = [...scrambleLetters(word)].reverse().join("");
      return scrambleKey(reversed) === scrambleKey(word) ? `${reversed}X` : reversed;
    }

    default: {
      if (shouldBeCorrect) return question.correctIndex;
      const wrong = options
        .map((_, index) => index)
        .filter((index) => index !== question.correctIndex);
      return wrong.length ? pick(wrong) : question.correctIndex;
    }
  }
};

import {
  AnswerRecord,
  BroadcastSnapshot,
  GamePhase,
  GameState,
  Player,
  PublicPlayer,
  PublicQuestion,
  Question,
  QuestionType,
  RevealDetail,
} from "../types";
import { CATEGORIES } from "../constants";
import { answeringRoster } from "./bracket";
import { SNAPSHOT_VERSION } from "./broadcastBus";

/**
 * Builds the read-only view of the game that the projector renders.
 *
 * The broadcast is a public screen, so this is where the answer is held back:
 * `question` carries only what the room may see while the clock is running,
 * and the answer travels separately in `reveal`, which is populated only once
 * the question is over.
 */

/** FNV-1a. Enough to turn a question id into a stable shuffle seed. */
const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Shuffle that depends only on the seed, so the host screen and the broadcast
 * always show a puzzle's tiles in the same order without syncing anything.
 */
export const seededShuffle = <T,>(items: T[], seed: number): T[] => {
  const copy = [...items];
  let state = seed || 1;
  const next = () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * The tile order a puzzle is shown in, on any screen.
 *
 * A shuffle is free to hand back the order it was given, and for a puzzle that
 * order is the answer — roughly one in six three-tile puzzles and half of all
 * two-tile ones would have published it. When the draw comes back as the
 * source order, rotate instead: still deterministic, never the answer.
 */
export const puzzleDisplayOrder = (question: Question): string[] => {
  const options = question.options;
  if (options.length < 2) return [...options];

  const shuffled = seededShuffle(options, hashString(question.id));
  const isSourceOrder = shuffled.every((item, i) => item === options[i]);

  return isSourceOrder ? [...options.slice(1), options[0]] : shuffled;
};

/**
 * Options with the answer stripped out. A typed answer has none to show, a
 * slider would give away its own target range, and a puzzle arrives in the
 * correct order — all three have to be filtered, not just passed through.
 */
export const publicOptions = (question: Question): string[] => {
  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      return [];
    case QuestionType.SLIDER:
      // options are [min, max, step, correctLow, correctHigh]. Only the two
      // bounds are needed to draw the scale, so only those are published.
      return question.options.slice(0, 2);
    case QuestionType.PUZZLE:
      return puzzleDisplayOrder(question);
    default:
      return question.options;
  }
};

export const toPublicQuestion = (question: Question): PublicQuestion => ({
  id: question.id,
  category: question.category,
  text: question.text,
  type: question.type ?? QuestionType.MULTIPLE_CHOICE,
  options: publicOptions(question),
});

/** How the answer reads on screen, formatted for the question type. */
export const buildReveal = (question: Question): RevealDetail => {
  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      return {
        label: question.options[0] ?? "",
        correctIndex: null,
        explanation: question.explanation,
      };

    case QuestionType.SLIDER: {
      const low = Number(question.options[3]);
      const high = Number(question.options[4]);
      return {
        label: low === high ? `${low}` : `${low} – ${high}`,
        correctIndex: null,
        correctRange: [low, high],
        explanation: question.explanation,
      };
    }

    case QuestionType.PUZZLE:
      return {
        label: question.options.join("  →  "),
        correctIndex: null,
        correctOrder: question.options,
        explanation: question.explanation,
      };

    default:
      return {
        label: question.options[question.correctIndex] ?? "",
        correctIndex: question.correctIndex,
        explanation: question.explanation,
      };
  }
};

/**
 * Counts per option, for the bar chart under a revealed multiple choice. Only
 * index-style answers can be tallied this way, so other types get nothing.
 */
const tallyOptions = (
  question: Question,
  answers: AnswerRecord[],
): number[] | null => {
  const type = question.type ?? QuestionType.MULTIPLE_CHOICE;
  if (type !== QuestionType.MULTIPLE_CHOICE && type !== QuestionType.TRUE_FALSE) {
    return null;
  }

  const tallies = question.options.map(() => 0);
  answers.forEach(({ answer }) => {
    if (typeof answer === "number" && tallies[answer] !== undefined) {
      tallies[answer] += 1;
    }
  });
  return tallies;
};

const toPublicPlayer = (player: Player): PublicPlayer => ({
  id: player.id,
  name: player.name,
  avatar: player.avatar,
  avatarColor: player.avatarColor,
  avatarAccessory: player.avatarAccessory,
  score: player.score,
  roundScore: player.roundScore,
  streak: player.streak,
  isBot: player.isBot,
  isHost: player.isHost,
  eliminated: player.eliminated,
});

export const buildSnapshot = (
  state: GameState,
  hostId: string,
): BroadcastSnapshot => {
  const roundConfig = state.roundsConfig[state.currentRound - 1];
  const bracketRound = state.bracket[state.currentRound - 1];
  const isRevealing = state.phase === GamePhase.QUESTION_REVEAL;

  // The wheel picks from the categories this game actually loaded; fall back to
  // the built-ins only before a game has been configured. Held back until the
  // wheel lands: the round's category is already known the moment the round
  // starts, and publishing it then puts the answer to the spin on the
  // projector before the host has spun for it.
  const category = !state.categoryRevealed
    ? null
    : (roundConfig?.category ??
      (state.selectedCategory
        ? (CATEGORIES.find((c) => c.id === state.selectedCategory) ?? null)
        : null));

  return {
    version: SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    hostId,

    phase: state.phase,
    gamePin: state.gamePin,
    gameName: state.gameName,

    roundNumber: state.currentRound,
    totalRounds: state.totalRounds,
    category,
    wheelSpinning: state.wheelSpinning,

    questionNumber: state.currentQuestionIndex + 1,
    questionsInRound: state.questionsQueue.length,
    question: state.currentQuestion
      ? toPublicQuestion(state.currentQuestion)
      : null,
    reveal:
      isRevealing && state.currentQuestion
        ? buildReveal(state.currentQuestion)
        : null,

    timeLeft: state.timeLeft,
    timerDuration: state.questionDuration,
    timerPaused: state.timerPaused,
    revealSecondsLeft: state.revealSecondsLeft,
    revealReason: state.revealReason,
    autoAdvance: state.autoAdvance,

    activePlayerIds: answeringRoster(
      bracketRound,
      state.players,
      state.hostAnsweringEnabled,
    ),
    answeredPlayerIds: state.currentAnswers.map((a) => a.playerId),
    // Who was right is a spoiler until the answer is up.
    correctPlayerIds: isRevealing
      ? state.currentAnswers.filter((a) => a.isCorrect).map((a) => a.playerId)
      : [],

    optionTallies:
      isRevealing && state.currentQuestion
        ? tallyOptions(state.currentQuestion, state.currentAnswers)
        : null,

    players: state.players.map(toPublicPlayer),
    bracket: state.bracket,
    nextRoundMatchups:
      state.phase === GamePhase.ROUND_END
        ? (state.bracket[state.currentRound]?.matchups ?? null)
        : null,
    championId: state.championId,
  };
};

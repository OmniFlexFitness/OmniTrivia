import {
  AnswerRecord,
  BroadcastSnapshot,
  CategoryPoll,
  GamePhase,
  GameState,
  LaneSeat,
  LaneStatus,
  MatchupLane,
  Player,
  PublicCategoryLike,
  PublicCategoryPoll,
  PublicLane,
  PublicPlayer,
  PublicQuestion,
  PublicSeat,
  Question,
  QuestionType,
  RevealDetail,
} from "../types";
import { CATEGORIES } from "../constants";
import { answeringRoster } from "./bracket";
import {
  answerBy,
  answersForQuestion,
  broadcastIndex,
  everyLaneCompleted,
  laneCompletedCount,
  laneHasCompleted,
  laneStatus,
  seatCompletedCount,
} from "./lanes";
import { SNAPSHOT_VERSION } from "./broadcastBus";

/**
 * Builds the read-only view of the game that the projector and the players'
 * phones render.
 *
 * The broadcast is a public screen, so this is where the answer is held back:
 * `question` carries only what the room may see, and the answer travels
 * separately in `reveal`, which is populated only once *every* player is
 * through that question. The room's question is the slowest player's, so the
 * big screen can never run ahead of anyone playing.
 *
 * Each seat publishes its own question and — while its player is looking at
 * the answer — its own reveal, because that phone has to render it. Every tab
 * on the channel receives the whole snapshot, so a seat's answer is only as
 * private as the machine the game is running on; a real backend would address
 * each seat's payload to the player in it.
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

/**
 * One player's seat, stripped of anything they are not owed yet.
 *
 * The answer travels with the seat and only once that seat has closed its
 * question, so a player who is still reading question two cannot be handed the
 * answer to it because the person across the table has already moved on.
 */
const toPublicSeat = (
  seat: LaneSeat,
  lane: MatchupLane,
  state: GameState,
): PublicSeat => {
  const questionsInRound = state.questionsQueue.length;
  const question = state.questionsQueue[seat.questionIndex];
  const isRevealing = seat.status === LaneStatus.REVEAL;
  const record = answerBy(lane, seat.playerId, seat.questionIndex);

  return {
    playerId: seat.playerId,
    status: seat.status,
    questionNumber: Math.min(
      seat.questionIndex + 1,
      Math.max(1, questionsInRound),
    ),
    completed: seatCompletedCount(seat, questionsInRound),
    question:
      question && seat.status !== LaneStatus.DONE
        ? toPublicQuestion(question)
        : null,
    reveal: isRevealing && question ? buildReveal(question) : null,
    answered: Boolean(record),
    // Whether they were right is a spoiler until their own answer is up.
    wasCorrect: isRevealing ? (record?.isCorrect ?? false) : null,
    lastPoints: isRevealing ? (record?.points ?? 0) : null,
    timeLeft: seat.timeLeft,
    timerDuration: seat.questionDuration,
    timerPaused: seat.timerPaused,
    revealSecondsLeft: seat.revealSecondsLeft,
    revealReason: seat.revealReason,
  };
};

/** One match, as the desk and the room see it. */
const toPublicLane = (lane: MatchupLane, state: GameState): PublicLane => {
  const questionsInRound = state.questionsQueue.length;
  const completed = laneCompletedCount(lane, questionsInRound);

  return {
    id: lane.id,
    matchupId: lane.matchupId,
    playerIds: lane.playerIds,
    answeringIds: lane.answeringIds,
    status: laneStatus(lane),
    questionNumber: Math.min(completed + 1, Math.max(1, questionsInRound)),
    completed,
    seats: lane.seats.map((seat) => toPublicSeat(seat, lane, state)),
  };
};

/** The likes this game has collected, ready for a phone or a projector. */
const toPublicLikes = (state: GameState): PublicCategoryLike[] =>
  state.categoryLikes
    .map((tally) => ({
      categoryId: tally.category.id,
      name: tally.category.name,
      icon: tally.category.icon,
      color: tally.category.color,
      count: tally.playerIds.length,
      playerIds: tally.playerIds,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

/**
 * The open ballot.
 *
 * The options are published rather than drawn per device on purpose: the host
 * draws them once, and every phone and the big screen show the same four.
 */
export const publicPoll = (
  poll: CategoryPoll | null,
): PublicCategoryPoll | null => {
  if (!poll) return null;

  const tallies: Record<string, number> = {};
  poll.options.forEach((option) => {
    tallies[option.id] = 0;
  });
  Object.values(poll.votes).forEach((categoryId) => {
    if (tallies[categoryId] !== undefined) tallies[categoryId] += 1;
  });

  return {
    id: poll.id,
    roundNumber: poll.roundNumber,
    options: poll.options,
    tallies,
    votes: poll.votes,
    totalVotes: Object.keys(poll.votes).length,
  };
};

export const buildSnapshot = (
  state: GameState,
  hostId: string,
): BroadcastSnapshot => {
  const roundConfig = state.roundsConfig[state.currentRound - 1];
  const bracketRound = state.bracket[state.currentRound - 1];

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

  /* --- the room's question --- */
  const questionsInRound = state.questionsQueue.length;
  const roomIndex = broadcastIndex(state);
  const roomQuestion = state.questionsQueue[roomIndex] ?? null;
  // The answer only goes on the projector once there is nobody left who could
  // still be looking at the question.
  const roomRevealing =
    state.phase === GamePhase.PLAYING &&
    state.broadcastRevealing &&
    everyLaneCompleted(state.lanes, roomIndex);

  const roomAnswers = roomQuestion
    ? answersForQuestion(state.lanes, roomIndex)
    : [];
  // Everyone still working on the question the room is showing. The room is
  // held up by the longest clock among them, not by any one table.
  const seatsOnRoomQuestion = state.lanes.flatMap((lane) =>
    lane.seats.filter(
      (seat) =>
        seat.status === LaneStatus.ANSWERING && seat.questionIndex === roomIndex,
    ),
  );

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

    questionNumber: roomIndex + 1,
    questionsInRound,
    question: roomQuestion ? toPublicQuestion(roomQuestion) : null,
    reveal: roomRevealing && roomQuestion ? buildReveal(roomQuestion) : null,

    // The room is waiting on whichever player has the most clock left on this
    // question — that is the longest it can still be held up.
    timeLeft: seatsOnRoomQuestion.reduce(
      (longest, seat) => Math.max(longest, seat.timeLeft),
      0,
    ),
    timerDuration: seatsOnRoomQuestion.reduce(
      (longest, seat) => Math.max(longest, seat.questionDuration),
      0,
    ),
    revealSecondsLeft: state.broadcastRevealSecondsLeft,
    autoAdvance: state.autoAdvance,

    lanesCompleted: state.lanes.filter((lane) =>
      laneHasCompleted(lane, roomIndex),
    ).length,
    lanesInPlay: state.lanes.length,
    lanes: state.lanes.map((lane) => toPublicLane(lane, state)),

    activePlayerIds: answeringRoster(
      bracketRound,
      state.players,
      state.hostAnsweringEnabled,
    ),
    answeredPlayerIds: roomAnswers.map((a) => a.playerId),
    correctPlayerIds: roomRevealing
      ? roomAnswers.filter((a) => a.isCorrect).map((a) => a.playerId)
      : [],

    optionTallies:
      roomRevealing && roomQuestion
        ? tallyOptions(roomQuestion, roomAnswers)
        : null,

    players: state.players.map(toPublicPlayer),
    bracket: state.bracket,
    nextRoundMatchups:
      state.phase === GamePhase.ROUND_END
        ? (state.bracket[state.currentRound]?.matchups ?? null)
        : null,
    championId: state.championId,

    categoryLikes: toPublicLikes(state),
    categoryPoll: publicPoll(state.categoryPoll),
  };
};

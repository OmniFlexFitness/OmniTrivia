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
  RoundReviewItem,
  SeatResult,
} from "../types";
import { CATEGORIES } from "../constants";
import { answeringRoster } from "./bracket";
import { wheelCategories } from "./wheel";
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
import { marginFor, readNumber } from "./scoring";
import { formatNumber } from "./questionTypes";

/**
 * Builds the read-only view of the game that the projector and the players'
 * phones render.
 *
 * The broadcast is a public screen, so this is where the answers are held
 * back — and not only the answer to the live question. Nobody is told whether
 * they got a question right until their match is over:
 *
 * - a seat publishes its question and its clock, never a verdict, until both
 *   players in its match are through the round (`results`);
 * - a player's score is published as it stood when the round began until
 *   their match is over, because a number that jumps by 150 is a verdict too;
 * - the room's screen says when everyone is locked in on a question, never
 *   what the answer was, and the answer key (`roundReview`) goes up only once
 *   the round is over — every match in it, not just one.
 *
 * Every tab on the channel receives the whole snapshot, so what is published
 * is only as private as the machine the game is running on; a real backend
 * would address each seat's payload to the player in it.
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
 * A deterministic shuffle that never hands back what it was given.
 *
 * A shuffle is free to return the order it started from, and for a puzzle
 * that order is the answer — roughly one in six three-tile puzzles and half
 * of all two-tile ones would have published it. When the draw comes back
 * reading the same as the source (compared as text, so a scramble of "LEVEL"
 * that swaps its two Ls counts as unscrambled), rotate instead: still
 * deterministic, never the answer. Only a list whose items are all the same
 * cannot be disguised, and the importer refuses those.
 */
const disguised = (items: string[], seed: string): string[] => {
  if (items.length < 2) return [...items];
  const shuffled = seededShuffle(items, hashString(seed));
  const same = shuffled.every((item, i) => item === items[i]);
  return same ? [...items.slice(1), items[0]] : shuffled;
};

/** The tile order a puzzle is shown in, on any screen. */
export const puzzleDisplayOrder = (question: Question): string[] =>
  disguised(question.options, question.id);

/**
 * A match puzzle's right-hand side as players see it: shuffled uniformly, and
 * never in the answer order.
 *
 * Some partners will often sit level with their item, and that is on purpose.
 * Nobody can tell which, so trusting the level rows scores no better than
 * guessing. A derangement — no partner ever level — would be the leak: it
 * tells every player that the partner beside an item is the wrong one.
 */
export const matchChoices = (question: Question): string[] =>
  disguised(question.pairs ?? [], `${question.id}:pairs`);

/** A sort puzzle's groups, alphabetically — their order says nothing. */
export const categorizeGroups = (question: Question): string[] =>
  [...new Set(question.pairs ?? [])].sort((a, b) => a.localeCompare(b));

/** The letters of a scramble, with spaces and punctuation left out. */
export const scrambleLetters = (answer: string): string[] =>
  [...answer.toUpperCase()].filter((char) => /[\p{L}\p{N}]/u.test(char));

/** How long each word of a scramble is — "3 · 4" for NEW YORK. */
export const scrambleWordLengths = (answer: string): number[] =>
  answer
    .split(/\s+/)
    .map((word) => scrambleLetters(word).length)
    .filter((length) => length > 0);

/**
 * Options with the answer stripped out. Every type that is not a plain pick
 * hides its key somewhere in `options` — a typed answer's spellings, a
 * slider's target, a closest-number answer, a puzzle's order — so each has to
 * be filtered, not just passed through.
 */
export const publicOptions = (question: Question): string[] => {
  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
    case QuestionType.NUMBER:
    case QuestionType.PIN:
      return [];
    case QuestionType.SLIDER:
    case QuestionType.RANGE:
      // options are [min, max, step, correctLow, correctHigh]. The scale is
      // all a screen needs to draw, so the scale is all that is published.
      return question.options.slice(0, 3);
    case QuestionType.PUZZLE:
    case QuestionType.CATEGORIZE:
      return puzzleDisplayOrder(question);
    case QuestionType.SCRAMBLE:
      return disguised(scrambleLetters(question.options[0] ?? ""), question.id);
    default:
      // Multiple choice, multi-select and true/false show their options as
      // they are; a match puzzle's left-hand side gives nothing away on its
      // own, because its partners are shuffled separately.
      return question.options;
  }
};

/** The second list a puzzle needs, if it needs one. */
const publicChoices = (question: Question): string[] | undefined => {
  switch (question.type) {
    case QuestionType.MATCH:
      return matchChoices(question);
    case QuestionType.CATEGORIZE:
      return categorizeGroups(question);
    case QuestionType.SCRAMBLE:
      return scrambleWordLengths(question.options[0] ?? "").map(String);
    default:
      return undefined;
  }
};

export const toPublicQuestion = (question: Question): PublicQuestion => {
  const type = question.type ?? QuestionType.MULTIPLE_CHOICE;
  const choices = publicChoices(question);
  const scored = type === QuestionType.SLIDER || type === QuestionType.NUMBER || type === QuestionType.PIN;
  return {
    id: question.id,
    category: question.category,
    text: question.text,
    type,
    options: publicOptions(question),
    ...(choices ? { choices } : {}),
    ...(question.image ? { image: question.image } : {}),
    ...(question.unit ? { unit: question.unit } : {}),
    ...(scored ? { margin: marginFor(question) } : {}),
  };
};

/** How the answer reads on screen, formatted for the question type. */
export const buildReveal = (question: Question): RevealDetail => {
  const shared = {
    explanation: question.explanation,
    ...(question.image ? { image: question.image } : {}),
    ...(question.unit ? { unit: question.unit } : {}),
  };

  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      return { label: question.options[0] ?? "", correctIndex: null, ...shared };

    case QuestionType.SLIDER:
    case QuestionType.RANGE: {
      const low = Number(question.options[3]);
      const high = Number(question.options[4]);
      return {
        label:
          low === high
            ? formatNumber(low, question.unit)
            : `${formatNumber(low)} – ${formatNumber(high, question.unit)}`,
        correctIndex: null,
        correctRange: [low, high],
        ...shared,
      };
    }

    case QuestionType.NUMBER: {
      const target = readNumber(question.options[0]) ?? 0;
      const tolerance = Math.abs(readNumber(question.options[1]) ?? 0);
      return {
        label:
          formatNumber(target, question.unit) +
          (tolerance > 0 ? ` (± ${formatNumber(tolerance)})` : ""),
        correctIndex: null,
        correctRange: [target - tolerance, target + tolerance],
        ...shared,
      };
    }

    case QuestionType.PIN:
      return {
        label: question.options[0] || "The marked spot",
        correctIndex: null,
        pin: question.pin,
        ...shared,
      };

    case QuestionType.MULTI_SELECT: {
      const indices = question.correctIndices ?? [question.correctIndex];
      return {
        label: indices.map((index) => question.options[index]).filter(Boolean).join("  ·  "),
        correctIndex: indices[0] ?? null,
        correctIndices: indices,
        ...shared,
      };
    }

    case QuestionType.PUZZLE:
      return {
        label: question.options.join("  →  "),
        correctIndex: null,
        correctOrder: question.options,
        ...shared,
      };

    case QuestionType.MATCH: {
      const pairs = question.options.map(
        (item, i) => [item, question.pairs?.[i] ?? ""] as [string, string],
      );
      return {
        label: pairs.map(([item, partner]) => `${item} → ${partner}`).join("  ·  "),
        correctIndex: null,
        pairs,
        ...shared,
      };
    }

    case QuestionType.CATEGORIZE: {
      const pairs = question.options.map(
        (item, i) => [item, question.pairs?.[i] ?? ""] as [string, string],
      );
      return {
        label: categorizeGroups(question)
          .map(
            (group) =>
              `${group}: ${pairs
                .filter(([, home]) => home === group)
                .map(([item]) => item)
                .join(", ")}`,
          )
          .join("  ·  "),
        correctIndex: null,
        pairs,
        ...shared,
      };
    }

    case QuestionType.SCRAMBLE:
      return { label: question.options[0] ?? "", correctIndex: null, ...shared };

    default:
      return {
        label: question.options[question.correctIndex] ?? "",
        correctIndex: question.correctIndex,
        ...shared,
      };
  }
};

/** The types whose answers are worth drawing on the answer key. */
const DRAWN_TYPES = new Set<QuestionType>([
  QuestionType.PIN,
  QuestionType.SLIDER,
  QuestionType.RANGE,
  QuestionType.NUMBER,
]);

/**
 * Counts per option, for the bar chart under a revealed pick. Only
 * index-style answers can be tallied this way, so other types get nothing.
 */
const tallyOptions = (
  question: Question,
  answers: AnswerRecord[],
): number[] | null => {
  const type = question.type ?? QuestionType.MULTIPLE_CHOICE;
  if (
    type !== QuestionType.MULTIPLE_CHOICE &&
    type !== QuestionType.TRUE_FALSE &&
    type !== QuestionType.MULTI_SELECT
  ) {
    return null;
  }

  const tallies = question.options.map(() => 0);
  answers.forEach(({ answer }) => {
    const picks = Array.isArray(answer) ? answer : [answer];
    new Set(picks).forEach((pick) => {
      if (typeof pick === "number" && tallies[pick] !== undefined) {
        tallies[pick] += 1;
      }
    });
  });
  return tallies;
};

/**
 * One player, as every screen sees them.
 *
 * `midMatch` is true while the match this player is in is still being played.
 * Points are banked the instant an answer is given, so a live score is a
 * running verdict on every question; until the match is over the room is
 * shown the score this player started the round on instead.
 */
const toPublicPlayer = (player: Player, midMatch: boolean): PublicPlayer => ({
  id: player.id,
  name: player.name,
  avatar: player.avatar,
  avatarColor: player.avatarColor,
  avatarAccessory: player.avatarAccessory,
  score: midMatch ? player.score - player.roundScore : player.score,
  roundScore: midMatch ? 0 : player.roundScore,
  // A streak moves with every right answer, so it is held back with the rest.
  streak: midMatch ? 0 : player.streak,
  isBot: player.isBot,
  isHost: player.isHost,
  eliminated: player.eliminated,
  losersBracket: player.losersBracket,
  // Held back the same way as the total: during a round, everybody who is
  // eliminated is on the Redemption Table, and every point they bank there
  // lands on this number too.
  redemptionScore:
    (player.redemptionScore ?? 0) -
    (midMatch && player.eliminated ? player.roundScore : 0),
  wildcardUsed: player.wildcardUsed,
});

/**
 * A match is over once both of its players are through every question — or
 * once the round itself is, which is what an early finish from the desk is.
 */
const matchIsOver = (lane: MatchupLane, state: GameState): boolean =>
  state.phase !== GamePhase.PLAYING || laneStatus(lane) === LaneStatus.DONE;

/** How one player did on every question in the round. */
const seatResults = (lane: MatchupLane, playerId: string, state: GameState): SeatResult[] =>
  state.questionsQueue.map((_, index) => {
    const record = answerBy(lane, playerId, index);
    return {
      answered: Boolean(record),
      correct: record?.isCorrect ?? false,
      points: record?.points ?? 0,
      answer: record?.answer ?? null,
    };
  });

/**
 * One player's seat, stripped of anything they are not owed yet.
 *
 * A seat carries its question and its clock, and nothing about how any answer
 * went until the match is over. The verdicts then arrive together, for the
 * whole round, so the end of a match is where a player finds out.
 */
const toPublicSeat = (
  seat: LaneSeat,
  lane: MatchupLane,
  state: GameState,
): PublicSeat => {
  const questionsInRound = state.questionsQueue.length;
  const question = state.questionsQueue[seat.questionIndex];
  const record = answerBy(lane, seat.playerId, seat.questionIndex);
  const results = matchIsOver(lane, state)
    ? seatResults(lane, seat.playerId, state)
    : null;

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
    answered: Boolean(record),
    results,
    roundPoints: results
      ? results.reduce((total, result) => total + result.points, 0)
      : null,
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
    ...(lane.redemption ? { redemption: true } : {}),
    playerIds: lane.playerIds,
    answeringIds: lane.answeringIds,
    status: laneStatus(lane),
    questionNumber: Math.min(completed + 1, Math.max(1, questionsInRound)),
    completed,
    seats: lane.seats.map((seat) => toPublicSeat(seat, lane, state)),
  };
};

/**
 * A published match's seats, never undefined.
 *
 * Every screen walks these arrays, and a single missing one takes the page
 * down to a blank screen — which is precisely how a field that moved between
 * two builds gets reported as "my phone went black". The version handshake
 * should stop a mismatched snapshot reaching a render at all; this is what
 * keeps the damage to a missing row if one ever does.
 */
export const seatsOf = (lane: PublicLane): PublicSeat[] => lane.seats ?? [];

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

  /* --- the wheel every screen turns --- */
  // Only while there is a wheel to turn. It is a dozen category names, but it
  // is a dozen names on every snapshot, and a snapshot goes out several times
  // a second for the whole of a round.
  const wheelSlices =
    state.phase === GamePhase.CATEGORY_SELECT
      ? wheelCategories(state.roundsConfig, state.currentRound)
      : [];

  /* --- the room's question --- */
  const questionsInRound = state.questionsQueue.length;
  const roomIndex = broadcastIndex(state);
  const roomQuestion = state.questionsQueue[roomIndex] ?? null;
  // Everyone is through the question the room is showing. That is all the
  // room is told about it until the round is over.
  const roomLockedIn =
    state.phase === GamePhase.PLAYING &&
    state.broadcastRevealing &&
    everyLaneCompleted(state.lanes, roomIndex);

  /* --- the answer key, once there is nobody left to spoil --- */
  const roundOver =
    state.phase === GamePhase.ROUND_END || state.phase === GamePhase.GAME_OVER;
  const roundReview: RoundReviewItem[] | null =
    roundOver && state.lanes.length > 0
      ? state.questionsQueue.map((question, index) => {
          const answers = answersForQuestion(state.lanes, index);
          return {
            question: toPublicQuestion(question),
            reveal: buildReveal(question),
            correctCount: answers.filter((a) => a.isCorrect).length,
            closeCount: answers.filter((a) => !a.isCorrect && a.points > 0).length,
            answeredCount: answers.length,
            optionTallies: tallyOptions(question, answers),
            ...(DRAWN_TYPES.has(question.type ?? QuestionType.MULTIPLE_CHOICE)
              ? { responses: answers.map((a) => a.answer) }
              : {}),
          };
        })
      : null;

  // Whose match is still being played, so their scores stay as they began.
  const midMatch = new Set(
    state.lanes
      .filter((lane) => !matchIsOver(lane, state))
      .flatMap((lane) => lane.playerIds),
  );

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
    broadcastTitle: state.broadcastTitle,
    broadcastSubtitle: state.broadcastSubtitle,

    roundNumber: state.currentRound,
    totalRounds: state.totalRounds,
    losersBracket: state.losersBracket,
    qualifyingRounds: state.qualifyingRounds,
    botsEnabled: state.botsEnabled,
    hostAnswering: state.hostAnsweringEnabled,
    category,
    wheelSpinning: state.wheelSpinning,
    wheelSlices,

    questionNumber: roomIndex + 1,
    questionsInRound,
    question: roomQuestion ? toPublicQuestion(roomQuestion) : null,
    roomLockedIn,

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

    roundReview,

    players: state.players.map((player) =>
      toPublicPlayer(player, midMatch.has(player.id)),
    ),
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

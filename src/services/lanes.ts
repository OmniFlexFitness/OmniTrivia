import {
  Answer,
  AnswerRecord,
  GamePhase,
  GameState,
  LaneStatus,
  MatchupLane,
  Question,
  RevealReason,
} from "../types";
import { REVEAL_DURATION, TIMER_DURATION } from "../constants";
import { answeringRoster, rosterForRound } from "./bracket";
import { isAnswerCorrect } from "./scoring";

/**
 * Asynchronous rounds.
 *
 * A round used to be one question, one clock and one room: nobody moved on
 * until the last person in the building had answered. That is the wrong shape
 * for a bracket — a matchup is a duel between two people, and there is no
 * reason for it to wait on a duel happening at another table.
 *
 * So a round deals every matchup a lane. A lane holds the whole per-question
 * state that used to be global — which question, how long is left, who is in,
 * whether the answer is up — and moves itself along the moment its own two
 * players are done. Nothing here reads another lane, which is what guarantees
 * one pair can be on the last question of the round while another is still on
 * the first.
 *
 * Both players in a matchup do share a lane, and that is deliberate: they are
 * playing each other, so they get the same question and the same clock. The
 * synchronisation that was removed is between matchups, not inside one.
 *
 * Every function here is a pure state -> state transition, so the clock, the
 * host's buttons and the last player's answer all drive a lane through exactly
 * the same code.
 */

const CORRECT_BASE_POINTS = 100;
const TIME_BONUS_PER_SECOND = 10;

/** The answers a lane has taken for one of its questions. */
export const laneAnswers = (
  lane: MatchupLane,
  questionIndex: number,
): AnswerRecord[] => lane.answers[questionIndex] ?? [];

/** The answers to the lane's live question. */
export const liveAnswers = (lane: MatchupLane): AnswerRecord[] =>
  laneAnswers(lane, lane.questionIndex);

/** The lane a player is playing in, whether or not they are answering in it. */
export const laneForPlayer = (
  lanes: MatchupLane[],
  playerId: string | null,
): MatchupLane | undefined =>
  playerId ? lanes.find((lane) => lane.playerIds.includes(playerId)) : undefined;

/**
 * Has this lane finished with a given question?
 *
 * A lane counts as through a question the moment it stops taking answers for
 * it — while it is showing its own players the answer, it is already done
 * asking. A retired lane (nobody left to answer in it) is through everything,
 * so the room never ends up waiting on an empty table.
 */
export const laneHasCompleted = (
  lane: MatchupLane,
  questionIndex: number,
): boolean =>
  lane.status === LaneStatus.DONE ||
  lane.questionIndex > questionIndex ||
  (lane.questionIndex === questionIndex && lane.status === LaneStatus.REVEAL);

/** How many of the round's questions a lane is through. */
export const laneCompletedCount = (
  lane: MatchupLane,
  questionsInRound: number,
): number => {
  if (lane.status === LaneStatus.DONE) return questionsInRound;
  return lane.questionIndex + (lane.status === LaneStatus.REVEAL ? 1 : 0);
};

/** True once every matchup has finished with a question. */
export const everyLaneCompleted = (
  lanes: MatchupLane[],
  questionIndex: number,
): boolean =>
  lanes.length > 0 &&
  lanes.every((lane) => laneHasCompleted(lane, questionIndex));

/**
 * Every answer any matchup has given to one question, for the room's tally.
 *
 * Lanes that have not reached the question yet hold nothing for it, so this is
 * naturally limited to the tables that have been through it — plus whoever is
 * already in at the table the room is waiting on.
 */
export const answersForQuestion = (
  lanes: MatchupLane[],
  questionIndex: number,
): AnswerRecord[] =>
  lanes.flatMap((lane) => laneAnswers(lane, questionIndex));

const patchLane = (
  state: GameState,
  laneId: string,
  patch: Partial<MatchupLane>,
): GameState => ({
  ...state,
  lanes: state.lanes.map((lane) =>
    lane.id === laneId ? { ...lane, ...patch } : lane,
  ),
});

/* ------------------------------------------------------------------ *
 * Drawing the lanes
 * ------------------------------------------------------------------ */

/**
 * One lane per matchup for the round about to start.
 *
 * A game too small to have a bracket has nobody to be matched against, so it
 * gets a single lane holding everyone — the old all-together round, which is
 * the right shape when there is only one table.
 */
export const buildRoundLanes = (state: GameState): MatchupLane[] => {
  const round = state.bracket[state.currentRound - 1];
  const answering = new Set(
    answeringRoster(round, state.players, state.hostAnsweringEnabled),
  );
  const questionCount = state.questionsQueue.length;

  const pairings = round
    ? round.matchups.map((matchup) => ({
        id: matchup.id,
        matchupId: matchup.id,
        playerIds: matchup.playerBId
          ? [matchup.playerAId, matchup.playerBId]
          : [matchup.playerAId],
      }))
    : [
        {
          id: `r${state.currentRound}-open`,
          matchupId: null,
          playerIds: rosterForRound(undefined, state.players),
        },
      ];

  return pairings.map(({ id, matchupId, playerIds }) => {
    const answeringIds = playerIds.filter((playerId) => answering.has(playerId));
    const playable = answeringIds.length > 0 && questionCount > 0;

    return {
      id,
      matchupId,
      playerIds,
      answeringIds,
      // A lane with nobody to answer in it is retired where it stands rather
      // than walked through the round on an empty clock.
      questionIndex: playable ? 0 : questionCount,
      status: playable ? LaneStatus.ANSWERING : LaneStatus.DONE,
      answers: [],
      timeLeft: TIMER_DURATION,
      questionDuration: TIMER_DURATION,
      timerPaused: false,
      revealSecondsLeft: REVEAL_DURATION,
      revealReason: null,
    };
  });
};

/* ------------------------------------------------------------------ *
 * Moving one lane along
 * ------------------------------------------------------------------ */

/**
 * Close a lane's question: bank its points, then put the answer in front of
 * the two players in it — and only them.
 */
export const closeLaneQuestion = (
  state: GameState,
  laneId: string,
  reason: RevealReason,
): GameState => {
  const lane = state.lanes.find((candidate) => candidate.id === laneId);
  if (!lane || lane.status !== LaneStatus.ANSWERING) return state;

  const byPlayer = new Map(
    liveAnswers(lane).map((record) => [record.playerId, record]),
  );
  const answering = new Set(lane.answeringIds);

  // Points land here rather than at submit time so nothing on a shared screen
  // can move the moment someone answers correctly.
  const players = state.players.map((player) => {
    if (!answering.has(player.id)) return player;

    const record = byPlayer.get(player.id);
    const isCorrect = record?.isCorrect ?? false;
    const points = record?.points ?? 0;

    return {
      ...player,
      score: player.score + points,
      roundScore: player.roundScore + points,
      lastAnswerCorrect: isCorrect,
      streak: isCorrect ? player.streak + 1 : 0,
    };
  });

  return openBroadcastRevealIfDue(
    patchLane({ ...state, players }, laneId, {
      status: LaneStatus.REVEAL,
      timerPaused: false,
      revealSecondsLeft: REVEAL_DURATION,
      revealReason: reason,
    }),
  );
};

/** Leave a lane's reveal: its next question, or the end of its round. */
export const advanceLane = (state: GameState, laneId: string): GameState => {
  const lane = state.lanes.find((candidate) => candidate.id === laneId);
  if (!lane || lane.status !== LaneStatus.REVEAL) return state;

  const questionCount = state.questionsQueue.length;
  const nextIndex = lane.questionIndex + 1;
  const hasMore = nextIndex < questionCount;

  return patchLane(state, laneId, {
    // A finished lane parks on the round's length, so it reads as through
    // every question rather than stuck on the last one.
    questionIndex: hasMore ? nextIndex : questionCount,
    status: hasMore ? LaneStatus.ANSWERING : LaneStatus.DONE,
    timeLeft: TIMER_DURATION,
    questionDuration: TIMER_DURATION,
    timerPaused: false,
    revealSecondsLeft: REVEAL_DURATION,
    revealReason: null,
  });
};

/** Take a lane out of the round — nobody is left in it to answer. */
const retireLane = (state: GameState, laneId: string): GameState =>
  openBroadcastRevealIfDue(
    patchLane(state, laneId, {
      status: LaneStatus.DONE,
      timerPaused: false,
      revealReason: null,
    }),
  );

/**
 * Record one answer in whichever lane the player is answering in.
 *
 * A lane closes its own question the moment both of its players are in. That
 * is the whole asynchronous round in one line: there is no other table to
 * wait for.
 */
export const recordLaneAnswer = (
  state: GameState,
  playerId: string,
  answer: Answer,
): GameState => {
  if (state.phase !== GamePhase.PLAYING) return state;

  const lane = state.lanes.find((candidate) =>
    candidate.answeringIds.includes(playerId),
  );
  // Eliminated players, spectators and a host who has switched answering off
  // can watch, but they cannot score.
  if (!lane || lane.status !== LaneStatus.ANSWERING) return state;

  const question: Question | undefined = state.questionsQueue[lane.questionIndex];
  if (!question) return state;

  const existing = liveAnswers(lane);
  if (existing.some((record) => record.playerId === playerId)) return state;

  const isCorrect = isAnswerCorrect(question, answer);
  const record: AnswerRecord = {
    playerId,
    answer,
    isCorrect,
    points: isCorrect
      ? CORRECT_BASE_POINTS + lane.timeLeft * TIME_BONUS_PER_SECOND
      : 0,
    timeLeft: lane.timeLeft,
  };

  const answers = [...lane.answers];
  answers[lane.questionIndex] = [...existing, record];
  const next = patchLane(state, lane.id, { answers });

  const answered = new Set(answers[lane.questionIndex].map((a) => a.playerId));
  const everyoneIsIn = lane.answeringIds.every((id) => answered.has(id));

  return everyoneIsIn ? closeLaneQuestion(next, lane.id, "all-in") : next;
};

/**
 * Re-read who each lane is waiting on, after the host takes themselves in or
 * out of the answer count mid-round.
 *
 * A lane that loses the last player it was waiting on is retired: it stops
 * holding the room's screen up. It does not come back if the host toggles
 * again — the next round draws fresh lanes.
 */
export const syncLaneRosters = (state: GameState): GameState => {
  if (state.phase !== GamePhase.PLAYING) return state;

  const roster = new Set(
    answeringRoster(
      state.bracket[state.currentRound - 1],
      state.players,
      state.hostAnsweringEnabled,
    ),
  );

  let next: GameState = {
    ...state,
    lanes: state.lanes.map((lane) => ({
      ...lane,
      answeringIds: lane.playerIds.filter((playerId) => roster.has(playerId)),
    })),
  };

  for (const lane of next.lanes) {
    if (lane.status !== LaneStatus.ANSWERING) continue;

    if (lane.answeringIds.length === 0) {
      next = retireLane(next, lane.id);
      continue;
    }

    const answered = new Set(liveAnswers(lane).map((a) => a.playerId));
    if (lane.answeringIds.every((id) => answered.has(id))) {
      next = closeLaneQuestion(next, lane.id, "all-in");
    }
  }

  return next;
};

/* ------------------------------------------------------------------ *
 * The room's screen
 *
 * The projector trails the field instead of driving it. It shows whichever
 * question the slowest matchup is still working on, which is what keeps it
 * safe to look at: no lane can ever see a question it has not reached on the
 * big screen, and the answer only goes up once every matchup is through it.
 * ------------------------------------------------------------------ */

/** The question the room is on, clamped to the round. */
export const broadcastIndex = (state: GameState): number =>
  Math.max(
    0,
    Math.min(state.broadcastQuestionIndex, state.questionsQueue.length - 1),
  );

/**
 * Put the answer on the projector if the last matchup has just cleared the
 * question it is showing.
 *
 * This runs off the back of a lane closing rather than off the clock, so the
 * big screen turns over the moment the field is through rather than up to a
 * second later with an empty countdown sitting at zero.
 */
export const openBroadcastRevealIfDue = (state: GameState): GameState => {
  if (state.phase !== GamePhase.PLAYING) return state;
  if (state.broadcastRevealing || state.questionsQueue.length === 0) return state;

  const index = broadcastIndex(state);
  if (!everyLaneCompleted(state.lanes, index)) return state;

  return {
    ...state,
    broadcastQuestionIndex: index,
    broadcastRevealing: true,
    broadcastRevealSecondsLeft: REVEAL_DURATION,
  };
};

/** Move the room's screen to the next question. */
export const advanceBroadcast = (state: GameState): GameState => {
  const nextIndex = state.broadcastQuestionIndex + 1;
  if (nextIndex >= state.questionsQueue.length) {
    // Nothing left to move on to; the answer stays up until the round wraps.
    return { ...state, broadcastRevealSecondsLeft: 0 };
  }

  return {
    ...state,
    broadcastQuestionIndex: nextIndex,
    broadcastRevealing: false,
    broadcastRevealSecondsLeft: REVEAL_DURATION,
  };
};

const tickBroadcast = (state: GameState): GameState => {
  if (state.questionsQueue.length === 0) return state;
  if (!state.broadcastRevealing) return openBroadcastRevealIfDue(state);

  // Auto-advance off means the room's screen holds until the host clicks on.
  if (!state.autoAdvance) return state;

  const revealSecondsLeft = state.broadcastRevealSecondsLeft - 1;
  return revealSecondsLeft > 0
    ? { ...state, broadcastRevealSecondsLeft: revealSecondsLeft }
    : advanceBroadcast({ ...state, broadcastRevealSecondsLeft: 0 });
};

/* ------------------------------------------------------------------ *
 * The clock
 * ------------------------------------------------------------------ */

/**
 * One second, applied to every lane and then to the room's screen.
 *
 * A single interval drives all of them: each lane keeps its own numbers, so
 * they run independently without needing a timer each.
 */
export const tickRound = (state: GameState): GameState => {
  if (state.phase !== GamePhase.PLAYING) return state;

  let next = state;

  for (const { id } of state.lanes) {
    const lane = next.lanes.find((candidate) => candidate.id === id);
    if (!lane) continue;

    if (lane.status === LaneStatus.ANSWERING) {
      if (lane.timerPaused) continue;
      const timeLeft = lane.timeLeft - 1;
      next = patchLane(next, id, { timeLeft: Math.max(0, timeLeft) });
      if (timeLeft <= 0) next = closeLaneQuestion(next, id, "time");
      continue;
    }

    if (lane.status === LaneStatus.REVEAL) {
      const revealSecondsLeft = lane.revealSecondsLeft - 1;
      next = patchLane(next, id, {
        revealSecondsLeft: Math.max(0, revealSecondsLeft),
      });
      // A lane always advances itself. Waiting on the host here would put the
      // whole field back on one pace, which is the thing lanes exist to undo.
      if (revealSecondsLeft <= 0) next = advanceLane(next, id);
    }
  }

  return tickBroadcast(next);
};

/**
 * The round is over once every matchup is through it *and* the room has seen
 * the last answer — the projector runs a question or so behind the field, and
 * cutting to the results while it is still catching up would rob the room of
 * the endings it has been waiting on.
 */
export const roundIsComplete = (state: GameState): boolean => {
  if (state.phase !== GamePhase.PLAYING) return false;
  // No lanes at all means nobody is playing this round; there is nothing for
  // the room's screen to catch up on either.
  if (state.lanes.length === 0) return true;
  if (!state.lanes.every((lane) => lane.status === LaneStatus.DONE)) return false;
  if (state.questionsQueue.length === 0) return true;

  return (
    state.broadcastRevealing &&
    state.broadcastQuestionIndex >= state.questionsQueue.length - 1 &&
    state.broadcastRevealSecondsLeft <= 0
  );
};

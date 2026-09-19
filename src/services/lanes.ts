import {
  Answer,
  AnswerRecord,
  GamePhase,
  GameState,
  LaneSeat,
  LaneStatus,
  MatchupLane,
  Question,
  RevealReason,
} from "../types";
import { REVEAL_DURATION, TIMER_DURATION } from "../constants";
import { answeringRoster, rosterForRound } from "./bracket";
import { isAnswerCorrect } from "./scoring";

/**
 * Asynchronous matches.
 *
 * A round used to be one question, one clock and one room: nobody moved on
 * until the last person in the building had answered. That is the wrong shape
 * for a bracket, so a round now deals every matchup a *match* — and a match
 * deals every player in it a *seat*.
 *
 * The seat is the unit that moves. It holds the whole per-question state that
 * used to be global — which question, how long is left, whether the answer is
 * up — and it moves itself along the moment its own player is done with a
 * question. Nothing here reads another seat to decide anything, which is what
 * guarantees one player can be on the last question of the round while the
 * person they are playing is still on the first.
 *
 * Why the two players in a matchup are not kept in step: points are 100 for a
 * correct answer plus 10 for every second left on the clock, so answering fast
 * is already worth something, and making the fast answerer sit and wait for
 * their opponent spends the very thing they just earned. They are compared on
 * the points they finish the round with, not on the pace they got there at.
 *
 * Every function here is a pure state -> state transition, so the clock, the
 * host's buttons and a player's own answer all drive a seat through exactly
 * the same code.
 */

const CORRECT_BASE_POINTS = 100;
const TIME_BONUS_PER_SECOND = 10;

/* ------------------------------------------------------------------ *
 * Reading a match
 * ------------------------------------------------------------------ */

/** The answers a match has taken for one of its questions, from both players. */
export const laneAnswers = (
  lane: MatchupLane,
  questionIndex: number,
): AnswerRecord[] => lane.answers[questionIndex] ?? [];

/** One player's seat in a match. */
export const seatFor = (
  lane: MatchupLane,
  playerId: string | null,
): LaneSeat | undefined =>
  playerId ? lane.seats.find((seat) => seat.playerId === playerId) : undefined;

/** The match a player is playing in, whether or not they are answering in it. */
export const laneForPlayer = (
  lanes: MatchupLane[],
  playerId: string | null,
): MatchupLane | undefined =>
  playerId ? lanes.find((lane) => lane.playerIds.includes(playerId)) : undefined;

/** A player's own seat, wherever in the field it is. */
export const seatForPlayer = (
  lanes: MatchupLane[],
  playerId: string | null,
): LaneSeat | undefined => {
  const lane = laneForPlayer(lanes, playerId);
  return lane ? seatFor(lane, playerId) : undefined;
};

/** What one player answered to a given question, if they answered it. */
export const answerBy = (
  lane: MatchupLane,
  playerId: string,
  questionIndex: number,
): AnswerRecord | undefined =>
  laneAnswers(lane, questionIndex).find(
    (record) => record.playerId === playerId,
  );

/**
 * Has this player finished with a given question?
 *
 * A seat counts as through a question the moment it stops taking an answer for
 * it — while the answer is in front of them, they are already done answering.
 */
export const seatHasCompleted = (
  seat: LaneSeat,
  questionIndex: number,
): boolean =>
  seat.status === LaneStatus.DONE ||
  seat.questionIndex > questionIndex ||
  (seat.questionIndex === questionIndex && seat.status === LaneStatus.REVEAL);

/** How many of the round's questions one player is through. */
export const seatCompletedCount = (
  seat: LaneSeat,
  questionsInRound: number,
): number => {
  if (seat.status === LaneStatus.DONE) return questionsInRound;
  return seat.questionIndex + (seat.status === LaneStatus.REVEAL ? 1 : 0);
};

/**
 * Has the whole match finished with a question?
 *
 * Both players have to be through it. A match with nobody left answering in it
 * (a host who switched answering off, a bye where the one player is out) is
 * through everything, so the room never ends up waiting on an empty table.
 */
export const laneHasCompleted = (
  lane: MatchupLane,
  questionIndex: number,
): boolean => lane.seats.every((seat) => seatHasCompleted(seat, questionIndex));

/** How far a match as a whole has got: where its slower player is. */
export const laneCompletedCount = (
  lane: MatchupLane,
  questionsInRound: number,
): number => {
  if (lane.seats.length === 0) return questionsInRound;
  return Math.min(
    ...lane.seats.map((seat) => seatCompletedCount(seat, questionsInRound)),
  );
};

/**
 * The match's status, derived from its seats rather than stored: a match is
 * still answering while anybody in it is, and done only when everybody is.
 */
export const laneStatus = (lane: MatchupLane): LaneStatus => {
  if (lane.seats.length === 0) return LaneStatus.DONE;
  if (lane.seats.every((seat) => seat.status === LaneStatus.DONE)) {
    return LaneStatus.DONE;
  }
  return lane.seats.some((seat) => seat.status === LaneStatus.ANSWERING)
    ? LaneStatus.ANSWERING
    : LaneStatus.REVEAL;
};

/** True once every player in the field has finished with a question. */
export const everyLaneCompleted = (
  lanes: MatchupLane[],
  questionIndex: number,
): boolean =>
  lanes.length > 0 &&
  lanes.every((lane) => laneHasCompleted(lane, questionIndex));

/**
 * Every answer anyone has given to one question, for the room's tally.
 *
 * Players who have not reached the question yet hold nothing for it, so this
 * is naturally limited to those who have been through it — plus whoever is
 * already in on the question the room is waiting on.
 */
export const answersForQuestion = (
  lanes: MatchupLane[],
  questionIndex: number,
): AnswerRecord[] =>
  lanes.flatMap((lane) => laneAnswers(lane, questionIndex));

/* ------------------------------------------------------------------ *
 * Writing to a match
 * ------------------------------------------------------------------ */

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

const patchSeat = (
  state: GameState,
  laneId: string,
  playerId: string,
  patch: Partial<LaneSeat>,
): GameState => ({
  ...state,
  lanes: state.lanes.map((lane) =>
    lane.id === laneId
      ? {
          ...lane,
          seats: lane.seats.map((seat) =>
            seat.playerId === playerId ? { ...seat, ...patch } : seat,
          ),
        }
      : lane,
  ),
});

/* ------------------------------------------------------------------ *
 * Drawing the matches
 * ------------------------------------------------------------------ */

const freshSeat = (playerId: string, playable: boolean, questionCount: number): LaneSeat => ({
  playerId,
  // A seat with nothing to answer is retired where it stands rather than
  // walked through the round on an empty clock.
  questionIndex: playable ? 0 : questionCount,
  status: playable ? LaneStatus.ANSWERING : LaneStatus.DONE,
  timeLeft: TIMER_DURATION,
  questionDuration: TIMER_DURATION,
  timerPaused: false,
  revealSecondsLeft: REVEAL_DURATION,
  revealReason: null,
});

/**
 * One match per matchup for the round about to start, each with a seat per
 * player who is actually answering.
 *
 * A game too small to have a bracket has nobody to be matched against, so it
 * gets a single match holding everyone — still one seat each, so a solo room
 * races itself rather than moving in lockstep.
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

    return {
      id,
      matchupId,
      playerIds,
      answeringIds,
      seats: answeringIds.map((playerId) =>
        freshSeat(playerId, questionCount > 0, questionCount),
      ),
      answers: [],
    };
  });
};

/* ------------------------------------------------------------------ *
 * Moving one seat along
 * ------------------------------------------------------------------ */

/**
 * Close one player's question: bank their points, then put the answer in front
 * of them — and only them.
 *
 * Their opponent is not touched. They may be four questions behind or already
 * finished; either way this player's round carries on from here.
 */
export const closeSeatQuestion = (
  state: GameState,
  laneId: string,
  playerId: string,
  reason: RevealReason,
): GameState => {
  const lane = state.lanes.find((candidate) => candidate.id === laneId);
  const seat = lane ? seatFor(lane, playerId) : undefined;
  if (!lane || !seat || seat.status !== LaneStatus.ANSWERING) return state;

  const record = answerBy(lane, playerId, seat.questionIndex);
  const isCorrect = record?.isCorrect ?? false;
  const points = record?.points ?? 0;

  // Points land here rather than at submit time so the scoreboard turns over
  // with the reveal the player is looking at, not a beat before it.
  const players = state.players.map((player) =>
    player.id === playerId
      ? {
          ...player,
          score: player.score + points,
          roundScore: player.roundScore + points,
          lastAnswerCorrect: isCorrect,
          streak: isCorrect ? player.streak + 1 : 0,
        }
      : player,
  );

  return openBroadcastRevealIfDue(
    patchSeat({ ...state, players }, laneId, playerId, {
      status: LaneStatus.REVEAL,
      timerPaused: false,
      revealSecondsLeft: REVEAL_DURATION,
      revealReason: reason,
    }),
  );
};

/**
 * Leave a player's reveal: their next question, or the end of their round.
 *
 * Called by the reveal clock running out and by the player themselves tapping
 * through. They are the same transition on purpose — a player who has read the
 * answer in two seconds should not be made to sit out the other four.
 */
export const advanceSeat = (
  state: GameState,
  laneId: string,
  playerId: string,
): GameState => {
  const lane = state.lanes.find((candidate) => candidate.id === laneId);
  const seat = lane ? seatFor(lane, playerId) : undefined;
  if (!lane || !seat || seat.status !== LaneStatus.REVEAL) return state;

  const questionCount = state.questionsQueue.length;
  const nextIndex = seat.questionIndex + 1;
  const hasMore = nextIndex < questionCount;

  return patchSeat(state, laneId, playerId, {
    // A finished seat parks on the round's length, so it reads as through
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

/**
 * A player has read their answer and wants the next question now.
 *
 * This is the whole point of the format from a player's side, so it is a first
 * class transition rather than a shortcut: find their seat wherever it is and
 * move it on.
 */
export const advancePlayerNow = (
  state: GameState,
  playerId: string,
): GameState => {
  if (state.phase !== GamePhase.PLAYING) return state;
  const lane = state.lanes.find((candidate) =>
    candidate.seats.some((seat) => seat.playerId === playerId),
  );
  return lane ? advanceSeat(state, lane.id, playerId) : state;
};

/** Take a seat out of the round — its player is no longer answering. */
const retireSeat = (
  state: GameState,
  laneId: string,
  playerId: string,
): GameState =>
  openBroadcastRevealIfDue(
    patchSeat(state, laneId, playerId, {
      status: LaneStatus.DONE,
      questionIndex: state.questionsQueue.length,
      timerPaused: false,
      revealReason: null,
    }),
  );

/**
 * Record one answer, and close the question it answers on the spot.
 *
 * There is nothing to wait for: the player has answered, so they have earned
 * their points and their feedback, and their opponent's pace is their own
 * business. This is the line that makes a round asynchronous all the way down
 * to the individual.
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
  const seat = lane ? seatFor(lane, playerId) : undefined;
  // Eliminated players, spectators and a host who has switched answering off
  // can watch, but they cannot score.
  if (!lane || !seat || seat.status !== LaneStatus.ANSWERING) return state;

  const question: Question | undefined = state.questionsQueue[seat.questionIndex];
  if (!question) return state;

  const existing = laneAnswers(lane, seat.questionIndex);
  if (existing.some((record) => record.playerId === playerId)) return state;

  const isCorrect = isAnswerCorrect(question, answer);
  const record: AnswerRecord = {
    playerId,
    answer,
    isCorrect,
    points: isCorrect
      ? CORRECT_BASE_POINTS + seat.timeLeft * TIME_BONUS_PER_SECOND
      : 0,
    timeLeft: seat.timeLeft,
  };

  const answers = [...lane.answers];
  answers[seat.questionIndex] = [...existing, record];

  return closeSeatQuestion(
    patchLane(state, lane.id, { answers }),
    lane.id,
    playerId,
    "answered",
  );
};

/**
 * Re-read who each match is waiting on, after the host takes themselves in or
 * out of the answer count mid-round.
 *
 * A seat whose player has stopped answering is retired: it stops holding the
 * room's screen up. It does not come back if the host toggles again — the next
 * round deals fresh seats.
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
    for (const seat of lane.seats) {
      if (seat.status === LaneStatus.DONE) continue;
      if (roster.has(seat.playerId)) continue;
      next = retireSeat(next, lane.id, seat.playerId);
    }
  }

  return next;
};

/* ------------------------------------------------------------------ *
 * Host controls
 *
 * The host acts on a table — both seats at it — because that is the unit they
 * can see from the desk. Underneath, each seat is still moved on its own.
 * ------------------------------------------------------------------ */

/** Stop a whole table's clocks and put each player's answer in front of them. */
export const closeLaneQuestion = (
  state: GameState,
  laneId: string,
  reason: RevealReason = "host",
): GameState => {
  const lane = state.lanes.find((candidate) => candidate.id === laneId);
  if (!lane) return state;

  return lane.seats.reduce(
    (next, seat) =>
      seat.status === LaneStatus.ANSWERING
        ? closeSeatQuestion(next, laneId, seat.playerId, reason)
        : next,
    state,
  );
};

/** Hold, or release, every clock at one table. */
export const setLanePaused = (
  state: GameState,
  laneId: string,
  paused: boolean,
): GameState => ({
  ...state,
  lanes: state.lanes.map((lane) =>
    lane.id === laneId
      ? {
          ...lane,
          seats: lane.seats.map((seat) =>
            seat.status === LaneStatus.ANSWERING
              ? { ...seat, timerPaused: paused }
              : seat,
          ),
        }
      : lane,
  ),
});

/** Give every live clock at one table more time. */
export const addLaneSeconds = (
  state: GameState,
  laneId: string,
  seconds: number,
): GameState => ({
  ...state,
  lanes: state.lanes.map((lane) => {
    if (lane.id !== laneId) return lane;

    return {
      ...lane,
      seats: lane.seats.map((seat) => {
        if (seat.status !== LaneStatus.ANSWERING) return seat;
        const timeLeft = Math.max(1, seat.timeLeft + seconds);
        return {
          ...seat,
          timeLeft,
          // Stretch the question's own clock with it, so the bars and the ring
          // measure against what the player was actually given rather than
          // sitting pinned at full while the number counts past it.
          questionDuration: Math.max(seat.questionDuration, timeLeft),
        };
      }),
    };
  }),
});

/** Is anybody at this table still on a running clock? */
export const laneIsRunning = (lane: MatchupLane): boolean =>
  lane.seats.some(
    (seat) => seat.status === LaneStatus.ANSWERING && !seat.timerPaused,
  );

/* ------------------------------------------------------------------ *
 * The room's screen
 *
 * The projector trails the field instead of driving it. It shows whichever
 * question the slowest player is still working on, which is what keeps it safe
 * to look at: nobody can see a question they have not reached on the big
 * screen, and the answer only goes up once everyone is through it.
 * ------------------------------------------------------------------ */

/** The question the room is on, clamped to the round. */
export const broadcastIndex = (state: GameState): number =>
  Math.max(
    0,
    Math.min(state.broadcastQuestionIndex, state.questionsQueue.length - 1),
  );

/**
 * Put the answer on the projector if the last player has just cleared the
 * question it is showing.
 *
 * This runs off the back of a seat closing rather than off the clock, so the
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
 * One second, applied to every seat and then to the room's screen.
 *
 * A single interval drives all of them: each seat keeps its own numbers, so
 * they run independently without needing a timer each.
 */
export const tickRound = (state: GameState): GameState => {
  if (state.phase !== GamePhase.PLAYING) return state;

  let next = state;

  for (const lane of state.lanes) {
    for (const { playerId } of lane.seats) {
      const seat = next.lanes
        .find((candidate) => candidate.id === lane.id)
        ?.seats.find((candidate) => candidate.playerId === playerId);
      if (!seat) continue;

      if (seat.status === LaneStatus.ANSWERING) {
        if (seat.timerPaused) continue;
        const timeLeft = seat.timeLeft - 1;
        next = patchSeat(next, lane.id, playerId, {
          timeLeft: Math.max(0, timeLeft),
        });
        if (timeLeft <= 0) {
          next = closeSeatQuestion(next, lane.id, playerId, "time");
        }
        continue;
      }

      if (seat.status === LaneStatus.REVEAL) {
        const revealSecondsLeft = seat.revealSecondsLeft - 1;
        next = patchSeat(next, lane.id, playerId, {
          revealSecondsLeft: Math.max(0, revealSecondsLeft),
        });
        // A seat always advances itself. Waiting on the host here would put
        // the whole field back on one pace, which is the thing seats exist to
        // undo — and the player can skip ahead of this countdown anyway.
        if (revealSecondsLeft <= 0) next = advanceSeat(next, lane.id, playerId);
      }
    }
  }

  return tickBroadcast(next);
};

/**
 * The round is over once every player is through it *and* the room has seen
 * the last answer — the projector runs a question or so behind the field, and
 * cutting to the results while it is still catching up would rob the room of
 * the endings it has been waiting on.
 */
export const roundIsComplete = (state: GameState): boolean => {
  if (state.phase !== GamePhase.PLAYING) return false;
  // No matches at all means nobody is playing this round; there is nothing for
  // the room's screen to catch up on either.
  if (state.lanes.length === 0) return true;
  if (!state.lanes.every((lane) => laneStatus(lane) === LaneStatus.DONE)) {
    return false;
  }
  if (state.questionsQueue.length === 0) return true;

  return (
    state.broadcastRevealing &&
    state.broadcastQuestionIndex >= state.questionsQueue.length - 1 &&
    state.broadcastRevealSecondsLeft <= 0
  );
};

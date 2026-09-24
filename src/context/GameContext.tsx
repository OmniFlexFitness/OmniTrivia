import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Answer,
  CategoryContent,
  GameState,
  GamePhase,
  GameMode,
  LaneStatus,
  Player,
  Question,
  QuestionType,
  RoundConfig,
} from "../types";
import {
  BOT_ACCURACY,
  BOT_MAX_THINK_SECONDS,
  BOT_MIN_THINK_SECONDS,
  BOT_NAMES,
  REVEAL_DURATION,
  AVATARS,
  AVATAR_COLORS,
  CATEGORIES,
} from "../constants";
import { generateQuestions } from "../services/claudeService";
import {
  describeSkipped,
  fetchDefaultQuestionBank,
  parseImportDataWithReport,
} from "../services/importService";
import {
  playableQuestions,
  playableRounds,
} from "../services/questionQuality";
import {
  buildRoundsFromContent,
  longestRound,
  randomizeRounds,
  renumberRounds,
  shuffle,
} from "../services/questionSet";
import {
  activePlayerIds,
  buildFirstRound,
  buildNextRound,
  resolveRound,
} from "../services/bracket";
import {
  addLaneSeconds,
  advanceBroadcast,
  advancePlayerNow,
  buildRoundLanes,
  closeLaneQuestion,
  laneAnswers,
  recordLaneAnswer,
  roundIsComplete,
  setLanePaused,
  stopRoundInPlace,
  syncLaneRosters,
  tickRound,
} from "../services/lanes";
import {
  applyCategoryLike,
  applyCategoryVote,
  buildCategoryPoll,
} from "../services/preferences";
import {
  recordBallot,
  recordCategoryLike,
  recordCategoryVote,
  recordRoundPlayed,
} from "../services/insights";
import { buildSnapshot } from "../services/snapshot";
import { clearSeat, pinSeatToUrl, readSeat, saveSeat } from "../services/seat";
import {
  applyHostState,
  captureHostState,
  clearHostSession,
  parseHostEnvelope,
  readHostSession,
  saveHostSession,
} from "../services/hostSession";
import type { PersistedHostState } from "../services/hostSession";
import {
  PLAYER_CODE_LENGTH,
  hostProof,
  playerProof,
  suggestHostPassword,
} from "../services/proof";
import { maySpeakFor, resolveJoinRequest } from "../services/seats";
import type { SeatBindings } from "../services/seats";
import {
  allocatePin,
  claimRoomAsHost,
  clearStoredSnapshot,
  fetchHostState,
  openBroadcastWindow,
  publishHostSecret,
  publishHostState,
  postMessage,
  publishSnapshot,
  registerRoom,
  releaseRoom,
  attachRoomChannel,
  detachRoomChannel,
  PLAYER_ATTACH_TIMEOUT_MS,
  warmUpRoomChannel,
  canReachOtherDevices,
  deviceIdentity,
  roomChannelReady,
  roomFailureReason,
  subscribeToMessages,
} from "../services/broadcastBus";

interface GameContextType extends GameState {
  /** True while a broadcast window is answering heartbeats. */
  broadcastConnected: boolean;
  initHost: () => void;
  initJoin: () => void;
  generateGame: (rounds: number, questions: number) => Promise<void>;
  confirmGame: () => void;
  setGameName: (name: string) => void;
  /** Choose the password that gets this game back. Set before the lobby opens. */
  setHostPassword: (password: string) => void;
  /** Open the door back into a game this host was already running. */
  initHostResume: () => void;
  /**
   * Take a game back with its PIN and its host password.
   *
   * Works from the window that lost it and from a device that never had it:
   * the password is the proof, and the game comes back from whichever copy is
   * newer — this machine's, or the room's.
   */
  resumeHosting: (pin: string, password: string) => Promise<void>;
  clearResumeError: () => void;
  toggleHostAnswering: () => void;
  clearJoinError: () => void;
  updateConfig: (rounds: number, questions: number) => void;
  /**
   * Open the importer, carrying the shape the host has just dialled in. The
   * rounds and questions-per-round sliders mean the same thing whether the
   * questions come from Claude or from a spreadsheet, and an import that
   * ignored them was the reason a 40-question file became a 40-question round.
   */
  initImport: (rounds: number, questions: number) => void;
  /**
   * Fetch the premade question bank and go straight to choosing what to play.
   *
   * Same destination as `initImport`, minus the file picker: a host who has
   * not written a question and has no API key gets a night out of one tap.
   * Resolves either way — a bank that cannot be reached leaves the host on the
   * importer with the reason, not on a dead screen.
   */
  loadQuestionBank: (rounds: number, questions: number) => Promise<void>;
  importGame: (csvData: string) => void;
  /**
   * Turn the parsed import into a game: which categories to keep, how many of
   * them to play, and how many questions each round carries.
   */
  applyImportSelection: (selection: {
    categoryIds: string[];
    rounds: number;
    questionsPerRound: number;
  }) => void;
  /** Back from the trimming screen to the file picker, keeping nothing. */
  cancelImport: () => void;
  /**
   * Back from the review screen to the import's WHAT TO PLAY, with the whole
   * file still in hand. Null-safe to call: it does nothing when this game did
   * not come from an import.
   */
  reopenImportSelection: () => void;
  goBackToConfig: () => void;
  joinGame: (
    name: string,
    avatar: string,
    avatarColor?: string,
    avatarAccessory?: string,
    pin?: string,
    /**
     * The player's own code, chosen on their first join and typed again to get
     * back into the same seat from a device that remembers nothing.
     */
    rejoinCode?: string,
  ) => void;
  hostJoinAsPlayer: (name: string, avatar: string) => void;
  addBot: () => void;
  startGame: () => void;
  /**
   * Deal the round on whatever the wheel landed on. No argument: the category
   * was settled by `revealCategory` when the wheel stopped, and passing it
   * again would just be a second chance to disagree with the pointer.
   */
  startRound: () => void;
  beginWheelSpin: () => void;
  /**
   * The wheel has stopped on `landedIndex` — a position among the categories
   * still to be played, which is what the wheel draws. This is where the
   * round's category is actually decided: the landed category is moved into
   * this round's slot and everything downstream reads it from there.
   *
   * `categoryId` is what the pointer is actually over. The host may respin as
   * often as they like, and after the first landing the remainder is no longer
   * in the order the wheel is still drawing, so a second landing is found by
   * its id; the index is the fallback for a slice with no id to go on.
   */
  revealCategory: (landedIndex: number, categoryId?: string) => void;
  submitAnswer: (answer: Answer) => void;
  /**
   * Take the next question now instead of waiting out the rest of the reveal.
   * Speed is worth points, so nobody is made to sit and watch a countdown.
   */
  advanceMyQuestion: () => void;
  /**
   * Like, or take back a like on, one of the categories this game has played.
   * The caller says which way rather than this toggling: a guest reads their
   * own like off the host's snapshot, not off state they do not have.
   */
  setCategoryLike: (categoryId: string, liked: boolean) => void;
  /** Vote in the end-of-round ballot on what to play in future. */
  voteForCategory: (pollId: string, categoryId: string) => void;
  /** Draw a fresh set of options for the open ballot. Host only. */
  redrawCategoryPoll: () => void;
  nextRound: () => void;
  restartGame: () => void;
  playAgain: () => void;
  /**
   * Rewrite one question in place. Returns false when generation failed and the
   * question was left alone, so the review screen can say so rather than
   * spinning and quietly changing nothing.
   */
  regenerateQuestion: (
    roundNumber: number,
    questionIndex: number,
  ) => Promise<boolean>;
  /** Drop one question from a round. */
  removeQuestion: (roundNumber: number, questionIndex: number) => void;
  /** Drop a whole round — the category and every question under it. */
  removeRound: (roundNumber: number) => void;

  /* --- host controls for running a live round --- *
   * Every question-level control now names the matchup it applies to: there is
   * no single question on screen to act on any more. The `all` variants are
   * for the moments a host really does mean the whole room. */
  revealLaneNow: (laneId: string) => void;
  toggleLanePaused: (laneId: string) => void;
  addLaneTime: (laneId: string, seconds: number) => void;
  revealAllLanesNow: () => void;
  setAllLanesPaused: (paused: boolean) => void;
  addTimeToAllLanes: (seconds: number) => void;
  /** Move the room's screen off the answer it is holding. */
  advanceBroadcastNow: () => void;
  /** Cut to the round's results without waiting for the projector to catch up. */
  endRoundNow: () => void;
  toggleAutoAdvance: () => void;
  openBroadcast: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

/** A broadcast window that has not checked in for this long is treated as gone. */
const BROADCAST_TIMEOUT_MS = 6000;
/**
 * How long a join waits for the host of that PIN to answer before giving up.
 * A host in the same browser answers in microseconds; one across the room
 * answers over someone's phone network, so the wait is not the same wait.
 */
const JOIN_TIMEOUT_MS = 1500;
const REMOTE_JOIN_TIMEOUT_MS = 10000;
/**
 * Once a host has answered, how long the seat itself may take to come back.
 *
 * Separate from the wait above, because by then the room is known to exist:
 * running out of time here is a slow link, and must not be reported as "no
 * game is running with that PIN" to a player looking at that very game.
 */
const REMOTE_SEAT_TIMEOUT_MS = 20000;
/** Used when the host never names the game. */
const DEFAULT_GAME_NAME = "OmniTrivia Night";

/* How often the running game is written down, so a host who loses their window
 * loses at most a moment of it rather than the night. Neither copy is written
 * per state change: during a round that is once a second, and the game carries
 * every question in it. */
const LOCAL_SAVE_INTERVAL_MS = 2000;
const REMOTE_SAVE_INTERVAL_MS = 6000;

/**
 * The largest game the room will hold, matching the payload limit in
 * `firebase/database.rules.json`. A game past it still saves to the host's own
 * machine, which is the copy that covers the case this is all for.
 */
const MAX_HOST_STATE_LENGTH = 786432;

/** Shown when this window's room has been reclaimed somewhere else. */
const DISPLACED_WARNING =
  "Another device has taken over hosting this game with the host password. This window is no longer running it — close it, or start a new game.";

/* ------------------------------------------------------------------ *
 * Pure transitions
 *
 * A live round is driven entirely by `src/services/lanes.ts`: every player
 * owns their question, their clock and their reveal, and moves themselves
 * along. What is left here are the transitions that are genuinely about the
 * whole game — settling a round, drawing the ballot, ending the night.
 * ------------------------------------------------------------------ */

/**
 * Settle the round's matchups and draw the next one. Called when the last
 * question of a round has been revealed.
 */
const finishRound = (prev: GameState): GameState => {
  const roundIndex = prev.currentRound - 1;
  const current = prev.bracket[roundIndex];

  if (!current) {
    return {
      ...prev,
      categoryPoll: buildCategoryPoll(prev, prev.currentRound),
      phase: GamePhase.ROUND_END,
    };
  }

  const poll = buildCategoryPoll(prev, prev.currentRound);

  const { round: resolved, advancingIds } = resolveRound(current, prev.players);
  const bracket = [...prev.bracket];
  bracket[roundIndex] = resolved;

  const wasActive = new Set(activePlayerIds(current));
  const advancing = new Set(advancingIds);
  const players = prev.players.map((player) =>
    wasActive.has(player.id) && !advancing.has(player.id)
      ? { ...player, eliminated: true }
      : player,
  );

  // One survivor means the bracket is decided and the game is over, even if
  // there are rounds left on the card. A bracket only exists when there were
  // two or more players to draw, so there is no degenerate case here where a
  // lone player is walked through byes for the rest of the night.
  const decided = advancingIds.length <= 1;
  const hasMoreRounds = prev.currentRound < prev.totalRounds;

  if (!decided && hasMoreRounds) {
    // Every round played so far, this one included, so the draw can see who
    // has already had a bye and give the next one to somebody else.
    bracket[roundIndex + 1] = buildNextRound(
      prev.currentRound + 1,
      advancingIds,
      bracket.slice(0, roundIndex + 1),
    );
  }

  return {
    ...prev,
    bracket,
    players,
    championId: decided ? (advancingIds[0] ?? null) : null,
    categoryPoll: poll,
    phase: GamePhase.ROUND_END,
  };
};

/** An answer a bot submits, built to be right or wrong on purpose. */
const botAnswerFor = (question: Question, shouldBeCorrect: boolean): Answer => {
  const options = question.options;

  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      return shouldBeCorrect ? (options[0] ?? "") : "…";

    case QuestionType.SLIDER: {
      const [min, max, , low, high] = options.map(Number);
      if (shouldBeCorrect) return (low + high) / 2;
      // Miss on whichever side of the correct band is still inside the slider.
      return low - 1 >= min ? low - 1 : Math.min(high + 1, max);
    }

    case QuestionType.PUZZLE:
      return shouldBeCorrect || options.length < 2
        ? [...options]
        : [...options].reverse();

    default: {
      if (shouldBeCorrect) return question.correctIndex;
      const wrong = options
        .map((_, index) => index)
        .filter((index) => index !== question.correctIndex);
      return wrong.length
        ? wrong[Math.floor(Math.random() * wrong.length)]
        : question.correctIndex;
    }
  }
};

/**
 * The game PIN carried on this page's own URL, if there is one.
 *
 * The lobby's QR code encodes the app's URL with `?pin=` already filled in
 * (see `joinUrl`), so a link that carries one is somebody who has already
 * chosen their game by pointing a camera at it. Anything that is not four
 * digits was not written by us and is ignored rather than prefilled into the
 * form.
 */
const readInitialPin = (): string | null => {
  try {
    const pin = new URLSearchParams(window.location.search).get("pin");
    return pin && /^\d{4}$/.test(pin) ? pin : null;
  } catch {
    return null;
  }
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Read once, before the first state, because it decides which screen this
  // page opens on as well as what is in the form when it gets there. A lazy
  // initialiser rather than a plain call: this provider re-renders on every
  // tick of the round clock, and the URL it would be re-reading cannot change
  // without the page being loaded again anyway.
  const [initialPin] = useState(readInitialPin);

  const [state, setState] = useState<GameState>({
    // A scan has already said "this game, please". Landing such a page on the
    // start screen asks the question a second time, and every player in the
    // room has to answer it by finding JOIN GAME — so go straight to the seat
    // they came for, with the PIN already in it.
    phase: initialPin ? GamePhase.JOIN : GamePhase.START,
    mode: GameMode.STANDARD,
    players: [],
    currentPlayerId: null,
    isHost: false,
    gamePin: null,
    gameName: "",
    // Offered rather than demanded: a host who never thinks about this still
    // ends up with a game they can get back, and can overwrite it with
    // something they will remember if they would rather.
    hostPassword: suggestHostPassword(),
    clientPin: null,
    clientPlayerId: null,
    joining: false,
    joinError: null,
    resuming: false,
    resumeError: null,
    totalRounds: 3,
    questionsPerRound: 5,
    roundsConfig: [],
    importPreview: null,
    currentRound: 0,
    questionsQueue: [],
    usedCategories: [],
    selectedCategory: null,
    bracket: [],
    championId: null,
    lanes: [],
    broadcastQuestionIndex: 0,
    broadcastRevealing: false,
    broadcastRevealSecondsLeft: REVEAL_DURATION,
    autoAdvance: true,
    hostAnsweringEnabled: true,
    wheelSpinning: false,
    categoryRevealed: false,
    categoryLikes: [],
    categoryPoll: null,
    loading: false,
    error: null,
    contentWarning: null,
    initialPin,
    roomWarning: null,
  });

  const [broadcastConnected, setBroadcastConnected] = useState(false);
  const broadcastSeenAt = useRef(0);
  // Identifies this host window on the shared channel. Two host tabs in one
  // browser would otherwise both publish into the same projector.
  const hostId = useRef<string>(
    globalThis.crypto?.randomUUID?.() ?? `host-${Math.random().toString(36).slice(2)}`,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * What this room's host password hashes to, once there is a room.
   *
   * Held rather than recomputed because the password itself is deliberately
   * forgotten: a window that resumed a game knows the proof it got in with and
   * never learns what was typed to produce it.
   */
  const hostProofRef = useRef<string | null>(null);

  /**
   * Which signed-in device holds each seat, for players who joined from one.
   *
   * A message carries the player id it claims to speak for, and player ids are
   * on every snapshot the room can read. The database's own idea of who sent a
   * message is the part that cannot be forged, so seats are bound to it on the
   * way in and every later message is checked against that binding — otherwise
   * anyone who knows the PIN could answer, or quit, as somebody else.
   */
  const seatUids = useRef<SeatBindings>(new Map());

  /* ---------------------------------------------------------------- *
   * Round clock
   *
   * One interval for the whole round: it hands a second to every seat, each
   * of which spends it on its own question or its own reveal. Players need no
   * timer of their own to run independently — only their own numbers.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (state.phase !== GamePhase.PLAYING) return;

    const timer = setInterval(() => {
      setState((prev) => {
        const next = tickRound(prev);
        return roundIsComplete(next) ? finishRound(next) : next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.phase]);

  // Auto-add bots in the lobby so a host testing alone still gets a bracket.
  useEffect(() => {
    if (
      !state.isHost ||
      state.phase !== GamePhase.LOBBY ||
      state.players.length >= 3
    ) {
      return;
    }

    const botInterval = setInterval(() => addBot(), 3000);
    return () => clearInterval(botInterval);
  }, [state.isHost, state.phase, state.players.length]);

  /** Take one answer into whichever seat the player is playing from. */
  const recordAnswer = useCallback((playerId: string, answer: Answer) => {
    setState((prev) => {
      const next = recordLaneAnswer(prev, playerId, answer);
      // The last player to finish can end the round with their answer, so
      // this has to be checked here and not only on the clock.
      return roundIsComplete(next) ? finishRound(next) : next;
    });
  }, []);

  /* ---------------------------------------------------------------- *
   * Bots answer on a spread of timers, one per seat, so the field actually
   * spreads out the way a room of real players does.
   * ---------------------------------------------------------------- */
  // Keyed by seat and question, so one bot moving on never reshuffles the
  // think time of the bot sitting across the table from it.
  const botTimers = useRef(new Map<string, number[]>());

  useEffect(() => {
    const clearKey = (key: string) => {
      botTimers.current.get(key)?.forEach(clearTimeout);
      botTimers.current.delete(key);
    };

    if (state.phase !== GamePhase.PLAYING) {
      [...botTimers.current.keys()].forEach(clearKey);
      return;
    }

    const bots = new Set(state.players.filter((p) => p.isBot).map((p) => p.id));
    const live = new Set<string>();

    state.lanes.forEach((lane) => {
      lane.seats.forEach((seat) => {
        if (seat.status !== LaneStatus.ANSWERING) return;
        if (!bots.has(seat.playerId)) return;

        const key = `${lane.id}:${seat.playerId}:${seat.questionIndex}`;
        live.add(key);
        if (botTimers.current.has(key)) return; // already thinking

        const question = state.questionsQueue[seat.questionIndex];
        if (!question) return;

        const alreadyIn = laneAnswers(lane, seat.questionIndex).some(
          (a) => a.playerId === seat.playerId,
        );
        if (alreadyIn) return;

        // Leave a second on the clock so a bot never lands after time is up.
        const latest = Math.min(seat.timeLeft - 1, BOT_MAX_THINK_SECONDS);
        const spread = Math.max(0, latest - BOT_MIN_THINK_SECONDS);

        const answerUp = () => {
          const current = stateRef.current.lanes
            .find((candidate) => candidate.id === lane.id)
            ?.seats.find((candidate) => candidate.playerId === seat.playerId);

          // The seat has moved on without this bot; its answer was built for a
          // question that is no longer the one in front of it.
          if (!current || current.questionIndex !== seat.questionIndex) return;

          // A paused seat is a host holding that table, so its bot waits too.
          if (current.timerPaused) {
            botTimers.current.set(key, [
              ...(botTimers.current.get(key) ?? []),
              window.setTimeout(answerUp, 1000),
            ]);
            return;
          }

          recordAnswer(
            seat.playerId,
            botAnswerFor(question, Math.random() < BOT_ACCURACY),
          );
        };

        const delay = (BOT_MIN_THINK_SECONDS + Math.random() * spread) * 1000;
        botTimers.current.set(key, [
          window.setTimeout(answerUp, Math.max(500, delay)),
        ]);
      });
    });

    // Drop the timers for questions the field has already moved past.
    [...botTimers.current.keys()]
      .filter((key) => !live.has(key))
      .forEach(clearKey);
    // Deliberately not keyed on the answers: rescheduling on every answer
    // would keep resetting the bots' think time.
  }, [state.phase, state.lanes, state.players, state.questionsQueue, recordAnswer]);

  useEffect(
    () => () => {
      botTimers.current.forEach((timers) => timers.forEach(clearTimeout));
      botTimers.current.clear();
    },
    [],
  );

  /* ---------------------------------------------------------------- *
   * The durable record of what the room likes
   *
   * Written by diffing committed state rather than from inside the handlers,
   * so a re-sent message, a re-render or a double-invoked updater cannot turn
   * one tap into two rows in the host's data. The baselines below are what has
   * already been banked; only the difference is ever written.
   * ---------------------------------------------------------------- */
  const likeBaseline = useRef(new Map<string, Set<string>>());
  const ballotId = useRef<string | null>(null);
  const voteBaseline = useRef(new Map<string, string>());
  const roundsRecorded = useRef(new Set<string>());

  const resetInsightBaselines = () => {
    likeBaseline.current = new Map();
    ballotId.current = null;
    voteBaseline.current = new Map();
    roundsRecorded.current = new Set();
  };

  useEffect(() => {
    if (!state.isHost) return;

    state.categoryLikes.forEach((tally) => {
      const before = likeBaseline.current.get(tally.category.id) ?? new Set<string>();
      const now = new Set(tally.playerIds);

      now.forEach((playerId) => {
        if (!before.has(playerId)) recordCategoryLike(tally.category, true);
      });
      before.forEach((playerId) => {
        if (!now.has(playerId)) recordCategoryLike(tally.category, false);
      });

      likeBaseline.current.set(tally.category.id, now);
    });
  }, [state.isHost, state.categoryLikes]);

  useEffect(() => {
    if (!state.isHost) return;

    const poll = state.categoryPoll;
    if (!poll) {
      // A closed ballot is not a retraction: the votes it collected were real
      // and stay banked. Only the baseline is forgotten.
      ballotId.current = null;
      voteBaseline.current = new Map();
      return;
    }

    if (ballotId.current !== poll.id) {
      ballotId.current = poll.id;
      voteBaseline.current = new Map();
      recordBallot(poll.options);
    }

    const optionsById = new Map(poll.options.map((option) => [option.id, option]));
    const before = voteBaseline.current;
    const now = new Map(Object.entries(poll.votes));

    now.forEach((categoryId, playerId) => {
      const previous = before.get(playerId);
      if (previous === categoryId) return;

      // A changed vote takes itself off the option it left, so the totals stay
      // equal to what the room actually wanted.
      const left = previous ? optionsById.get(previous) : undefined;
      if (left) recordCategoryVote(left, -1);

      const picked = optionsById.get(categoryId);
      if (picked) recordCategoryVote(picked, 1);
    });

    voteBaseline.current = now;
  }, [state.isHost, state.categoryPoll]);

  useEffect(() => {
    if (!state.isHost || state.phase !== GamePhase.ROUND_END) return;

    const category = state.roundsConfig[state.currentRound - 1]?.category;
    if (!category) return;

    const key = `${state.gamePin}:${state.currentRound}:${category.id}`;
    if (roundsRecorded.current.has(key)) return;
    roundsRecorded.current.add(key);
    recordRoundPlayed(category);
  }, [
    state.isHost,
    state.phase,
    state.currentRound,
    state.roundsConfig,
    state.gamePin,
  ]);

  /* ---------------------------------------------------------------- *
   * Publish to the broadcast window
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (!state.isHost) return;
    publishSnapshot(buildSnapshot(state, hostId.current));
  }, [state]);

  /* ---------------------------------------------------------------- *
   * Keeping the game where the host can get it back
   *
   * The host window *is* the game — the questions, the scores, the bracket and
   * every clock in the round live in this state and nowhere else. So it is
   * written down as it goes: on this machine, and in the room itself where a
   * device that can prove the host password may read it. Neither copy is
   * written on every change, because during a round there is one a second and
   * each carries the whole round's questions with it.
   * ---------------------------------------------------------------- */
  const savedLocallyAt = useRef(0);
  const savedRemotelyAt = useRef(0);
  const savedPhase = useRef<GamePhase | null>(null);

  const persistHostSession = useCallback(
    (snapshot: GameState, force = false): void => {
      const pin = snapshot.gamePin;
      const proof = hostProofRef.current;
      if (!snapshot.isHost || !pin || !proof) return;

      // A phase change is the interesting kind of change — a round starting, a
      // round settling, the game ending — and worth both copies immediately.
      const turned = savedPhase.current !== snapshot.phase;
      savedPhase.current = snapshot.phase;

      const now = Date.now();
      const state = captureHostState(snapshot);

      if (force || turned || now - savedLocallyAt.current >= LOCAL_SAVE_INTERVAL_MS) {
        savedLocallyAt.current = now;
        saveHostSession({
          pin,
          hostId: hostId.current,
          proof,
          seats: [...seatUids.current.entries()],
          state,
        });
      }

      if (
        canReachOtherDevices() &&
        (force || turned || now - savedRemotelyAt.current >= REMOTE_SAVE_INTERVAL_MS)
      ) {
        savedRemotelyAt.current = now;
        const payload = JSON.stringify({
          state,
          seats: [...seatUids.current.entries()],
        });
        if (payload.length <= MAX_HOST_STATE_LENGTH) {
          void publishHostState(pin, hostId.current, payload);
        }
      }
    },
    [],
  );

  useEffect(() => {
    persistHostSession(state);
  }, [state, persistHostSession]);

  // A page being closed is the whole reason any of this exists, and it is the
  // one moment there is no time to wait for an interval. localStorage is
  // synchronous, so this copy always lands; the room's may not, which is why
  // the two are kept in step during play rather than only here.
  useEffect(() => {
    if (!state.isHost || !state.gamePin) return;

    const save = () => persistHostSession(stateRef.current, true);
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [state.isHost, state.gamePin, persistHostSession]);

  useEffect(() => {
    if (!state.isHost) return;
    const beat = setInterval(
      () =>
        postMessage({
          type: "host-heartbeat",
          at: Date.now(),
          hostId: hostId.current,
        }),
      2000,
    );
    return () => clearInterval(beat);
  }, [state.isHost]);

  useEffect(() => {
    const unsubscribe = subscribeToMessages((message) => {
      if (
        message.type !== "broadcast-hello" &&
        message.type !== "broadcast-heartbeat"
      ) {
        return;
      }

      // A display latched onto another host tab is not watching this one, so
      // its heartbeats must not light up this host's pill.
      const watching = message.hostId;
      if (watching && watching !== hostId.current) return;

      broadcastSeenAt.current = Date.now();
      setBroadcastConnected(true);

      // A window that just opened may have hydrated from a stale snapshot.
      if (message.type === "broadcast-hello" && stateRef.current.isHost) {
        publishSnapshot(buildSnapshot(stateRef.current, hostId.current));
      }
    });

    const check = setInterval(() => {
      setBroadcastConnected(
        Date.now() - broadcastSeenAt.current < BROADCAST_TIMEOUT_MS,
      );
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(check);
    };
  }, []);

  /* ---------------------------------------------------------------- *
   * Hosting a room: answering for the PIN, and admitting the players
   * who ask for it
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const unsubscribe = subscribeToMessages((message, meta) => {
      const current = stateRef.current;
      if (!current.isHost || !current.gamePin) return;

      const speaksFor = (playerId: string): boolean =>
        maySpeakFor(seatUids.current, playerId, meta);

      if (message.type === "room-query") {
        if (message.pin !== current.gamePin) return;
        postMessage({
          type: "room-offer",
          pin: current.gamePin,
          nonce: message.nonce,
          hostId: hostId.current,
          gameName: current.gameName,
          // Latecomers cannot be slotted into a bracket that is already drawn.
          open: current.phase === GamePhase.LOBBY,
        });
        return;
      }

      if (message.type === "player-join") {
        if (message.pin !== current.gamePin) return;

        // Who this is — a new player, a phone that reloaded, or somebody
        // coming back with the code they chose — is one decision, and it is
        // made in `services/seats` where it can be tested without a room.
        const decision = resolveJoinRequest({
          players: current.players,
          seats: seatUids.current,
          lobbyOpen: current.phase === GamePhase.LOBBY,
          request: {
            playerId: message.playerId,
            name: message.name,
            rejoinProof: message.rejoinProof,
          },
          meta,
        });

        const { accepted, seatId } = decision;

        if (accepted && meta) seatUids.current.set(seatId, meta.uid);

        if (accepted) {
          setState((prev) => {
            const existing = prev.players.find((p) => p.id === seatId);

            // A returning player keeps their score, their streak and their
            // place in the bracket, and gets whatever they look like now: a
            // new phone is a new avatar picker, and the room should see the
            // person rather than the device.
            if (existing) {
              return {
                ...prev,
                players: prev.players.map((p) =>
                  p.id === seatId
                    ? {
                        ...p,
                        name: message.name || p.name,
                        avatar: message.avatar || p.avatar,
                        avatarColor: message.avatarColor ?? p.avatarColor,
                        avatarAccessory:
                          message.avatarAccessory ?? p.avatarAccessory,
                        // Set on a first join and kept on every later one, so
                        // a reload cannot quietly drop a player's way back in.
                        rejoinProof: message.rejoinProof ?? p.rejoinProof,
                      }
                    : p,
                ),
              };
            }

            const player: Player = {
              id: seatId,
              name: message.name,
              avatar: message.avatar,
              avatarColor: message.avatarColor,
              avatarAccessory: message.avatarAccessory,
              rejoinProof: message.rejoinProof,
              score: 0,
              roundScore: 0,
              isBot: false,
              streak: 0,
            };
            return { ...prev, players: [...prev.players, player] };
          });
        }

        postMessage({
          type: "player-join-result",
          clientId: message.clientId,
          accepted,
          playerId: accepted ? seatId : undefined,
          rejoined: accepted ? decision.rejoined : undefined,
          reason: decision.reason,
          hostId: hostId.current,
          gameName: current.gameName,
          pin: current.gamePin,
        });
        return;
      }

      if (message.type === "player-answer") {
        if (message.pin !== current.gamePin) return;
        if (!speaksFor(message.playerId)) return;
        recordAnswer(message.playerId, message.answer);
        return;
      }

      if (message.type === "player-advance") {
        if (message.pin !== current.gamePin) return;
        if (!speaksFor(message.playerId)) return;
        // Their own seat, and only theirs: reading the answer quickly buys
        // them the next question, not the table's.
        setState((prev) => {
          const next = advancePlayerNow(prev, message.playerId);
          return roundIsComplete(next) ? finishRound(next) : next;
        });
        return;
      }

      if (message.type === "category-like") {
        if (message.pin !== current.gamePin) return;
        if (!speaksFor(message.playerId)) return;
        setState((prev) =>
          applyCategoryLike(
            prev,
            message.playerId,
            message.categoryId,
            message.liked,
          ),
        );
        return;
      }

      if (message.type === "category-vote") {
        if (message.pin !== current.gamePin) return;
        if (!speaksFor(message.playerId)) return;
        setState((prev) =>
          applyCategoryVote(
            prev,
            message.playerId,
            message.pollId,
            message.categoryId,
          ),
        );
        return;
      }

      if (message.type === "player-leave") {
        if (message.pin !== current.gamePin) return;
        if (!speaksFor(message.playerId)) return;
        seatUids.current.delete(message.playerId);
        setState((prev) => ({
          ...prev,
          players: prev.players.filter((p) => p.id !== message.playerId),
        }));
      }
    });

    return unsubscribe;
  }, [recordAnswer]);

  /**
   * Keep this room's claim on its PIN fresh.
   *
   * It no longer hands the PIN back when the window goes away. That was the
   * whole bug: every way a host leaves a page — a reload, the back button, a
   * closed tab, a sleeping laptop — looks identical to being finished, and
   * treating them the same took the game down with the window. The room now
   * stays claimed and stops being refreshed, which reads as "no host is
   * answering" to a joining phone and as "still yours" to a host coming back
   * with the PIN and the password. `restartGame` is what actually ends it.
   */
  useEffect(() => {
    if (!state.isHost || !state.gamePin) return;

    const pin = state.gamePin;
    const name = state.gameName;
    const id = hostId.current;

    // `open` is read fresh on every beat rather than keyed into this effect,
    // so the room's advertised state follows the game without the heartbeat
    // being torn down and rebuilt at every phase change.
    const beat = async () => {
      const result = await registerRoom(
        pin,
        id,
        name,
        stateRef.current.phase === GamePhase.LOBBY,
      );

      // Refused means another device reclaimed this room with the host
      // password — which is a thing a host may legitimately do from a phone
      // when this window is the one that went wrong. This window is no longer
      // driving anything, and has to say so rather than carry on looking like
      // it is.
      if (result === "denied") {
        // And it stops writing the game down. Both copies are keyed to the
        // proof, so dropping it here is what keeps a window that is no longer
        // hosting from saving its own frozen version over the one the live
        // host is still advancing.
        hostProofRef.current = null;

        setState((prev) =>
          prev.roomWarning === DISPLACED_WARNING
            ? prev
            : { ...prev, roomWarning: DISPLACED_WARNING },
        );
      }
    };

    void beat();
    const keepAlive = setInterval(() => void beat(), 2000);

    return () => clearInterval(keepAlive);
  }, [state.isHost, state.gamePin, state.gameName]);



  const initHost = () => {
    setState((prev) => ({
      ...prev,
      isHost: true,
      phase: GamePhase.HOST_CONFIG,
    }));
  };

  const initJoin = () => {
    setState((prev) => ({ ...prev, isHost: false, phase: GamePhase.JOIN }));
  };

  /* ---------------------------------------------------------------- *
   * Taking a game back
   * ---------------------------------------------------------------- */

  const setHostPassword = (password: string) =>
    setState((prev) => ({ ...prev, hostPassword: password }));

  const initHostResume = () =>
    setState((prev) => ({
      ...prev,
      phase: GamePhase.HOST_RESUME,
      resuming: false,
      resumeError: null,
    }));

  const clearResumeError = () =>
    setState((prev) => ({ ...prev, resumeError: null }));

  /**
   * Seed the insight baselines from a game that was already under way.
   *
   * The durable record of likes, votes and rounds played is written by diffing
   * committed state against what has already been banked. A restored game
   * arrives with all of it in state and none of it in the baselines, so
   * without this a host walking back in would bank every like in the game a
   * second time and every round they had already played again.
   */
  const adoptInsightBaselines = (restored: PersistedHostState): void => {
    likeBaseline.current = new Map(
      restored.categoryLikes.map((tally) => [
        tally.category.id,
        new Set(tally.playerIds),
      ]),
    );

    ballotId.current = restored.categoryPoll?.id ?? null;
    voteBaseline.current = new Map(
      Object.entries(restored.categoryPoll?.votes ?? {}),
    );

    // A round is banked when it ends, so the round in progress is not one of
    // them — recording it here would be the one that never got counted.
    const banked =
      restored.phase === GamePhase.ROUND_END ||
      restored.phase === GamePhase.GAME_OVER
        ? restored.currentRound
        : restored.currentRound - 1;

    roundsRecorded.current = new Set(
      restored.roundsConfig
        .slice(0, Math.max(0, banked))
        .map(
          (round, index) =>
            `${restored.gamePin}:${index + 1}:${round.category.id}`,
        ),
    );
  };

  /**
   * Take a game back with its PIN and its host password.
   *
   * Two things have to come back, and they come from different places. The
   * *room* is reclaimed by proving the password to the database, which is what
   * makes this work from a device that has never seen this game. The *game* is
   * restored from whichever saved copy is newer: this machine's, or the one in
   * the room. Either alone is enough to host from.
   */
  const resumeHosting = async (pin: string, password: string): Promise<void> => {
    const code = pin.trim();
    const secret = password.trim();

    if (!/^\d{4}$/.test(code)) {
      setState((prev) => ({
        ...prev,
        resumeError: "Enter the game's four-digit PIN.",
      }));
      return;
    }

    if (!secret) {
      setState((prev) => ({
        ...prev,
        resumeError: "Enter the host password from when you opened the game.",
      }));
      return;
    }

    setState((prev) => ({ ...prev, resuming: true, resumeError: null }));

    const stop = (resumeError: string): void => {
      setState((prev) => ({ ...prev, resuming: false, resumeError }));
    };

    const proof = hostProof(code, secret);

    // This machine's own copy. Its proof is a full check of the password on
    // its own, which is what lets a host get their game back on screen even
    // with the database unreachable.
    const local = readHostSession(code);
    const localMatches = Boolean(local && local.proof === proof);

    const remoteConfigured = canReachOtherDevices();
    const connected = remoteConfigured ? await roomChannelReady() : false;
    const claim = connected ? await claimRoomAsHost(code, proof) : null;

    if (claim !== "ok" && !localMatches) {
      stop(
        claim === "denied"
          ? `That host password does not match the game on PIN ${code}. A game opened before the password existed cannot be taken back this way — the room has nothing to check against.`
          : claim === "missing"
            ? `No game is waiting on PIN ${code}. A game nobody comes back to is cleared after half an hour, and a game the host ended is gone for good.`
            : remoteConfigured
              ? "Could not reach the game server, and this browser is not holding that game either. Check this device's internet connection, or come back on the machine that was hosting."
              : local
                ? `That host password does not match the game this browser was hosting on PIN ${local.pin}.`
                : `This browser is not holding a game on PIN ${code}, and without multiplayer configured there is nowhere else to look. A game can only be taken back on the machine that was hosting it.`,
      );
      return;
    }

    let restored = localMatches ? (local?.state ?? null) : null;
    let resumedHostId = localMatches ? (local?.hostId ?? null) : null;
    let seats: [string, string][] = localMatches ? (local?.seats ?? []) : [];

    if (claim === "ok") {
      const held = await fetchHostState(code);
      const fromRoom = parseHostEnvelope(held?.payload);

      // The room's copy wins when it is the newer of the two: the host may
      // have carried on from another device after this machine last saved.
      if (fromRoom && held && (!restored || held.at > (local?.at ?? 0))) {
        restored = fromRoom.state;
        resumedHostId = held.hostId || resumedHostId;
        seats = fromRoom.seats;
      }
    }

    const game = restored;
    if (!game) {
      stop(
        `PIN ${code} is yours, but no saved copy of that game could be found — not on this machine and not in the room. There is nothing to carry on from.`,
      );
      return;
    }

    const attached = await attachRoomChannel(code, true);

    // Publish under the id this game was already published with, so a
    // projector window that is still open keeps following it instead of
    // waiting to be re-opened and re-latched.
    if (resumedHostId) hostId.current = resumedHostId;
    hostProofRef.current = proof;
    seatUids.current = new Map(seats);
    adoptInsightBaselines(game);

    // Nothing has been saved by *this* window yet, so the first state change
    // after the resume should write both copies rather than wait out an
    // interval it never started.
    savedLocallyAt.current = 0;
    savedRemotelyAt.current = 0;
    savedPhase.current = null;

    const roomWarning =
      !remoteConfigured || (attached && claim === "ok")
        ? null
        : "This game is back on this screen, but the room could not be reached — players' phones cannot reconnect until it is. Check this device's internet connection.";

    if (claim === "ok" && attached) {
      await registerRoom(
        code,
        hostId.current,
        game.gameName,
        game.phase === GamePhase.LOBBY,
      );
    }

    setState((prev) => ({
      ...applyHostState(prev, game, code),
      roomWarning,
    }));

    // Whichever bindings came back, they are a snapshot of a moment that has
    // passed: a player who joined after the last save is not in them, and a
    // phone that came back on a new identity is in them under the old one.
    // Asking the room to re-introduce itself settles all of it in one round
    // trip, and costs one message.
    postMessage({
      type: "host-reclaimed",
      pin: code,
      hostId: hostId.current,
    });
  };

  const generateGame = async (rounds: number, questions: number) => {
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      contentWarning: null,
      totalRounds: rounds,
      questionsPerRound: questions,
    }));

    try {
      // A properly shuffled draw of distinct categories, topped up with repeats
      // only if the host asked for more rounds than there are categories.
      const selectedCats = shuffle(CATEGORIES).slice(0, rounds);
      while (selectedCats.length < rounds) {
        selectedCats.push(
          CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
        );
      }

      // Generate every round concurrently. Sequential calls made a 5-round game
      // wait for 5 round-trips before the host saw anything.
      const results = await Promise.all(
        selectedCats.map((category) =>
          generateQuestions(category.name, questions),
        ),
      );

      // Shuffled on the way in: the model writes a set in the order it thought
      // of it, and a room that plays two games off the same generator should
      // not meet the same question in the same seat twice.
      //
      // Placeholders never make it this far into a game. A round whose
      // generation failed is nothing *but* placeholders, so it is dropped
      // whole rather than played as "Option A, Option B" in front of a room.
      const generated = results.map((result, i) => ({
        roundNumber: i + 1,
        category: selectedCats[i],
        questions: result.usedFallback ? [] : result.questions,
      }));
      const newRoundsConfig: RoundConfig[] = randomizeRounds(
        playableRounds(generated),
      );

      const failed = results.filter((r) => r.usedFallback);
      if (newRoundsConfig.length === 0) {
        throw new Error(
          failed[0]?.error ??
            "Every generated question was unplayable, so there is no game to start.",
        );
      }

      const dropped = generated.reduce(
        (total, round, i) =>
          total +
          (results[i].usedFallback
            ? 0
            : round.questions.length - playableQuestions(round.questions).length),
        0,
      );
      const contentWarning =
        [
          failed.length > 0
            ? `${failed.length} of ${results.length} round(s) could not be generated and were left out. ${failed[0].error}`
            : null,
          dropped > 0
            ? `${dropped} generated question(s) had placeholder answers or no options and were left out.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null;

      setState((prev) => ({
        ...prev,
        loading: false,
        roundsConfig: newRoundsConfig,
        // A round that failed is gone, so the game is the rounds that are left.
        totalRounds: newRoundsConfig.length,
        contentWarning,
        phase: GamePhase.REVIEW,
      }));
    } catch (error: any) {
      console.error("Error generating game:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: `Failed to generate game content: ${error?.message || "unknown error"}`,
      }));
    }
  };

  const initImport = (rounds: number, questions: number) => {
    setState((prev) => ({
      ...prev,
      isHost: true,
      error: null,
      // The sliders the host has just set are the shape of the game whichever
      // way the questions arrive, so they travel into the importer rather than
      // being discarded at its door.
      totalRounds: rounds,
      questionsPerRound: questions,
      importPreview: null,
      phase: GamePhase.IMPORT,
    }));
  };

  const goBackToConfig = () => {
    setState((prev) => ({
      ...prev,
      error: null,
      importPreview: null,
      phase: GamePhase.HOST_CONFIG,
    }));
  };

  const cancelImport = () => {
    setState((prev) => ({
      ...prev,
      error: null,
      importPreview: null,
      phase: GamePhase.IMPORT,
    }));
  };

  /**
   * The premade bank, loaded.
   *
   * The sliders travel with it for the same reason they travel into the file
   * importer: a bank of several hundred questions across thirty categories is
   * a library, and a host who asked for three rounds of five meant three
   * rounds of five.
   *
   * A failure lands on the importer rather than nowhere. The bank lives on
   * somebody else's Google Sheet, so a venue's Wi-Fi is enough to take it
   * away, and the answer to that is the file picker, not a dead end.
   */
  const loadQuestionBank = async (rounds: number, questions: number) => {
    setState((prev) => ({
      ...prev,
      isHost: true,
      error: null,
      totalRounds: rounds,
      questionsPerRound: questions,
      importPreview: null,
    }));

    try {
      const csvData = await fetchDefaultQuestionBank();
      importGame(csvData);
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Could not load the question bank.",
        phase: GamePhase.IMPORT,
      }));
    }
  };

  /**
   * Read a file and show the host what is in it.
   *
   * This deliberately stops short of building a game. A question file is
   * usually a library — twenty categories, fifty questions each — and turning
   * all of it into rounds is how a three-round night became however many
   * categories the spreadsheet happened to contain. What it produces is the
   * menu; `applyImportSelection` orders from it.
   */
  const importGame = (csvData: string) => {
    try {
      const { contents: parsed, skipped } = parseImportDataWithReport(csvData);
      const categoryContents: CategoryContent[] = Object.values(parsed).filter(
        (content) => content.questions.length > 0,
      );

      if (categoryContents.length === 0) {
        throw new Error("No valid questions could be parsed from the data.");
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        error: null,
        // Carried through to the review screen, so the host knows how much of
        // the file was eliminated as unplayable.
        contentWarning: describeSkipped(skipped),
        importPreview: categoryContents,
        phase: GamePhase.IMPORT_SELECT,
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Failed to import questions.",
      }));
    }
  };

  /**
   * Go back and re-cut the file.
   *
   * The whole parsed import is still held, so a host who gets to the review
   * screen and decides they want different categories does not have to find
   * the file again — which, mid-setup with a room filling up, is the
   * difference between changing your mind and living with it.
   */
  const reopenImportSelection = () => {
    setState((prev) =>
      prev.importPreview && prev.importPreview.length > 0
        ? { ...prev, error: null, phase: GamePhase.IMPORT_SELECT }
        : prev,
    );
  };

  const applyImportSelection = ({
    categoryIds,
    rounds,
    questionsPerRound,
  }: {
    categoryIds: string[];
    rounds: number;
    questionsPerRound: number;
  }) => {
    setState((prev) => {
      const contents = prev.importPreview ?? [];
      const roundsConfig = buildRoundsFromContent(contents, {
        categoryIds,
        maxCategories: rounds,
        maxQuestions: questionsPerRound,
      });

      if (roundsConfig.length === 0) {
        return {
          ...prev,
          error: "Keep at least one category with at least one question.",
        };
      }

      // A category can be short of the ceiling the host set, so what the lobby
      // advertises is the longest round rather than the number they asked for.
      return {
        ...prev,
        error: null,
        roundsConfig,
        totalRounds: roundsConfig.length,
        questionsPerRound: longestRound(roundsConfig),
        importPreview: contents,
        phase: GamePhase.REVIEW,
      };
    });
  };

  const confirmGame = async () => {
    // A PIN nobody else is hosting — in this browser or, once Firebase is
    // configured, in any room live anywhere. Two rooms answering to the same
    // code is what made joining land in a phantom lobby.
    const pin = await allocatePin();

    // Start carrying the room before the lobby renders its QR code, so a
    // phone that scans it immediately finds a host already listening.
    //
    // This never throws and never hangs for long: a build configured for
    // multiplayer that cannot reach Firebase — sign-in disabled in the
    // console, a venue's Wi-Fi captive portal — still opens the room locally,
    // because the alternative is a host stuck on the review screen with a
    // dead button and a room waiting on them.
    const attached = await attachRoomChannel(pin, true);
    const roomWarning = !canReachOtherDevices() || attached
      ? null
      : roomFailureReason() === "denied"
        ? "The room database is refusing every device, so phones cannot join this game. Its security rules have never been published — run `npm run rules:deploy` (see MULTIPLAYER.md). The host screen and the broadcast display still work."
        : "Could not reach the multiplayer server, so phones cannot join this game. The host screen and the broadcast display still work.";

    // Claim the PIN now rather than on the first heartbeat: until the room is
    // registered another host could allocate the same code, and a snapshot
    // published into an unclaimed room is a room with no owner.
    const gameName = stateRef.current.gameName.trim() || DEFAULT_GAME_NAME;
    await registerRoom(pin, hostId.current, gameName, true);

    // What it will take to get this game back. The room only accepts a secret
    // from the room's own host, which is why this waits on the claim above
    // rather than racing it.
    const password = stateRef.current.hostPassword.trim() || suggestHostPassword();
    hostProofRef.current = hostProof(pin, password);
    void publishHostSecret(pin, hostProofRef.current);

    setState((prev) => {
      // The host is always seated as a player so they can run the whole game
      // against themselves before a room is in front of them.
      const hostPlayer: Player = {
        id: `host-${Date.now()}`,
        name: "Host",
        avatar: AVATARS[0],
        avatarColor: AVATAR_COLORS[0],
        score: 0,
        roundScore: 0,
        isBot: false,
        isHost: true,
        streak: 0,
      };

      const alreadySeated = prev.players.some((p) => p.isHost);

      return {
        ...prev,
        gamePin: pin,
        gameName,
        hostPassword: password,
        roomWarning,
        players: alreadySeated ? prev.players : [...prev.players, hostPlayer],
        currentPlayerId: alreadySeated ? prev.currentPlayerId : hostPlayer.id,
        phase: GamePhase.LOBBY,
      };
    });
  };

  const setGameName = (name: string) => {
    setState((prev) => {
      if (prev.gamePin) {
        registerRoom(
          prev.gamePin,
          hostId.current,
          name,
          prev.phase === GamePhase.LOBBY,
        );
      }
      return { ...prev, gameName: name };
    });
  };

  /**
   * Take the host in or out of the answer count.
   *
   * Mid-round this has to reach the lanes as well: a matchup that was waiting
   * on the host has to stop waiting, and a lane with nobody left in it is
   * retired rather than holding the room's screen up for the rest of the
   * round. It takes effect from the next round if the host toggles back.
   */
  const toggleHostAnswering = () =>
    setState((prev) => {
      const next = syncLaneRosters({
        ...prev,
        hostAnsweringEnabled: !prev.hostAnsweringEnabled,
      });
      return roundIsComplete(next) ? finishRound(next) : next;
    });

  const updateConfig = (rounds: number, questions: number) => {
    setState((prev) => ({
      ...prev,
      totalRounds: rounds,
      questionsPerRound: questions,
    }));
  };

  /**
   * Ask whoever hosts `pin` for a seat.
   *
   * `playerId` is set when this device already held one, so a phone coming
   * back from a lock screen rejoins as itself rather than as a stranger with
   * no score. `silent` keeps such an attempt off the join screen: if the room
   * has moved on, the player should get the ordinary join form, not an error
   * about a game nobody told them they had left.
   */
  const attemptJoin = async (params: {
    name: string;
    avatar: string;
    avatarColor?: string;
    avatarAccessory?: string;
    pin: string;
    /** The rejoin code this player chose, four digits, typed on the join form. */
    rejoinCode?: string;
    playerId?: string;
    silent?: boolean;
  }): Promise<void> => {
    const code = params.pin.trim();
    if (!code) {
      setState((prev) => ({ ...prev, joinError: "Enter the game's PIN." }));
      return;
    }

    const rejoinCode = params.rejoinCode?.trim() ?? "";
    if (rejoinCode && rejoinCode.length !== PLAYER_CODE_LENGTH) {
      setState((prev) => ({
        ...prev,
        joinError: `A rejoin code is ${PLAYER_CODE_LENGTH} digits.`,
      }));
      return;
    }

    // Hashed on this device, so the code itself never goes anywhere. It is
    // both halves of the handshake at once: what the host files against a new
    // seat, and what unlocks that seat later.
    const rejoinProof = rejoinCode ? playerProof(code, rejoinCode) : undefined;

    const clientId = `client-${Math.random().toString(36).slice(2)}`;
    const playerId =
      params.playerId ??
      `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nonce = `q-${Math.random().toString(36).slice(2)}`;

    setState((prev) => ({ ...prev, joining: !params.silent, joinError: null }));

    // The question has to go out on the same channel the host is listening
    // to, so this room is carried before anything is asked of it.
    // A player gets the long wait: see PLAYER_ATTACH_TIMEOUT_MS.
    const attached = await attachRoomChannel(
      code,
      false,
      PLAYER_ATTACH_TIMEOUT_MS,
    );

    const remote = canReachOtherDevices();

    // A silent rejoin can lose a race with the player simply joining by hand
    // while it was waiting. When that happens it must not tidy up after the
    // winner: the seat it would clear and the channel it would detach now
    // belong to a player who is already in the game.
    const overtaken = () => Boolean(params.silent && stateRef.current.clientPin);

    const giveUp = (joinError: string | null, keepConnecting = false) => {
      if (overtaken()) return;
      // A connection that is merely slow is left to finish, so tapping JOIN
      // again picks it up where it is instead of starting over from nothing.
      if (!keepConnecting) void detachRoomChannel();
      setState((prev) => ({ ...prev, joining: false, joinError }));
    };

    // A phone with no working connection and a PIN nobody is hosting fail the
    // same way from the inside, and they are not the same problem.
    if (remote && (!attached || !(await roomChannelReady()))) {
      const denied = roomFailureReason() === "denied";
      giveUp(
        params.silent
          ? null
          : denied
            ? "The game server is refusing every device, because this game's database rules have not been published yet. Nothing is wrong with this phone or the PIN — the host has to publish them."
            : "Could not reach the game server yet — the connection here is slow or down. Tap JOIN again: it carries on from where it got to.",
        !denied && !params.silent,
      );
      return;
    }

    let settled = false;
    let seatTimerArmed = false;
    const finish = (update: Partial<GameState>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe();
      setState((prev) => ({ ...prev, joining: false, ...update }));
    };

    const unsubscribe = subscribeToMessages((message) => {
      // The host that owns this PIN answers the query; anyone else stays quiet.
      if (message.type === "room-offer" && message.nonce === nonce) {
        // A returning player is admitted whatever the phase, so a closed lobby
        // is only a dead end for someone who never had a seat — and someone
        // holding a rejoin code may well have one, which only the host can
        // say. Their request goes through rather than being turned back here.
        if (!message.open && !params.playerId && !rejoinProof) {
          finish({
            joinError: `"${message.gameName}" has already started. Ask the host to open a new game.`,
          });
          return;
        }
        // The room exists and its host is listening. From here a slow answer
        // is a slow link, and gets the longer wait with a message that says so.
        if (remote && !seatTimerArmed) {
          seatTimerArmed = true;
          window.clearTimeout(timeout);
          timeout = window.setTimeout(() => {
            if (overtaken()) return;
            finish({
              joinError: params.silent
                ? null
                : `Found "${message.gameName}", but the host's answer is taking too long over this connection. Tap JOIN again.`,
            });
          }, REMOTE_SEAT_TIMEOUT_MS);
        }
        postMessage({
          type: "player-join",
          pin: code,
          clientId,
          playerId,
          name: params.name,
          avatar: params.avatar,
          avatarColor: params.avatarColor,
          avatarAccessory: params.avatarAccessory,
          rejoinProof,
        });
        return;
      }

      if (message.type === "player-join-result" && message.clientId === clientId) {
        if (!message.accepted) {
          if (overtaken()) return;
          // Whatever seat this device thought it held is not a seat any more.
          clearSeat();
          finish({
            joinError: params.silent
              ? null
              : (message.reason ?? "The host turned the join down."),
          });
          return;
        }

        // The host decides which seat this is. A player who came back with
        // their code is put into the one they already had — with their score
        // and their place in the bracket — so the id to play under is the
        // host's answer, not the one this device generated on the way in.
        const seatId = message.playerId ?? playerId;

        // Remembered so a reload lands back in this seat rather than opening
        // a second one beside it.
        void deviceIdentity().then((uid) =>
          saveSeat({
            pin: message.pin,
            playerId: seatId,
            name: params.name,
            avatar: params.avatar,
            avatarColor: params.avatarColor,
            avatarAccessory: params.avatarAccessory,
            uid: uid ?? undefined,
            proof: rejoinProof,
            code: rejoinCode || undefined,
          }),
        );
        // And named in the address, so that reload comes back through the
        // seat rather than the start screen.
        pinSeatToUrl(message.pin);

        finish({
          clientPin: message.pin,
          clientPlayerId: seatId,
          currentPlayerId: seatId,
          gamePin: message.pin,
          gameName: message.gameName,
          isHost: false,
          phase: GamePhase.LOBBY,
        });
      }
    });

    // Nobody hosting this PIN means there is no room to join. Saying so beats
    // opening an empty one that looks like the host's game but is not.
    let timeout = window.setTimeout(
      () => {
        if (overtaken()) return;
        // Over the network, silence is as likely a slow link as a closed room,
        // and throwing the seat away would leave the join form empty for a
        // player whose seat is still there. Kept, it comes back filled in.
        if (params.silent && !remote) clearSeat();
        finish({
          joinError: params.silent
            ? null
            : remote
              ? `No game is running with PIN ${code}. Check the code on the big screen.`
              : `No game is running with PIN ${code}. Check the code on the big screen — and note that joining only works in the same browser on the host's machine until this build has a server.`,
        });
        if (params.silent) void detachRoomChannel();
      },
      remote ? REMOTE_JOIN_TIMEOUT_MS : JOIN_TIMEOUT_MS,
    );

    postMessage({ type: "room-query", pin: code, nonce });
  };

  const joinGame = (
    name: string,
    avatar: string,
    avatarColor?: string,
    avatarAccessory?: string,
    pin?: string,
    rejoinCode?: string,
  ) => {
    void attemptJoin({
      name,
      avatar,
      avatarColor,
      avatarAccessory,
      pin: pin ?? "",
      rejoinCode,
    });
  };

  /**
   * Get the connection going while the player is still filling in the join
   * form, so the JOIN tap finds it already open rather than paying for the SDK
   * download, the sign-in and the connection all at once.
   */
  useEffect(() => {
    if (state.phase === GamePhase.JOIN && !state.isHost) warmUpRoomChannel();
  }, [state.phase, state.isHost]);

  /**
   * A device that already holds a seat in the room its link names takes that
   * seat back on load. This is what a phone does after its screen locks and
   * the browser reloads the page underneath it.
   */
  useEffect(() => {
    const pin = stateRef.current.initialPin;
    if (!pin) return;

    void (async () => {
      // The seat has to match the identity this browser signs in as now: the
      // host binds seats to devices, so one claimed under an identity that has
      // since been cleared would be refused rather than restored.
      const seat = readSeat(pin, await deviceIdentity());
      if (!seat) return;

      await attemptJoin({
        name: seat.name,
        avatar: seat.avatar,
        avatarColor: seat.avatarColor,
        avatarAccessory: seat.avatarAccessory,
        pin,
        // Sent even here: a browser that has been cleared signs in as somebody
        // new, and the code is then the only thing that still says this seat
        // is theirs.
        rejoinCode: seat.code,
        playerId: seat.playerId,
        silent: true,
      });
    })();
    // Mount only: rejoining is something that happens as the page comes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Answer a host that has just taken this room back.
   *
   * A player tab keeps playing straight through a host swap — it renders
   * whatever snapshot arrives under its PIN — but the *host* has to be told
   * again which device holds this seat, or every answer this phone sends will
   * be dropped as coming from somebody who cannot prove the seat is theirs.
   * The ordinary join request is what says so, and the host treats it as the
   * returning player it is.
   */
  useEffect(() => {
    const pin = state.clientPin;
    const playerId = state.clientPlayerId;
    if (!pin || !playerId) return;

    return subscribeToMessages((message) => {
      if (message.type !== "host-reclaimed" || message.pin !== pin) return;

      const seat = readSeat(pin);
      postMessage({
        type: "player-join",
        pin,
        // Nobody is waiting on the result: this is a re-introduction, not a
        // join, and the tab is already in the game.
        clientId: `rebind-${Math.random().toString(36).slice(2)}`,
        playerId,
        // Empty is safe — the host keeps what it already has for a player it
        // recognises — and is what a phone with no storage has to offer.
        name: seat?.name ?? "",
        avatar: seat?.avatar ?? "",
        avatarColor: seat?.avatarColor,
        avatarAccessory: seat?.avatarAccessory,
        rejoinProof: seat?.proof,
      });
    });
  }, [state.clientPin, state.clientPlayerId]);

  const clearJoinError = () =>
    setState((prev) => ({ ...prev, joinError: null }));

  /**
   * The host already has a seat from the moment the lobby opens, so this
   * renames it rather than handing them a second one.
   */
  const hostJoinAsPlayer = (name: string, avatar: string) => {
    setState((prev) => {
      const existing = prev.players.find((p) => p.isHost);
      if (existing) {
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.isHost
              ? { ...p, name: name || p.name, avatar: avatar || p.avatar }
              : p,
          ),
          currentPlayerId: prev.currentPlayerId ?? existing.id,
        };
      }

      const hostPlayer: Player = {
        id: `host-${Date.now()}`,
        name: name || "Host",
        avatar: avatar || AVATARS[0],
        avatarColor: AVATAR_COLORS[0],
        score: 0,
        roundScore: 0,
        isBot: false,
        isHost: true,
        streak: 0,
      };

      return {
        ...prev,
        players: [...prev.players, hostPlayer],
        currentPlayerId: hostPlayer.id,
      };
    });
  };

  const addBot = () => {
    setState((prev) => {
      const currentBotCount = prev.players.filter((p) => p.isBot).length;
      if (currentBotCount >= BOT_NAMES.length) return prev;

      const botIndex = currentBotCount % BOT_NAMES.length;
      const newBot: Player = {
        id: `bot-${Date.now()}-${Math.random()}`,
        name: BOT_NAMES[botIndex],
        avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
        score: 0,
        roundScore: 0,
        isBot: true,
        streak: 0,
      };

      return {
        ...prev,
        players: [...prev.players, newBot],
      };
    });
  };

  const startGame = () => {
    setState((prev) => {
      if (!prev.roundsConfig[0]) return prev;

      const players = prev.players.map((p) => ({
        ...p,
        roundScore: 0,
        eliminated: false,
        lastAnswerCorrect: undefined,
      }));

      return {
        ...prev,
        players,
        currentRound: 1,
        // The draw for round one is made before a single question is asked, so
        // the broadcast can show the room who they are up against. One player
        // on their own is not a tournament: they play the rounds as configured
        // and nobody is eliminated.
        bracket: players.length >= 2 ? [buildFirstRound(players)] : [],
        championId: null,
        categoryPoll: null,
        lanes: [],
        broadcastQuestionIndex: 0,
        broadcastRevealing: false,
        broadcastRevealSecondsLeft: REVEAL_DURATION,
        wheelSpinning: false,
        categoryRevealed: false,
        phase: GamePhase.CATEGORY_SELECT,
      };
    });
  };

  /** The host started the wheel; the broadcast switches to a suspense screen. */
  const beginWheelSpin = () => {
    setState((prev) => ({
      ...prev,
      wheelSpinning: true,
      categoryRevealed: false,
    }));
  };

  /**
   * The wheel has landed, and *this* is where the round's category is decided.
   *
   * The wheel draws the categories still to be played — `roundsConfig` from
   * this round's slot onwards — so `landedIndex` is a position in that
   * remainder. Committing it is a swap: the landed category is moved into this
   * round's slot, and the one that was sitting there goes back into the
   * remainder to be spun for again later.
   *
   * Everything downstream already reads the round's category and questions out
   * of `roundsConfig[currentRound - 1]`, so moving it here is what makes the
   * pointer the thing that chooses. It used to be the other way round: the
   * category was fixed when the game was generated and the spin was animated
   * to agree with it.
   */
  const revealCategory = (landedIndex: number, categoryId?: string) => {
    setState((prev) => {
      const from = Math.max(0, prev.currentRound - 1);
      const remaining = prev.roundsConfig.length - from;
      if (remaining <= 0) {
        return { ...prev, wheelSpinning: false, categoryRevealed: true };
      }

      // A respin lands on a wheel drawn in the order the remainder had before
      // the first landing swapped it, so the index can point at the wrong
      // round by now. The id cannot.
      const byId = categoryId
        ? prev.roundsConfig.findIndex(
            (round, index) => index >= from && round.category.id === categoryId,
          )
        : -1;
      const picked =
        byId >= 0 ? byId : from + Math.min(Math.max(landedIndex, 0), remaining - 1);
      const roundsConfig = [...prev.roundsConfig];
      [roundsConfig[from], roundsConfig[picked]] = [
        roundsConfig[picked],
        roundsConfig[from],
      ];

      return {
        ...prev,
        // Renumbered so a round's label keeps matching the round it is, which
        // is also what every edit on the review screen names it by.
        roundsConfig: renumberRounds(roundsConfig),
        selectedCategory: roundsConfig[from].category.id,
        wheelSpinning: false,
        categoryRevealed: true,
      };
    });
  };

  /**
   * Start the round on the category the wheel landed on.
   *
   * This is the last moment the field is together: it deals a lane to every
   * matchup and then stops coordinating them. From here each pairing is on its
   * own clock, and the only thing they share is the list of questions.
   */
  const startRound = () => {
    setState((prev) => {
      const roundConfig = prev.roundsConfig[prev.currentRound - 1];
      if (!roundConfig) {
        console.error("No config for round", prev.currentRound);
        return prev;
      }

      const started: GameState = {
        ...prev,
        loading: false,
        // The last line of defence: a game resumed from a save written before
        // placeholders were filtered out still never deals one.
        questionsQueue: playableQuestions(roundConfig.questions),
        selectedCategory: roundConfig.category.id,
        wheelSpinning: false,
        categoryRevealed: true,
        phase: GamePhase.PLAYING,
        broadcastQuestionIndex: 0,
        broadcastRevealing: false,
        broadcastRevealSecondsLeft: REVEAL_DURATION,
      };

      return { ...started, lanes: buildRoundLanes(started) };
    });
  };

  const submitAnswer = (answer: Answer) => {
    const current = stateRef.current;
    const playerId = current.currentPlayerId;
    if (!playerId) return;

    // A guest tab holds no game state — the host owns the scoring, so the
    // answer goes to them and comes back in the next snapshot.
    if (current.clientPin) {
      postMessage({
        type: "player-answer",
        pin: current.clientPin,
        playerId,
        answer,
      });
      return;
    }

    recordAnswer(playerId, answer);
  };

  /**
   * Take the next question now.
   *
   * The reveal countdown is a ceiling, not a wait: a player who has read the
   * answer gets on with it, and every second they save is a second of time
   * bonus on the question after this one.
   */
  const advanceMyQuestion = () => {
    const current = stateRef.current;
    const playerId = current.currentPlayerId;
    if (!playerId) return;

    if (current.clientPin) {
      postMessage({ type: "player-advance", pin: current.clientPin, playerId });
      return;
    }

    setState((prev) => {
      const next = advancePlayerNow(prev, playerId);
      return roundIsComplete(next) ? finishRound(next) : next;
    });
  };

  const setCategoryLike = (categoryId: string, liked: boolean) => {
    const current = stateRef.current;
    const playerId = current.currentPlayerId;
    if (!playerId) return;

    if (current.clientPin) {
      postMessage({
        type: "category-like",
        pin: current.clientPin,
        playerId,
        categoryId,
        liked,
      });
      return;
    }

    setState((prev) => applyCategoryLike(prev, playerId, categoryId, liked));
  };

  const voteForCategory = (pollId: string, categoryId: string) => {
    const current = stateRef.current;
    const playerId = current.currentPlayerId;
    if (!playerId) return;

    if (current.clientPin) {
      postMessage({
        type: "category-vote",
        pin: current.clientPin,
        playerId,
        pollId,
        categoryId,
      });
      return;
    }

    setState((prev) => applyCategoryVote(prev, playerId, pollId, categoryId));
  };

  /**
   * Put a different set of options up.
   *
   * The votes already cast are cleared from the ballot, because they were cast
   * on options that are no longer there. They stay in the host's data — they
   * were real answers to a real question.
   */
  const redrawCategoryPoll = () =>
    setState((prev) =>
      prev.categoryPoll
        ? {
            ...prev,
            categoryPoll:
              buildCategoryPoll(prev, prev.categoryPoll.roundNumber) ??
              prev.categoryPoll,
          }
        : prev,
    );

  /* ---------------------------------------------------------------- *
   * Host controls
   *
   * Each one names the table it acts on, and reaches every seat at it. A host
   * stepping in for one table must not stop the three beside it, which is
   * exactly what a single global clock control used to do.
   * ---------------------------------------------------------------- */

  /** Stop a table's clocks and put each player's answer in front of them. */
  const revealLaneNow = (laneId: string) =>
    setState((prev) => {
      const next = closeLaneQuestion(prev, laneId, "host");
      return roundIsComplete(next) ? finishRound(next) : next;
    });

  const revealAllLanesNow = () =>
    setState((prev) => {
      const next = prev.lanes.reduce(
        (state, lane) => closeLaneQuestion(state, lane.id, "host"),
        prev,
      );
      return roundIsComplete(next) ? finishRound(next) : next;
    });

  const toggleLanePaused = (laneId: string) =>
    setState((prev) => {
      const lane = prev.lanes.find((candidate) => candidate.id === laneId);
      if (!lane) return prev;
      // One button for the table, so it follows whether anything at it is
      // still running rather than each seat's own flag.
      const running = lane.seats.some(
        (seat) => seat.status === LaneStatus.ANSWERING && !seat.timerPaused,
      );
      return setLanePaused(prev, laneId, running);
    });

  const setAllLanesPaused = (paused: boolean) =>
    setState((prev) =>
      prev.lanes.reduce(
        (state, lane) => setLanePaused(state, lane.id, paused),
        prev,
      ),
    );

  const addLaneTime = (laneId: string, seconds: number) =>
    setState((prev) =>
      prev.phase === GamePhase.PLAYING
        ? addLaneSeconds(prev, laneId, seconds)
        : prev,
    );

  const addTimeToAllLanes = (seconds: number) =>
    setState((prev) =>
      prev.phase === GamePhase.PLAYING
        ? prev.lanes.reduce(
            (state, lane) => addLaneSeconds(state, lane.id, seconds),
            prev,
          )
        : prev,
    );

  /** Move the room's screen off the answer it is holding. */
  const advanceBroadcastNow = () =>
    setState((prev) => {
      if (prev.phase !== GamePhase.PLAYING || !prev.broadcastRevealing) {
        return prev;
      }
      const next = advanceBroadcast({ ...prev, broadcastRevealSecondsLeft: 0 });
      return roundIsComplete(next) ? finishRound(next) : next;
    });

  /**
   * End the round now, on the scores as they stand.
   *
   * Two things bring a host here. The field is through and only the projector
   * is still catching up, and cutting to the results costs nothing. Or a match
   * is still running and the night has to move anyway — a table that has gone
   * quiet, a player who has walked off, a room that is being asked to leave.
   *
   * Both are the same transition, because a round is *already* scored
   * continuously: every answer banks its points the moment it is given. So
   * whatever is on the scoreboard right now is what the matchups are settled
   * on, and stopping early takes nothing away from anyone except the questions
   * they had not reached.
   */
  const endRoundNow = () =>
    setState((prev) =>
      prev.phase === GamePhase.PLAYING
        ? finishRound(stopRoundInPlace(prev))
        : prev,
    );

  const toggleAutoAdvance = () =>
    setState((prev) => ({ ...prev, autoAdvance: !prev.autoAdvance }));

  const openBroadcast = () => {
    openBroadcastWindow();
  };

  const nextRound = () => {
    setState((prev) => {
      const gameIsOver =
        prev.championId !== null || prev.currentRound >= prev.totalRounds;

      if (gameIsOver) {
        // Rounds can run out before the bracket resolves; the highest score
        // among the players still standing takes it. A tie there falls to the
        // draw, the same as a matchup does — not to whoever joined first,
        // which is what sorting the lobby array alone would have used.
        const standing = prev.players.filter((p) => !p.eliminated);
        const pool = standing.length > 0 ? standing : prev.players;
        const draw = new Map(
          (prev.bracket[0]
            ? activePlayerIds(prev.bracket[0])
            : prev.players.map((p) => p.id)
          ).map((id, index) => [id, index]),
        );
        const seed = (id: string) => draw.get(id) ?? Number.MAX_SAFE_INTEGER;
        const leader = [...pool].sort(
          (a, b) => b.score - a.score || seed(a.id) - seed(b.id),
        )[0];

        return {
          ...prev,
          championId: prev.championId ?? leader?.id ?? null,
          phase: GamePhase.GAME_OVER,
        };
      }

      return {
        ...prev,
        currentRound: prev.currentRound + 1,
        phase: GamePhase.CATEGORY_SELECT,
        // The ballot belongs to the round that ran it. Its votes are already
        // banked in the host's data; the next round draws its own options.
        categoryPoll: null,
        questionsQueue: [],
        // Lanes belong to the round that dealt them; the next one draws its own.
        lanes: [],
        broadcastQuestionIndex: 0,
        broadcastRevealing: false,
        broadcastRevealSecondsLeft: REVEAL_DURATION,
        selectedCategory: null,
        wheelSpinning: false,
        categoryRevealed: false,
        // Each round is scored on its own, so every matchup starts level.
        players: prev.players.map((p) => ({
          ...p,
          roundScore: 0,
          lastAnswerCorrect: undefined,
        })),
      };
    });
  };

  const restartGame = () => {
    const wasHosting = stateRef.current.isHost;

    clearSeat();
    // A player who left is done with that room; a reload should not walk
    // them back to its join form.
    if (!wasHosting) pinSeatToUrl(null);

    // Only the host tears the game down, and the check matters more than it
    // looks: a guest tab and the host window share this browser's storage, so
    // a player leaving used to reach for the host's own room, published
    // snapshot and — now that there is one — their saved game.
    if (wasHosting) {
      clearStoredSnapshot();
      // Ending a game is the one thing that closes the door behind it: the
      // room goes and so does the saved copy of it. A game nobody is playing
      // should not still be reclaimable, and tonight's answers should not
      // still be sitting on this machine or in the database.
      clearHostSession();
      hostProofRef.current = null;
      releaseRoom(hostId.current, stateRef.current.gamePin);
    }

    seatUids.current.clear();
    resetInsightBaselines();
    void detachRoomChannel();
    setState((prev) => ({
      ...prev,
      phase: GamePhase.START,
      currentRound: 0,
      questionsQueue: [],
      usedCategories: [],
      selectedCategory: null,
      players: [],
      isHost: false,
      gamePin: null,
      gameName: "",
      clientPin: null,
      clientPlayerId: null,
      joining: false,
      joinError: null,
      resuming: false,
      resumeError: null,
      // A fresh suggestion for the next game rather than the last game's.
      hostPassword: suggestHostPassword(),
      currentPlayerId: null,
      roomWarning: null,
      roundsConfig: [],
      importPreview: null,
      bracket: [],
      championId: null,
      lanes: [],
      broadcastQuestionIndex: 0,
      broadcastRevealing: false,
      broadcastRevealSecondsLeft: REVEAL_DURATION,
      wheelSpinning: false,
      categoryRevealed: false,
      categoryLikes: [],
      categoryPoll: null,
      loading: false,
      error: null,
      contentWarning: null,
    }));
  };

  // Replay the same questions with fresh scores, so "play again" does not force
  // the host to burn another round of generation in front of a waiting room.
  const playAgain = () => {
    resetInsightBaselines();
    setState((prev) => ({
      ...prev,
      phase: GamePhase.LOBBY,
      currentRound: 0,
      questionsQueue: [],
      usedCategories: [],
      selectedCategory: null,
      bracket: [],
      championId: null,
      lanes: [],
      broadcastQuestionIndex: 0,
      broadcastRevealing: false,
      broadcastRevealSecondsLeft: REVEAL_DURATION,
      wheelSpinning: false,
      categoryRevealed: false,
      // A replay collects its own likes rather than inheriting the last
      // game's, which are already banked.
      categoryLikes: [],
      categoryPoll: null,
      players: prev.players.map((p) => ({
        ...p,
        score: 0,
        roundScore: 0,
        streak: 0,
        eliminated: false,
        lastAnswerCorrect: undefined,
      })),
    }));
  };

  /**
   * Rewrite one question in place.
   *
   * Rounds are named by their number rather than by their category, here and
   * in the two functions below. A game with more rounds than categories plays
   * one twice, and an id lookup would have edited whichever copy came first
   * however many times the host clicked — on a round they were not looking at.
   */
  const regenerateQuestion = async (
    roundNumber: number,
    questionIndex: number,
  ): Promise<boolean> => {
    const roundIndex = stateRef.current.roundsConfig.findIndex(
      (rc) => rc.roundNumber === roundNumber,
    );
    if (roundIndex === -1) return false;

    const roundConfig = stateRef.current.roundsConfig[roundIndex];
    if (!roundConfig.questions[questionIndex]) return false;

    try {
      const result = await generateQuestions(roundConfig.category.name, 1);
      // A placeholder is not a replacement. Leaving the original in place and
      // saying so beats swapping a real question for "generation failed".
      if (result.usedFallback || result.questions.length === 0) return false;

      setState((prev) => {
        const target = prev.roundsConfig.findIndex(
          (rc) => rc.roundNumber === roundNumber,
        );
        if (target === -1) return prev;

        const questions = [...prev.roundsConfig[target].questions];
        if (!questions[questionIndex]) return prev;
        questions[questionIndex] = result.questions[0];

        const roundsConfig = [...prev.roundsConfig];
        roundsConfig[target] = { ...roundsConfig[target], questions };
        return { ...prev, roundsConfig };
      });
      return true;
    } catch (error) {
      console.error("Error regenerating question:", error);
      return false;
    }
  };

  /**
   * Drop one question from a round.
   *
   * Rounds are allowed to end up different lengths — the round a match plays
   * is whatever `questionsQueue` holds, not a fixed count — so this needs no
   * backfill. The last question in a round is kept: an empty round is a spin
   * of the wheel onto nothing, and the way to get rid of it is `removeRound`.
   */
  const removeQuestion = (roundNumber: number, questionIndex: number) => {
    setState((prev) => {
      const target = prev.roundsConfig.findIndex(
        (rc) => rc.roundNumber === roundNumber,
      );
      if (target === -1) return prev;

      const round = prev.roundsConfig[target];
      if (round.questions.length <= 1) return prev;
      if (!round.questions[questionIndex]) return prev;

      const roundsConfig = [...prev.roundsConfig];
      roundsConfig[target] = {
        ...round,
        questions: round.questions.filter((_, i) => i !== questionIndex),
      };

      return {
        ...prev,
        roundsConfig,
        questionsPerRound: longestRound(roundsConfig),
      };
    });
  };

  /** Drop a whole round: its category leaves the wheel with it. */
  const removeRound = (roundNumber: number) => {
    setState((prev) => {
      // The last round standing is kept for the same reason the last question
      // in a round is: a game with nothing in it cannot be opened, and the
      // host is one click from RESTART if that is what they meant.
      if (prev.roundsConfig.length <= 1) return prev;

      const roundsConfig = renumberRounds(
        prev.roundsConfig.filter((rc) => rc.roundNumber !== roundNumber),
      );
      if (roundsConfig.length === prev.roundsConfig.length) return prev;

      return {
        ...prev,
        roundsConfig,
        totalRounds: roundsConfig.length,
        questionsPerRound: longestRound(roundsConfig),
      };
    });
  };

  return (
    <GameContext.Provider
      value={{
        ...state,
        broadcastConnected,
        initHost,
        initJoin,
        generateGame,
        confirmGame,
        setGameName,
        setHostPassword,
        initHostResume,
        resumeHosting,
        clearResumeError,
        toggleHostAnswering,
        clearJoinError,
        updateConfig,
        initImport,
        loadQuestionBank,
        importGame,
        applyImportSelection,
        cancelImport,
        reopenImportSelection,
        goBackToConfig,
        joinGame,
        hostJoinAsPlayer,
        addBot,
        startGame,
        startRound,
        beginWheelSpin,
        revealCategory,
        submitAnswer,
        advanceMyQuestion,
        setCategoryLike,
        voteForCategory,
        redrawCategoryPoll,
        nextRound,
        restartGame,
        playAgain,
        regenerateQuestion,
        removeQuestion,
        removeRound,
        revealLaneNow,
        toggleLanePaused,
        addLaneTime,
        revealAllLanesNow,
        setAllLanesPaused,
        addTimeToAllLanes,
        advanceBroadcastNow,
        endRoundNow,
        toggleAutoAdvance,
        openBroadcast,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used within a GameProvider");
  return context;
};

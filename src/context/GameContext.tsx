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
import { parseImportData } from "../services/importService";
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
import { clearSeat, readSeat, saveSeat } from "../services/seat";
import { maySpeakFor, seatHeldByAnother } from "../services/seats";
import type { SeatBindings } from "../services/seats";
import {
  allocatePin,
  clearStoredSnapshot,
  openBroadcastWindow,
  postMessage,
  publishSnapshot,
  registerRoom,
  releaseRoom,
  attachRoomChannel,
  detachRoomChannel,
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
   */
  revealCategory: (landedIndex: number) => void;
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
const REMOTE_JOIN_TIMEOUT_MS = 6000;
/** Used when the host never names the game. */
const DEFAULT_GAME_NAME = "OmniTrivia Night";

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
    bracket[roundIndex + 1] = buildNextRound(
      prev.currentRound + 1,
      advancingIds,
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

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<GameState>({
    phase: GamePhase.START,
    mode: GameMode.STANDARD,
    players: [],
    currentPlayerId: null,
    isHost: false,
    gamePin: null,
    gameName: "",
    clientPin: null,
    clientPlayerId: null,
    joining: false,
    joinError: null,
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
    initialPin: new URLSearchParams(window.location.search).get("pin"),
    roomWarning: null,
  });

  const [broadcastConnected, setBroadcastConnected] = useState(false);
  const broadcastSeenAt = useRef(0);
  // Identifies this host window on the shared channel. Two host tabs in one
  // browser would otherwise both publish into the same projector.
  const hostId = useRef(
    globalThis.crypto?.randomUUID?.() ?? `host-${Math.random().toString(36).slice(2)}`,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

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

        // A player already in this room is coming back, not arriving late —
        // a phone that locked its screen or reloaded. Turning them away would
        // strand their seat and their score for the rest of the game.
        const returning = current.players.some((p) => p.id === message.playerId);

        // ...unless a different device is asking for that seat, in which case
        // the one holding it is the one who keeps it.
        const seatTaken = seatHeldByAnother(
          seatUids.current,
          message.playerId,
          meta,
        );

        const accepted =
          !seatTaken && (current.phase === GamePhase.LOBBY || returning);

        if (accepted && meta) seatUids.current.set(message.playerId, meta.uid);

        if (accepted) {
          setState((prev) => {
            if (prev.players.some((p) => p.id === message.playerId)) return prev;
            const player: Player = {
              id: message.playerId,
              name: message.name,
              avatar: message.avatar,
              avatarColor: message.avatarColor,
              avatarAccessory: message.avatarAccessory,
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
          reason: accepted
            ? undefined
            : seatTaken
              ? "That seat is being played on another device."
              : "The game has already started.",
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

  // Keep this room's claim on its PIN fresh, and hand the PIN back when the
  // host window goes away.
  useEffect(() => {
    if (!state.isHost || !state.gamePin) return;

    const pin = state.gamePin;
    const name = state.gameName;
    const id = hostId.current;

    // `open` is read fresh on every beat rather than keyed into this effect,
    // so the room's advertised state follows the game without the heartbeat
    // being torn down and rebuilt at every phase change.
    const beat = () =>
      registerRoom(pin, id, name, stateRef.current.phase === GamePhase.LOBBY);

    beat();
    const keepAlive = setInterval(beat, 2000);
    const drop = () => releaseRoom(id, pin);
    window.addEventListener("pagehide", drop);

    return () => {
      clearInterval(keepAlive);
      window.removeEventListener("pagehide", drop);
    };
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
      const newRoundsConfig: RoundConfig[] = randomizeRounds(
        results.map((result, i) => ({
          roundNumber: i + 1,
          category: selectedCats[i],
          questions: result.questions,
        })),
      );

      // Warn the host that they are about to run placeholders in front of a room.
      const failed = results.filter((r) => r.usedFallback);
      const contentWarning =
        failed.length > 0
          ? `${failed.length} of ${results.length} round(s) used placeholder questions instead of real ones. ${failed[0].error}`
          : null;

      setState((prev) => ({
        ...prev,
        loading: false,
        roundsConfig: newRoundsConfig,
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
      const parsed = parseImportData(csvData);
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
        contentWarning: null,
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
        contentWarning: null,
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
    registerRoom(pin, hostId.current, gameName, true);

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
    playerId?: string;
    silent?: boolean;
  }): Promise<void> => {
    const code = params.pin.trim();
    if (!code) {
      setState((prev) => ({ ...prev, joinError: "Enter the game's PIN." }));
      return;
    }

    const clientId = `client-${Math.random().toString(36).slice(2)}`;
    const playerId =
      params.playerId ??
      `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nonce = `q-${Math.random().toString(36).slice(2)}`;

    setState((prev) => ({ ...prev, joining: !params.silent, joinError: null }));

    // The question has to go out on the same channel the host is listening
    // to, so this room is carried before anything is asked of it.
    const attached = await attachRoomChannel(code, false);

    const remote = canReachOtherDevices();

    // A silent rejoin can lose a race with the player simply joining by hand
    // while it was waiting. When that happens it must not tidy up after the
    // winner: the seat it would clear and the channel it would detach now
    // belong to a player who is already in the game.
    const overtaken = () => Boolean(params.silent && stateRef.current.clientPin);

    const giveUp = (joinError: string | null) => {
      if (overtaken()) return;
      void detachRoomChannel();
      setState((prev) => ({ ...prev, joining: false, joinError }));
    };

    // A phone with no working connection and a PIN nobody is hosting fail the
    // same way from the inside, and they are not the same problem.
    if (remote && (!attached || !(await roomChannelReady()))) {
      giveUp(
        params.silent
          ? null
          : roomFailureReason() === "denied"
            ? "The game server is refusing every device, because this game's database rules have not been published yet. Nothing is wrong with this phone or the PIN — the host has to publish them."
            : "Could not reach the game server. Check this device's internet connection, then try the PIN again.",
      );
      return;
    }

    let settled = false;
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
        // is only a dead end for someone who never had a seat.
        if (!message.open && !params.playerId) {
          finish({
            joinError: `"${message.gameName}" has already started. Ask the host to open a new game.`,
          });
          return;
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

        // Remembered so a reload lands back in this seat rather than opening
        // a second one beside it.
        void deviceIdentity().then((uid) =>
          saveSeat({
            pin: message.pin,
            playerId,
            name: params.name,
            avatar: params.avatar,
            avatarColor: params.avatarColor,
            avatarAccessory: params.avatarAccessory,
            uid: uid ?? undefined,
          }),
        );

        finish({
          clientPin: message.pin,
          clientPlayerId: playerId,
          currentPlayerId: playerId,
          gamePin: message.pin,
          gameName: message.gameName,
          isHost: false,
          phase: GamePhase.LOBBY,
        });
      }
    });

    // Nobody hosting this PIN means there is no room to join. Saying so beats
    // opening an empty one that looks like the host's game but is not.
    const timeout = window.setTimeout(
      () => {
        if (overtaken()) return;
        if (params.silent) clearSeat();
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
  ) => {
    void attemptJoin({
      name,
      avatar,
      avatarColor,
      avatarAccessory,
      pin: pin ?? "",
    });
  };

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
        playerId: seat.playerId,
        silent: true,
      });
    })();
    // Mount only: rejoining is something that happens as the page comes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const revealCategory = (landedIndex: number) => {
    setState((prev) => {
      const from = Math.max(0, prev.currentRound - 1);
      const remaining = prev.roundsConfig.length - from;
      if (remaining <= 0) {
        return { ...prev, wheelSpinning: false, categoryRevealed: true };
      }

      const picked = from + Math.min(Math.max(landedIndex, 0), remaining - 1);
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
        questionsQueue: roundConfig.questions,
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

  /** Cut to the results without waiting for the projector to catch up. */
  const endRoundNow = () =>
    setState((prev) =>
      prev.phase === GamePhase.PLAYING ? finishRound(prev) : prev,
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
    clearStoredSnapshot();
    clearSeat();
    seatUids.current.clear();
    resetInsightBaselines();
    releaseRoom(hostId.current, stateRef.current.gamePin);
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
        toggleHostAnswering,
        clearJoinError,
        updateConfig,
        initImport,
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

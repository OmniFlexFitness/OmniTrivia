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
  AnswerRecord,
  RevealReason,
  GameState,
  GamePhase,
  GameMode,
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
  TIMER_DURATION,
  REVEAL_DURATION,
  AVATARS,
  AVATAR_COLORS,
  CATEGORIES,
} from "../constants";
import { generateQuestions } from "../services/claudeService";
import { parseImportData } from "../services/importService";
import { isAnswerCorrect } from "../services/scoring";
import {
  activePlayerIds,
  answeringRoster,
  buildFirstRound,
  buildNextRound,
  resolveRound,
} from "../services/bracket";
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
  initImport: () => void;
  importGame: (csvData: string) => void;
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
  selectCategory: (category: string) => Promise<void>; // Kept for compatibility but modified
  beginWheelSpin: () => void;
  revealCategory: () => void;
  submitAnswer: (answer: Answer) => void;
  nextQuestion: () => void;
  nextRound: () => void;
  restartGame: () => void;
  playAgain: () => void;
  regenerateQuestion: (
    categoryId: string,
    questionIndex: number,
  ) => Promise<void>;

  // Host controls for running a live round.
  endQuestionNow: () => void;
  toggleTimerPaused: () => void;
  addTime: (seconds: number) => void;
  toggleAutoAdvance: () => void;
  openBroadcast: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const CORRECT_BASE_POINTS = 100;
const TIME_BONUS_PER_SECOND = 10;
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
 * Every phase change a timer or an answer can trigger lives here as a
 * state -> state function, so the interval callbacks, the host's buttons and
 * the last player's answer all drive the game through the same code.
 * ------------------------------------------------------------------ */

/** Close the question: bank the points, then put the answer on screen. */
const endQuestion = (prev: GameState, reason: RevealReason): GameState => {
  if (prev.phase !== GamePhase.PLAYING) return prev;

  const active = new Set(answeringRoster(prev.bracket[prev.currentRound - 1], prev.players, prev.hostAnsweringEnabled));
  const byPlayer = new Map(prev.currentAnswers.map((a) => [a.playerId, a]));

  // Points land here rather than at submit time so nothing on a shared screen
  // can move the moment someone answers correctly.
  const players = prev.players.map((player) => {
    if (!active.has(player.id)) return player;

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

  return {
    ...prev,
    players,
    phase: GamePhase.QUESTION_REVEAL,
    timerPaused: false,
    revealSecondsLeft: REVEAL_DURATION,
    revealReason: reason,
  };
};

/**
 * Settle the round's matchups and draw the next one. Called when the last
 * question of a round has been revealed.
 */
const finishRound = (prev: GameState): GameState => {
  const roundIndex = prev.currentRound - 1;
  const current = prev.bracket[roundIndex];

  if (!current) {
    return { ...prev, phase: GamePhase.ROUND_END };
  }

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
    phase: GamePhase.ROUND_END,
  };
};

/** Leave the reveal: next question, or the end of the round. */
const advanceFromReveal = (prev: GameState): GameState => {
  if (prev.phase !== GamePhase.QUESTION_REVEAL) return prev;

  const nextIndex = prev.currentQuestionIndex + 1;
  if (nextIndex < prev.questionsQueue.length) {
    return {
      ...prev,
      phase: GamePhase.PLAYING,
      currentQuestion: prev.questionsQueue[nextIndex],
      currentQuestionIndex: nextIndex,
      currentAnswers: [],
      timeLeft: TIMER_DURATION,
      timerPaused: false,
      questionDuration: TIMER_DURATION,
      revealSecondsLeft: REVEAL_DURATION,
      revealReason: null,
    };
  }

  return finishRound(prev);
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
    currentRound: 0,
    currentQuestion: null,
    currentQuestionIndex: 0,
    questionsQueue: [],
    usedCategories: [],
    selectedCategory: null,
    bracket: [],
    championId: null,
    currentAnswers: [],
    timeLeft: TIMER_DURATION,
    timerPaused: false,
    questionDuration: TIMER_DURATION,
    revealSecondsLeft: REVEAL_DURATION,
    revealReason: null,
    autoAdvance: true,
    hostAnsweringEnabled: true,
    wheelSpinning: false,
    categoryRevealed: false,
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
   * Question clock
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (state.phase !== GamePhase.PLAYING || state.timerPaused) return;

    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.phase !== GamePhase.PLAYING) return prev;
        const timeLeft = prev.timeLeft - 1;
        return timeLeft <= 0
          ? endQuestion({ ...prev, timeLeft: 0 }, "time")
          : { ...prev, timeLeft };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.phase, state.timerPaused]);

  /* ---------------------------------------------------------------- *
   * Reveal clock — holds the answer up, then moves the room along
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (state.phase !== GamePhase.QUESTION_REVEAL || !state.autoAdvance) return;

    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.phase !== GamePhase.QUESTION_REVEAL) return prev;
        const revealSecondsLeft = prev.revealSecondsLeft - 1;
        return revealSecondsLeft <= 0
          ? advanceFromReveal({ ...prev, revealSecondsLeft: 0 })
          : { ...prev, revealSecondsLeft };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.phase, state.autoAdvance]);

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

  const recordAnswer = useCallback((playerId: string, answer: Answer) => {
    setState((prev) => {
      if (prev.phase !== GamePhase.PLAYING || !prev.currentQuestion) return prev;
      if (prev.currentAnswers.some((a) => a.playerId === playerId)) return prev;

      const active = answeringRoster(prev.bracket[prev.currentRound - 1], prev.players, prev.hostAnsweringEnabled);
      // Eliminated players and spectators can watch, but they cannot score.
      if (!active.includes(playerId)) return prev;

      const isCorrect = isAnswerCorrect(prev.currentQuestion, answer);
      const record: AnswerRecord = {
        playerId,
        answer,
        isCorrect,
        points: isCorrect
          ? CORRECT_BASE_POINTS + prev.timeLeft * TIME_BONUS_PER_SECOND
          : 0,
        timeLeft: prev.timeLeft,
      };

      const currentAnswers = [...prev.currentAnswers, record];
      const answered = new Set(currentAnswers.map((a) => a.playerId));
      const everyoneIsIn =
        active.length > 0 && active.every((id) => answered.has(id));

      const next = { ...prev, currentAnswers };
      // The whole point of the counter on the broadcast: once the last player
      // is in there is nothing left to wait for, so the clock stops early.
      return everyoneIsIn ? endQuestion(next, "all-in") : next;
    });
  }, []);

  /* ---------------------------------------------------------------- *
   * Bots answer on a spread of timers, so the "still answering" count on
   * the broadcast actually counts down during a question.
   * ---------------------------------------------------------------- */
  const botTimers = useRef<number[]>([]);

  useEffect(() => {
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];

    if (state.phase !== GamePhase.PLAYING || state.timerPaused) return;
    const question = state.currentQuestion;
    if (!question) return;

    const active = new Set(answeringRoster(state.bracket[state.currentRound - 1], state.players, state.hostAnsweringEnabled));
    const answered = new Set(state.currentAnswers.map((a) => a.playerId));
    const thinking = state.players.filter(
      (p) => p.isBot && active.has(p.id) && !answered.has(p.id),
    );

    // Leave a second on the clock so a bot never lands after time is up.
    const latest = Math.min(state.timeLeft - 1, BOT_MAX_THINK_SECONDS);
    const spread = Math.max(0, latest - BOT_MIN_THINK_SECONDS);

    thinking.forEach((bot) => {
      const delay = (BOT_MIN_THINK_SECONDS + Math.random() * spread) * 1000;
      const timer = window.setTimeout(() => {
        recordAnswer(bot.id, botAnswerFor(question, Math.random() < BOT_ACCURACY));
      }, Math.max(500, delay));
      botTimers.current.push(timer);
    });

    return () => {
      botTimers.current.forEach(clearTimeout);
      botTimers.current = [];
    };
    // Deliberately not keyed on currentAnswers: a rescheduling on every answer
    // would keep resetting the bots' think time.
  }, [
    state.phase,
    state.currentRound,
    state.currentQuestionIndex,
    state.timerPaused,
    recordAnswer,
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
      // Select random unique categories
      const shuffledCats = [...CATEGORIES].sort(() => 0.5 - Math.random());
      const selectedCats = shuffledCats.slice(0, rounds);

      // If we requested more rounds than categories, we might reuse, but for now assume rounds <= categories
      if (selectedCats.length < rounds) {
        // Fill with randoms if needed
        while (selectedCats.length < rounds) {
          selectedCats.push(
            CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
          );
        }
      }

      // Generate every round concurrently. Sequential calls made a 5-round game
      // wait for 5 round-trips before the host saw anything.
      const results = await Promise.all(
        selectedCats.map((category) =>
          generateQuestions(category.name, questions),
        ),
      );

      const newRoundsConfig: RoundConfig[] = results.map((result, i) => ({
        roundNumber: i + 1,
        category: selectedCats[i],
        questions: result.questions,
      }));

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

  const initImport = () => {
    setState((prev) => ({
      ...prev,
      isHost: true,
      error: null,
      phase: GamePhase.IMPORT,
    }));
  };

  const goBackToConfig = () => {
    setState((prev) => ({
      ...prev,
      error: null,
      phase: GamePhase.HOST_CONFIG,
    }));
  };

  const importGame = (csvData: string) => {
    try {
      const parsed = parseImportData(csvData);
      const categoryContents = Object.values(parsed);

      const newRoundsConfig: RoundConfig[] = categoryContents.map(
        (content, i) => ({
          roundNumber: i + 1,
          category: content.category,
          questions: content.questions,
        }),
      );

      setState((prev) => ({
        ...prev,
        loading: false,
        error: null,
        contentWarning: null,
        roundsConfig: newRoundsConfig,
        totalRounds: newRoundsConfig.length,
        questionsPerRound: Math.max(
          ...newRoundsConfig.map((r) => r.questions.length),
        ),
        phase: GamePhase.REVIEW,
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Failed to import questions.",
      }));
    }
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
    const roomWarning =
      canReachOtherDevices() && !attached
        ? "Could not reach the multiplayer server, so phones cannot join this game. The host screen and the broadcast display still work."
        : null;

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

  const toggleHostAnswering = () =>
    setState((prev) => ({
      ...prev,
      hostAnsweringEnabled: !prev.hostAnsweringEnabled,
    }));

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
        currentAnswers: [],
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
   * The wheel has landed. This is the beat the room is watching for, and it
   * happens when the animation ends — not later, when the host gets around to
   * pressing START ROUND.
   */
  const revealCategory = () => {
    setState((prev) => ({
      ...prev,
      wheelSpinning: false,
      categoryRevealed: true,
    }));
  };

  // Modified to use pre-generated content
  const selectCategory = async (_categoryId: string) => {
    setState((prev) => {
      const roundConfig = prev.roundsConfig[prev.currentRound - 1];
      if (!roundConfig) {
        console.error("No config for round", prev.currentRound);
        return prev;
      }

      return {
        ...prev,
        loading: false,
        currentQuestion: roundConfig.questions[0],
        currentQuestionIndex: 0,
        questionsQueue: roundConfig.questions,
        selectedCategory: roundConfig.category.id,
        currentAnswers: [],
        wheelSpinning: false,
        categoryRevealed: true,
        phase: GamePhase.PLAYING,
        timeLeft: TIMER_DURATION,
        timerPaused: false,
        questionDuration: TIMER_DURATION,
        revealReason: null,
      };
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

  /** Host control: stop the clock and put the answer up now. */
  const endQuestionNow = () => setState((prev) => endQuestion(prev, "host"));

  const toggleTimerPaused = () =>
    setState((prev) => ({ ...prev, timerPaused: !prev.timerPaused }));

  const addTime = (seconds: number) =>
    setState((prev) => {
      if (prev.phase !== GamePhase.PLAYING) return prev;

      const timeLeft = Math.max(1, prev.timeLeft + seconds);
      return {
        ...prev,
        timeLeft,
        // Stretch the question's own clock with it, so the bars and the ring
        // measure against what the room was actually given rather than sitting
        // pinned at full while the number counts down from 25.
        questionDuration: Math.max(prev.questionDuration, timeLeft),
      };
    });

  const toggleAutoAdvance = () =>
    setState((prev) => ({ ...prev, autoAdvance: !prev.autoAdvance }));

  const openBroadcast = () => {
    openBroadcastWindow();
  };

  const nextQuestion = () => setState((prev) => advanceFromReveal(prev));

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
        currentQuestion: null,
        currentQuestionIndex: 0,
        questionsQueue: [],
        currentAnswers: [],
        selectedCategory: null,
        wheelSpinning: false,
        categoryRevealed: false,
        timeLeft: TIMER_DURATION,
        timerPaused: false,
        questionDuration: TIMER_DURATION,
        revealReason: null,
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
    releaseRoom(hostId.current, stateRef.current.gamePin);
    void detachRoomChannel();
    setState((prev) => ({
      ...prev,
      phase: GamePhase.START,
      currentRound: 0,
      currentQuestion: null,
      currentQuestionIndex: 0,
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
      bracket: [],
      championId: null,
      currentAnswers: [],
      timeLeft: TIMER_DURATION,
      timerPaused: false,
      questionDuration: TIMER_DURATION,
      revealSecondsLeft: REVEAL_DURATION,
      revealReason: null,
      wheelSpinning: false,
      categoryRevealed: false,
      loading: false,
      error: null,
      contentWarning: null,
    }));
  };

  // Replay the same questions with fresh scores, so "play again" does not force
  // the host to burn another round of generation in front of a waiting room.
  const playAgain = () => {
    setState((prev) => ({
      ...prev,
      phase: GamePhase.LOBBY,
      currentRound: 0,
      currentQuestion: null,
      currentQuestionIndex: 0,
      questionsQueue: [],
      usedCategories: [],
      selectedCategory: null,
      bracket: [],
      championId: null,
      currentAnswers: [],
      timeLeft: TIMER_DURATION,
      timerPaused: false,
      questionDuration: TIMER_DURATION,
      revealSecondsLeft: REVEAL_DURATION,
      revealReason: null,
      wheelSpinning: false,
      categoryRevealed: false,
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

  const regenerateQuestion = async (
    categoryId: string,
    questionIndex: number,
  ) => {
    // Find the round config for this category
    const roundIndex = state.roundsConfig.findIndex(
      (rc) => rc.category.id === categoryId,
    );
    if (roundIndex === -1) return;

    const roundConfig = state.roundsConfig[roundIndex];
    try {
      // Generate a single new question
      const result = await generateQuestions(roundConfig.category.name, 1);
      if (result.usedFallback || result.questions.length === 0) return;

      // Replace the question at the specified index
      const updatedQuestions = [...roundConfig.questions];
      updatedQuestions[questionIndex] = result.questions[0];

      const updatedRoundsConfig = [...state.roundsConfig];
      updatedRoundsConfig[roundIndex] = {
        ...roundConfig,
        questions: updatedQuestions,
      };

      setState((prev) => ({
        ...prev,
        roundsConfig: updatedRoundsConfig,
      }));
    } catch (error) {
      console.error("Error regenerating question:", error);
    }
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
        goBackToConfig,
        joinGame,
        hostJoinAsPlayer,
        addBot,
        startGame,
        selectCategory,
        beginWheelSpin,
        revealCategory,
        submitAnswer,
        nextQuestion,
        nextRound,
        restartGame,
        playAgain,
        regenerateQuestion,
        endQuestionNow,
        toggleTimerPaused,
        addTime,
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

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
  activePlayerIds,
  buildFirstRound,
  buildNextRound,
  resolveRound,
} from "../services/bracket";
import {
  advanceBroadcast,
  buildRoundLanes,
  closeLaneQuestion,
  laneAnswers,
  recordLaneAnswer,
  roundIsComplete,
  syncLaneRosters,
  tickRound,
} from "../services/lanes";
import { buildSnapshot } from "../services/snapshot";
import {
  allocatePin,
  clearStoredSnapshot,
  openBroadcastWindow,
  postMessage,
  publishSnapshot,
  registerRoom,
  releaseRoom,
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
  nextRound: () => void;
  restartGame: () => void;
  playAgain: () => void;
  regenerateQuestion: (
    categoryId: string,
    questionIndex: number,
  ) => Promise<void>;

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
/** How long a join waits for the host of that PIN to answer before giving up. */
const JOIN_TIMEOUT_MS = 1500;
/** Used when the host never names the game. */
const DEFAULT_GAME_NAME = "OmniTrivia Night";

/* ------------------------------------------------------------------ *
 * Pure transitions
 *
 * A live round is driven entirely by `src/services/lanes.ts`: each matchup
 * owns its question, its clock and its reveal, and moves itself along. What is
 * left here are the transitions that are genuinely about the whole game —
 * settling a round, drawing the next one, ending the night.
 * ------------------------------------------------------------------ */

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
    loading: false,
    error: null,
    contentWarning: null,
    initialPin: new URLSearchParams(window.location.search).get("pin"),
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

  /* ---------------------------------------------------------------- *
   * Round clock
   *
   * One interval for the whole round: it hands a second to every lane, each
   * of which spends it on its own question or its own reveal. Matchups need
   * no timer of their own to run independently — only their own numbers.
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

  /** Take one answer into whichever matchup's lane the player is playing in. */
  const recordAnswer = useCallback((playerId: string, answer: Answer) => {
    setState((prev) => {
      const next = recordLaneAnswer(prev, playerId, answer);
      // The last pair to finish can end the round with their answer, so this
      // has to be checked here and not only on the clock.
      return roundIsComplete(next) ? finishRound(next) : next;
    });
  }, []);

  /* ---------------------------------------------------------------- *
   * Bots answer on a spread of timers, per lane, so every matchup's
   * "still answering" count actually counts down while it plays.
   * ---------------------------------------------------------------- */
  // Keyed by lane and question, so a lane advancing never reshuffles the
  // think time of the bots sitting in another one.
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
      if (lane.status !== LaneStatus.ANSWERING) return;

      const key = `${lane.id}:${lane.questionIndex}`;
      live.add(key);
      if (botTimers.current.has(key)) return; // already thinking

      const question = state.questionsQueue[lane.questionIndex];
      if (!question) return;

      const answered = new Set(
        laneAnswers(lane, lane.questionIndex).map((a) => a.playerId),
      );
      const thinking = lane.answeringIds.filter(
        (id) => bots.has(id) && !answered.has(id),
      );
      if (thinking.length === 0) return;

      // Leave a second on the clock so a bot never lands after time is up.
      const latest = Math.min(lane.timeLeft - 1, BOT_MAX_THINK_SECONDS);
      const spread = Math.max(0, latest - BOT_MIN_THINK_SECONDS);

      botTimers.current.set(
        key,
        thinking.map((botId) => {
          const answerUp = () => {
            const current = stateRef.current.lanes.find(
              (candidate) => candidate.id === lane.id,
            );
            // The lane has moved on without this bot; its answer was built for
            // a question that is no longer the one being asked.
            if (!current || current.questionIndex !== lane.questionIndex) return;

            // A paused lane is a host holding the room, so its bots wait too.
            if (current.timerPaused) {
              botTimers.current.set(key, [
                ...(botTimers.current.get(key) ?? []),
                window.setTimeout(answerUp, 1000),
              ]);
              return;
            }
            recordAnswer(
              botId,
              botAnswerFor(question, Math.random() < BOT_ACCURACY),
            );
          };

          const delay =
            (BOT_MIN_THINK_SECONDS + Math.random() * spread) * 1000;
          return window.setTimeout(answerUp, Math.max(500, delay));
        }),
      );
    });

    // Drop the timers for questions the field has already moved past.
    [...botTimers.current.keys()]
      .filter((key) => !live.has(key))
      .forEach(clearKey);
    // Deliberately not keyed on the lanes' answers: rescheduling on every
    // answer would keep resetting the bots' think time.
  }, [state.phase, state.lanes, state.players, state.questionsQueue, recordAnswer]);

  useEffect(
    () => () => {
      botTimers.current.forEach((timers) => timers.forEach(clearTimeout));
      botTimers.current.clear();
    },
    [],
  );

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
    const unsubscribe = subscribeToMessages((message) => {
      const current = stateRef.current;
      if (!current.isHost || !current.gamePin) return;

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

        const accepted = current.phase === GamePhase.LOBBY;
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
          reason: accepted ? undefined : "The game has already started.",
          hostId: hostId.current,
          gameName: current.gameName,
          pin: current.gamePin,
        });
        return;
      }

      if (message.type === "player-answer") {
        if (message.pin !== current.gamePin) return;
        recordAnswer(message.playerId, message.answer);
        return;
      }

      if (message.type === "player-leave") {
        if (message.pin !== current.gamePin) return;
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

    registerRoom(pin, id, name);
    const keepAlive = setInterval(() => registerRoom(pin, id, name), 2000);
    const drop = () => releaseRoom(id);
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

  const confirmGame = () => {
    // A PIN nobody else is hosting. Two rooms answering to the same code is
    // what made joining land in a phantom lobby.
    const pin = allocatePin();

    setState((prev) => {
      const gameName = prev.gameName.trim() || DEFAULT_GAME_NAME;
      registerRoom(pin, hostId.current, gameName);

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
        players: alreadySeated ? prev.players : [...prev.players, hostPlayer],
        currentPlayerId: alreadySeated ? prev.currentPlayerId : hostPlayer.id,
        phase: GamePhase.LOBBY,
      };
    });
  };

  const setGameName = (name: string) => {
    setState((prev) => {
      if (prev.gamePin) registerRoom(prev.gamePin, hostId.current, name);
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

  const joinGame = (
    name: string,
    avatar: string,
    avatarColor?: string,
    avatarAccessory?: string,
    pin?: string,
  ) => {
    const code = (pin ?? "").trim();
    if (!code) {
      setState((prev) => ({ ...prev, joinError: "Enter the game's PIN." }));
      return;
    }

    const clientId = `client-${Math.random().toString(36).slice(2)}`;
    const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nonce = `q-${Math.random().toString(36).slice(2)}`;

    setState((prev) => ({ ...prev, joining: true, joinError: null }));

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
        if (!message.open) {
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
          name,
          avatar,
          avatarColor,
          avatarAccessory,
        });
        return;
      }

      if (message.type === "player-join-result" && message.clientId === clientId) {
        finish(
          message.accepted
            ? {
                clientPin: message.pin,
                clientPlayerId: playerId,
                currentPlayerId: playerId,
                gamePin: message.pin,
                gameName: message.gameName,
                isHost: false,
                phase: GamePhase.LOBBY,
              }
            : { joinError: message.reason ?? "The host turned the join down." },
        );
      }
    });

    // Nobody hosting this PIN means there is no room to join. Saying so beats
    // opening an empty one that looks like the host's game but is not.
    const timeout = window.setTimeout(
      () =>
        finish({
          joinError: `No game is running with PIN ${code}. Check the code on the big screen — and note that joining only works in the same browser on the host's machine until there is a server.`,
        }),
      JOIN_TIMEOUT_MS,
    );

    postMessage({ type: "room-query", pin: code, nonce });
  };

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

  /**
   * Start the round on the category the wheel landed on.
   *
   * This is the last moment the field is together: it deals a lane to every
   * matchup and then stops coordinating them. From here each pairing is on its
   * own clock, and the only thing they share is the list of questions.
   */
  const selectCategory = async (_categoryId: string) => {
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

  /* ---------------------------------------------------------------- *
   * Host controls
   *
   * Each one names the matchup it acts on. A host stepping in for one table
   * must not stop the three beside it, which is exactly what a single global
   * clock control used to do.
   * ---------------------------------------------------------------- */

  /** Stop one matchup's clock and put its answer in front of the pair in it. */
  const revealLaneNow = (laneId: string) =>
    setState((prev) => {
      const next = closeLaneQuestion(prev, laneId, "host");
      return roundIsComplete(next) ? finishRound(next) : next;
    });

  const revealAllLanesNow = () =>
    setState((prev) => {
      const next = prev.lanes.reduce(
        (state, lane) =>
          lane.status === LaneStatus.ANSWERING
            ? closeLaneQuestion(state, lane.id, "host")
            : state,
        prev,
      );
      return roundIsComplete(next) ? finishRound(next) : next;
    });

  const setLanePaused = (
    prev: GameState,
    match: (laneId: string) => boolean,
    paused: (lane: GameState["lanes"][number]) => boolean,
  ): GameState => ({
    ...prev,
    lanes: prev.lanes.map((lane) =>
      match(lane.id) ? { ...lane, timerPaused: paused(lane) } : lane,
    ),
  });

  const toggleLanePaused = (laneId: string) =>
    setState((prev) =>
      setLanePaused(
        prev,
        (id) => id === laneId,
        (lane) => !lane.timerPaused,
      ),
    );

  const setAllLanesPaused = (paused: boolean) =>
    setState((prev) =>
      setLanePaused(
        prev,
        () => true,
        () => paused,
      ),
    );

  const stretchLane = (
    prev: GameState,
    laneId: string,
    seconds: number,
  ): GameState => ({
    ...prev,
    lanes: prev.lanes.map((lane) => {
      if (lane.id !== laneId || lane.status !== LaneStatus.ANSWERING) {
        return lane;
      }
      const timeLeft = Math.max(1, lane.timeLeft + seconds);
      return {
        ...lane,
        timeLeft,
        // Stretch the question's own clock with it, so the bars and the ring
        // measure against what the pair were actually given rather than
        // sitting pinned at full while the number counts past it.
        questionDuration: Math.max(lane.questionDuration, timeLeft),
      };
    }),
  });

  const addLaneTime = (laneId: string, seconds: number) =>
    setState((prev) =>
      prev.phase === GamePhase.PLAYING ? stretchLane(prev, laneId, seconds) : prev,
    );

  const addTimeToAllLanes = (seconds: number) =>
    setState((prev) =>
      prev.phase === GamePhase.PLAYING
        ? prev.lanes.reduce(
            (state, lane) => stretchLane(state, lane.id, seconds),
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
    releaseRoom(hostId.current);
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
      roundsConfig: [],
      bracket: [],
      championId: null,
      lanes: [],
      broadcastQuestionIndex: 0,
      broadcastRevealing: false,
      broadcastRevealSecondsLeft: REVEAL_DURATION,
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
        nextRound,
        restartGame,
        playAgain,
        regenerateQuestion,
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

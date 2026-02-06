import React, { createContext, useContext, useState, useEffect } from "react";
import {
  GameState,
  GamePhase,
  GameMode,
  Player,
  Question,
  RoundConfig,
  Category,
} from "../types";
import { BOT_NAMES, TIMER_DURATION, AVATARS, CATEGORIES } from "../constants";
import { generateQuestions } from "../services/geminiService";

interface GameContextType extends GameState {
  initHost: () => void;
  initJoin: () => void;
  generateGame: (rounds: number, questions: number) => Promise<void>;
  confirmGame: () => void;
  updateConfig: (rounds: number, questions: number) => void;
  joinGame: (name: string, avatar: string) => void;
  hostJoinAsPlayer: (name: string, avatar: string) => void;
  addBot: () => void;
  startGame: () => void;
  selectCategory: (category: string) => Promise<void>; // Kept for compatibility but modified
  submitAnswer: (answerIndex: number) => void;
  nextQuestion: () => void;
  nextRound: () => void;
  restartGame: () => void;
  regenerateQuestion: (
    categoryId: string,
    questionIndex: number,
  ) => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

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
    totalRounds: 3,
    questionsPerRound: 5,
    roundsConfig: [],
    currentRound: 0,
    currentQuestion: null,
    currentQuestionIndex: 0,
    questionsQueue: [],
    usedCategories: [],
    selectedCategory: null,
    timeLeft: TIMER_DURATION,
    loading: false,
    error: null,
  });

  // Timer Logic
  useEffect(() => {
    let timer: any;
    if (state.phase === GamePhase.PLAYING && state.timeLeft > 0) {
      timer = setInterval(() => {
        setState((prev) => ({ ...prev, timeLeft: prev.timeLeft - 1 }));
      }, 1000);
    } else if (state.phase === GamePhase.PLAYING && state.timeLeft === 0) {
      handleQuestionEnd();
    }
    return () => clearInterval(timer);
  }, [state.phase, state.timeLeft]);

  // Auto-add bots in Lobby for Host (Optional, kept from previous but reduced frequency)
  useEffect(() => {
    let botInterval: any;
    if (
      state.isHost &&
      state.phase === GamePhase.LOBBY &&
      state.players.length < 3
    ) {
      botInterval = setInterval(() => {
        addBot();
      }, 3000);
    }
    return () => clearInterval(botInterval);
  }, [state.isHost, state.phase, state.players.length]);

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

      const newRoundsConfig: RoundConfig[] = [];

      // Generate questions for each round
      for (let i = 0; i < rounds; i++) {
        const category = selectedCats[i];
        const generatedQuestions = await generateQuestions(
          category.name,
          questions,
        );

        newRoundsConfig.push({
          roundNumber: i + 1,
          category: category,
          questions: generatedQuestions,
        });
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        roundsConfig: newRoundsConfig,
        phase: GamePhase.REVIEW,
      }));
    } catch (error) {
      console.error("Error generating game:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to generate game content.",
      }));
    }
  };

  const confirmGame = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setState((prev) => ({
      ...prev,
      gamePin: pin,
      phase: GamePhase.LOBBY,
    }));
  };

  const updateConfig = (rounds: number, questions: number) => {
    setState((prev) => ({
      ...prev,
      totalRounds: rounds,
      questionsPerRound: questions,
    }));
  };

  const joinGame = (name: string, avatar: string) => {
    const newPlayer: Player = {
      id: `user-${Date.now()}`,
      name,
      avatar,
      score: 0,
      isBot: false,
      streak: 0,
    };

    setState((prev) => ({
      ...prev,
      players: [...prev.players, newPlayer],
      currentPlayerId: newPlayer.id,
      phase: GamePhase.LOBBY,
    }));
  };

  const hostJoinAsPlayer = (name: string, avatar: string) => {
    const hostPlayer: Player = {
      id: `host-${Date.now()}`,
      name: name || "Host",
      avatar: avatar || AVATARS[0],
      score: 0,
      isBot: false,
      isHost: true,
      streak: 0,
    };

    setState((prev) => ({
      ...prev,
      players: [...prev.players, hostPlayer],
      currentPlayerId: hostPlayer.id,
    }));
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
    // Start Round 1
    const firstRound = state.roundsConfig[0];
    if (!firstRound) return;

    setState((prev) => ({
      ...prev,
      currentRound: 1,
      phase: GamePhase.CATEGORY_SELECT,
      // We don't set questions yet, we wait for the wheel spin to "select" the category visually
    }));
  };

  // Modified to use pre-generated content
  const selectCategory = async (categoryId: string) => {
    // Find the config for the current round
    // Note: The wheel calls this with the category ID it landed on.
    // In our rigged wheel, this should match the pre-generated category.

    const roundConfig = state.roundsConfig[state.currentRound - 1];

    if (!roundConfig) {
      console.error("No config for round", state.currentRound);
      return;
    }

    setState((prev) => ({
      ...prev,
      loading: false,
      currentQuestion: roundConfig.questions[0],
      currentQuestionIndex: 0,
      questionsQueue: roundConfig.questions,
      selectedCategory: roundConfig.category.id,
      phase: GamePhase.PLAYING,
      timeLeft: TIMER_DURATION,
    }));
  };

  const handleQuestionEnd = () => {
    const updatedPlayers = state.players.map((p) => {
      if (p.isBot) {
        const isCorrect = Math.random() > 0.5;
        const points = isCorrect ? 100 + Math.floor(Math.random() * 50) : 0;
        return {
          ...p,
          score: p.score + points,
          lastAnswerCorrect: isCorrect,
          streak: isCorrect ? p.streak + 1 : 0,
        };
      } else if (p.id === state.currentPlayerId) {
        return {
          ...p,
          lastAnswerCorrect: false,
          streak: 0,
        };
      }
      return p;
    });

    setState((prev) => ({
      ...prev,
      players: updatedPlayers,
      phase: GamePhase.ROUND_RESULT,
    }));
  };

  const submitAnswer = (answerIndex: number) => {
    if (state.phase !== GamePhase.PLAYING || !state.currentQuestion) return;

    // If host is just watching (currentPlayerId is null), they can't submit
    if (state.isHost && !state.currentPlayerId) return;

    const isCorrect = answerIndex === state.currentQuestion.correctIndex;
    const timeBonus = Math.floor(state.timeLeft * 10);
    const points = isCorrect ? 100 + timeBonus : 0;

    const tempPlayers = state.players.map((p) => {
      if (p.id === state.currentPlayerId) {
        return {
          ...p,
          score: p.score + points,
          lastAnswerCorrect: isCorrect,
          streak: isCorrect ? p.streak + 1 : 0,
        };
      }
      return p;
    });

    const finalPlayers = tempPlayers.map((p) => {
      if (p.isBot) {
        const botCorrect = Math.random() > 0.4;
        const botPoints = botCorrect ? 100 + Math.floor(Math.random() * 50) : 0;
        return {
          ...p,
          score: p.score + botPoints,
          lastAnswerCorrect: botCorrect,
          streak: botCorrect ? p.streak + 1 : 0,
        };
      }
      return p;
    });

    setState((prev) => ({
      ...prev,
      players: finalPlayers,
      phase: GamePhase.ROUND_RESULT,
    }));
  };

  const nextQuestion = () => {
    const queue = state.questionsQueue || [];
    const nextIndex = state.currentQuestionIndex + 1;

    if (nextIndex < queue.length) {
      setState((prev) => ({
        ...prev,
        currentQuestion: queue[nextIndex],
        currentQuestionIndex: nextIndex,
        phase: GamePhase.PLAYING,
        timeLeft: TIMER_DURATION,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        phase: GamePhase.ROUND_END,
      }));
    }
  };

  const nextRound = () => {
    if (state.currentRound < state.totalRounds) {
      setState((prev) => ({
        ...prev,
        currentRound: prev.currentRound + 1,
        phase: GamePhase.CATEGORY_SELECT,
        currentQuestion: null,
        questionsQueue: [],
        selectedCategory: null,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        phase: GamePhase.GAME_OVER,
      }));
    }
  };

  const restartGame = () => {
    setState((prev) => ({
      ...prev,
      phase: GamePhase.START,
      score: 0,
      currentRound: 0,
      currentQuestionIndex: 0,
      questionsQueue: [],
      usedCategories: [],
      players: [],
      isHost: false,
      gamePin: null,
      currentPlayerId: null,
      roundsConfig: [],
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
      const newQuestions = await generateQuestions(
        roundConfig.category.name,
        1,
      );
      if (newQuestions.length === 0) return;

      // Replace the question at the specified index
      const updatedQuestions = [...roundConfig.questions];
      updatedQuestions[questionIndex] = newQuestions[0];

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
        initHost,
        initJoin,
        generateGame,
        confirmGame,
        updateConfig,
        joinGame,
        hostJoinAsPlayer,
        addBot,
        startGame,
        selectCategory,
        submitAnswer,
        nextQuestion,
        nextRound,
        restartGame,
        regenerateQuestion,
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

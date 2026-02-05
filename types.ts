export enum GamePhase {
  START = 'START',
  HOST_CONFIG = 'HOST_CONFIG',
  REVIEW = 'REVIEW', // New phase for reviewing questions
  JOIN = 'JOIN',
  LOBBY = 'LOBBY',
  CATEGORY_SELECT = 'CATEGORY_SELECT',
  PLAYING = 'PLAYING',
  ROUND_RESULT = 'ROUND_RESULT',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER'
}

export enum GameMode {
  STANDARD = 'STANDARD',
  SURVIVAL = 'SURVIVAL'
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  isBot: boolean;
  isHost?: boolean; // Added isHost
  lastAnswerCorrect?: boolean;
  streak: number;
}

export interface Question {
  id: string;
  category: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface RoundConfig {
  roundNumber: number;
  category: Category;
  questions: Question[];
}

export interface GameState {
  phase: GamePhase;
  mode: GameMode;
  players: Player[];
  currentPlayerId: string | null;
  isHost: boolean;
  gamePin: string | null;
  
  // Game Configuration
  totalRounds: number;
  questionsPerRound: number;
  roundsConfig: RoundConfig[]; // Store pre-generated rounds
  
  // Current Progress
  currentRound: number;
  currentQuestion: Question | null;
  currentQuestionIndex: number;
  questionsQueue: Question[];
  usedCategories: string[];
  selectedCategory: string | null;
  
  timeLeft: number;
  loading: boolean;
  error: string | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}
export enum GamePhase {
  START = "START",
  HOST_CONFIG = "HOST_CONFIG",
  IMPORT = "IMPORT", // Importing questions from CSV / Google Sheets
  REVIEW = "REVIEW", // New phase for reviewing questions
  JOIN = "JOIN",
  LOBBY = "LOBBY",
  CATEGORY_SELECT = "CATEGORY_SELECT",
  PLAYING = "PLAYING",
  QUESTION_REVEAL = "QUESTION_REVEAL", // Answer is on the broadcast, next question pending
  ROUND_END = "ROUND_END",
  GAME_OVER = "GAME_OVER",
}

export enum GameMode {
  STANDARD = "STANDARD",
  SURVIVAL = "SURVIVAL",
}

export enum QuestionType {
  MULTIPLE_CHOICE = "MULTIPLE_CHOICE",
  TRUE_FALSE = "TRUE_FALSE",
  TYPE_ANSWER = "TYPE_ANSWER",
  SLIDER = "SLIDER",
  PUZZLE = "PUZZLE",
}

/**
 * What a player submits depends on the question type: an option index for
 * multiple choice, typed text, a slider value, or a reordered list. It lives
 * here rather than in the scoring service so the broadcast snapshot types can
 * reference it without importing game logic.
 */
export type Answer = number | string | string[];

/**
 * Why a question stopped. The room is told which it was, so this is recorded
 * when it happens rather than guessed afterwards from the clock — a host who
 * reveals early leaves time on it, and so does the last player answering.
 */
export type RevealReason = "all-in" | "time" | "host";

export interface Player {
  id: string;
  name: string;
  avatar: string;
  avatarColor?: string;
  avatarAccessory?: string;
  score: number;
  // Points earned in the current round only. Head-to-head matchups are decided
  // on this, not on the running total, so every round starts even.
  roundScore: number;
  isBot: boolean;
  isHost?: boolean; // Added isHost
  lastAnswerCorrect?: boolean;
  streak: number;
  // Knocked out of the bracket. Eliminated players stay on the leaderboard and
  // keep their score, they just stop being matched up.
  eliminated?: boolean;
}

export interface Question {
  id: string;
  category: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  type?: QuestionType;
}

export interface RoundConfig {
  roundNumber: number;
  category: Category;
  questions: Question[];
}

/** One player's answer to the question currently on screen. */
export interface AnswerRecord {
  playerId: string;
  answer: Answer;
  isCorrect: boolean;
  points: number;
  /** Seconds left on the clock when they locked it in — drives the time bonus. */
  timeLeft: number;
}

/**
 * One head-to-head pairing for a single round. `playerBId` is null for the odd
 * player out, who advances on a bye.
 */
export interface Matchup {
  id: string;
  roundNumber: number;
  playerAId: string;
  playerBId: string | null;
  winnerId: string | null;
  /**
   * The round points each side finished on, frozen when the round resolves.
   * Live round scores reset every round, so a settled matchup has to carry its
   * own numbers or the bracket rewrites its own history.
   */
  scoreA: number | null;
  scoreB: number | null;
  /** Set when the matchup did not come down to round points alone. */
  tiebreak: string | null;
}

export interface BracketRound {
  roundNumber: number;
  matchups: Matchup[];
  resolved: boolean;
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

  // Head-to-head bracket, one entry per round played so far.
  bracket: BracketRound[];
  championId: string | null;

  // Answers to the question currently on screen, cleared on every question.
  currentAnswers: AnswerRecord[];

  timeLeft: number;
  timerPaused: boolean;
  // Why the question on screen ended. Null until it does.
  revealReason: RevealReason | null;
  // How long the current question was given in total. Tracked rather than
  // assumed from TIMER_DURATION because the host can add time mid-question,
  // and every progress bar and ring measures against it.
  questionDuration: number;
  // Seconds the answer stays up before the broadcast moves on.
  revealSecondsLeft: number;
  // When false the host has to click through every question and reveal.
  autoAdvance: boolean;
  // The host is mid-spin on the category wheel; the broadcast shows suspense.
  wheelSpinning: boolean;
  // The wheel has landed. Until it does, the round's category is kept out of
  // the broadcast snapshot entirely — publishing it and relying on the view to
  // hide it is how the room ends up reading the category off the projector
  // before the host has spun for it.
  categoryRevealed: boolean;

  loading: boolean;
  error: string | null;
  // Set when a round fell back to placeholder questions so the host is warned
  // before starting a game in front of a room.
  contentWarning: string | null;
  // Pre-filled from a ?pin= query param so QR-code links skip manual entry.
  initialPin: string | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface CategoryContent {
  category: Category;
  questions: Question[];
}

/* ------------------------------------------------------------------ *
 * Broadcast snapshot
 *
 * The projector window renders nothing but the snapshot the host window
 * publishes. Keeping it a separate, explicitly-built shape is what stops the
 * answer to the live question from ever reaching the big screen early.
 * ------------------------------------------------------------------ */

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  avatarColor?: string;
  avatarAccessory?: string;
  score: number;
  roundScore: number;
  streak: number;
  isBot: boolean;
  isHost?: boolean;
  eliminated?: boolean;
}

/**
 * The question as the room may see it. `options` is stripped of anything that
 * gives the answer away: a typed answer shows none, a slider shows only its
 * bounds, and a puzzle is shuffled out of its correct order.
 */
export interface PublicQuestion {
  id: string;
  category: string;
  text: string;
  type: QuestionType;
  options: string[];
}

/** Everything the broadcast needs to show the answer, sent only at reveal. */
export interface RevealDetail {
  /** Human-readable answer, already formatted for the question type. */
  label: string;
  /** Index into the public options, for highlighting a choice. Null if N/A. */
  correctIndex: number | null;
  correctOrder?: string[];
  correctRange?: [number, number];
  explanation?: string;
}

export interface BroadcastSnapshot {
  /** Bumped when the snapshot shape changes so a stale window can bow out. */
  version: number;
  updatedAt: number;
  /**
   * Identifies the host window that published this. Two host tabs in one
   * browser share a channel, and without this the projector would flip between
   * their two games.
   */
  hostId: string;

  phase: GamePhase;
  gamePin: string | null;

  roundNumber: number;
  totalRounds: number;
  category: Category | null;
  wheelSpinning: boolean;

  questionNumber: number;
  questionsInRound: number;
  question: PublicQuestion | null;
  reveal: RevealDetail | null;

  timeLeft: number;
  timerDuration: number;
  timerPaused: boolean;
  revealSecondsLeft: number;
  revealReason: RevealReason | null;
  autoAdvance: boolean;

  /** Who is competing this round, who has locked in, and who got it right. */
  activePlayerIds: string[];
  answeredPlayerIds: string[];
  correctPlayerIds: string[];

  /**
   * How many players picked each public option. Sent only with the reveal —
   * a live tally would tell the room where the crowd is going.
   */
  optionTallies: number[] | null;

  players: PublicPlayer[];
  bracket: BracketRound[];
  /** Pairings for the round after this one, shown at the end of a round. */
  nextRoundMatchups: Matchup[] | null;
  championId: string | null;
}

/** Messages on the host <-> broadcast channel. */
export type BroadcastMessage =
  | { type: "snapshot"; snapshot: BroadcastSnapshot }
  | { type: "host-heartbeat"; at: number; hostId: string }
  // `hostId` names the host this display is following, so a host that is not
  // being watched does not light up its BROADCAST LIVE pill. Null while the
  // display has not latched onto anyone yet.
  | { type: "broadcast-hello"; hostId?: string | null }
  | { type: "broadcast-heartbeat"; at: number; hostId?: string | null };

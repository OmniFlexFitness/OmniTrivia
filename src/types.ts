export enum GamePhase {
  START = "START",
  HOST_CONFIG = "HOST_CONFIG",
  IMPORT = "IMPORT", // Importing questions from CSV / Google Sheets
  REVIEW = "REVIEW", // New phase for reviewing questions
  JOIN = "JOIN",
  LOBBY = "LOBBY",
  CATEGORY_SELECT = "CATEGORY_SELECT",
  PLAYING = "PLAYING", // The round is live; every matchup runs at its own pace
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

/** One player's answer to the question their matchup is currently on. */
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

/**
 * Where a matchup has got to in the round it is playing.
 *
 * ANSWERING: the question is live and the lane is waiting on its players.
 * REVEAL:    the answer is up for the two players in it, nobody else.
 * DONE:      the lane has been through every question in the round.
 */
export enum LaneStatus {
  ANSWERING = "ANSWERING",
  REVEAL = "REVEAL",
  DONE = "DONE",
}

/**
 * One matchup's run through a round — its own question, its own clock, its own
 * reveal.
 *
 * This is what makes a round asynchronous: the round hands every matchup the
 * same list of questions and then stops coordinating. A pair who answer in
 * four seconds each are on question five while the pair beside them are still
 * reading question two, and neither is waiting on the other. Nothing outside a
 * lane may move it along.
 */
export interface MatchupLane {
  /** The matchup's id, or a synthetic one for a game with no bracket. */
  id: string;
  /** The bracket matchup this lane runs. Null when the game has no bracket. */
  matchupId: string | null;
  /** Both sides of the pairing — who the lane is *about*. */
  playerIds: string[];
  /**
   * Who the lane actually waits on. The same as `playerIds` except for a host
   * who has switched answering off; a lane with nobody left to answer is
   * retired rather than run through the round on an empty clock.
   */
  answeringIds: string[];
  /** Index into the round's questions. Equals the round length once DONE. */
  questionIndex: number;
  status: LaneStatus;
  /**
   * Answers indexed by question, so a finished question keeps its record for
   * the broadcast's aggregate tally. `answers[questionIndex]` is the live one.
   */
  answers: AnswerRecord[][];
  timeLeft: number;
  /**
   * How long this lane's current question was given in total. Tracked rather
   * than assumed from TIMER_DURATION because the host can add time to a single
   * lane, and its bars and rings measure against what it was actually given.
   */
  questionDuration: number;
  timerPaused: boolean;
  /** Seconds the answer stays up in this lane before it moves on. */
  revealSecondsLeft: number;
  /** Why this lane's question ended. Null while one is running. */
  revealReason: RevealReason | null;
}

export interface GameState {
  phase: GamePhase;
  mode: GameMode;
  players: Player[];
  currentPlayerId: string | null;
  isHost: boolean;
  /** The join code, and only that — the room is identified by `gameName`. */
  gamePin: string | null;
  /** What this game is called. Set by the host, shown on every screen. */
  gameName: string;

  /* --- set only in a tab that joined someone else's room --- */
  // The PIN this tab is playing in. Null unless we are a guest player.
  clientPin: string | null;
  clientPlayerId: string | null;
  joining: boolean;
  joinError: string | null;

  // Game Configuration
  totalRounds: number;
  questionsPerRound: number;
  roundsConfig: RoundConfig[]; // Store pre-generated rounds

  // Current Progress
  currentRound: number;
  /** The round's questions. Every matchup works through this same list. */
  questionsQueue: Question[];
  usedCategories: string[];
  selectedCategory: string | null;

  // Head-to-head bracket, one entry per round played so far.
  bracket: BracketRound[];
  championId: string | null;

  /**
   * One lane per matchup, drawn when the round starts and emptied when it
   * ends. This — not a single question and a single clock — is where a live
   * round's progress lives.
   */
  lanes: MatchupLane[];

  /* --- what the room sees, which trails the field rather than driving it --- */
  /**
   * The question on the projector. It is the one the slowest matchup is still
   * working on, so the big screen can never show a lane a question it has not
   * reached, and the answer only goes up once every lane is through it.
   */
  broadcastQuestionIndex: number;
  /** The answer to `broadcastQuestionIndex` is up on the projector. */
  broadcastRevealing: boolean;
  /** Seconds that answer stays up before the room's screen moves on. */
  broadcastRevealSecondsLeft: number;

  // When false the room's screen holds on each answer until the host clicks
  // through. Matchups always advance themselves — that is the point of a lane.
  autoAdvance: boolean;
  // The host plays along from their own screen for testing. Turning this off
  // takes them out of the answer count so a round does not wait on them.
  hostAnsweringEnabled: boolean;
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

/**
 * A live room, as advertised to other tabs in this browser. The registry of
 * these is what keeps two games from picking the same PIN.
 */
export interface RoomRecord {
  pin: string;
  hostId: string;
  gameName: string;
  /** Refreshed on every host heartbeat; a stale entry is a closed room. */
  updatedAt: number;
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

/**
 * One matchup's lane, as published.
 *
 * Every lane is in the snapshot because the host desk and the projector both
 * draw the whole field, and because a player's own tab has to find its lane in
 * here to know which question it is on. A lane carries its own question and —
 * only while it is revealing — its own answer.
 */
export interface PublicLane {
  id: string;
  matchupId: string | null;
  playerIds: string[];
  answeringIds: string[];
  status: LaneStatus;
  /** 1-based position in the round, clamped to the round's length. */
  questionNumber: number;
  /** How many of the round's questions this lane is through. */
  completed: number;
  question: PublicQuestion | null;
  /** Non-null only while this lane is showing its answer. */
  reveal: RevealDetail | null;
  timeLeft: number;
  timerDuration: number;
  timerPaused: boolean;
  revealSecondsLeft: number;
  revealReason: RevealReason | null;
  /** Who is in on this lane's current question. */
  answeredPlayerIds: string[];
  /** Who got it — published only once this lane is revealing. */
  correctPlayerIds: string[];
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
  gameName: string;

  roundNumber: number;
  totalRounds: number;
  category: Category | null;
  wheelSpinning: boolean;

  /* --- the room's question: the one the slowest matchup is still on --- */
  questionNumber: number;
  questionsInRound: number;
  question: PublicQuestion | null;
  /** Set once every matchup is through the room's question, and not before. */
  reveal: RevealDetail | null;
  /** Longest a lane still on the room's question has left on its clock. */
  timeLeft: number;
  timerDuration: number;
  /** Seconds the room's screen holds this answer before moving on. */
  revealSecondsLeft: number;
  autoAdvance: boolean;

  /** How many matchups are through the room's question, out of how many. */
  lanesCompleted: number;
  lanesInPlay: number;
  /** Every matchup's lane, so both the desk and the room can see the field. */
  lanes: PublicLane[];

  /** Who is competing this round, who is through the room's question, and
   * — once its answer is up — who got it right. */
  activePlayerIds: string[];
  answeredPlayerIds: string[];
  correctPlayerIds: string[];

  /**
   * How many players picked each public option, across every matchup. Sent
   * only with the reveal — a live tally would tell the room where the crowd is
   * going, and would leak to lanes that have not reached the question yet.
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
  /* --- joining a room by PIN --- */
  // "Is anyone hosting this PIN?" A host that owns it answers with room-offer;
  // silence means there is no such room, which is what stops a typo from
  // conjuring an empty room of its own.
  | { type: "room-query"; pin: string; nonce: string }
  | {
      type: "room-offer";
      pin: string;
      nonce: string;
      hostId: string;
      gameName: string;
      open: boolean;
    }
  | {
      type: "player-join";
      pin: string;
      clientId: string;
      playerId: string;
      name: string;
      avatar: string;
      avatarColor?: string;
      avatarAccessory?: string;
    }
  | {
      type: "player-join-result";
      clientId: string;
      accepted: boolean;
      reason?: string;
      hostId: string;
      gameName: string;
      pin: string;
    }
  | { type: "player-answer"; pin: string; playerId: string; answer: Answer }
  | { type: "player-leave"; pin: string; playerId: string }
  // `hostId` names the host this display is following, so a host that is not
  // being watched does not light up its BROADCAST LIVE pill. Null while the
  // display has not latched onto anyone yet.
  | { type: "broadcast-hello"; hostId?: string | null }
  | { type: "broadcast-heartbeat"; at: number; hostId?: string | null };

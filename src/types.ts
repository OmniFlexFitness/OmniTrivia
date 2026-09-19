export enum GamePhase {
  START = "START",
  HOST_CONFIG = "HOST_CONFIG",
  IMPORT = "IMPORT", // Importing questions from CSV / Google Sheets
  REVIEW = "REVIEW", // New phase for reviewing questions
  JOIN = "JOIN",
  LOBBY = "LOBBY",
  CATEGORY_SELECT = "CATEGORY_SELECT",
  PLAYING = "PLAYING", // The round is live; every match runs at its own pace
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
 * Why a question stopped *for one player*. The room is told which it was, so
 * this is recorded when it happens rather than guessed afterwards from the
 * clock.
 *
 * "answered" is the ordinary case: a player locks an answer in and their
 * question closes there and then, whatever their opponent is doing.
 */
export type RevealReason = "answered" | "time" | "host";

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

/** One player's answer to the question their match is currently on. */
export interface AnswerRecord {
  playerId: string;
  answer: Answer;
  isCorrect: boolean;
  points: number;
  /** Seconds left on their own clock when they locked it in — the time bonus. */
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
 * Where one player has got to in the round.
 *
 * ANSWERING: their question is live and their own clock is running.
 * REVEAL:    they are looking at the answer to the question they just closed.
 * DONE:      they are through every question in the round.
 */
export enum LaneStatus {
  ANSWERING = "ANSWERING",
  REVEAL = "REVEAL",
  DONE = "DONE",
}

/**
 * One player's seat in a match: their question, their clock, their reveal.
 *
 * This is the unit the whole round now moves in. A player who answers in three
 * seconds sees the answer immediately and is on the next question while the
 * person they are playing is still reading the last one — nothing waits on
 * anyone else, because speed is worth points and a fast answer should buy a
 * head start rather than a pause.
 */
export interface LaneSeat {
  playerId: string;
  /** Index into the round's questions. Equals the round length once DONE. */
  questionIndex: number;
  status: LaneStatus;
  timeLeft: number;
  /**
   * How long this seat's current question was given in total. Tracked rather
   * than assumed from TIMER_DURATION because the host can add time, and the
   * bars and rings measure against what the player was actually given.
   */
  questionDuration: number;
  timerPaused: boolean;
  /**
   * Seconds the answer stays up before this seat moves on by itself. A player
   * who has read it can skip the rest of that wait and take the next question
   * straight away.
   */
  revealSecondsLeft: number;
  /** Why this seat's question ended. Null while one is running. */
  revealReason: RevealReason | null;
}

/**
 * One match: the two players of a matchup working through the round's
 * questions.
 *
 * A match is a container, not a clock. Everything that ticks lives on the
 * seats inside it, so the two players in a matchup are never waiting on each
 * other — they are compared on the points they finish the round with, not on
 * the pace they got there at. Nothing outside a seat may move that seat along.
 */
export interface MatchupLane {
  /** The matchup's id, or a synthetic one for a game with no bracket. */
  id: string;
  /** The bracket matchup this match plays out. Null when there is no bracket. */
  matchupId: string | null;
  /** Both sides of the pairing — who the match is *about*. */
  playerIds: string[];
  /**
   * Who the match actually waits on. The same as `playerIds` except for a host
   * who has switched answering off; a match with nobody left to answer is
   * retired rather than run through the round on an empty clock.
   */
  answeringIds: string[];
  /** One seat per answering player. This is where the round actually runs. */
  seats: LaneSeat[];
  /**
   * Answers indexed by question, so a finished question keeps its record for
   * the broadcast's aggregate tally. Both players' answers to one question sit
   * in the same bucket even though they arrived at it at different times.
   */
  answers: AnswerRecord[][];
}

/**
 * One category people can be asked to vote on, and the pool they are drawn
 * from. The pool is the host's own list — editable, and separate from the
 * categories a given game happens to have loaded.
 */
export interface CategoryPoll {
  /** New for every poll, so a stale vote from the last round cannot land. */
  id: string;
  roundNumber: number;
  /** Drawn once, by the host, and published — so the whole room sees the same
   * four options rather than four rooms' worth of different ones. */
  options: Category[];
  /** playerId -> category id. One vote each, changeable while the poll is up. */
  votes: Record<string, string>;
}

/** How many people have liked one category in this game. */
export interface CategoryLikeTally {
  category: Category;
  playerIds: string[];
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
  /** The round's questions. Every match works through this same list. */
  questionsQueue: Question[];
  usedCategories: string[];
  selectedCategory: string | null;

  // Head-to-head bracket, one entry per round played so far.
  bracket: BracketRound[];
  championId: string | null;

  /**
   * One match per matchup, drawn when the round starts and emptied when it
   * ends. This — not a single question and a single clock — is where a live
   * round's progress lives.
   */
  lanes: MatchupLane[];

  /* --- what the room sees, which trails the field rather than driving it --- */
  /**
   * The question on the projector. It is the one the slowest player is still
   * working on, so the big screen can never show anyone a question they have
   * not reached, and the answer only goes up once every player is through it.
   */
  broadcastQuestionIndex: number;
  /** The answer to `broadcastQuestionIndex` is up on the projector. */
  broadcastRevealing: boolean;
  /** Seconds that answer stays up before the room's screen moves on. */
  broadcastRevealSecondsLeft: number;

  // When false the room's screen holds on each answer until the host clicks
  // through. Players always advance themselves — that is the point of a seat.
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

  /** Who has liked which category in this game. Totals are kept on disk too. */
  categoryLikes: CategoryLikeTally[];
  /** The end-of-round vote on what to play in future, while one is open. */
  categoryPoll: CategoryPoll | null;

  loading: boolean;
  error: string | null;
  // Set when a round fell back to placeholder questions so the host is warned
  // before starting a game in front of a room.
  contentWarning: string | null;
  // Pre-filled from a ?pin= query param so QR-code links skip manual entry.
  initialPin: string | null;
  // Set when the room was opened but could not be carried to other devices, so
  // the host learns that phones cannot join *before* the room tries to.
  roomWarning: string | null;
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
 * One player's seat, as published. This is what a player's own phone renders:
 * their question, their clock, and — only once they have closed it — their
 * answer.
 */
export interface PublicSeat {
  playerId: string;
  status: LaneStatus;
  /** 1-based position in the round, clamped to the round's length. */
  questionNumber: number;
  /** How many of the round's questions this player is through. */
  completed: number;
  question: PublicQuestion | null;
  /** Non-null only while this player is looking at their own answer. */
  reveal: RevealDetail | null;
  /** They are in on the question they are currently on. */
  answered: boolean;
  /** Whether they got it — published only once they are past the question. */
  wasCorrect: boolean | null;
  /** Points their last closed question earned them. */
  lastPoints: number | null;
  timeLeft: number;
  timerDuration: number;
  timerPaused: boolean;
  revealSecondsLeft: number;
  revealReason: RevealReason | null;
}

/**
 * One match, as published.
 *
 * Every match is in the snapshot because the host desk and the projector both
 * draw the whole field, and because a player's own tab has to find their seat
 * in here to know which question they are on.
 */
export interface PublicLane {
  id: string;
  matchupId: string | null;
  playerIds: string[];
  answeringIds: string[];
  /** The match as a whole: ANSWERING until every seat in it is through. */
  status: LaneStatus;
  /** Where the slower of the two players is, 1-based. */
  questionNumber: number;
  /** Questions both players are through. */
  completed: number;
  seats: PublicSeat[];
}

/** One category's likes, as the room sees them. */
export interface PublicCategoryLike {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  count: number;
  /** So a phone can show whether this player is one of them. */
  playerIds: string[];
}

/** The end-of-round vote on what to play next, as the room sees it. */
export interface PublicCategoryPoll {
  id: string;
  roundNumber: number;
  options: Category[];
  /** category id -> votes. */
  tallies: Record<string, number>;
  /** playerId -> category id, so a phone can show its own pick. */
  votes: Record<string, string>;
  totalVotes: number;
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

  /* --- the room's question: the one the slowest player is still on --- */
  questionNumber: number;
  questionsInRound: number;
  question: PublicQuestion | null;
  /** Set once every player is through the room's question, and not before. */
  reveal: RevealDetail | null;
  /** Longest a player still on the room's question has left on their clock. */
  timeLeft: number;
  timerDuration: number;
  /** Seconds the room's screen holds this answer before moving on. */
  revealSecondsLeft: number;
  autoAdvance: boolean;

  /** How many matches are through the room's question, out of how many. */
  lanesCompleted: number;
  lanesInPlay: number;
  /** Every match, so both the desk and the room can see the field. */
  lanes: PublicLane[];

  /** Who is competing this round, who is through the room's question, and
   * — once its answer is up — who got it right. */
  activePlayerIds: string[];
  answeredPlayerIds: string[];
  correctPlayerIds: string[];

  /**
   * How many players picked each public option, across every match. Sent
   * only with the reveal — a live tally would tell the room where the crowd is
   * going, and would leak to players who have not reached the question yet.
   */
  optionTallies: number[] | null;

  players: PublicPlayer[];
  bracket: BracketRound[];
  /** Pairings for the round after this one, shown at the end of a round. */
  nextRoundMatchups: Matchup[] | null;
  championId: string | null;

  /** Likes on the categories this game has played. */
  categoryLikes: PublicCategoryLike[];
  /** The vote on what to play in future, open at the end of a round. */
  categoryPoll: PublicCategoryPoll | null;
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
  // "I have read the answer, give me the next question." A player never has to
  // sit through the rest of their own reveal.
  | { type: "player-advance"; pin: string; playerId: string }
  | {
      type: "category-like";
      pin: string;
      playerId: string;
      categoryId: string;
      liked: boolean;
    }
  | {
      type: "category-vote";
      pin: string;
      playerId: string;
      pollId: string;
      categoryId: string;
    }
  | { type: "player-leave"; pin: string; playerId: string }
  // `hostId` names the host this display is following, so a host that is not
  // being watched does not light up its BROADCAST LIVE pill. Null while the
  // display has not latched onto anyone yet.
  | { type: "broadcast-hello"; hostId?: string | null }
  | { type: "broadcast-heartbeat"; at: number; hostId?: string | null };

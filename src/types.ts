export enum GamePhase {
  START = "START",
  HOST_CONFIG = "HOST_CONFIG",
  IMPORT = "IMPORT", // Importing questions from CSV / Google Sheets
  // Choosing which of an imported file's categories to play, and how much
  // of each. A file is usually a library rather than a game.
  IMPORT_SELECT = "IMPORT_SELECT",
  REVIEW = "REVIEW", // New phase for reviewing questions
  JOIN = "JOIN",
  /** The host is coming back to a game they were already running. */
  HOST_RESUME = "HOST_RESUME",
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
  /**
   * `playerProof` of the rejoin code this player chose when they joined.
   *
   * Host-side only, and deliberately absent from `PublicPlayer`: it is what
   * lets this seat be handed back to whoever can produce the code, so putting
   * it on the snapshot every device renders would hand it to everybody.
   */
  rejoinProof?: string;
  /**
   * The rejoin code itself, so the host can read it back to a player who has
   * forgotten it. Host-side only, like the proof: it is kept on the seat,
   * saved with the host's copy of the game, and never put on the snapshot.
   */
  rejoinCode?: string;
  lastAnswerCorrect?: boolean;
  streak: number;
  // Knocked out of the bracket. Eliminated players stay on the leaderboard and
  // keep their score, they just stop being matched up.
  eliminated?: boolean;
  /**
   * Lost once, and still alive in the loser's bracket. Only ever set in a game
   * the host opened with a loser's bracket; a second loss is `eliminated`.
   */
  losersBracket?: boolean;
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
 * Which half of a double-elimination bracket a matchup belongs to.
 *
 * "winners" is everybody who has not lost yet — and the whole bracket when the
 * game has no loser's bracket. "losers" is everybody who has lost exactly once.
 * "final" is the one matchup between the last player standing on each side.
 */
export type BracketSide = "winners" | "losers" | "final";

/**
 * One head-to-head pairing for a single round. `playerBId` is null for the odd
 * player out, who advances on a bye.
 */
export interface Matchup {
  id: string;
  roundNumber: number;
  /**
   * Which bracket this matchup is played in. Absent on anything written before
   * the loser's bracket existed, which read as "winners" — every matchup was.
   */
  bracket?: BracketSide;
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
  /**
   * The headline on the big screen while the room is joining. Defaults to
   * "Trivia"; the host can change it. `{date}` is replaced with today's date.
   */
  broadcastTitle: string;
  /** The line under it. Defaults to "Elevate · {date}". */
  broadcastSubtitle: string;
  /** What this game is called. Set by the host, shown on every screen. */
  gameName: string;
  /**
   * The password that gets this game back.
   *
   * Set when the game is opened and held only for as long as this window is
   * showing it, so the host can write it down. Nothing persists it in the
   * clear: what is stored, here and in the room, is `hostProof` of it.
   * Empty in a window that resumed a game rather than opening it — a
   * returning host typed the password, they do not need telling what it was.
   */
  hostPassword: string;

  /* --- set only in a tab that joined someone else's room --- */
  // The PIN this tab is playing in. Null unless we are a guest player.
  clientPin: string | null;
  clientPlayerId: string | null;
  joining: boolean;
  joinError: string | null;

  /* --- set only while a host is taking a game back --- */
  /** A reclaim is in flight: the PIN and password have gone off to the room. */
  resuming: boolean;
  resumeError: string | null;

  // Game Configuration
  totalRounds: number;
  questionsPerRound: number;
  roundsConfig: RoundConfig[]; // Store pre-generated rounds
  /**
   * Everything an import parsed, before the host has said how much of it to
   * play. Kept separate from `roundsConfig` so the trimming screen can offer
   * the whole file back — including the categories and questions that were cut
   * — without the game itself ever carrying more than it will use.
   *
   * Null outside the import flow.
   */
  importPreview: CategoryContent[] | null;

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
  /**
   * Double elimination: a first loss drops a player into the loser's bracket
   * instead of out of the game, and the last player on each side meets in a
   * grand final. Chosen at setup and fixed once the first round is drawn.
   */
  losersBracket: boolean;
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
  losersBracket?: boolean;
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

/** One question of a finished round, with its answer, for the review. */
export interface RoundReviewItem {
  question: PublicQuestion;
  reveal: RevealDetail;
  /** How many of the players who answered it got it right. */
  correctCount: number;
  answeredCount: number;
  /** Picks per public option — multiple choice and true/false only. */
  optionTallies: number[] | null;
}

/** Everything a screen needs to show an answer, sent only once it is due. */
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
 * How one player did on one question, published only once their match is
 * over. Until then nobody — not the player, not the room — is told whether an
 * answer was right.
 */
export interface SeatResult {
  /** They locked something in before their clock ran out. */
  answered: boolean;
  correct: boolean;
  points: number;
  /** What they gave, so the end-of-round review can show it beside the key. */
  answer: Answer | null;
}

/**
 * One player's seat, as published. This is what a player's own phone renders:
 * their question and their clock — and, once the match is over, how they did.
 *
 * Nothing on a seat says whether an answer was right while the match is still
 * being played. A player finds out at the end, all at once.
 */
export interface PublicSeat {
  playerId: string;
  status: LaneStatus;
  /** 1-based position in the round, clamped to the round's length. */
  questionNumber: number;
  /** How many of the round's questions this player is through. */
  completed: number;
  question: PublicQuestion | null;
  /** They are in on the question they are currently on. */
  answered: boolean;
  /**
   * One entry per question in the round, published once *both* players in
   * the match are through it — the end of the match. Null before that.
   */
  results: SeatResult[] | null;
  /** Points this round, published with `results` and not before. */
  roundPoints: number | null;
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
  /** The big screen's headline and the line under it, as the host set them. */
  broadcastTitle: string;
  broadcastSubtitle: string;

  roundNumber: number;
  totalRounds: number;
  /** The game runs a loser's bracket, so a first loss is not the end. */
  losersBracket: boolean;
  /**
   * The host's own seat is in the answer count. A host running the room from
   * a remote usually switches it off, and the remote needs to show which way
   * it is set.
   */
  hostAnswering: boolean;
  category: Category | null;
  wheelSpinning: boolean;
  /**
   * The slices on the wheel: every category still to be played.
   *
   * Sent so the room's screen and the players' phones can turn the same wheel
   * the host is turning, rather than watching an emoji. Which slice the spin
   * lands on is *not* in here — that is `category`, and it is published only
   * once the wheel has stopped.
   */
  wheelSlices: Category[];

  /* --- the room's question: the one the slowest player is still on --- */
  questionNumber: number;
  questionsInRound: number;
  question: PublicQuestion | null;
  /**
   * Every player is through the room's question. The screen says so — and
   * nothing more: the answer waits for the end of the round.
   */
  roomLockedIn: boolean;
  /** Longest a player still on the room's question has left on their clock. */
  timeLeft: number;
  timerDuration: number;
  /** Seconds the room's screen holds on a finished question before moving on. */
  revealSecondsLeft: number;
  autoAdvance: boolean;

  /** How many matches are through the room's question, out of how many. */
  lanesCompleted: number;
  lanesInPlay: number;
  /** Every match, so both the desk and the room can see the field. */
  lanes: PublicLane[];

  /** Who is competing this round, and who is locked in on the room's
   * question. Never who got it right — that is for the end of the round. */
  activePlayerIds: string[];
  answeredPlayerIds: string[];

  /**
   * The round's answer key, published once the round is over and not a
   * moment before: every question, its answer, and how the room did on it.
   */
  roundReview: RoundReviewItem[] | null;

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

/**
 * One thing a host's remote can ask the host window to do.
 *
 * Every one of these is a button the host already has on their own desk; the
 * remote is a second set of hands on the same game, not a second game. They
 * carry the value to set rather than "toggle", and the round they were
 * pressed in, so a tap sent from a screen a beat behind cannot flip a setting
 * back or skip a round nobody meant to skip.
 */
export type RemoteCommand =
  | { kind: "start-game" }
  | { kind: "add-bot" }
  | { kind: "set-losers-bracket"; enabled: boolean }
  | { kind: "spin"; round: number }
  | { kind: "start-round"; round: number }
  | { kind: "pause-all"; paused: boolean }
  | { kind: "add-time-all"; seconds: number }
  | { kind: "close-all" }
  | { kind: "lane-pause"; laneId: string; paused: boolean }
  | { kind: "lane-add-time"; laneId: string; seconds: number }
  | { kind: "lane-close"; laneId: string }
  | { kind: "advance-room" }
  | { kind: "end-round"; round: number }
  | { kind: "set-auto-advance"; enabled: boolean }
  | { kind: "set-host-answering"; enabled: boolean }
  | { kind: "next-round"; round: number }
  | { kind: "redraw-ballot" }
  | { kind: "play-again" };

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
      /**
       * `playerProof` of this player's rejoin code. On a first join it is what
       * the host stores against the seat; on a later one it is what gets them
       * back into it from a device that has nothing else to show.
       */
      rejoinProof?: string;
      /**
       * The code itself, so the host can read it back to a player who forgot
       * it. It adds nothing a watcher could use that the proof beside it does
       * not already give them, and the host only keeps it when it matches.
       */
      rejoinCode?: string;
    }
  | {
      type: "player-join-result";
      clientId: string;
      accepted: boolean;
      reason?: string;
      hostId: string;
      gameName: string;
      pin: string;
      /**
       * The seat the host actually sat them in. A player coming back with
       * their code is put back into the seat they already had, which is not
       * the player id the returning device generated for itself.
       */
      playerId?: string;
      /** True when this was a seat handed back rather than a new one opened. */
      rejoined?: boolean;
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
  /**
   * A host has taken this room back — possibly on a device that has never seen
   * it, and so with no idea which phone holds which seat. Every player tab
   * answers by asking for its seat again, which is what re-binds them and gets
   * their answers accepted rather than quietly dropped.
   */
  | { type: "host-reclaimed"; pin: string; hostId: string }
  // `hostId` names the host this display is following, so a host that is not
  // being watched does not light up its BROADCAST LIVE pill. Null while the
  // display has not latched onto anyone yet.
  /* --- the host's remote: a tablet running the round from the floor --- */
  /**
   * "I am the host, on another device." `signature` is `remoteSignature` of
   * the host password's proof, bound to this device's signed-in identity —
   * never the proof itself, which anybody reading the bus could reuse.
   */
  | {
      type: "remote-hello";
      pin: string;
      controllerId: string;
      label: string;
      signature: string;
    }
  | { type: "remote-welcome"; pin: string; controllerId: string; hostId: string }
  /**
   * "password": the signature does not match this game's host password.
   * "unbound": this host window does not know the remote — it reloaded, or
   * the game was taken back on another device — and it should say hello again.
   */
  | {
      type: "remote-rejected";
      pin: string;
      controllerId: string;
      reason: "password" | "unbound";
    }
  | { type: "remote-heartbeat"; pin: string; controllerId: string }
  | {
      type: "remote-command";
      pin: string;
      controllerId: string;
      commandId: string;
      command: RemoteCommand;
    }
  | {
      type: "remote-ack";
      pin: string;
      controllerId: string;
      commandId: string;
      ok: boolean;
      /** Why a command was not carried out, in words for the remote's screen. */
      reason?: string;
    }
  | { type: "broadcast-hello"; hostId?: string | null }
  | { type: "broadcast-heartbeat"; at: number; hostId?: string | null };

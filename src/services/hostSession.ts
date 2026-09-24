import { GamePhase, GameState } from "../types";

/**
 * The game a host can come back to.
 *
 * The host window *is* the game: the questions, the scores, the bracket and
 * every clock in the round live in its React state, and the room is claimed by
 * the device it runs on. So a host who closed the tab, hit back, or let a
 * laptop sleep used to lose the night — the room went with the window and
 * there was no door back in.
 *
 * Two things fix that. `proof.ts` holds the first: a password named when the
 * game is opened, which is what lets a device that has never seen this game be
 * trusted with it. This holds the second: a copy of everything durable about
 * the running game, kept on the host's machine and — when multiplayer is
 * configured — in the room itself, where only the host or a device that has
 * proved the password may read it. The answers are in there, so "only those
 * two" is the whole point.
 *
 * `src/services/seat.ts` is the same idea for a player's seat. This is the
 * host's, and it has to carry the game rather than just a name and an avatar.
 */

const SESSION_KEY = "omnitrivia:host-session";

/**
 * How long a game can sit abandoned and still be picked back up. Long enough
 * to cover a host sorting out a dead laptop mid-round, short enough that
 * tonight's PIN is not still reserved tomorrow.
 *
 * The same window is written into `firebase/database.rules.json`, which is
 * what lets any device reap a room nobody came back for.
 */
export const HOST_RESUME_TTL_MS = 30 * 60 * 1000;

/**
 * The part of the game worth keeping.
 *
 * Deliberately a whitelist rather than the whole of `GameState`: the transient
 * fields (a spinner, an error, whether a join is in flight) belong to the
 * window that was showing them, and restoring them would bring somebody
 * else's half-finished moment back with the game.
 */
export type PersistedHostState = Pick<
  GameState,
  | "phase"
  | "mode"
  | "players"
  | "currentPlayerId"
  | "gamePin"
  | "gameName"
  | "totalRounds"
  | "questionsPerRound"
  | "roundsConfig"
  | "currentRound"
  | "questionsQueue"
  | "usedCategories"
  | "selectedCategory"
  | "bracket"
  | "championId"
  | "lanes"
  | "broadcastQuestionIndex"
  | "broadcastRevealing"
  | "broadcastRevealSecondsLeft"
  | "autoAdvance"
  | "losersBracket"
  | "hostAnsweringEnabled"
  | "wheelSpinning"
  | "categoryRevealed"
  | "categoryLikes"
  | "categoryPoll"
  | "contentWarning"
>;

/**
 * The copy of the game the room holds.
 *
 * The seat bindings ride along with it because they are not part of the game
 * state and a host resuming on a *different* device has no other way to know
 * them: without them every phone in the room would be a device speaking for a
 * seat it cannot prove, and every answer would be dropped on the floor.
 */
export interface HostStateEnvelope {
  state: PersistedHostState;
  seats: [string, string][];
}

/** A game the host can come back to, and what it takes to prove they may. */
export interface HostSession {
  pin: string;
  /**
   * The id this host window published under. Restoring it means a projector
   * window that is still open keeps following the game rather than having to
   * be re-opened and re-latched.
   */
  hostId: string;
  /** `hostProof` of the password. The password itself is never written down. */
  proof: string;
  /**
   * Which device holds which seat, so players who joined from a phone keep
   * being allowed to answer for themselves after the host comes back.
   */
  seats: [string, string][];
  state: PersistedHostState;
  at: number;
}

/** Phases that are a game in progress rather than a host still setting one up. */
const RESUMABLE_PHASES = new Set<GamePhase>([
  GamePhase.LOBBY,
  GamePhase.CATEGORY_SELECT,
  GamePhase.PLAYING,
  GamePhase.ROUND_END,
  GamePhase.GAME_OVER,
]);

export const isResumablePhase = (phase: GamePhase): boolean =>
  RESUMABLE_PHASES.has(phase);

/** The durable half of the live game. */
export const captureHostState = (state: GameState): PersistedHostState => ({
  phase: state.phase,
  mode: state.mode,
  players: state.players,
  currentPlayerId: state.currentPlayerId,
  gamePin: state.gamePin,
  gameName: state.gameName,
  totalRounds: state.totalRounds,
  questionsPerRound: state.questionsPerRound,
  roundsConfig: state.roundsConfig,
  currentRound: state.currentRound,
  questionsQueue: state.questionsQueue,
  usedCategories: state.usedCategories,
  selectedCategory: state.selectedCategory,
  bracket: state.bracket,
  championId: state.championId,
  lanes: state.lanes,
  broadcastQuestionIndex: state.broadcastQuestionIndex,
  broadcastRevealing: state.broadcastRevealing,
  broadcastRevealSecondsLeft: state.broadcastRevealSecondsLeft,
  autoAdvance: state.autoAdvance,
  losersBracket: state.losersBracket,
  hostAnsweringEnabled: state.hostAnsweringEnabled,
  wheelSpinning: state.wheelSpinning,
  categoryRevealed: state.categoryRevealed,
  categoryLikes: state.categoryLikes,
  categoryPoll: state.categoryPoll,
  contentWarning: state.contentWarning,
});

/**
 * Whether a blob read back off a disk or out of the database is a game.
 *
 * Both sources are outside this window's control — an old build's format, a
 * half-written record, a room somebody else wrote into — and a malformed
 * restore would take the host's screen down with it.
 */
export const isHostState = (value: unknown): value is PersistedHostState => {
  const state = value as PersistedHostState | null;
  return Boolean(
    state &&
      typeof state === "object" &&
      typeof state.phase === "string" &&
      isResumablePhase(state.phase) &&
      Array.isArray(state.players) &&
      Array.isArray(state.roundsConfig) &&
      Array.isArray(state.questionsQueue) &&
      Array.isArray(state.lanes) &&
      Array.isArray(state.bracket) &&
      Array.isArray(state.categoryLikes) &&
      typeof state.currentRound === "number",
  );
};

/** A copy read back out of the room, if it is one. */
export const parseHostEnvelope = (
  payload?: string | null,
): HostStateEnvelope | null => {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<HostStateEnvelope>;
    if (!isHostState(parsed?.state)) return null;

    return {
      state: parsed.state,
      seats: Array.isArray(parsed.seats) ? parsed.seats : [],
    };
  } catch {
    return null;
  }
};

/** The game, put back together around the state the window already has. */
export const applyHostState = (
  previous: GameState,
  state: PersistedHostState,
  pin: string,
): GameState => ({
  ...previous,
  ...state,
  // A game saved before the loser's bracket existed was single elimination.
  losersBracket: state.losersBracket === true,
  gamePin: pin,
  isHost: true,
  // Whatever this window was before it became the host again.
  clientPin: null,
  clientPlayerId: null,
  joining: false,
  joinError: null,
  resuming: false,
  resumeError: null,
  loading: false,
  error: null,
  roomWarning: null,
});

export const saveHostSession = (session: Omit<HostSession, "at">): void => {
  try {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, at: Date.now() }),
    );
  } catch {
    // Private mode or a full quota. The room's own copy is the other way back.
  }
};

/**
 * The game this browser was hosting, if it still holds one.
 *
 * `pin` narrows it to a particular game; without one this answers "what was
 * this browser hosting", which is what pre-fills the PIN on the way back in.
 */
export const readHostSession = (pin?: string | null): HostSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as HostSession;
    if (typeof session?.pin !== "string" || typeof session.at !== "number") {
      return null;
    }
    if (pin && session.pin !== pin) return null;
    if (Date.now() - session.at > HOST_RESUME_TTL_MS) return null;
    if (!isHostState(session.state)) return null;

    return { ...session, seats: Array.isArray(session.seats) ? session.seats : [] };
  } catch {
    return null;
  }
};

export const clearHostSession = (): void => {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clean up.
  }
};

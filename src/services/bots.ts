import { GamePhase, GameState } from "../types";
import { buildFirstRound } from "./bracket";

/**
 * Whether a game has bots in it.
 *
 * Bots are how a host tests a bracket alone: the lobby seats a couple on its
 * own until there are three players, and ADD BOT seats more. On a real night
 * with a real room they are opponents nobody asked for, so the host can turn
 * them off — while setting the game up, in the lobby, or right up until the
 * first round is dealt.
 *
 * After that the bracket has been played on, and taking a player out of it
 * would rewrite who beat whom, so the setting is fixed.
 */

const PREFERENCE_KEY = "omnitrivia:bots-enabled";

/** Phases before a lobby exists: the setting is only a preference yet. */
const SETUP_PHASES = new Set<GamePhase>([
  GamePhase.START,
  GamePhase.HOST_CONFIG,
  GamePhase.IMPORT,
  GamePhase.IMPORT_SELECT,
  GamePhase.REVIEW,
]);

/**
 * Round one's wheel, before START ROUND: the draw has been made and shown, but
 * nobody has answered anything, so it can still be made again without them.
 */
const beforeFirstRound = (state: GameState): boolean =>
  state.phase === GamePhase.CATEGORY_SELECT && state.currentRound === 1;

/** Whether the host can still change it. */
export const botsSettingOpen = (state: GameState): boolean =>
  SETUP_PHASES.has(state.phase) ||
  state.phase === GamePhase.LOBBY ||
  beforeFirstRound(state);

/**
 * Turn bots on or off.
 *
 * Off takes every bot out of the game. On round one's wheel it also redraws
 * the first round without them, because a matchup against a player who is no
 * longer there is a free win for whoever drew them — and a bye goes to
 * whoever the fresh draw leaves over, not to them.
 *
 * On adds nobody by itself: bots join in the lobby, and once the lobby has
 * closed there is no seat to put one in.
 */
export const applyBotsSetting = (state: GameState, enabled: boolean): GameState => {
  if (!botsSettingOpen(state)) return state;
  if (enabled || !state.players.some((player) => player.isBot)) {
    return { ...state, botsEnabled: enabled };
  }

  const players = state.players.filter((player) => !player.isBot);
  const redraw = beforeFirstRound(state);

  return {
    ...state,
    botsEnabled: false,
    players,
    bracket: redraw
      ? players.length >= 2
        ? [buildFirstRound(players)]
        : []
      : state.bracket,
  };
};

/** What this host chose last time. Bots stay on unless they turned them off. */
export const readBotsPreference = (): boolean => {
  try {
    return window.localStorage.getItem(PREFERENCE_KEY) !== "0";
  } catch {
    return true;
  }
};

export const saveBotsPreference = (enabled: boolean): void => {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, enabled ? "1" : "0");
  } catch {
    // Private mode: the setting still applies to this game.
  }
};

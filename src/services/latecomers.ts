import { GamePhase, GameState, Player } from "../types";
import { buildFirstRound, enterRound, openingOptions } from "./bracket";

/**
 * Somebody who turns up after START GAME.
 *
 * The door stays open for the whole night: the QR code stays on the big
 * screen, a phone that scans it gets a seat, and that seat waits on the bench
 * — in the room, out of the field — until the host deals them in or turns
 * them away from their own screen. Nobody else sees them until then, so the
 * decision is the host's alone and the room is never asked to wait on it.
 *
 * Kept here, pure, so every rule below can be checked without a room
 * (`npm run check-hosting`).
 */

/**
 * Whether somebody new can still get a seat: the lobby, or a game that is
 * running. A latecomer is benched until the host deals them in, so letting
 * them in costs the room nothing — and turning them away cost the host a
 * round of explaining. A finished game takes nobody.
 */
export const acceptsLatecomers = (state: Pick<GameState, "phase">): boolean =>
  state.phase === GamePhase.CATEGORY_SELECT ||
  state.phase === GamePhase.PLAYING ||
  state.phase === GamePhase.ROUND_END;

export const takesNewPlayers = (state: Pick<GameState, "phase">): boolean =>
  state.phase === GamePhase.LOBBY || acceptsLatecomers(state);

/** Waiting on the host: on the bench, and not yet dealt in. */
export const awaitingHost = (player: Pick<Player, "benched" | "entering">): boolean =>
  Boolean(player.benched && !player.entering);

/**
 * Round one's wheel, before START ROUND. The draw on the screen is a random
 * one nobody has played a question of, so it can be made again with whoever
 * has just been dealt in — which is what makes the matchups the ones the
 * round is actually started with, not the ones START GAME happened to make.
 */
const openingDrawOpen = (state: GameState): boolean =>
  state.phase === GamePhase.CATEGORY_SELECT && state.currentRound === 1;

/**
 * Draw round one again from everybody in the field.
 *
 * A latecomer slotted into the old draw would have taken whatever seat was
 * left — the bye, or a matchup on their own — and two of them would only
 * ever have met each other. A fresh draw mixes them in like anybody who was
 * on time. A field still under two has no bracket, the same as START GAME.
 */
const redrawOpening = (state: GameState): GameState => {
  const field = state.players.filter((player) => !player.benched);
  return {
    ...state,
    bracket: field.length >= 2 ? [buildFirstRound(field, openingOptions(state))] : [],
  };
};

/**
 * Deal one player in, or say why not.
 *
 * Who it is for: a latecomer on the bench, or a player knocked out of the
 * bracket. Where they land depends on where the game is:
 *
 * - **Round one's wheel** — the opening draw is made again with them in it.
 * - **Between later rounds** (the wheel is up, or the round has just ended
 *   and the next draw is on the screen) they go straight into that draw.
 * - **During a round** they are marked as entering and go into the next
 *   draw the moment it is made, so the round in play is not disturbed.
 * - **A game with no bracket** — one player, until now — simply takes them,
 *   and on round one's wheel that is a bracket for the first time.
 */
export const admit = (
  prev: GameState,
  playerId: string,
): { state: GameState; reason: string | null } => {
  const player = prev.players.find((p) => p.id === playerId);
  if (!player) return { state: prev, reason: "That player has left the game." };
  if (player.entering) {
    return { state: prev, reason: `${player.name} is already in from the next round.` };
  }
  if (!player.benched && !player.eliminated) {
    return { state: prev, reason: `${player.name} is already in the field.` };
  }

  const patch = (changes: Partial<Player>, bracket = prev.bracket): GameState => ({
    ...prev,
    bracket,
    players: prev.players.map((p) => (p.id === playerId ? { ...p, ...changes } : p)),
  });
  const intoField = { benched: false, entering: false, eliminated: false, losersBracket: false };

  // Checked before "no bracket": a solo game on round one's wheel becomes a
  // real one the moment a second player is dealt in.
  if (openingDrawOpen(prev)) {
    return { state: redrawOpening(patch(intoField)), reason: null };
  }

  if (prev.phase === GamePhase.LOBBY || prev.bracket.length === 0) {
    return { state: patch(intoField), reason: null };
  }

  if (prev.phase === GamePhase.PLAYING) {
    return { state: patch({ entering: true }), reason: null };
  }

  const roundIndex =
    prev.phase === GamePhase.CATEGORY_SELECT
      ? prev.currentRound - 1
      : prev.phase === GamePhase.ROUND_END
        ? prev.currentRound
        : -1;
  const round = roundIndex >= 0 ? prev.bracket[roundIndex] : undefined;
  if (!round) {
    return {
      state: prev,
      reason:
        prev.phase === GamePhase.ROUND_END
          ? "There is no next round to deal them into."
          : "The game is over.",
    };
  }

  const result = enterRound(round, player, prev.losersBracket);
  if (!result) {
    return {
      state: prev,
      reason: `The final is set — ${player.name} stays on the Redemption Table.`,
    };
  }

  const bracket = [...prev.bracket];
  bracket[roundIndex] = result.round;
  return { state: patch(result.player, bracket), reason: null };
};

/**
 * Deal in everybody waiting on the bench, in the order they arrived. On round
 * one's wheel each one redraws the field, so the draw left on the screen is a
 * fresh one with all of them in it.
 */
export const admitAll = (prev: GameState): GameState =>
  prev.players
    .filter(awaitingHost)
    .reduce((next, player) => admit(next, player.id).state, prev);

/**
 * Turn a latecomer away: their seat is taken out of the game before they were
 * ever in it. Only somebody still waiting on the bench — a player the host
 * has dealt in is in the draw, and taking them out of it is a different
 * decision with a bracket attached.
 *
 * Their phone sees itself gone from the next snapshot and says so. Scanning
 * again asks again; nothing about them is kept.
 */
export const turnAway = (
  prev: GameState,
  playerId: string,
): { state: GameState; reason: string | null } => {
  const player = prev.players.find((p) => p.id === playerId);
  if (!player) return { state: prev, reason: "That player has already left." };
  if (!awaitingHost(player)) {
    return {
      state: prev,
      reason: player.entering
        ? `${player.name} is already dealt in for the next round.`
        : `${player.name} is already playing.`,
    };
  }
  return {
    state: { ...prev, players: prev.players.filter((p) => p.id !== playerId) },
    reason: null,
  };
};

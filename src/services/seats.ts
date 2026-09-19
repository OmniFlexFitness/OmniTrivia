import type { Player } from "../types";
import type { MessageMeta } from "./remoteRoom";

/**
 * Which device holds which seat, and whether a message may speak for one.
 *
 * Every message names the player it speaks for, and player ids are on every
 * snapshot the room can read — so the name alone proves nothing. What cannot
 * be forged is the sender's signed-in identity: the database stamps it and the
 * rules pin it to the real one. Binding a seat to that identity when it is
 * claimed, and checking it on everything after, is what stops someone who
 * knows the PIN from answering, or quitting, as another player.
 */
export type SeatBindings = Map<string, string>;

/**
 * Whether `meta` may act as `playerId`.
 *
 * No `meta` means the message came over the local bus — another window of the
 * host's own browser — which is trusted exactly as it was before there was a
 * network at all. From a device, the seat must have been claimed by that same
 * device: an unclaimed seat cannot be spoken for, which is what keeps a
 * stranger from answering as the host or as a bot.
 */
export const maySpeakFor = (
  seats: SeatBindings,
  playerId: string,
  meta?: MessageMeta,
): boolean => {
  if (!meta) return true;
  return seats.get(playerId) === meta.uid;
};

/**
 * Whether a seat is already held by a different device.
 *
 * A seat with no holder is free, and one held by the device asking for it is a
 * player coming back — a reload, or a phone waking up.
 */
export const seatHeldByAnother = (
  seats: SeatBindings,
  playerId: string,
  meta?: MessageMeta,
): boolean => {
  if (!meta) return false;
  const holder = seats.get(playerId);
  return Boolean(holder && holder !== meta.uid);
};

/* ------------------------------------------------------------------ *
 * Who is asking for a seat
 * ------------------------------------------------------------------ */

/**
 * Whether two people typed the same name.
 *
 * A player coming back on a different phone types their name again from
 * memory, and "dave" is the same person as "Dave " as far as a trivia night
 * is concerned.
 */
export const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** What a device sends when it wants a seat — a new one or one it already had. */
export interface JoinRequest {
  /** The seat this device believes it holds, or a fresh id if it holds none. */
  playerId: string;
  name: string;
  /** `playerProof` of the player's rejoin code, when they gave one. */
  rejoinProof?: string;
}

export interface JoinDecision {
  accepted: boolean;
  /** The seat they end up in: their old one when they proved it is theirs. */
  seatId: string;
  /** True when a seat was handed back rather than a new one opened. */
  rejoined: boolean;
  /** Why not, in words a player reads on their own phone. */
  reason?: string;
}

/**
 * The seat a request has proved is its own, if it proved one.
 *
 * Name *and* code, both. A code alone would collide across a room of thirty
 * people picking four digits; a name alone is written on the leaderboard for
 * anyone to read. Together they are what a player has when their phone has
 * nothing left — which is the case this exists for.
 */
export const claimSeatByCode = (
  players: Player[],
  request: JoinRequest,
): Player | null => {
  if (!request.rejoinProof) return null;

  return (
    players.find(
      (player) =>
        !player.isBot &&
        player.rejoinProof === request.rejoinProof &&
        sameName(player.name, request.name),
    ) ?? null
  );
};

/**
 * Decide one join request.
 *
 * Three different people send the same message and only the first is a new
 * player:
 *
 *  1. Somebody joining the lobby, who gets a seat if it is still open.
 *  2. A phone that reloaded and still remembers its seat, which asks for the
 *     same player id and is let back in whatever the phase — turning them
 *     away would strand their score for the rest of the game.
 *  3. A player whose device remembers nothing: flat, wiped, or borrowed from
 *     a friend. All they have is their name and the code they chose, and that
 *     is what this is for.
 *
 * Kept here, pure, because it is the decision that hands one person's score to
 * whoever is asking for it.
 */
export const resolveJoinRequest = (params: {
  players: Player[];
  seats: SeatBindings;
  /** Whether a *new* player could still be slotted into the bracket. */
  lobbyOpen: boolean;
  request: JoinRequest;
  meta?: MessageMeta;
}): JoinDecision => {
  const { players, seats, lobbyOpen, request, meta } = params;

  const proved = claimSeatByCode(players, request);
  const remembered = players.find((player) => player.id === request.playerId);
  const seat = proved ?? remembered;

  // A seat another device is holding stays theirs — unless the code says
  // otherwise, which is the whole point of having one: the device that can
  // prove the seat outranks the device that merely has it.
  if (!proved && seatHeldByAnother(seats, request.playerId, meta)) {
    return {
      accepted: false,
      seatId: request.playerId,
      rejoined: false,
      reason:
        "That seat is being played on another device. If it is yours, come back with the name and rejoin code you joined with.",
    };
  }

  // Somebody is already answering to this name, and it is not the player this
  // request turned out to be. Saying so beats a second "Dave" on the
  // leaderboard, and beats letting a name be worn by whoever types it.
  if (
    !seat &&
    players.some((player) => !player.isBot && sameName(player.name, request.name))
  ) {
    return {
      accepted: false,
      seatId: request.playerId,
      rejoined: false,
      reason: `Somebody is already playing as "${request.name.trim()}". If that is you, enter the rejoin code you chose when you joined.`,
    };
  }

  if (!seat && !lobbyOpen) {
    return {
      accepted: false,
      seatId: request.playerId,
      rejoined: false,
      reason:
        "The game has already started. Ask the host to open a new game — or, if you were already playing, come back with your name and rejoin code.",
    };
  }

  return {
    accepted: true,
    seatId: seat?.id ?? request.playerId,
    rejoined: Boolean(seat),
  };
};

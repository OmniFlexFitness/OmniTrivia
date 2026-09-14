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

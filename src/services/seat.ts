/**
 * The seat a player is holding in a room, remembered across reloads.
 *
 * Phones lock, browsers evict background tabs, and a player who comes back to
 * a reloaded page would otherwise rejoin as a brand new player: a second
 * entry in the lobby, a score of zero, and their real seat still sitting there
 * answering nothing. The host keys everything on the player id, so bringing
 * the same id back is all it takes to land in the same seat.
 */

const SEAT_KEY = "omnitrivia:seat";

/** Long enough to cover a trivia night, short enough not to haunt the next one. */
const SEAT_TTL_MS = 6 * 60 * 60 * 1000;

export interface Seat {
  pin: string;
  playerId: string;
  /**
   * The signed-in identity that claimed this seat. The host binds a seat to a
   * device, so a browser whose anonymous identity has been reset no longer
   * holds this one — better to join fresh than to be refused on arrival.
   */
  uid?: string;
  name: string;
  avatar: string;
  avatarColor?: string;
  avatarAccessory?: string;
  at: number;
}

export const saveSeat = (seat: Omit<Seat, "at">): void => {
  try {
    window.localStorage.setItem(
      SEAT_KEY,
      JSON.stringify({ ...seat, at: Date.now() }),
    );
  } catch {
    // Private mode or a full quota. The player can rejoin by hand.
  }
};

/**
 * The seat held in `pin`, if this device still holds one and it has not gone
 * stale. `uid` is the identity this device signs in as now; a seat claimed
 * under a different one belongs to a browser state that no longer exists.
 */
export const readSeat = (pin: string | null, uid?: string | null): Seat | null => {
  if (!pin) return null;
  try {
    const raw = window.localStorage.getItem(SEAT_KEY);
    if (!raw) return null;

    const seat = JSON.parse(raw) as Seat;
    if (seat?.pin !== pin || typeof seat.at !== "number") return null;
    if (Date.now() - seat.at > SEAT_TTL_MS) return null;
    if (seat.uid && uid && seat.uid !== uid) return null;

    return seat;
  } catch {
    return null;
  }
};

export const clearSeat = (): void => {
  try {
    window.localStorage.removeItem(SEAT_KEY);
  } catch {
    // Nothing to clean up.
  }
};

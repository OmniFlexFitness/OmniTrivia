/**
 * The seat a player is holding in a room, remembered across reloads.
 *
 * Phones lock, browsers evict background tabs, and a player who comes back to
 * a reloaded page would otherwise rejoin as a brand new player: a second
 * entry in the lobby, a score of zero, and their real seat still sitting there
 * answering nothing. The host keys everything on the player id, so bringing
 * the same id back is all it takes to land in the same seat.
 *
 * That covers a phone that still remembers. It does not cover a phone that is
 * flat, wiped, or a different phone altogether, and those are the ones that
 * actually strand a player mid-game. For those there is the rejoin code they
 * chose when they joined: the host keeps `playerProof` of it against their
 * seat, and a name and a code are enough to be let back into it from anywhere.
 * See `proof.ts`.
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
  /**
   * `playerProof` of the rejoin code this player chose. Kept so a reload can
   * prove the seat is theirs even when the identity that claimed it is gone —
   * a browser that cleared its storage signs in as somebody new, and without
   * this the seat it saved would be refused on arrival.
   */
  proof?: string;
  /**
   * The code itself, so the join form on this device comes back filled in.
   * It never leaves this browser; what travels is the proof.
   */
  code?: string;
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
 * under a different one belongs to a browser state that no longer exists —
 * unless it saved a proof, which re-establishes the claim under whatever
 * identity this browser has now.
 *
 * Without a `pin` this answers "what was this device playing", which is what
 * pre-fills the join form.
 */
export const readSeat = (pin?: string | null, uid?: string | null): Seat | null => {
  try {
    const raw = window.localStorage.getItem(SEAT_KEY);
    if (!raw) return null;

    const seat = JSON.parse(raw) as Seat;
    if (typeof seat?.pin !== "string" || typeof seat.at !== "number") return null;
    if (pin && seat.pin !== pin) return null;
    if (Date.now() - seat.at > SEAT_TTL_MS) return null;
    if (seat.uid && uid && seat.uid !== uid && !seat.proof) return null;

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

/**
 * Put the room's PIN in this page's address, or take it out (`null`).
 *
 * The saved seat is only reclaimed on load when the address names its room —
 * that is what a scanned QR code gives a phone. A player who typed the PIN
 * instead was left on a bare address, so the reload an iPhone does to a tab
 * it swapped out landed them on the start screen, out of a game they still
 * held a seat in. With the PIN in the address every reload comes back the
 * way a scan does, straight into the seat.
 */
export const pinSeatToUrl = (pin: string | null): void => {
  try {
    const url = new URL(window.location.href);
    if ((url.searchParams.get("pin") ?? null) === pin) return;
    if (pin) url.searchParams.set("pin", pin);
    else url.searchParams.delete("pin");
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // An address this browser will not rewrite: the seat is still saved, and
    // the join form still offers it back.
  }
};

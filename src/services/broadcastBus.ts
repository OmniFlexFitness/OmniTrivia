import { BroadcastMessage, BroadcastSnapshot, RoomRecord } from "../types";

/**
 * Transport between the host window and the broadcast window.
 *
 * There is no server, so the two windows talk over BroadcastChannel — which
 * means they must be the same browser on the same machine (a laptop with the
 * projector as a second display). Every snapshot is also mirrored into
 * localStorage so a broadcast window opened mid-game paints immediately
 * instead of waiting for the next state change, and so browsers without
 * BroadcastChannel still sync through `storage` events.
 */

const CHANNEL_NAME = "omnitrivia-broadcast";
const SNAPSHOT_KEY = "omnitrivia:broadcast-snapshot";
const MESSAGE_KEY = "omnitrivia:broadcast-message";
const ROOMS_KEY = "omnitrivia:rooms";

/**
 * A room whose host has not checked in for this long is treated as closed —
 * its PIN goes back in the pool. Hosts refresh on every heartbeat (2s), so
 * this only expires rooms whose window is actually gone.
 */
const ROOM_TTL_MS = 20000;

export const SNAPSHOT_VERSION = 1;

/** Query param that turns this window into the projector view. */
export const BROADCAST_VIEW_PARAM = "view";
export const BROADCAST_VIEW_VALUE = "broadcast";

const hasChannel = typeof BroadcastChannel !== "undefined";

let channel: BroadcastChannel | null = null;
const getChannel = (): BroadcastChannel | null => {
  if (!hasChannel) return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
};

export const isBroadcastView = (): boolean =>
  new URLSearchParams(window.location.search).get(BROADCAST_VIEW_PARAM) ===
  BROADCAST_VIEW_VALUE;

/** URL of the broadcast view, preserving whatever else is on the query string. */
export const broadcastUrl = (): string => {
  const url = new URL(window.location.href);
  url.searchParams.set(BROADCAST_VIEW_PARAM, BROADCAST_VIEW_VALUE);
  return url.toString();
};

/**
 * Open (or re-focus) the projector window. Reusing a named window means the
 * host clicking the button twice does not end up with two displays fighting
 * over the same screen.
 */
export const openBroadcastWindow = (): Window | null => {
  const win = window.open(broadcastUrl(), "omnitrivia-broadcast");
  win?.focus();
  return win;
};

export const postMessage = (message: BroadcastMessage): void => {
  const bus = getChannel();
  if (bus) {
    bus.postMessage(message);
    return;
  }

  // No BroadcastChannel: a storage write is still seen by other windows. The
  // nonce forces an event even when the same message is sent twice in a row.
  try {
    window.localStorage.setItem(
      MESSAGE_KEY,
      JSON.stringify({ nonce: Math.random(), message }),
    );
  } catch {
    // Private mode or a full quota. Nothing to do but drop the message.
  }
};

export const publishSnapshot = (snapshot: BroadcastSnapshot): void => {
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage is optional — the channel below is the live path.
  }
  postMessage({ type: "snapshot", snapshot });
};

/** Last published snapshot, for a broadcast window that just opened. */
export const readStoredSnapshot = (): BroadcastSnapshot | null => {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as BroadcastSnapshot;
    return snapshot?.version === SNAPSHOT_VERSION ? snapshot : null;
  } catch {
    return null;
  }
};

export const clearStoredSnapshot = (): void => {
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Nothing to clean up.
  }
};

/** Subscribe to messages from the other window. Returns an unsubscribe fn. */
export const subscribeToMessages = (
  handler: (message: BroadcastMessage) => void,
): (() => void) => {
  const bus = getChannel();

  const onChannel = (event: MessageEvent) =>
    handler(event.data as BroadcastMessage);

  const onStorage = (event: StorageEvent) => {
    if (!event.newValue) return;
    try {
      if (event.key === MESSAGE_KEY) {
        handler(JSON.parse(event.newValue).message as BroadcastMessage);
      } else if (event.key === SNAPSHOT_KEY && !hasChannel) {
        handler({
          type: "snapshot",
          snapshot: JSON.parse(event.newValue) as BroadcastSnapshot,
        });
      }
    } catch {
      // Malformed payload from another tab; ignore it.
    }
  };

  bus?.addEventListener("message", onChannel);
  window.addEventListener("storage", onStorage);

  return () => {
    bus?.removeEventListener("message", onChannel);
    window.removeEventListener("storage", onStorage);
  };
};

/* ------------------------------------------------------------------ *
 * Room registry
 *
 * Rooms live in localStorage so every tab in this browser can see which PINs
 * are in use. That is what makes a PIN mean something: a new game will not
 * pick one that is taken, and a tab joining with a PIN nobody is hosting is
 * told so instead of quietly starting a room of its own.
 *
 * The registry is per-browser, which is exactly as far as a room can reach
 * without a server — so it covers every collision that is actually possible.
 * ------------------------------------------------------------------ */

/** Live rooms, with expired entries dropped. */
export const readRooms = (): RoomRecord[] => {
  try {
    const raw = window.localStorage.getItem(ROOMS_KEY);
    if (!raw) return [];
    const rooms = JSON.parse(raw) as RoomRecord[];
    if (!Array.isArray(rooms)) return [];
    const now = Date.now();
    return rooms.filter(
      (room) => room && typeof room.pin === "string" && now - room.updatedAt < ROOM_TTL_MS,
    );
  } catch {
    return [];
  }
};

const writeRooms = (rooms: RoomRecord[]): void => {
  try {
    window.localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  } catch {
    // No storage: PIN uniqueness degrades to chance, which is where it was.
  }
};

/** Claim or refresh this host's room. Called on open and on every heartbeat. */
export const registerRoom = (
  pin: string,
  hostId: string,
  gameName: string,
): void => {
  const others = readRooms().filter((room) => room.hostId !== hostId);
  writeRooms([...others, { pin, hostId, gameName, updatedAt: Date.now() }]);
};

/** Give the PIN back when a host closes its game. */
export const releaseRoom = (hostId: string): void => {
  writeRooms(readRooms().filter((room) => room.hostId !== hostId));
};

export const isPinTaken = (pin: string): boolean =>
  readRooms().some((room) => room.pin === pin);

/**
 * A four-digit PIN no live room is already using.
 *
 * With every 4-digit PIN somehow taken there is nothing left to hand out, so
 * the last resort is a random one rather than an infinite loop — a duplicate
 * beats a hang, and 9000 concurrent rooms in one browser is not a real case.
 */
export const allocatePin = (): string => {
  const taken = new Set(readRooms().map((room) => room.pin));
  for (let attempt = 0; attempt < 200; attempt++) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    if (!taken.has(pin)) return pin;
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/** The link a player opens to join, with the PIN already filled in. */
export const joinUrl = (pin: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.delete(BROADCAST_VIEW_PARAM);
  url.searchParams.set("pin", pin);
  return url.toString();
};

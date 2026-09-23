import { BroadcastMessage, BroadcastSnapshot, RoomRecord } from "../types";
import {
  attachRoom,
  claimRemoteRoom,
  currentUid,
  detachRoom,
  lastRoomFailure,
  publishRemote,
  publishRoomSecret,
  readRemoteHostState,
  registerRemoteRoom,
  releaseRemoteRoom,
  remoteEnabled,
  remotePinTaken,
  whenConnected,
  writeRemoteHostState,
} from "./remoteRoom";
import type {
  ClaimResult,
  HostWriteResult,
  MessageMeta,
  RemoteHostState,
} from "./remoteRoom";

export type { ClaimResult, HostWriteResult, RemoteHostState };

/**
 * A message, and who the database says sent it. `meta` is absent for anything
 * that came over the local bus: those senders are windows of this browser,
 * which is as far as an unverified message could ever have travelled anyway.
 */
export type MessageHandler = (
  message: BroadcastMessage,
  meta?: MessageMeta,
) => void;

/**
 * Transport between the windows of a game, and between its devices.
 *
 * Windows of one browser talk over BroadcastChannel — the host desk and the
 * projector on a second display. Every snapshot is also mirrored into
 * localStorage so a broadcast window opened mid-game paints immediately
 * instead of waiting for the next state change, and so browsers without
 * BroadcastChannel still sync through `storage` events.
 *
 * Neither of those leaves the machine, so when a room is attached (see
 * `attachRoomChannel`) the same messages are mirrored through Firebase in
 * `remoteRoom`, and anything arriving from there is handed to the same
 * subscribers. Callers do not know or care which path a message took.
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

/**
 * The shape of the snapshot, bumped whenever a field moves or disappears.
 *
 * This number is the contract between the host's build and every screen
 * rendering what it publishes, and those are not always the same build: the
 * site is redeployed while a game is running, a phone holds the previous
 * bundle in its cache, and the two meet in the middle of a round. Reading a
 * snapshot written by a newer build is how a phone ends up blank — a field
 * that moved reads as `undefined`, the render throws, and React takes the
 * whole page down. So the version travels with every snapshot and is checked
 * before anything is rendered from it.
 */
export const SNAPSHOT_VERSION = 4;

/** How a snapshot's version compares to what this build can render. */
export type SnapshotFit = "ok" | "sender-is-newer" | "sender-is-older";

export const snapshotFit = (snapshot: BroadcastSnapshot): SnapshotFit => {
  const version = typeof snapshot?.version === "number" ? snapshot.version : 0;
  if (version > SNAPSHOT_VERSION) return "sender-is-newer";
  if (version < SNAPSHOT_VERSION) return "sender-is-older";
  return "ok";
};

/** Do not try the same reload over and over if it does not take. */
const RELOAD_KEY = "omnitrivia:build-reload-at";
const RELOAD_COOLDOWN_MS = 60000;

/**
 * Leave a stale build behind.
 *
 * Both the page and its bundle are cached for ten minutes, so a browser that
 * loaded the site just before a deploy keeps running the old one — against a
 * host that has already moved on. Reloading against a URL it has never seen
 * gets the current page, and with it the current bundle.
 *
 * Returns false when it has already tried recently, so the caller can ask the
 * person to do it by hand rather than sitting in a reload loop.
 */
export const reloadForNewBuild = (): boolean => {
  const now = Date.now();

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // No session storage means no way to remember an attempt, and a reload
    // loop in front of a room is worse than a message asking for one.
    return false;
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("v", now.toString(36));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }

  return true;
};

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

/**
 * Every live subscriber. The local paths below deliver through their own
 * listeners; this is how a message that arrived from another device reaches
 * the same handlers without pretending to be a local event.
 */
const handlers = new Set<MessageHandler>();

const deliverRemote = (message: BroadcastMessage, meta: MessageMeta): void => {
  handlers.forEach((handler) => handler(message, meta));
};

/**
 * Start carrying this room's traffic to and from other devices. The host
 * claims the PIN; a player only listens and sends.
 *
 * Without Firebase configured this resolves immediately and changes nothing,
 * which is what keeps a build with no backend working exactly as before.
 */
export const attachRoomChannel = (
  pin: string,
  asHost: boolean,
): Promise<boolean> => attachRoom(pin, { asHost, handler: deliverRemote });

export const detachRoomChannel = (): Promise<void> => detachRoom();

/** Whether this build can reach other devices at all. */
export const canReachOtherDevices = remoteEnabled;

/**
 * Why the last attach failed — "denied" when the database refused this device,
 * which is a published-rules problem rather than a network one.
 */
export const roomFailureReason = lastRoomFailure;

/**
 * Resolves true once the room channel can carry a message. Always true when
 * there is no room channel, because the local bus needs no connecting.
 */
export const roomChannelReady = (): Promise<boolean> =>
  remoteEnabled() ? whenConnected() : Promise.resolve(true);

/** This device's signed-in identity, or null when it has none. */
export const deviceIdentity = currentUid;

export const postMessage = (message: BroadcastMessage): void => {
  // Out to the room first: a phone waiting on an answer should not be held up
  // by whatever the local listeners do with it.
  publishRemote(message);

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

/**
 * Subscribe to messages from the other windows of this browser and from the
 * other devices in the room. Returns an unsubscribe fn.
 */
export const subscribeToMessages = (handler: MessageHandler): (() => void) => {
  const bus = getChannel();
  handlers.add(handler);

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
    handlers.delete(handler);
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
 * With Firebase configured a room is also published under its PIN there, so
 * the same rules hold across devices: a PIN in use by a host on another
 * machine is taken, and a phone that types one nobody is hosting is told so.
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

/**
 * Claim or refresh this host's room. Called on open and on every heartbeat.
 *
 * `open` says whether the lobby is still admitting players. It is advisory —
 * the host answers every join itself — but it lets a phone be told the game
 * has started without waiting on a round trip.
 */
export const registerRoom = (
  pin: string,
  hostId: string,
  gameName: string,
  open = true,
): Promise<HostWriteResult> => {
  const others = readRooms().filter((room) => room.hostId !== hostId);
  writeRooms([...others, { pin, hostId, gameName, updatedAt: Date.now() }]);
  return registerRemoteRoom(pin, hostId, gameName, open);
};

/* ------------------------------------------------------------------ *
 * Getting a game back
 *
 * A host's window is the game, so losing it used to lose the night. These
 * carry the password's proof and a copy of the running game into the room, and
 * back out again for whoever can prove they are its host. The plumbing is in
 * `remoteRoom`; the derivation is in `hostSession`.
 * ------------------------------------------------------------------ */

/** Record what this room's host password hashes to. Host only, room must exist. */
export const publishHostSecret = publishRoomSecret;

/** Prove this device knows the room's host password. */
export const claimRoomAsHost = claimRemoteRoom;

/** Publish the running game where only its host can read it back. */
export const publishHostState = writeRemoteHostState;

/** The running game this room is holding for its host. */
export const fetchHostState = readRemoteHostState;

/** Give the PIN back when a host closes its game. */
export const releaseRoom = (hostId: string, pin?: string | null): void => {
  writeRooms(readRooms().filter((room) => room.hostId !== hostId));
  if (pin) void releaseRemoteRoom(pin);
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
export const allocatePin = async (): Promise<string> => {
  const taken = new Set(readRooms().map((room) => room.pin));

  for (let attempt = 0; attempt < 200; attempt++) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    if (taken.has(pin)) continue;

    // Only the first few candidates are worth a round trip to the database.
    // Past that a collision is vanishingly unlikely and a host waiting to
    // start a game is not.
    if (attempt < 5 && (await remotePinTaken(pin))) continue;

    return pin;
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

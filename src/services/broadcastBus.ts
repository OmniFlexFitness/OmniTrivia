import { BroadcastMessage, BroadcastSnapshot } from "../types";

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

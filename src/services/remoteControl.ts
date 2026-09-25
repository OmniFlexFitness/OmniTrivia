import type { BroadcastMessage } from "../types";
import type { MessageMeta } from "./remoteRoom";
import { remoteSignature } from "./proof";

/**
 * The host's remote: a tablet or phone that runs the round from anywhere in
 * the room while the host's own window keeps running the game.
 *
 * It is not a second host. The host window is still the only authority — it
 * holds the questions, scores every answer, and publishes what the room sees.
 * A remote is a second set of hands on that window's buttons: it sends a
 * command over the room's message bus, the host window carries it out through
 * exactly the code its own buttons use, and the result comes back on the next
 * snapshot like everything else.
 *
 * The one thing that has to be right is who gets to send those commands. The
 * bus is readable by every device in the room, so the check works like a
 * seat's: a remote proves the host password once, with a signature bound to
 * its own signed-in identity (`remoteSignature`), and the host binds that
 * identity. Every command after that is accepted only from the identity that
 * proved itself — which the database stamps on the message and the rules pin
 * to the real sender, so it cannot be claimed by anybody else.
 *
 * The decisions are kept here, pure, so they can be tested without a room.
 */

/** What a device signs as when there is no network identity to sign as. */
export const LOCAL_UID = "local";

/** A remote the host window has let in. */
export interface RemoteBinding {
  controllerId: string;
  /** The signed-in identity that proved the password. Null over the local bus. */
  uid: string | null;
  /** What the remote calls itself — "iPad", "iPhone" — for the host's desk. */
  label: string;
  lastSeen: number;
}

export type RemoteBindings = Map<string, RemoteBinding>;

/** A remote that has not checked in for this long is shown as gone. */
export const REMOTE_TIMEOUT_MS = 12000;

/** How often a remote checks in. */
export const REMOTE_HEARTBEAT_MS = 4000;

/** Other spellings of a typed password a hello may also be signed with. */
const MAX_ALTERNATES = 2;

/**
 * The spellings of a typed password worth trying: as typed, then in capitals,
 * then in lower case. A suggested password is capitals, and an iPad keyboard
 * on a password field does not capitalise anything — so "l9yb4s" typed on the
 * tablet is the same password the lobby shows as "L9YB4S".
 */
export const passwordSpellings = (password: string): string[] => {
  const typed = password.trim();
  return [...new Set([typed, typed.toUpperCase(), typed.toLowerCase()])].filter(Boolean);
};

/**
 * The key a host's pairing QR carries, and the one thing the tablet needs.
 *
 * It is the host password's proof — the same credential a returning host
 * proves — so it goes after the `#`, where a browser never sends it to any
 * server, and the remote takes it out of the address bar as soon as it has
 * read it.
 */
export const PAIRING_KEY_PARAM = "key";

export const isPairingKey = (value: string | null | undefined): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

/** Read the pairing key off a URL's fragment, if it carries one. */
export const pairingKeyFromHash = (hash: string): string | null => {
  const key = new URLSearchParams(hash.replace(/^#/, "")).get(PAIRING_KEY_PARAM);
  return isPairingKey(key) ? key : null;
};

/** Long enough for a device name; short enough that nobody writes an essay. */
const MAX_LABEL_LENGTH = 40;

/** Who signed a message, as far as the signature is concerned. */
export const signerUid = (meta?: MessageMeta): string => meta?.uid ?? LOCAL_UID;

/**
 * Compare two signatures without stopping at the first difference.
 *
 * A trivia night is not a timing-attack target, but the comparison costs
 * nothing to do properly and this is the line that hands out the controls.
 */
const sameSignature = (a: string, b: string): boolean => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
};

export type HelloVerdict = "accept" | "reject" | "ignore";

/**
 * Decide a remote's hello.
 *
 * "reject" is said out loud — the remote is told the password is wrong. But
 * only about a hello that came over the network. A remote open in the same
 * browser as the host is heard twice, once locally and once through the room,
 * and the local copy was signed for its network identity; checking it as a
 * local message fails, and telling the remote its correct password was wrong
 * would be a lie. Those are ignored instead, and the network copy decides it.
 */
export const judgeRemoteHello = (
  proof: string | null,
  pin: string,
  message: Extract<BroadcastMessage, { type: "remote-hello" }>,
  meta?: MessageMeta,
): HelloVerdict => {
  // A window with no proof is not hosting this game any more — it was taken
  // back somewhere else — and must not answer for it either way.
  if (!proof || message.pin !== pin) return "ignore";

  const expected = remoteSignature(proof, pin, signerUid(meta), message.controllerId);
  const offered = [
    message.signature,
    ...(Array.isArray(message.alternates) ? message.alternates.slice(0, MAX_ALTERNATES) : []),
  ];
  if (offered.some((signature) => sameSignature(expected, signature))) return "accept";
  return meta ? "reject" : "ignore";
};

/** Bind a remote that has just proved itself. */
export const bindRemote = (
  bindings: RemoteBindings,
  message: Extract<BroadcastMessage, { type: "remote-hello" }>,
  meta: MessageMeta | undefined,
  now = Date.now(),
): RemoteBindings => {
  const next = new Map(bindings);
  next.set(message.controllerId, {
    controllerId: message.controllerId,
    uid: meta?.uid ?? null,
    label: (message.label || "Remote").slice(0, MAX_LABEL_LENGTH),
    lastSeen: now,
  });
  return next;
};

export type CommandVerdict = "accept" | "unbound" | "ignore";

/**
 * Whether a message may act for a remote.
 *
 * From the network it must come from the identity that proved the password —
 * a remote's id is on the bus for anyone to copy, and the identity is not. An
 * unknown remote is told so ("unbound"), which is how one that outlived a
 * host window's reload knows to say hello again.
 *
 * Over the local bus there is no identity to check, and a message there came
 * from a window of the host's own browser — trusted exactly as a player's is
 * — so a remote this window has already bound is enough.
 */
export const judgeRemoteMessage = (
  bindings: RemoteBindings,
  controllerId: string,
  meta?: MessageMeta,
): CommandVerdict => {
  const binding = bindings.get(controllerId);
  if (!meta) return binding ? "accept" : "ignore";
  return binding && binding.uid === meta.uid ? "accept" : "unbound";
};

/** Remotes that have checked in recently, for the host's desk. */
export const liveRemotes = (
  bindings: RemoteBindings,
  now = Date.now(),
): RemoteBinding[] =>
  [...bindings.values()].filter((binding) => now - binding.lastSeen < REMOTE_TIMEOUT_MS);

/** A short name for this device, so the host can tell two remotes apart. */
export const describeDevice = (): string => {
  try {
    const agent = navigator.userAgent;
    // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
    if (/iPad/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) {
      return "iPad";
    }
    if (/iPhone/.test(agent)) return "iPhone";
    if (/Android/.test(agent)) return /Mobile/.test(agent) ? "Android phone" : "Android tablet";
    if (/Macintosh/.test(agent)) return "Mac";
    if (/Windows/.test(agent)) return "Windows PC";
    return "Remote";
  } catch {
    return "Remote";
  }
};

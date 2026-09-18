import type { BroadcastMessage, BroadcastSnapshot } from "../types";

/**
 * The transport that reaches other devices.
 *
 * `broadcastBus` carries the game between windows of one browser. This carries
 * the same messages between a host laptop and the phones in the room, over
 * Firebase Realtime Database, so the protocol above it is unchanged: the host
 * is still the only authority, players still send answers and render whatever
 * the host publishes.
 *
 * Nothing here runs unless the Firebase variables are set at build time. With
 * them absent the app behaves exactly as it did before — same-browser play,
 * and a join from a phone that says so plainly.
 *
 * Data lives under the room's PIN:
 *
 *   /rooms/{pin}/meta      { hostId, hostUid, gameName, open, updatedAt }
 *   /rooms/{pin}/snapshot  { from, at, payload }   <- host writes, room reads
 *   /rooms/{pin}/bus/{id}  { from, at, payload }   <- one message, then pruned
 *
 * Payloads are JSON strings rather than nested objects on purpose. Realtime
 * Database drops `undefined`, turns `null` into a deleted key and stores
 * arrays as objects keyed by index — an empty array comes back as nothing at
 * all. The snapshot is full of optional fields and arrays that must survive
 * the round trip exactly, and a string survives it exactly.
 */

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Point the app at a local Firebase emulator instead of the real project —
 * `127.0.0.1:9000` alongside `npx firebase-tools emulators:start`. Rules are
 * enforced there too, which is the only way to find out that a rule refuses
 * something without finding out in front of a room.
 */
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST;

/**
 * Whether this build can reach other devices at all. The database URL is the
 * one that decides it: a project id without it names a project with no
 * database, which fails later and less clearly.
 */
export const remoteEnabled = (): boolean =>
  Boolean(config.apiKey && config.databaseURL && config.projectId);

/** A room whose host has not checked in for this long has gone. */
export const ROOM_TTL_MS = 20000;

/** How long to wait for the database connection before giving up on it. */
const CONNECT_TIMEOUT_MS = 8000;

/** How long to wait for a room to be carried before playing without one. */
const ATTACH_TIMEOUT_MS = 10000;

/** Messages older than this are cleaned up by the host that owns the room. */
const BUS_TTL_MS = 60000;

/** This device, so it can ignore the copies of its own messages. */
const deviceId = `dev-${Math.random().toString(36).slice(2)}`;

/* ------------------------------------------------------------------ *
 * Lazy initialisation
 *
 * The Firebase SDK is a large dependency and most sessions never need it —
 * the projector window and a solo host never leave the machine. Importing it
 * on demand keeps it out of the main bundle entirely.
 * ------------------------------------------------------------------ */

type Db = import("firebase/database").Database;
type DbRef = import("firebase/database").DatabaseReference;
type Unsubscribe = () => void;

type Sdk = {
  db: Db;
  uid: string;
  api: typeof import("firebase/database");
  /** Kept so a caller can ask for a fresh ID token to prove who it is. */
  user: import("firebase/auth").User;
};

let sdkPromise: Promise<Sdk> | null = null;

const loadSdk = async (): Promise<Sdk> => {
  const [{ initializeApp, getApps }, auth, api] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/database"),
  ]);

  const app = getApps()[0] ?? initializeApp(config);

  const session = auth.getAuth(app);
  const db = api.getDatabase(app);

  if (emulatorHost) {
    const [host, port] = emulatorHost.split(":");
    auth.connectAuthEmulator(session, `http://${host}:9099`, {
      disableWarnings: true,
    });
    api.connectDatabaseEmulator(db, host, Number(port));
  }

  // Anonymous sign-in is what makes the security rules meaningful: the host's
  // uid is recorded on the room, and only that uid may write the snapshot or
  // close the room. Players get a uid of their own and can do neither.
  const credential = session.currentUser ?? (await auth.signInAnonymously(session)).user;

  return { db, uid: credential.uid, api, user: credential };
};

const sdk = (): Promise<Sdk> => {
  if (!sdkPromise) {
    // A rejected promise cached here would fail every later attempt too, so a
    // network blip while the lobby was opening would follow the host around
    // for the rest of the night. Clear it and let the next call try again.
    sdkPromise = loadSdk().catch((error) => {
      sdkPromise = null;
      throw error;
    });
  }
  return sdkPromise;
};

/**
 * Resolves once the database is reachable, so a join can tell "no such room"
 * apart from "this phone has no working connection yet".
 */
export const whenConnected = async (
  timeoutMs = CONNECT_TIMEOUT_MS,
): Promise<boolean> => {
  let db: Db;
  let api: Sdk["api"];
  try {
    ({ db, api } = await sdk());
  } catch {
    // Signing in failed — most often Anonymous sign-in left disabled in the
    // Firebase console. Unreachable is unreachable either way.
    return false;
  }


  // `.info/connected` is maintained by the client, not stored on the server:
  // a `get()` against it is sent as a real query and comes back "Invalid token
  // in path". Only a listener can read it, and it fires straight away with the
  // current state, so there is nothing to check first.
  const connected = api.ref(db, ".info/connected");

  return new Promise<boolean>((resolve) => {
    // When the client already knows it is connected, `onValue` answers
    // synchronously — inside the call that is still producing the handle used
    // to unsubscribe. So settle first and detach once there is something to
    // detach, rather than reaching for a handle that does not exist yet.
    let off: Unsubscribe | null = null;
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      off?.();
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    off = api.onValue(connected, (snap) => {
      if (snap.val() === true) finish(true);
    });

    if (settled) off();
  });
};

/* ------------------------------------------------------------------ *
 * The attached room
 * ------------------------------------------------------------------ */

type Attachment = {
  pin: string;
  asHost: boolean;
  listeners: Unsubscribe[];
  prune: ReturnType<typeof setInterval> | null;
  metaRef: DbRef | null;
};

let attachment: Attachment | null = null;

type Envelope = { from?: string; uid?: string; at?: number; payload?: string };

/**
 * Who sent a message, as the database knows them rather than as the message
 * claims. `uid` is written into the envelope and pinned to the real signed-in
 * user by the rules, so it cannot be spoofed the way anything inside the
 * payload can. Absent for anything that came over the local bus, where every
 * sender is a window of the host's own browser.
 */
export interface MessageMeta {
  uid: string;
}

const decode = (
  value: unknown,
): { message: BroadcastMessage; meta: MessageMeta } | null => {
  const envelope = value as Envelope | null;
  if (!envelope?.payload || envelope.from === deviceId) return null;
  if (!envelope.uid) return null;

  try {
    return {
      message: JSON.parse(envelope.payload) as BroadcastMessage,
      meta: { uid: envelope.uid },
    };
  } catch {
    // Something else wrote here, or wrote it badly. Not ours to interpret.
    return null;
  }
};

/**
 * Hand a room's traffic to `handler` and, for a host, claim the room.
 *
 * Safe to call for a PIN already attached — the second call is a no-op, which
 * is what lets the host's heartbeat and a re-render share one attachment.
 */
/**
 * Why the last attach failed.
 *
 * `openRoom` starts with a read, so a database that refuses this device throws
 * immediately, while an unreachable one hangs until the timebox. Both used to
 * come back as a bare `false` and be reported as a network problem — and a
 * room told to check its Wi-Fi when the real answer is that
 * firebase/database.rules.json was never published will check its Wi-Fi all
 * night. The rules deny by default until they are deployed, so this is the
 * first thing a new project hits and the last thing the message described.
 */
export type RoomFailure = "denied" | "unreachable" | null;

let lastFailure: RoomFailure = null;

/** Firebase reports this as a code, a message, or both, depending on the call. */
const isPermissionDenied = (error: unknown): boolean => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const text = `${typeof code === "string" ? code : ""} ${typeof message === "string" ? message : ""}`;
  return /permission[\s_]?denied/i.test(text);
};

/** The reason the last `attachRoom` returned false, or null if it succeeded. */
export const lastRoomFailure = (): RoomFailure => lastFailure;

export const attachRoom = async (
  pin: string,
  options: {
    asHost: boolean;
    handler: (message: BroadcastMessage, meta: MessageMeta) => void;
  },
): Promise<boolean> => {
  if (!remoteEnabled()) return false;
  if (attachment?.pin === pin && attachment.asHost === options.asHost) return true;

  await detachRoom();
  lastFailure = null;

  // Everything past here can fail or hang: sign-in is refused when Anonymous
  // auth was never enabled, the rules refuse every read until they are
  // published, and a first read over a bad connection can sit there
  // indefinitely. None of them may take the local game down, so the whole
  // attachment is timeboxed and its failure is just a `false` — with the
  // reason kept alongside, because the caller has to explain it to someone.
  try {
    // Catching here rather than around the race keeps a rejection that lands
    // after the timebox from going unhandled, and still records its reason.
    const opening = openRoom(pin, options).catch((error) => {
      lastFailure = isPermissionDenied(error) ? "denied" : "unreachable";
      return false;
    });

    const opened = await Promise.race([
      opening,
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), ATTACH_TIMEOUT_MS),
      ),
    ]);

    if (!opened && !lastFailure) lastFailure = "unreachable";
    return opened;
  } catch (error) {
    lastFailure = isPermissionDenied(error) ? "denied" : "unreachable";
    return false;
  }
};

const openRoom = async (
  pin: string,
  options: {
    asHost: boolean;
    handler: (message: BroadcastMessage, meta: MessageMeta) => void;
  },
): Promise<boolean> => {
  const { db, api } = await sdk();
  const room = api.ref(db, `rooms/${pin}`);
  const busRef = api.child(room, "bus");
  const listeners: Unsubscribe[] = [];

  // Start after whatever is already on the bus. Without this every message
  // still waiting to be pruned would be replayed to a device that just
  // arrived — a join answered by a stale offer from the last game.
  const tail = await api.get(api.query(busRef, api.orderByKey(), api.limitToLast(1)));
  let cursor: string | null = null;
  tail.forEach((child) => {
    cursor = child.key;
  });

  const stream = cursor
    ? api.query(busRef, api.orderByKey(), api.startAfter(cursor))
    : busRef;

  listeners.push(
    api.onChildAdded(stream, (child) => {
      const decoded = decode(child.val());
      if (decoded) options.handler(decoded.message, decoded.meta);
    }),
  );

  // A player renders the host's snapshot; a host publishes it and has no use
  // for a copy of its own.
  if (!options.asHost) {
    listeners.push(
      api.onValue(api.child(room, "snapshot"), (snap) => {
        const decoded = decode(snap.val());
        if (decoded?.message.type === "snapshot") {
          options.handler(decoded.message, decoded.meta);
        }
      }),
    );
  }

  attachment = {
    pin,
    asHost: options.asHost,
    listeners,
    prune: null,
    metaRef: options.asHost ? api.child(room, "meta") : null,
  };

  if (options.asHost) {
    // The room belongs to this window. When the window goes — closed, crashed,
    // or off the network — the room goes with it rather than sitting there
    // holding a PIN no one is hosting.
    api.onDisconnect(room).remove();

    attachment.prune = setInterval(() => {
      void pruneBus(pin);
    }, 30000);
  }

  return true;
};

export const detachRoom = async (): Promise<void> => {
  const current = attachment;
  if (!current) return;
  attachment = null;

  current.listeners.forEach((off) => off());
  if (current.prune) clearInterval(current.prune);
};

/** Drop messages old enough that nobody is still waiting on them. */
const pruneBus = async (pin: string): Promise<void> => {
  try {
    const { db, api } = await sdk();
    const busRef = api.ref(db, `rooms/${pin}/bus`);
    const stale = await api.get(
      api.query(busRef, api.orderByChild("at"), api.endAt(Date.now() - BUS_TTL_MS)),
    );

    const removals: Promise<unknown>[] = [];
    stale.forEach((child) => {
      removals.push(api.remove(child.ref));
    });
    await Promise.all(removals);
  } catch {
    // Cleanup is best-effort; a failed pass is retried on the next interval.
  }
};

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

/** Mirror a message to the attached room. No-op when there is no room. */
export const publishRemote = (message: BroadcastMessage): void => {
  const current = attachment;
  if (!current) return;

  void (async () => {
    try {
      const { db, api, uid } = await sdk();
      const envelope = {
        from: deviceId,
        // Pinned to the signed-in user by the rules, so a message cannot claim
        // to come from someone it did not come from.
        uid,
        at: api.serverTimestamp(),
        payload: JSON.stringify(message),
      };

      // The snapshot is republished on every state change, including each tick
      // of the clock. Overwriting one key keeps the room's footprint flat;
      // pushing them would grow the bus by a record a second.
      if (message.type === "snapshot") {
        await api.set(api.ref(db, `rooms/${current.pin}/snapshot`), envelope);
        return;
      }

      await api.push(api.ref(db, `rooms/${current.pin}/bus`), envelope);
    } catch {
      // A dropped message is not worth breaking the local game over: the
      // snapshot that follows carries the state anyway.
    }
  })();
};

/* ------------------------------------------------------------------ *
 * The room registry
 * ------------------------------------------------------------------ */

type RoomMeta = {
  hostId: string;
  hostUid: string;
  gameName: string;
  open: boolean;
  updatedAt: number;
};

const readMeta = async (pin: string): Promise<RoomMeta | null> => {
  const { db, api } = await sdk();
  const snap = await api.get(api.ref(db, `rooms/${pin}/meta`));
  const meta = snap.val() as RoomMeta | null;
  if (!meta || typeof meta.updatedAt !== "number") return null;

  // A host that stopped checking in is gone even if its room node lingers.
  return Date.now() - meta.updatedAt < ROOM_TTL_MS ? meta : null;
};

/** Whether a live room already answers to this PIN. */
export const remotePinTaken = async (pin: string): Promise<boolean> => {
  if (!remoteEnabled()) return false;
  try {
    return (await readMeta(pin)) !== null;
  } catch {
    // Unreachable database: better to risk a duplicate PIN than to block a
    // host from starting a game at all.
    return false;
  }
};

/** Claim or refresh this host's room. Called on attach and on every heartbeat. */
export const registerRemoteRoom = async (
  pin: string,
  hostId: string,
  gameName: string,
  open: boolean,
): Promise<void> => {
  if (!remoteEnabled() || attachment?.pin !== pin || !attachment.asHost) return;

  try {
    const { api, uid } = await sdk();
    const ref = attachment.metaRef;
    if (!ref) return;

    await api.set(ref, {
      hostId,
      hostUid: uid,
      gameName,
      open,
      updatedAt: api.serverTimestamp(),
    });
  } catch {
    // The local room still works; the next heartbeat tries again.
  }
};

/**
 * This device's signed-in identity, once it has one. Used to tell a seat this
 * browser still holds from one it claimed under an identity since replaced.
 */
export const currentUid = async (): Promise<string | null> => {
  if (!remoteEnabled()) return null;
  try {
    return (await sdk()).uid;
  } catch {
    return null;
  }
};

/**
 * A fresh Firebase ID token for this device, or null when there is no Firebase.
 *
 * This is what the question-generation proxy checks before it spends anything:
 * the token is signed by Google for this project, so the proxy can tell a
 * device that signed into this game from anyone else who found the URL. The
 * SDK refreshes it when it is close to expiring, so it is asked for per call
 * rather than held onto.
 */
export const currentIdToken = async (): Promise<string | null> => {
  if (!remoteEnabled()) return null;
  try {
    return await (await sdk()).user.getIdToken();
  } catch {
    return null;
  }
};

/** Tear the room down when the host closes the game. */
export const releaseRemoteRoom = async (pin: string): Promise<void> => {
  if (!remoteEnabled()) return;
  try {
    const { db, api } = await sdk();
    await api.remove(api.ref(db, `rooms/${pin}`));
  } catch {
    // The onDisconnect handler removes it when this window goes away.
  }
};

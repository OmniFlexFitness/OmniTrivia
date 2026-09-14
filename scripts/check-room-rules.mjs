/**
 * Contract test for the room data model and its security rules, against the
 * Firebase emulator. Mirrors exactly what src/services/remoteRoom.ts writes.
 *
 *   npx firebase-tools@latest emulators:start --only database,auth
 *   node scripts/check-room-rules.mjs
 *
 * The rules are pushed to the emulator here rather than trusted to have been
 * loaded at startup. An emulator with no rules loaded is wide open, and a test
 * suite that cannot tell that apart from a passing one is worse than no suite:
 * every "cannot" below would fail, and every one of those failures would be
 * about the harness rather than the rules. The sentinel check proves it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
} from "firebase/auth";
import {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  child,
  set,
  get,
  push,
  remove,
  query,
  orderByKey,
  limitToLast,
  startAfter,
  onChildAdded,
  serverTimestamp,
} from "firebase/database";

const PROJECT = "omnitrivia-local";
const DB_HOST = "127.0.0.1:9000";
const AUTH_HOST = "127.0.0.1:9099";
const RULES = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "firebase",
  "database.rules.json",
);
let failures = 0;
let checks = 0;

const ok = (name, condition, detail = "") => {
  checks++;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/** A separate signed-in device: its own app, its own uid. */
const device = async (name) => {
  const app = initializeApp(
    {
      apiKey: "emulator-key",
      authDomain: `${PROJECT}.firebaseapp.com`,
      databaseURL: `http://127.0.0.1:9000?ns=${PROJECT}`,
      projectId: PROJECT,
      appId: `1:1:web:${name}`,
    },
    name,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  const { user } = await signInAnonymously(auth);
  return { app, db, uid: user.uid, id: `dev-${name}` };
};

/**
 * Realtime Database reports a refusal as PERMISSION_DENIED on the error, on
 * its code, or on neither depending on the call, so this reads the whole
 * thing and ignores case rather than trusting one field.
 */
const denied = async (promise) => {
  try {
    await promise;
    return false;
  } catch (error) {
    const text = `${error?.code ?? ""} ${error?.message ?? error}`.toLowerCase();
    return text.includes("permission_denied") || text.includes("permission denied");
  }
};

const envelope = (from, payload) => ({
  from,
  at: serverTimestamp(),
  payload: JSON.stringify(payload),
});

const PIN = "4242";

/** Load the real rules file into the emulator, as its owner. */
const loadRules = async () => {
  const response = await fetch(
    `http://${DB_HOST}/.settings/rules.json?ns=${PROJECT}`,
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: readFileSync(RULES, "utf8"),
    },
  );

  const body = await response.text();
  if (!response.ok || !body.includes("ok")) {
    console.error(`Could not load ${RULES} into the emulator: ${body}`);
    process.exit(1);
  }
};

/** Rooms left behind by an earlier run would look like PINs already taken. */
const clearRooms = async () => {
  await fetch(`http://${DB_HOST}/rooms.json?ns=${PROJECT}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer owner" },
  });
};

const main = async () => {
  await loadRules();
  await clearRooms();

  const host = await device("host");
  const player = await device("player");
  const intruder = await device("intruder");

  console.log("\nRules are live");

  ok(
    "a write outside /rooms is refused",
    await denied(set(ref(player.db, "forbidden/zone"), { x: 1 })),
    "the emulator is running with no rules loaded — every check below is meaningless",
  );
  if (failures) {
    console.log("\nStopping: the rules under test are not the rules in force.");
    process.exit(1);
  }

  console.log("\nRoom claim");

  await set(ref(host.db, `rooms/${PIN}/meta`), {
    hostId: "host-window-1",
    hostUid: host.uid,
    gameName: "Nectar Lab Trivia Test",
    open: true,
    updatedAt: serverTimestamp(),
  });
  const meta = await get(ref(host.db, `rooms/${PIN}/meta`));
  ok("host claims a free PIN", meta.val()?.hostUid === host.uid);

  ok(
    "another device cannot take a claimed PIN",
    await denied(
      set(ref(intruder.db, `rooms/${PIN}/meta`), {
        hostId: "intruder",
        hostUid: intruder.uid,
        gameName: "hijack",
        open: true,
        updatedAt: serverTimestamp(),
      }),
    ),
  );

  ok(
    "a device cannot claim a room in someone else's name",
    await denied(
      set(ref(intruder.db, `rooms/9998/meta`), {
        hostId: "intruder",
        hostUid: host.uid,
        gameName: "spoof",
        open: true,
        updatedAt: serverTimestamp(),
      }),
    ),
  );

  console.log("\nSnapshot");

  // The real snapshot shape: nulls, empty arrays and absent optional fields
  // are all things the round trip has to preserve.
  const snapshot = {
    version: 1,
    updatedAt: Date.now(),
    hostId: "host-window-1",
    phase: "LOBBY",
    gamePin: PIN,
    gameName: "Nectar Lab Trivia Test",
    roundNumber: 0,
    totalRounds: 3,
    category: null,
    wheelSpinning: false,
    questionNumber: 0,
    questionsInRound: 5,
    question: null,
    reveal: null,
    timeLeft: 0,
    timerDuration: 25,
    timerPaused: false,
    revealSecondsLeft: 0,
    revealReason: null,
    autoAdvance: true,
    activePlayerIds: [],
    answeredPlayerIds: [],
    correctPlayerIds: [],
    optionTallies: null,
    players: [
      { id: "host-1", name: "Host", avatar: "🐼", score: 0, roundScore: 0, streak: 0, isBot: false, isHost: true },
    ],
    bracket: [],
    nextRoundMatchups: null,
    championId: null,
  };

  await set(
    ref(host.db, `rooms/${PIN}/snapshot`),
    envelope(host.id, { type: "snapshot", snapshot }),
  );

  const stored = await get(ref(player.db, `rooms/${PIN}/snapshot`));
  const received = JSON.parse(stored.val().payload).snapshot;
  ok(
    "snapshot survives the round trip exactly",
    JSON.stringify(received) === JSON.stringify(snapshot),
    "nulls or empty arrays were mangled",
  );
  ok("empty arrays come back as arrays", Array.isArray(received.activePlayerIds));
  ok("nulls come back as null", received.category === null && received.optionTallies === null);

  ok(
    "a player cannot publish the game",
    await denied(
      set(
        ref(player.db, `rooms/${PIN}/snapshot`),
        envelope(player.id, { type: "snapshot", snapshot }),
      ),
    ),
  );

  console.log("\nControl bus");

  const busRef = ref(player.db, `rooms/${PIN}/bus`);
  const seen = [];
  const hostBus = ref(host.db, `rooms/${PIN}/bus`);
  const tail = await get(query(hostBus, orderByKey(), limitToLast(1)));
  let cursor = null;
  tail.forEach((c) => {
    cursor = c.key;
  });
  const stream = cursor ? query(hostBus, orderByKey(), startAfter(cursor)) : hostBus;
  onChildAdded(stream, (snap) => {
    const payload = snap.val()?.payload;
    if (typeof payload === "string") seen.push(JSON.parse(payload));
  });

  await push(
    busRef,
    envelope(player.id, { type: "room-query", pin: PIN, nonce: "n1" }),
  );
  ok("a player may ask for a seat", true);

  await new Promise((resolve) => setTimeout(resolve, 600));
  ok(
    "the host receives it",
    seen.some((m) => m.type === "room-query" && m.nonce === "n1"),
    `saw ${JSON.stringify(seen)}`,
  );

  const playerMessage = (await get(query(hostBus, orderByKey(), limitToLast(1)))).val();
  const messageKey = Object.keys(playerMessage)[0];

  ok(
    "a player cannot rewrite a message on the bus",
    await denied(
      set(
        ref(intruder.db, `rooms/${PIN}/bus/${messageKey}`),
        envelope(intruder.id, { type: "room-query", pin: PIN, nonce: "tampered" }),
      ),
    ),
  );

  ok(
    "a player cannot clear the bus",
    await denied(remove(ref(intruder.db, `rooms/${PIN}/bus/${messageKey}`))),
  );

  ok("the host can prune the bus", !(await denied(remove(ref(host.db, `rooms/${PIN}/bus/${messageKey}`)))));

  console.log("\nMalformed writes");

  ok(
    "a message with no payload is rejected",
    await denied(push(busRef, { from: player.id, at: serverTimestamp() })),
  );

  ok(
    "an unknown child of a room is rejected",
    await denied(set(ref(player.db, `rooms/${PIN}/sneaky`), { hello: "world" })),
  );

  console.log("\nTeardown");

  ok(
    "a player cannot delete the room",
    await denied(remove(ref(intruder.db, `rooms/${PIN}`))),
  );

  ok("the host can delete the room", !(await denied(remove(ref(host.db, `rooms/${PIN}`)))));
  ok("the room is gone", (await get(ref(host.db, `rooms/${PIN}`))).val() === null);

  console.log(
    `\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}`,
  );

  await Promise.all([deleteApp(host.app), deleteApp(player.app), deleteApp(intruder.app)]);
  process.exit(failures ? 1 : 0);
};

main().catch((error) => {
  console.error("probe crashed:", error);
  process.exit(1);
});

/**
 * End-to-end check of the cross-device join, against the Firebase emulator.
 *
 *   npx firebase-tools@latest emulators:start --only database,auth
 *   node scripts/check-room-join.mjs
 *
 * Builds the app's own transport for Node and runs two of them — a host and a
 * player, in separate processes so neither can see the other's memory, which
 * is the whole point. Anything they learn about each other came over the wire.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const EMULATOR = "127.0.0.1:9000";
const PIN = String(1000 + Math.floor(Math.random() * 9000));

// Inside the project rather than in a temp directory: the bundle leaves
// `firebase` external, and Node can only resolve that from a path that walks
// up into this project's node_modules.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "node_modules", ".cache", "omnitrivia-probe");
mkdirSync(outDir, { recursive: true });

const env = {
  "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify("emulator-key"),
  "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify("omnitrivia-local.firebaseapp.com"),
  "import.meta.env.VITE_FIREBASE_DATABASE_URL": JSON.stringify(`http://${EMULATOR}?ns=omnitrivia-local`),
  "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify("omnitrivia-local"),
  "import.meta.env.VITE_FIREBASE_APP_ID": JSON.stringify("1:1:web:probe"),
  "import.meta.env.VITE_FIREBASE_EMULATOR_HOST": JSON.stringify(EMULATOR),
};

await build({
  logLevel: "error",
  configFile: false,
  define: env,
  build: {
    outDir,
    emptyOutDir: true,
    ssr: "scripts/probe/room-entry.ts",
    target: "node22",
    rollupOptions: { output: { entryFileNames: "room-entry.mjs" } },
  },
});

const bundle = join(outDir, "room-entry.mjs");
const lines = { host: [], player: [] };

const run = (role) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [bundle, role], {
      env: { ...process.env, PROBE_PIN: PIN, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      String(chunk)
        .split("\n")
        .filter(Boolean)
        .forEach((line) => {
          lines[role].push(line.trim());
          if (line.includes("HOST_READY")) resolve({ child, ready: true });
        });
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (!text.includes("FIREBASE WARNING")) process.stderr.write(`[${role}] ${text}`);
    });
    child.on("exit", () => resolve({ child, ready: false }));
  });

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log(`\nTwo devices, PIN ${PIN}\n`);

const host = await run("host");
await new Promise((resolve) => setTimeout(resolve, 500));
const player = await run("player");
await new Promise((resolve) => setTimeout(resolve, 9000));

host.child.kill();
player.child.kill();

const hostSaid = lines.host.join("\n");
const playerSaid = lines.player.join("\n");

ok("the host claims the room", hostSaid.includes("HOST_READY"));
ok("the player's build knows it can reach other devices", playerSaid.includes("PLAYER_REMOTE true"));
ok("the player connects to the database", playerSaid.includes("PLAYER_CONNECTED true"));
ok("the host hears a query from the other device", hostSaid.includes("HOST_SAW_QUERY"), hostSaid);
ok("the player receives the host's offer", playerSaid.includes("PLAYER_SAW_OFFER open=true"), playerSaid);
ok("the host admits the player", hostSaid.includes("HOST_SAW_JOIN Phone"));
ok("the player is told it is in", playerSaid.includes("PLAYER_JOINED accepted=true"));
ok("the player renders the host's snapshot", playerSaid.includes("PLAYER_SAW_SNAPSHOT Probe Game"), playerSaid);
ok("the answer reaches the host", hostSaid.includes("HOST_SAW_ANSWER 2"), hostSaid);
ok("no device hears its own messages back", !playerSaid.includes("PLAYER_SAW_OFFER open=true\nPLAYER_SAW_OFFER"));

console.log(failures ? `\n${failures} FAILED\n` : "\nall checks passed\n");
process.exit(failures ? 1 : 0);

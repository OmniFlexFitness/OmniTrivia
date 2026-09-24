/**
 * Proves the two ways a host can shape a night beyond one laptop hold up.
 *
 *   node scripts/check-hosting.mjs
 *
 * The loser's bracket: that a first loss drops a player rather than removing
 * them, a second loss is final, the last player on each side meets in a grand
 * final, and the whole thing is decided in exactly the number of rounds the
 * lobby promises. And the remote: that a device holding the host password can
 * drive the game from across the room, and that one without it — or one
 * replaying somebody else's handshake — cannot.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { build } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "node_modules", ".cache", "omnitrivia-hosting-probe");
mkdirSync(outDir, { recursive: true });

await build({
  logLevel: "error",
  configFile: false,
  // The services read `import.meta.env` for the Firebase configuration. None
  // of it is used here, and leaving it undefined is exactly the "no backend"
  // build, which is the one to test the engine on.
  define: {
    "import.meta.env.VITE_FIREBASE_API_KEY": "undefined",
    "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": "undefined",
    "import.meta.env.VITE_FIREBASE_DATABASE_URL": "undefined",
    "import.meta.env.VITE_FIREBASE_PROJECT_ID": "undefined",
    "import.meta.env.VITE_FIREBASE_APP_ID": "undefined",
    "import.meta.env.VITE_FIREBASE_EMULATOR_HOST": "undefined",
  },
  build: {
    outDir,
    emptyOutDir: true,
    ssr: "scripts/probe/hosting-entry.ts",
    target: "node22",
    rollupOptions: { output: { entryFileNames: "hosting-entry.mjs" } },
  },
});

const child = spawn(process.execPath, [join(outDir, "hosting-entry.mjs")], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));

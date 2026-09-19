/**
 * Proves the round engine actually runs asynchronously.
 *
 *   node scripts/check-round-pacing.mjs
 *
 * The claim this repository makes about its own format — that nobody in a
 * round ever waits for anybody else, and that the projector still cannot show
 * an answer early — is the kind of claim that looks true on a host's screen
 * with four bots and quietly stops being true the next time the engine is
 * touched. So it is checked here, against the app's own services, with no
 * React and no browser in the way.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { build } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "node_modules", ".cache", "omnitrivia-round-probe");
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
    ssr: "scripts/probe/round-entry.ts",
    target: "node22",
    rollupOptions: { output: { entryFileNames: "round-entry.mjs" } },
  },
});

const child = spawn(process.execPath, [join(outDir, "round-entry.mjs")], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));

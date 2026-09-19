/**
 * Proves a lost game can be taken back.
 *
 *   node scripts/check-returns.mjs
 *
 * A host whose window went away and a player whose phone went away are the two
 * ways a night falls apart, and both are recovered by something typed: the
 * host password, and a player's own rejoin code. What that lets in — and, more
 * to the point, what it keeps out — is checked here against the app's own
 * services, with no React and no browser in the way.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { build } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "node_modules", ".cache", "omnitrivia-return-probe");
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
    ssr: "scripts/probe/return-entry.ts",
    target: "node22",
    rollupOptions: { output: { entryFileNames: "return-entry.mjs" } },
  },
});

const child = spawn(process.execPath, [join(outDir, "return-entry.mjs")], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));

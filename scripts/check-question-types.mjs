/**
 * Proves every question type imports, grades and publishes the way the app
 * says it does.
 *
 *   node scripts/check-question-types.mjs
 *
 * Each type hides its answer somewhere different, and the failures that
 * matter — a published question carrying its own answer, a near miss scored
 * as a bullseye, an export that imports back as a different question — do not
 * look broken from a host's screen. So they are checked here, against the
 * app's own services, with no React and no browser in the way.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { build } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "node_modules", ".cache", "omnitrivia-types-probe");
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
    ssr: "scripts/probe/types-entry.ts",
    target: "node22",
    rollupOptions: { output: { entryFileNames: "types-entry.mjs" } },
  },
});

const child = spawn(process.execPath, [join(outDir, "types-entry.mjs")], {
  stdio: "inherit",
  // The probe reads `questions.example.csv` to check the documented example
  // through the real parser, and the bundle it runs from is elsewhere.
  env: { ...process.env, PROBE_REPO_ROOT: root },
});

child.on("exit", (code) => process.exit(code ?? 1));

/**
 * Proves a game is put together the way the app says it is.
 *
 *   node scripts/check-game-setup.mjs
 *
 * Shuffling, trimming an import and the wheel's geometry are all claims that
 * are easy to believe from a host's screen — a wheel lands *somewhere*, a set
 * of questions is *some* order — and hard to notice going wrong. A shuffle
 * that drops a question, a trim that keeps a category the host unticked, a
 * pointer that is a slice out: none of those look broken. So they are checked
 * here, against the app's own services, with no React and no browser in the
 * way.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { build } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "node_modules", ".cache", "omnitrivia-setup-probe");
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
    ssr: "scripts/probe/setup-entry.ts",
    target: "node22",
    rollupOptions: { output: { entryFileNames: "setup-entry.mjs" } },
  },
});

const child = spawn(process.execPath, [join(outDir, "setup-entry.mjs")], {
  stdio: "inherit",
  // The probe reads `questions.example.csv` to check a real file through the
  // real parser, and the bundle it runs from is nowhere near the repository.
  env: { ...process.env, PROBE_REPO_ROOT: root },
});

child.on("exit", (code) => process.exit(code ?? 1));

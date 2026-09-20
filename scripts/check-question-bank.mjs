/**
 * Proves the premade question bank still loads and still plays.
 *
 *   node scripts/check-question-bank.mjs
 *   npm run check-question-bank
 *
 * The bank is a Google Sheet that is edited independently of this repository,
 * so it can break the app without a commit: a row typed in a shape the
 * importer cannot read, or sharing switched back to private, and the default
 * question source is gone. Nothing else in `scripts/` would notice.
 *
 * This needs the network and nothing else — no Anthropic key, no Firebase, no
 * browser — and it costs nothing to run.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { build } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "node_modules", ".cache", "omnitrivia-bank-probe");
mkdirSync(outDir, { recursive: true });

await build({
  logLevel: "error",
  configFile: false,
  // None of the services under test read these, but the module graph they sit
  // in does. Undefined is the "no backend" build, which is the right one to
  // read a spreadsheet with.
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
    ssr: "scripts/probe/bank-entry.ts",
    target: "node22",
    rollupOptions: { output: { entryFileNames: "bank-entry.mjs" } },
  },
});

const child = spawn(process.execPath, [join(outDir, "bank-entry.mjs")], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));

/**
 * Preflight for `npm run dev` / `build` / `preview`.
 *
 * Vite's own error for a missing package is a stack trace pointing into Vite's
 * internals ("Failed to resolve import ... Does the file exist?"), which reads
 * like a bug in this repo rather than an install problem. That is a real trap
 * here: this project used to commit `node_modules` to git, so an older clone
 * has a populated-looking `node_modules` that predates the Anthropic SDK. Vite
 * starts fine and then fails on the first import of it.
 *
 * So check before the server starts, and say what to run.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const nodeModules = join(root, "node_modules");

const require = createRequire(join(root, "package.json"));

/**
 * Installed if the package directory is there. Some packages (`@types/*`) have
 * no importable entry point and others hide `./package.json` behind an exports
 * map, so resolving the name is only a fallback — it covers layouts where the
 * install was hoisted to a parent directory.
 */
const isInstalled = (name) => {
  if (existsSync(join(nodeModules, ...name.split("/"), "package.json"))) return true;
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
};

const missing = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
].filter((name) => !isInstalled(name));

// Node 18 is the floor for the Anthropic SDK and for Vite 5. npm only warns
// about `engines`, and the errors an older Node produces are far less obvious.
const minNode = Number.parseInt(String(pkg.engines?.node ?? "").replace(/\D/g, ""), 10);
const currentNode = Number.parseInt(process.versions.node.split(".")[0], 10);
const nodeTooOld = Number.isFinite(minNode) && currentNode < minNode;

if (!missing.length && !nodeTooOld) process.exit(0);

const reinstall =
  process.platform === "win32"
    ? [
        "    cmd:         rmdir /s /q node_modules && npm install",
        "    PowerShell:  Remove-Item -Recurse -Force node_modules; npm install",
      ]
    : ["    rm -rf node_modules && npm install"];

const lines = ["", "  OmniTrivia cannot start."];

if (nodeTooOld) {
  lines.push(
    "",
    `  Node ${minNode} or newer is required. This is Node ${process.versions.node}.`,
    "  Install a current release from https://nodejs.org, then try again.",
  );
}

if (missing.length) {
  lines.push(
    "",
    // Naming the gaps is useful when some packages are there and some are not.
    // With nothing installed it is just the whole manifest read back.
    ...(existsSync(nodeModules)
      ? [
          `  Missing package${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
          "",
          "  node_modules exists but is missing packages this app needs. It is",
          "  almost certainly left over from an older commit — dependencies used",
          "  to be committed to this repo. Delete it and reinstall:",
          "",
          ...reinstall,
        ]
      : ["  Dependencies are not installed yet. Run:", "", "    npm install"]),
  );
}

lines.push("");
console.error(lines.join("\n"));
process.exit(1);

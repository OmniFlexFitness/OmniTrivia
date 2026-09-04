/**
 * Answers "why did GENERATE & REVIEW give me placeholders?" on this machine.
 *
 *   npm run check-key
 *
 * Resolves the key exactly the way the app does (Vite's own loadEnv, including
 * its .env.local precedence), says which file supplied it, calls the real API
 * once, and looks for leftovers from the old Gemini version that can make a
 * stale checkout look like it is still wired to Google.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const say = (...parts) => console.log(...parts);
const problems = [];

say("");
say("  Checking how this checkout is configured");
say("  " + "-".repeat(58));

// --- which env files exist -------------------------------------------------
// Vite loads .env, .env.local, .env.<mode> and .env.<mode>.local, later ones
// winning. A forgotten .env.local silently overrides .env, so name them all.
const candidates = [".env", ".env.local", ".env.development", ".env.development.local"];
const present = candidates.filter((name) => existsSync(join(root, name)));

say("");
say("  env files present:", present.length ? present.join(", ") : "NONE");

// A file named .env.txt is the classic Windows Notepad mistake: it looks right
// in Explorer with extensions hidden, and Vite ignores it completely.
const strays = readdirSync(root).filter((name) => /^\.env.*\.(txt|rtf|docx?)$/i.test(name));
if (strays.length) {
  problems.push(
    `${strays.join(", ")} will never be read. Rename to exactly ".env" ` +
      `(in Explorer turn on View > File name extensions first).`,
  );
}

// --- what the app actually sees -------------------------------------------
const env = loadEnv("development", root, "");
const apiKey = env.VITE_ANTHROPIC_API_KEY || "";
const workspaceId = env.VITE_ANTHROPIC_WORKSPACE_ID || "";

/** Which file supplied the winning value, in Vite's precedence order. */
const sourceOf = (name) => {
  let winner = null;
  for (const file of present) {
    const line = readFileSync(join(root, file), "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith(`${name}=`));
    if (line && line.slice(line.indexOf("=") + 1).trim()) winner = file;
  }
  return winner;
};

say("");
if (!apiKey) {
  say("  VITE_ANTHROPIC_API_KEY: NOT SET");
  problems.push(
    'No key, so the app never calls any API — every round comes back as ' +
      '"Placeholder question #N". Put VITE_ANTHROPIC_API_KEY in .env, or skip ' +
      "the key and use HOST GAME > IMPORT MY OWN QUESTIONS.",
  );
} else {
  say(`  VITE_ANTHROPIC_API_KEY: set, ${apiKey.length} chars, from ${sourceOf("VITE_ANTHROPIC_API_KEY")}`);
  if (!apiKey.startsWith("sk-ant-")) {
    problems.push(
      `The key does not start with "sk-ant-", so it is not an Anthropic key. ` +
        `Anthropic keys come from https://console.anthropic.com/settings/keys.`,
    );
  }
  if (/^["']|["']$/.test(apiKey)) {
    problems.push("The key is wrapped in quotes in the .env file. Remove them.");
  }
}

say(
  `  VITE_ANTHROPIC_WORKSPACE_ID: ${
    workspaceId ? `set, from ${sourceOf("VITE_ANTHROPIC_WORKSPACE_ID")}` : "not set (fine unless the key is identity-linked)"
  }`,
);

// --- leftovers from the Gemini version -------------------------------------
const geminiArtifacts = [];
if (existsSync(join(root, "src/services/geminiService.ts"))) geminiArtifacts.push("src/services/geminiService.ts");
if (existsSync(join(root, "node_modules/@google/generative-ai"))) geminiArtifacts.push("node_modules/@google/generative-ai");
if (existsSync(join(root, "yarn.lock"))) geminiArtifacts.push("yarn.lock");
for (const file of present) {
  if (/GEMINI|GOOGLE_API/i.test(readFileSync(join(root, file), "utf8"))) geminiArtifacts.push(`${file} (mentions a Gemini key)`);
}

say("");
if (geminiArtifacts.length) {
  say("  Leftovers from the old Gemini version:", geminiArtifacts.join(", "));
  problems.push(
    "This checkout still has files from before the switch to Claude. Nothing " +
      "in the current code reads them, but they mean the working copy is stale: " +
      "`git pull`, then delete node_modules and run npm install.",
  );
} else {
  say("  No Gemini leftovers — this checkout is fully on the Claude path.");
}

// --- does the key actually work -------------------------------------------
if (apiKey) {
  say("");
  say("  Calling https://api.anthropic.com/v1/messages ...");
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with the single word: ready" }],
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = payload.content?.find((block) => block.type === "text")?.text?.trim();
      say(`  ${response.status} OK — the model replied ${JSON.stringify(text ?? "")}`);
    } else {
      const message = payload.error?.message ?? JSON.stringify(payload).slice(0, 200);
      say(`  ${response.status} — ${message}`);
      if (response.status === 401) problems.push("The API rejected the key. Check it was copied whole, and has not been revoked.");
      else if (/workspace/i.test(message)) problems.push("Identity-linked key: set VITE_ANTHROPIC_WORKSPACE_ID to the wrkspc_... id.");
      else if (response.status === 429) problems.push("Rate limited or out of credit. Check billing in the Anthropic Console.");
      else problems.push(`The API returned ${response.status}: ${message}`);
    }
  } catch (error) {
    say(`  request failed — ${error.message}`);
    problems.push(
      "Could not reach api.anthropic.com from this machine. A firewall, VPN or " +
        "corporate proxy will do this, and the app will show the same failure.",
    );
  }
}

// --- verdict ---------------------------------------------------------------
say("");
if (problems.length) {
  say(`  ${problems.length} thing${problems.length > 1 ? "s" : ""} to fix:`);
  problems.forEach((p, i) => say(`    ${i + 1}. ${p}`));
  say("");
  say("  Vite reads .env only at startup — restart the dev server after editing it.");
} else {
  say("  All good. GENERATE & REVIEW will produce real questions.");
}
say("");
process.exit(problems.length ? 1 : 0);

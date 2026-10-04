/**
 * Writes a playable question CSV using the Claude API.
 *
 * This runs in Node, not the browser, so the API key never reaches a bundle
 * and never reaches the room's Wi-Fi. Generate a file once, import it at the
 * venue, and the app itself can run with no key set at all.
 *
 *   node scripts/generate-questions.mjs                      # all 10 categories
 *   node scripts/generate-questions.mjs --out kava-night.csv
 *   node scripts/generate-questions.mjs --categories Science,Music
 *
 * Each round is 3 multiple choice + 1 true/false + 1 of the other formats the
 * game supports — a pin, a range, a match puzzle and so on, a different one
 * per category — so a night is not five identical-looking screens.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HEADER, SPECIALS, clean, row } from "./lib/question-rows.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MODEL = "claude-opus-5";

// --- .env ------------------------------------------------------------------
// Read it directly rather than depending on Vite, which is not running here.
const readEnv = () => {
  const path = join(root, ".env");
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const eq = line.indexOf("=");
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
      })
      .filter(([key]) => key),
  );
};

const env = { ...readEnv(), ...process.env };
const apiKey = env.VITE_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
const workspaceId = env.VITE_ANTHROPIC_WORKSPACE_ID || env.ANTHROPIC_WORKSPACE_ID;

if (!apiKey) {
  console.error(
    "\n  No API key found. Put VITE_ANTHROPIC_API_KEY in .env (see .env.example),\n" +
      "  or export ANTHROPIC_API_KEY before running this.\n",
  );
  process.exit(1);
}

const client = new Anthropic({
  apiKey,
  // Identity-linked keys are rejected until the request names a workspace.
  ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
});

// --- args ------------------------------------------------------------------
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

// Matching the built-in names gets each round its own icon and colour on the
// wheel; anything else still plays, just in grey.
const ALL_CATEGORIES = [
  { name: "Science", special: "number" },
  { name: "History", special: "puzzle" },
  { name: "Geography", special: "pin" },
  { name: "Pop Culture", special: "match" },
  { name: "Sports", special: "range" },
  { name: "Tech", special: "scramble" },
  { name: "Art", special: "slider" },
  { name: "Literature", special: "typeAnswer" },
  { name: "Music", special: "multiSelect" },
  { name: "Food", special: "categorize" },
];

const wanted = arg("categories", "")
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);

const categories = wanted.length
  ? ALL_CATEGORIES.filter((c) => wanted.includes(c.name.toLowerCase()))
  : ALL_CATEGORIES;

if (!categories.length) {
  console.error(`\n  No known categories matched. Options: ${ALL_CATEGORIES.map((c) => c.name).join(", ")}\n`);
  process.exit(1);
}

const outPath = resolve(root, arg("out", "questions.csv"));

// --- schemas ---------------------------------------------------------------
const multipleChoice = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(6),
  correctIndex: z.number().int().min(0).max(5),
  explanation: z.string(),
});

const trueFalse = z.object({
  question: z.string(),
  answer: z.boolean(),
  explanation: z.string(),
});

// --- generation ------------------------------------------------------------
const SYSTEM =
  "You write pub-trivia questions for a relaxed bar crowd playing on a big " +
  "screen. Every question has exactly one defensibly correct answer, and any " +
  "wrong options are plausible but clearly wrong to someone who knows the " +
  "answer. Favour questions a general audience can reason about or enjoy " +
  "being told the answer to, over obscure recall. Skip the most worn-out pub " +
  "quiz questions. Keep each question to one line, under 120 characters where " +
  "you can. Explanations are one sentence, and should be the kind of fact a " +
  "host enjoys reading out. Never use double-quote characters in any field.";

const generate = async (category) => {
  const schema = z.object({
    multipleChoice: z.array(multipleChoice).min(3).max(6),
    trueFalse: z.array(trueFalse).min(1).max(3),
    special: SPECIALS[category.special].schema,
  });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Write one round of trivia about "${category.name}".\n\n` +
          `- multipleChoice: 3 questions, 4 options each, mixed difficulty ` +
          `(one most people get, one middling, one that rewards a real fan).\n` +
          `- trueFalse: 1 statement that sounds plausible either way.\n` +
          `- special: ${SPECIALS[category.special].brief}\n\n` +
          `All 5 must be about different things — no two questions on the ` +
          `same person, event, or work.`,
      },
    ],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Model declined for ${category.name}: ${response.stop_details?.explanation ?? ""}`);
  }
  if (!response.parsed_output) {
    throw new Error(`Unparseable response for ${category.name}`);
  }
  return response.parsed_output;
};

// --- CSV -------------------------------------------------------------------
// Cleaning, quoting and the row layout live in ./lib/question-rows.mjs.

const toRows = (categoryName, special, round) => {
  const rows = [];

  // The schema allows a little slack (the model sometimes returns a bonus
  // question), so take the first three sound ones rather than failing a round
  // over an extra.
  const usableMc = round.multipleChoice
    .filter((q) => q.options.length >= 2 && q.correctIndex < q.options.length)
    .slice(0, 3);

  for (const q of usableMc) {
    rows.push(
      row(
        "MULTIPLE_CHOICE",
        categoryName,
        q.question,
        q.options,
        q.options[q.correctIndex],
        q.explanation,
      ),
    );
  }

  for (const q of round.trueFalse.slice(0, 1)) {
    rows.push(
      row("TRUE_FALSE", categoryName, q.question, ["True", "False"], q.answer ? "True" : "False", q.explanation),
    );
  }

  rows.push(SPECIALS[special].toRow(categoryName, round.special));

  return rows;
};

// --- run -------------------------------------------------------------------
const started = Date.now();
console.log(`Generating ${categories.length} round(s) with ${MODEL}...`);

const results = await Promise.all(
  categories.map(async (category) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const round = await generate(category);
        console.log(`  ok    ${category.name}${attempt > 1 ? ` (attempt ${attempt})` : ""}`);
        return { category, round };
      } catch (error) {
        const last = attempt === 2;
        console.error(`  ${last ? "FAIL " : "retry"} ${category.name}: ${error.message.split("\n")[0]}`);
        if (last) return null;
      }
    }
    return null;
  }),
);

const ok = results.filter(Boolean);
if (!ok.length) {
  console.error("\n  Nothing was generated. The file was not written.\n");
  process.exit(1);
}

const rows = ok.flatMap(({ category, round }) => toRows(category.name, category.special, round));

writeFileSync(outPath, [HEADER, ...rows].join("\n") + "\n", "utf8");

console.log(
  `\nWrote ${rows.length} questions across ${ok.length} round(s) to ${outPath} ` +
    `in ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
if (ok.length < categories.length) {
  console.log(`${categories.length - ok.length} round(s) failed and are not in the file.`);
}

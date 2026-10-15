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
 *   node scripts/generate-questions.mjs --difficulty everyday   # or school (default), quiz
 *
 * Each round is 3 multiple choice + 1 true/false + 1 of the other formats the
 * game supports — a pin, a range, a match puzzle and so on, a different one
 * per category — so a night is not five identical-looking screens. The
 * questions are written for a mixed room, not a quiz team: the other-format
 * question is the easiest of the five, because the format itself is the work.
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

// How hard to pitch them. The same three levels the app's setup screen
// offers (src/services/difficulty.ts), with the same briefs; high school is
// the default there too. Kept in step by hand — this script runs without
// the app's TypeScript.
const DIFFICULTY_BRIEFS = {
  everyday:
    "Difficulty: EVERYDAY. Every question is something a typical 12-year-old " +
    "knows, or that daily life makes obvious: colours, animals, the days and " +
    "months, famous landmarks, the biggest films, the most famous people " +
    "alive, what things are called. The test for every question: would a " +
    "12-year-old and their grandparent both know this instantly, without " +
    "working anything out? If not, do not ask it — find an easier fact about " +
    "the same category. Nearly everybody in the room should get nearly every " +
    "question; the game is decided on speed, not knowledge. Right level: 'How " +
    "many legs does a spider have?', 'What colour do you get by mixing blue " +
    "and yellow?', 'Which planet do we live on?'. Too hard: 'What is the " +
    "capital of Australia?', 'Who painted The Starry Night?'.",
  school:
    "Difficulty: HIGH SCHOOL. Every question is something a typical " +
    "high-school graduate who paid moderate attention would know without " +
    "studying, or that everyday life makes obvious — the kind of fact that is " +
    "in a school textbook, on a famous landmark, in a blockbuster film or a " +
    "hit song everybody has heard. The test for every question: would an " +
    "average 17-year-old, and an average adult who has not followed the " +
    "subject since school, know this instantly, without looking it up or " +
    "working anything out? If not, do not ask it — find an easier fact about " +
    "the same category. About two thirds of the questions should be ones " +
    "nearly everybody gets, and the rest ones about half the room gets. There " +
    "are no stretch questions at this level: nothing that rewards a fan, a " +
    "graduate in the subject or a pub-quiz regular. Right level: 'What is the " +
    "capital of France?', 'Which planet is closest to the Sun?', 'Who painted " +
    "the Mona Lisa?', 'How many players does a basketball team have on the " +
    "court?', 'What gas do plants take in from the air?', 'Which ocean is the " +
    "largest?'. Too hard — never write questions like these: 'Who was the " +
    "last emperor of the Western Roman Empire?', 'Which element is most " +
    "abundant in the Earth's crust by mass?', 'Who played the saxophone on " +
    "Baker Street?', 'Which Bronte sister published as Currer Bell?', 'What " +
    "was the first item sold on eBay?', 'Which African country borders the " +
    "most others?'. If a question needs a date, a measurement or a name that " +
    "only a fan knows, it is too hard.",
  quiz:
    "Difficulty: PUB QUIZ. About half the questions easy (most of the room " +
    "gets them), about a third medium (half the room gets them), and at most " +
    "one in six a stretch — one a person can still reason or eliminate their " +
    "way to, never specialist knowledge. If you are not sure most people have " +
    "heard of the answer, make the question easier. Too hard even here: 'Who " +
    "was the last emperor of the Western Roman Empire?', 'Who played the " +
    "saxophone on Baker Street?'.",
};
const difficulty = arg("difficulty", "school").toLowerCase();
if (!DIFFICULTY_BRIEFS[difficulty]) {
  console.error(`\n  Unknown difficulty "${difficulty}". Options: ${Object.keys(DIFFICULTY_BRIEFS).join(", ")}\n`);
  process.exit(1);
}

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
  "You write trivia questions for a bar-night game played on phones by a " +
  "mixed room — friends, families, regulars, people who have had a drink. " +
  "They are not a quiz team. The game is head-to-head and scored on speed, " +
  "so it does not need hard questions to be competitive — it needs ones " +
  "everybody in the room knows the answer to and races to tap. Pitch every " +
  "question at exactly the level the request names, and when in doubt go " +
  "easier: a question that is too easy costs nothing, a question that is too " +
  "hard loses the room. Never ask for an exact year, a precise statistic, a " +
  "minor character, a specific episode, a name only an enthusiast knows, or " +
  "anything that takes two facts to work out. Every question has exactly one " +
  "defensibly correct answer, and any wrong options are plausible but clearly " +
  "wrong to someone who knows the subject at all — and are things the room " +
  "has heard of, so the question is which of these, not have you heard of " +
  "these. Keep each question to one plain sentence, under 90 characters where " +
  "you can, with no double negatives and no trick wording. Skipping worn-out " +
  "pub-quiz questions is fine, but never by making a question harder: a fresh " +
  "angle on a famous thing beats an obscure thing. Explanations are one " +
  "sentence, and should be the kind of fact a host enjoys reading out. Never " +
  "use double-quote characters in any field.";

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
          `Write one round of trivia about "${category.name}".\n` +
          `${DIFFICULTY_BRIEFS[difficulty]}\n\n` +
          `- multipleChoice: 3 questions, 4 short options each (one to four ` +
          `words), all at the level above.\n` +
          `- trueFalse: 1 short statement that sounds plausible either way; ` +
          `a false one is a believable near miss, never nonsense.\n` +
          `- special: ${SPECIALS[category.special].brief} This format takes ` +
          `longer to answer and is harder in itself, so make it the easiest ` +
          `question of the five.\n\n` +
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
console.log(`Generating ${categories.length} round(s) with ${MODEL} at "${difficulty}" difficulty...`);

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

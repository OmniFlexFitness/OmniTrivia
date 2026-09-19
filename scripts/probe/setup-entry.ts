/**
 * How a game is put together, checked against the app's own services.
 *
 * Four claims this repository now makes about game setup are the kind that
 * look true on a host's screen and quietly stop being true the next time the
 * code is touched — a shuffle that drops a question, a trim that keeps the
 * wrong ones, a wheel that lands somewhere other than where it points:
 *
 *   1. Shuffling a game never loses, duplicates or corrupts a question, and
 *      the correct answer follows its option around.
 *   2. An import is trimmed to the shape the host asked for, and only ever to
 *      categories they kept.
 *   3. The slice under the wheel's pointer is the slice the spin planned for.
 *   4. The category the wheel lands on is the one the round is played on.
 *
 * Run it with `node scripts/check-game-setup.mjs`.
 */
import "./dom-stub";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CategoryContent,
  GamePhase,
  GameMode,
  GameState,
  Question,
  QuestionType,
  RoundConfig,
} from "../../src/types";
import { REVEAL_DURATION } from "../../src/constants";
import {
  buildRoundsFromContent,
  longestRound,
  randomizeRounds,
  renumberRounds,
  shuffle,
  shuffleOptions,
} from "../../src/services/questionSet";
import { landedSliceIndex, planSpin } from "../../src/services/wheel";
import { parseImportData } from "../../src/services/importService";

let failures = 0;

const check = (label: string, passed: boolean, detail = ""): void => {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
};

const question = (category: string, n: number): Question => ({
  id: `${category}-q${n}`,
  category,
  text: `${category} question ${n}?`,
  options: [`${category}-${n}-right`, "wrong A", "wrong B", "wrong C"],
  correctIndex: 0,
  explanation: "Because.",
  type: QuestionType.MULTIPLE_CHOICE,
});

const content = (id: string, name: string, count: number): CategoryContent => ({
  category: { id, name, icon: "❓", color: "bg-slate-500" },
  questions: Array.from({ length: count }, (_, i) => question(id, i + 1)),
});

/** The answer text a question currently marks correct. */
const correctText = (q: Question): string => q.options[q.correctIndex];

const library: CategoryContent[] = [
  content("science", "Science", 12),
  content("history", "History", 9),
  content("music", "Music", 3),
  content("food", "Food", 20),
  content("space", "Space", 7),
];

/* ------------------------------------------------------------------ *
 * 1. Shuffling never costs a question
 * ------------------------------------------------------------------ */

const original: RoundConfig[] = library.slice(0, 3).map((c, i) => ({
  roundNumber: i + 1,
  category: c.category,
  questions: c.questions,
}));

const randomized = randomizeRounds(original);

check(
  "every round survives a shuffle",
  randomized.length === original.length,
  `${randomized.length} of ${original.length}`,
);
check(
  "rounds are numbered by the position they are in",
  randomized.every((round, index) => round.roundNumber === index + 1),
);
check(
  "every category survives a shuffle",
  new Set(randomized.map((r) => r.category.id)).size === original.length,
);

const idsBefore = original.flatMap((r) => r.questions.map((q) => q.id)).sort();
const idsAfter = randomized.flatMap((r) => r.questions.map((q) => q.id)).sort();
check(
  "no question is lost or duplicated by a shuffle",
  idsBefore.length === idsAfter.length &&
    idsBefore.every((id, i) => id === idsAfter[i]),
  `${idsBefore.length} in, ${idsAfter.length} out`,
);

const byId = new Map(
  original.flatMap((r) => r.questions).map((q) => [q.id, q]),
);
check(
  "the correct answer follows its option around",
  randomized
    .flatMap((r) => r.questions)
    .every((q) => correctText(q) === correctText(byId.get(q.id)!)),
);
check(
  "a question keeps all of its options",
  randomized
    .flatMap((r) => r.questions)
    .every(
      (q) =>
        [...q.options].sort().join("|") ===
        [...byId.get(q.id)!.options].sort().join("|"),
    ),
);

/* Order actually changes. One shuffle can legitimately come back identical,
 * so this asks whether *any* of a hundred does — a "shuffle" that is a no-op
 * fails it every time, and a real one fails it with probability ~1e-200. */
const settled = library[0].questions;
const moved = Array.from({ length: 100 }).some(() =>
  shuffle(settled).some((q, index) => q.id !== settled[index].id),
);
check("shuffling actually reorders", moved);

/* ------------------------------------------------------------------ *
 * 2. Only multiple choice has its answers moved
 * ------------------------------------------------------------------ */

const fixedOrderTypes = [
  QuestionType.TRUE_FALSE,
  QuestionType.SLIDER,
  QuestionType.PUZZLE,
  QuestionType.TYPE_ANSWER,
];

check(
  "a question whose option order is the answer is left alone",
  fixedOrderTypes.every((type) => {
    const q: Question = {
      ...question("misc", 1),
      type,
      options: ["first", "second", "third", "fourth", "fifth"],
    };
    return Array.from({ length: 50 }).every(() =>
      shuffleOptions(q).options.join("|") === q.options.join("|"),
    );
  }),
);

check(
  "a question with a correct answer out of range is left alone",
  Array.from({ length: 50 }).every(() => {
    const broken: Question = { ...question("misc", 2), correctIndex: 9 };
    const out = shuffleOptions(broken);
    return out.options.join("|") === broken.options.join("|") &&
      out.correctIndex === 9;
  }),
);

/* ------------------------------------------------------------------ *
 * 3. An import is trimmed to the shape the host asked for
 * ------------------------------------------------------------------ */

const trimmed = buildRoundsFromContent(library, {
  categoryIds: ["science", "history", "music", "food"],
  maxCategories: 3,
  maxQuestions: 5,
});

check(
  "the rounds ceiling is honoured",
  trimmed.length === 3,
  `${trimmed.length} rounds`,
);
check(
  "the questions-per-round ceiling is honoured",
  trimmed.every((round) => round.questions.length <= 5),
);
check(
  "a category the host dropped never appears",
  trimmed.every((round) => round.category.id !== "space"),
);
check(
  "a category is never played twice in one game",
  new Set(trimmed.map((r) => r.category.id)).size === trimmed.length,
);
check(
  "a short category plays a short round rather than a padded one",
  buildRoundsFromContent([library[2]], { maxQuestions: 5 })[0].questions
    .length === 3,
);
check(
  "questions per round reports the longest round",
  longestRound(trimmed) ===
    Math.max(...trimmed.map((r) => r.questions.length)),
);
check(
  "no ceiling means keep everything",
  buildRoundsFromContent(library).length === library.length,
);
check(
  "an empty category is never made into a round",
  buildRoundsFromContent([
    ...library,
    { category: library[0].category, questions: [] },
  ]).every((round) => round.questions.length > 0),
);

/* The same file twice is not the same game twice. */
const drawnTwice = Array.from({ length: 40 }, () =>
  buildRoundsFromContent(library, { maxCategories: 3, maxQuestions: 4 })
    .map((r) => r.category.id)
    .join(","),
);
check(
  "importing the same file twice does not give the same game",
  new Set(drawnTwice).size > 1,
  `${new Set(drawnTwice).size} distinct draws in 40`,
);

/* ------------------------------------------------------------------ *
 * 3b. A real file, through the real parser
 *
 * The checks above run on questions built in this file, which cannot catch a
 * shuffle that is fine for multiple choice and quietly ruins the four types
 * whose option order *is* the answer. `questions.example.csv` carries one of
 * each, so it is imported here exactly as the app imports it.
 * ------------------------------------------------------------------ */

// The runner builds this probe into node_modules/.cache, so `import.meta.url`
// points at the bundle rather than the repository. The runner passes the root.
const repoRoot = process.env.PROBE_REPO_ROOT ?? process.cwd();
const exampleCsv = readFileSync(
  join(repoRoot, "questions.example.csv"),
  "utf8",
);
const parsed = Object.values(parseImportData(exampleCsv));
const parsedById = new Map(
  parsed.flatMap((c) => c.questions).map((q) => [q.id, q]),
);

const imported = buildRoundsFromContent(parsed, { maxQuestions: 10 });
const importedQuestions = imported.flatMap((round) => round.questions);

check(
  "a real file keeps every question through the import",
  importedQuestions.length === parsedById.size,
  `${importedQuestions.length} of ${parsedById.size}`,
);
check(
  "every question type in the example file survives the import",
  new Set(importedQuestions.map((q) => q.type)).size ===
    new Set([...parsedById.values()].map((q) => q.type)).size,
);
check(
  "an imported question still marks the same answer correct",
  importedQuestions.every((q) => {
    const before = parsedById.get(q.id)!;
    return (before.type ?? QuestionType.MULTIPLE_CHOICE) ===
      QuestionType.MULTIPLE_CHOICE
      ? correctText(q) === correctText(before)
      : q.options.join("|") === before.options.join("|") &&
          q.correctIndex === before.correctIndex;
  }),
);
check(
  "an imported slider keeps its bounds in order",
  importedQuestions
    .filter((q) => q.type === QuestionType.SLIDER)
    .every(
      (q) => q.options.join(",") === parsedById.get(q.id)!.options.join(","),
    ),
);
check(
  "an imported puzzle keeps the order that is its answer",
  importedQuestions
    .filter((q) => q.type === QuestionType.PUZZLE)
    .every(
      (q) => q.options.join("|") === parsedById.get(q.id)!.options.join("|"),
    ),
);

/* ------------------------------------------------------------------ *
 * 4. The wheel lands where it points
 * ------------------------------------------------------------------ */

check(
  "the pointer reads the slice a spin planned for, at every slice count",
  [1, 2, 3, 5, 7, 10, 13].every((slices) =>
    Array.from({ length: 200 }).every(() => {
      const plan = planSpin(Math.random() * 1000 - 500, Math.random() * 3000, slices);
      return (
        landedSliceIndex(plan.finalRotation, slices) === plan.landedIndex &&
        plan.landedIndex >= 0 &&
        plan.landedIndex < slices
      );
    }),
  ),
);

check(
  "a spin comes to rest on a slice's centre line, not on a boundary",
  [3, 6, 11].every((slices) =>
    Array.from({ length: 200 }).every(() => {
      const plan = planSpin(0, 900, slices);
      const sliceAngle = 360 / slices;
      const normalized = ((-plan.finalRotation % 360) + 360) % 360;
      const intoSlice = normalized - plan.landedIndex * sliceAngle;
      return Math.abs(intoSlice - sliceAngle / 2) < 1e-6;
    }),
  ),
);

check(
  "a spin always moves the wheel forwards",
  Array.from({ length: 200 }).every(() => {
    const from = Math.random() * 1000;
    return planSpin(from, Math.random() * 3000, 8).finalRotation > from;
  }),
);

/* Every slice is reachable — a wheel that always lands on the same place is
 * the simulated spin this replaced. */
const landings = new Set(
  Array.from({ length: 600 }, () => planSpin(0, 800, 6).landedIndex),
);
check(
  "every slice on the wheel is reachable",
  landings.size === 6,
  `${landings.size} of 6 slices hit in 600 spins`,
);

/* ------------------------------------------------------------------ *
 * 5. The category the wheel lands on is the one that gets played
 *
 * This is the transition `revealCategory` performs, written out against the
 * same helpers the context uses: the landed category is swapped into this
 * round's slot, which is where every screen reads the round's category and
 * questions from.
 * ------------------------------------------------------------------ */

const commit = (state: GameState, landedIndex: number): GameState => {
  const from = Math.max(0, state.currentRound - 1);
  const roundsConfig = [...state.roundsConfig];
  const picked = from + landedIndex;
  [roundsConfig[from], roundsConfig[picked]] = [
    roundsConfig[picked],
    roundsConfig[from],
  ];
  return { ...state, roundsConfig: renumberRounds(roundsConfig) };
};

const baseState = {
  phase: GamePhase.CATEGORY_SELECT,
  mode: GameMode.STANDARD,
  players: [],
  currentPlayerId: null,
  isHost: true,
  gamePin: "1234",
  gameName: "Setup Probe",
  clientPin: null,
  clientPlayerId: null,
  joining: false,
  joinError: null,
  totalRounds: 5,
  questionsPerRound: 5,
  roundsConfig: buildRoundsFromContent(library, { maxQuestions: 5 }),
  importPreview: null,
  currentRound: 1,
  questionsQueue: [],
  usedCategories: [],
  selectedCategory: null,
  bracket: [],
  championId: null,
  lanes: [],
  broadcastQuestionIndex: 0,
  broadcastRevealing: false,
  broadcastRevealSecondsLeft: REVEAL_DURATION,
  autoAdvance: true,
  hostAnsweringEnabled: true,
  wheelSpinning: false,
  categoryRevealed: false,
  categoryLikes: [],
  categoryPoll: null,
  loading: false,
  error: null,
  contentWarning: null,
  initialPin: null,
  roomWarning: null,
} as GameState;

let game = baseState;
const playedOrder: string[] = [];
const wheelWidths: number[] = [];

for (let round = 1; round <= library.length; round++) {
  game = { ...game, currentRound: round };

  // What the wheel draws: the categories still to be played.
  const onTheWheel = game.roundsConfig.slice(round - 1).map((r) => r.category);
  wheelWidths.push(onTheWheel.length);

  const plan = planSpin(0, 1200, onTheWheel.length);
  const landedOn = onTheWheel[plan.landedIndex];

  game = commit(game, plan.landedIndex);
  const played = game.roundsConfig[round - 1];

  if (played.category.id !== landedOn.id) {
    check(`round ${round} plays what the wheel landed on`, false);
  }
  playedOrder.push(played.category.id);
}

check(
  "every round plays the category the wheel landed on",
  playedOrder.length === library.length,
);
check(
  "the wheel loses a slice every round",
  wheelWidths.join(",") === "5,4,3,2,1",
  wheelWidths.join(","),
);
check(
  "no category is played twice and none is lost",
  new Set(playedOrder).size === library.length,
);
check(
  "the questions still with their category after the wheel has moved them",
  game.roundsConfig.every((round) =>
    round.questions.every((q) => q.category === round.category.id),
  ),
);
check(
  "rounds stay numbered by position after every spin",
  game.roundsConfig.every((round, index) => round.roundNumber === index + 1),
);

/* The wheel is not a rotation of a fixed list: across many games the category
 * that comes up first should vary. */
const firstUp = new Set(
  Array.from({ length: 200 }, () => {
    const start = { ...baseState, currentRound: 1 };
    const wheel = start.roundsConfig.map((r) => r.category);
    return commit(start, planSpin(0, 1000, wheel.length).landedIndex)
      .roundsConfig[0].category.id;
  }),
);
check(
  "which category opens the game is decided by the spin",
  firstUp.size === library.length,
  `${firstUp.size} of ${library.length} categories opened a game`,
);

console.log(
  failures === 0
    ? "\nAll game-setup checks passed."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);

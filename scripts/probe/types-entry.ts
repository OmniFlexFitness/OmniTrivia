/**
 * Every question type, checked against the app's own services.
 *
 * Twelve types now share one importer, one grader and one snapshot, and each
 * of them hides its answer somewhere different — a slider's target in its
 * options, a pin's in a field of its own, a match puzzle's in the order its
 * partners are listed. The ways that goes wrong do not look broken from a
 * host's screen: a published question that quietly carries its answer, a
 * near miss that scores nothing or everything, an export that imports back as
 * a different question. So they are checked here:
 *
 *   1. A sheet using every type — and the loose spellings people type —
 *      imports as the questions it describes.
 *   2. The right answer is right, a wrong one is wrong, and a near miss earns
 *      the share of the points it should.
 *   3. Nothing published to a screen gives an answer away.
 *   4. Bots answer every type in a shape the grader accepts.
 *   5. The round engine gives each type its own clock and scores it fairly.
 *   6. Export, then import, gives back the same questions.
 *
 * Run it with `npm run check-question-types`.
 */
import "./dom-stub";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CategoryContent,
  GameMode,
  GamePhase,
  GameState,
  Player,
  Question,
  QuestionType,
} from "../../src/types";
import { REVEAL_DURATION, TIMER_DURATION } from "../../src/constants";
import {
  exportRoundsToCSV,
  parseImportData,
  parseImportDataWithReport,
} from "../../src/services/importService";
import { gradeAnswer, isAnswerCorrect } from "../../src/services/scoring";
import {
  buildSnapshot,
  categorizeGroups,
  matchChoices,
  publicOptions,
  toPublicQuestion,
} from "../../src/services/snapshot";
import { botAnswerFor } from "../../src/services/botAnswers";
import { shuffleOptions } from "../../src/services/questionSet";
import { questionSeconds, parseQuestionType, QUESTION_TYPES } from "../../src/services/questionTypes";
import {
  answerPoints,
  buildRoundLanes,
  recordLaneAnswer,
  seatForPlayer,
} from "../../src/services/lanes";
import { MAP_FRAMES, geoPinTarget, mapAspect } from "../../src/services/mapProjection";

let failures = 0;
const check = (label: string, passed: boolean, detail = ""): void => {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
};
const section = (title: string): void => console.log(`\n${title}`);

/* ------------------------------------------------------------------ *
 * 1. Importing every type
 * ------------------------------------------------------------------ */

section("1. A sheet with every type imports as the questions it describes");

const csv = [
  "type,category,question,option1,option2,option3,option4,option5,option6,correctAnswer,explanation,image,margin,unit,timeLimit",
  "MULTIPLE_CHOICE,Science,Which planet is red?,Mars,Venus,Jupiter,Mercury,,,Mars,,,,,",
  "Select all that apply,Science,Which are gas giants?,Jupiter,Mars,Saturn,Venus,,,Jupiter|Saturn,,,,,",
  "true/false,Science,Sound travels faster in water than in air.,,,,,,,True,,,,,",
  "TF,Science,The Sun is a planet.,True,False,,,,,F,,,,,",
  "SLIDER,History,In what year did Apollo 11 land?,1950,1990,1,1969,1969,,1969,,,medium,,",
  "RANGE,Geography,How tall is Everest in metres?,5000,10000,10,,,,8849,,,,m,",
  'CLOSEST,Science,How far away is the Moon?,,,,,,,"384,400 km",,,,,',
  "PIN,Geography,Where is Paris?,48.8566,2.3522,400,,,,Paris,,world,,,",
  "Pin answer,Florida,Where is Fort Myers?,26.64,-81.87,100,,,,Fort Myers,,USA,,,",
  "PIN,Art,Where is the red square?,https://example.com/grid.png,40,30,5,,,The red square,,,,,",
  "PIN,Art,Where is the blue circle?,60,40,8,,,,The blue circle,,https://example.com/shapes.png,high,,",
  "ORDER,History,Put these in order,World War I,World War II,Korean War,Vietnam War,,,x,,,,,",
  "MATCH,Science,Match the symbol to the element,Au = Gold,Ag = Silver,Fe -> Iron,Na → Sodium,,,See the pairs,,,,,",
  "SORT,Food,Fruit or vegetable?,Tomato = Fruit,Carrot = Vegetable,Cucumber = Fruit,Potato = Vegetable,Pepper = Fruit,Onion = Vegetable,See the groups,,,,,",
  "ANAGRAM,Fitness,Unscramble this muscle,,,,,,,Hamstring,,,,,45",
  "SCRAMBLE,Geography,The Big Apple,,,,,,,New York,,,,,",
].join("\n");

const report = parseImportDataWithReport(csv);
const imported = Object.values(report.contents).flatMap((c) => c.questions);
const byText = (fragment: string): Question => {
  const found = imported.find((q) => q.text.includes(fragment));
  if (!found) throw new Error(`no question containing "${fragment}" — skipped: ${JSON.stringify(report.skipped)}`);
  return found;
};

check(
  "every row imports, none skipped",
  imported.length === 16 && report.skipped.length === 0,
  `${imported.length} imported, skipped: ${report.skipped.map((s) => s.reason).join("; ") || "none"}`,
);

const mc = byText("planet is red");
const multi = byText("gas giants");
const tfTrue = byText("Sound travels");
const tfFalse = byText("Sun is a planet");
const slider = byText("Apollo 11");
const range = byText("Everest");
const closest = byText("Moon");
const paris = byText("Paris");
const fortMyers = byText("Fort Myers");
const redSquare = byText("red square");
const blueCircle = byText("blue circle");
const order = byText("in order");
const match = byText("symbol to the element");
const sort = byText("Fruit or vegetable");
const anagram = byText("muscle");
const scramble = byText("Big Apple");

check("type aliases resolve", [
  [multi, QuestionType.MULTI_SELECT],
  [tfTrue, QuestionType.TRUE_FALSE],
  [tfFalse, QuestionType.TRUE_FALSE],
  [closest, QuestionType.NUMBER],
  [fortMyers, QuestionType.PIN],
  [order, QuestionType.PUZZLE],
  [sort, QuestionType.CATEGORIZE],
  [anagram, QuestionType.SCRAMBLE],
].every(([q, type]) => (q as Question).type === type));

check(
  "every alias in the type table resolves to its own type",
  Object.values(QUESTION_TYPES).every((info) =>
    [info.type, ...info.aliases].every((alias) => parseQuestionType(alias) === info.type),
  ),
);

check(
  "multi-select marks every correct option",
  multi.correctIndices?.map((i) => multi.options[i]).join("|") === "Jupiter|Saturn",
  multi.correctIndices?.join(","),
);
check(
  "true/false accepts T/F shorthand and an empty option row",
  tfTrue.correctIndex === 0 && tfFalse.correctIndex === 1 &&
    tfTrue.options.join("/") === "True/False",
);
check("a margin column is read", slider.margin === "medium");
check(
  "a range with its answer in the answer column becomes an exact target",
  range.options.join(",") === "5000,10000,10,8849,8849" && range.unit === "m",
  range.options.join(","),
);
check(
  "a closest-number answer written with commas and a unit reads as a number and a unit",
  closest.options[0] === "384400" && closest.unit === "km",
  `${closest.options[0]} / ${closest.unit}`,
);
check(
  "a pin on the world map is placed from latitude and longitude",
  paris.image === "map:world" &&
    Math.abs(paris.pin!.x - (2.3522 + 180) / 360) < 1e-6 &&
    paris.pin!.radius > 0,
  JSON.stringify(paris.pin),
);
check(
  "a pin on the US map lands on Fort Myers, not in the Gulf",
  fortMyers.image === "map:usa" && fortMyers.pin!.x > 0.75 && fortMyers.pin!.y > 0.85,
  JSON.stringify(fortMyers.pin),
);
check(
  "a pin picture can come from the first option when there is no image column",
  redSquare.image === "https://example.com/grid.png" &&
    Math.abs(redSquare.pin!.x - 0.4) < 1e-9 &&
    Math.abs(redSquare.pin!.radius - 0.05) < 1e-9,
  JSON.stringify(redSquare.pin),
);
check(
  "a pin picture from the image column, spot in percent",
  blueCircle.image === "https://example.com/shapes.png" &&
    Math.abs(blueCircle.pin!.y - 0.4) < 1e-9 &&
    blueCircle.margin === "high",
);
check(
  "match pairs are read on any of the separators",
  match.options.join("|") === "Au|Ag|Fe|Na" &&
    match.pairs?.join("|") === "Gold|Silver|Iron|Sodium",
);
check(
  "a sort reads its items and their groups",
  sort.options.length === 6 && categorizeGroups(sort).join("|") === "Fruit|Vegetable",
);
check("a time limit column is read", anagram.timeLimit === 45);

/* The ways a row is refused, each with a reason the host is shown. */
const refused = parseImportDataWithReport(
  [
    "type,category,question,option1,option2,option3,option4,correctAnswer",
    "TRUE_FALSE,X,Is it?,,,,,Maybe",
    "MULTI_SELECT,X,Which?,A,B,C,D,A|Z",
    "PIN,X,Where?,,,,,Somewhere",
    "PIN,X,Where on the US map is Honolulu?,usa,21.3,-157.8,,Honolulu",
    "MATCH,X,Match these,A = 1,B = 1,,,x",
    "MATCH,X,Match these too,A = 1,B,,,x",
    "CATEGORIZE,X,Sort these,A = 1,B = 1,C = 1,D = 1,x",
    "SCRAMBLE,X,Unscramble,,,,,aa",
    "SLIDER,X,How many?,10,1,1,,5",
    "MULTIPLE_CHOICE,X,Which?,A,B,C,D,E",
    "MULTIPLE_CHOICE,X,Fine one?,A,B,C,D,A",
  ].join("\n"),
);
const refusedReasons = refused.skipped.map((s) => s.reason);
check(
  "a malformed row is left out with a reason, never guessed at",
  refused.skipped.length === 10 &&
    Object.values(refused.contents).flatMap((c) => c.questions).length === 1,
  refusedReasons.join(" | "),
);

/* ------------------------------------------------------------------ *
 * 2. Grading
 * ------------------------------------------------------------------ */

section("2. Right is right, wrong is wrong, and a near miss pays its share");

const grade = (q: Question, answer: Parameters<typeof gradeAnswer>[1]) => gradeAnswer(q, answer);
const near = (credit: number, expected: number) => Math.abs(credit - expected) < 0.011;

check("multiple choice", isAnswerCorrect(mc, 0) === (mc.options[0] === "Mars"));
check(
  "multi-select: the exact set is right; one wrong pick cancels one right one",
  grade(multi, multi.correctIndices!).correct &&
    near(grade(multi, [multi.correctIndices![0]]).credit, 0.5) &&
    grade(multi, multi.options.map((_, i) => i)).credit === 0,
);
check(
  "slider: a near miss inside the margin scores part, off it scores nothing",
  grade(slider, 1969).correct &&
    !grade(slider, 1972).correct &&
    near(grade(slider, 1972).credit, 0.5) &&
    grade(slider, 1980).credit === 0,
  `1972 → ${grade(slider, 1972).credit}`,
);
check(
  "slider with no margin is exact, as every slider was before margins",
  grade({ ...slider, margin: undefined }, 1970).credit === 0,
);
check(
  "range: a tight catch earns it all, a loose one less, a miss nothing",
  grade(range, [8800, 8900]).credit === 1 &&
    grade(range, [7000, 9500]).correct &&
    near(grade(range, [7000, 9500]).credit, 0.2) &&
    !grade(range, [9000, 9500]).correct &&
    !grade(range, [5000, 10000]).correct,
  `loose → ${grade(range, [7000, 9500]).credit}`,
);
check(
  "closest number: dead on is right, near is partial, way off is nothing",
  grade(closest, 384400).correct &&
    near(grade(closest, 400000).credit, 0.84) &&
    grade(closest, "384,400").correct &&
    grade(closest, 900000).credit === 0,
  `400,000 → ${grade(closest, 400000).credit}`,
);
{
  const world = MAP_FRAMES.world;
  const at = (lat: number, lng: number) => {
    const target = geoPinTarget(world, lat, lng, 1)!;
    return [target.x, target.y];
  };
  const berlin = grade(paris, at(52.52, 13.405));
  check(
    "pin: on target is right, the next country over is partial, another continent is nothing",
    grade(paris, at(48.86, 2.35)).correct &&
      !berlin.correct && berlin.credit > 0 && berlin.credit < 1 &&
      grade(paris, at(-33.87, 151.21)).credit === 0,
    `Berlin → ${berlin.credit}`,
  );
  check(
    "pin: distances on a built-in map use the map's own shape, whatever the phone says",
    gradeAnswer(paris, [...at(52.52, 13.405), 9]).credit === berlin.credit,
  );
}
check(
  "pin on a picture: the aspect a phone reports stretches distance down the picture",
  gradeAnswer(redSquare, [0.4, 0.33, 1]).correct && !gradeAnswer(redSquare, [0.4, 0.33, 3]).correct,
);
check(
  "order puzzle: all or nothing",
  grade(order, [...order.options]).correct &&
    grade(order, [order.options[1], order.options[0], ...order.options.slice(2)]).credit === 0,
);
check(
  "match: half right is a third of the points once guessing is taken out",
  near(
    grade(match, { Au: "Silver", Ag: "Gold", Fe: "Iron", Na: "Sodium" }).credit,
    0.33,
  ) && grade(match, { Au: "Gold", Ag: "Silver", Fe: "Iron", Na: "Sodium" }).correct,
);
check(
  "sort: putting everything in one group is no better than guessing, and scores nothing",
  grade(sort, Object.fromEntries(sort.options.map((item) => [item, "Fruit"]))).credit === 0,
);
check(
  "scramble: case and spacing do not matter, the letters do",
  grade(scramble, "new york").correct &&
    grade(scramble, "NEWYORK").correct &&
    !grade(scramble, "YORKNEW").correct,
);
check(
  "a malformed answer is wrong, not an error",
  [mc, multi, slider, range, closest, paris, order, match, sort, scramble].every((q) =>
    [null as any, undefined as any, {}, [], "", "x", 3, ["a"]].every(
      (bad) => gradeAnswer(q, bad).credit === 0,
    ),
  ),
);

/* ------------------------------------------------------------------ *
 * 3. Nothing published gives an answer away
 * ------------------------------------------------------------------ */

section("3. What reaches a screen never carries the answer");

const published = (q: Question) => JSON.stringify(toPublicQuestion(q));
check(
  "slider and range publish their scale and nothing else",
  [slider, range].every((q) => publicOptions(q).length === 3),
);
check("a closest-number question publishes no number", publicOptions(closest).length === 0 && !published(closest).includes("384400"));
check(
  "a pin question publishes its picture and not its target",
  [paris, fortMyers, redSquare].every((q) => {
    const pub = toPublicQuestion(q) as any;
    return pub.image === q.image && pub.pin === undefined && pub.options.length === 0;
  }),
);
check(
  "a match puzzle's partners never line up with their items",
  Array.from({ length: 60 }).every((_, n) => {
    const q = { ...match, id: `match-${n}` };
    const shown = matchChoices(q);
    return shown.some((item, i) => item !== q.pairs![i]) &&
      [...shown].sort().join() === [...q.pairs!].sort().join();
  }),
);
check(
  "a sort's items are never shown in the order they were written, nor with their groups",
  Array.from({ length: 60 }).every((_, n) => {
    const q = { ...sort, id: `sort-${n}` };
    const pub = toPublicQuestion(q);
    return pub.options.join() !== q.options.join() && !("pairs" in pub);
  }),
);
check(
  "a scramble's tiles never spell the word",
  Array.from({ length: 60 }).every((_, n) => {
    const q = { ...anagram, id: `scramble-${n}` };
    const tiles = publicOptions(q);
    return tiles.join("") !== "HAMSTRING" && [...tiles].sort().join("") === [..."HAMSTRING"].sort().join("");
  }),
);
check("a scramble says how long each word is", toPublicQuestion(scramble).choices?.join(",") === "3,4");
check(
  "an order puzzle is never published in its answer order",
  Array.from({ length: 60 }).every((_, n) =>
    publicOptions({ ...order, id: `order-${n}` }).join() !== order.options.join(),
  ),
);

/* ------------------------------------------------------------------ *
 * 4. Bots
 * ------------------------------------------------------------------ */

section("4. Bots answer every type in a shape the grader accepts");

const everyType = [mc, multi, tfTrue, slider, range, closest, paris, fortMyers, redSquare, order, match, sort, anagram];
check(
  "a bot meaning to be right is right, with full credit",
  everyType.every((q) => {
    const g = gradeAnswer(q, botAnswerFor(q, true));
    return g.correct && g.credit === 1;
  }),
  everyType.filter((q) => gradeAnswer(q, botAnswerFor(q, true)).credit !== 1).map((q) => q.type).join(", "),
);
check(
  "a bot meaning to be wrong is wrong",
  everyType.every((q) => !gradeAnswer(q, botAnswerFor(q, false, () => 0.3)).correct),
  everyType.filter((q) => gradeAnswer(q, botAnswerFor(q, false, () => 0.3)).correct).map((q) => q.type).join(", "),
);
check(
  "a multi-select keeps its correct answers through the deal's shuffle",
  Array.from({ length: 40 }).every(() => {
    const dealt = shuffleOptions(multi);
    return dealt.correctIndices!.map((i) => dealt.options[i]).sort().join() === "Jupiter,Saturn" &&
      dealt.correctIndex === dealt.correctIndices![0];
  }),
);

/* ------------------------------------------------------------------ *
 * 5. The round engine
 * ------------------------------------------------------------------ */

section("5. Each type gets its own clock, and the clock is worth the same on all of them");

check(
  "a fifteen-second question pays exactly what it always has",
  answerPoints(1, TIMER_DURATION, TIMER_DURATION, 1) === 100 + TIMER_DURATION * 10 &&
    answerPoints(1, 7, TIMER_DURATION, 1) === 170,
);
check(
  "a full clock is worth the same on a thirty-second puzzle",
  answerPoints(1, 30, 30, 1) === answerPoints(1, 15, 15, 1),
);
check("half credit is half the points", answerPoints(0.5, 15, 15, 2) === 250);
check(
  "a puzzle gets longer than a true/false, and a question can set its own clock",
  questionSeconds(order) > questionSeconds(tfTrue) &&
    questionSeconds(anagram) === 45 &&
    questionSeconds({ ...mc, timeLimit: 999 }) === 120 &&
    questionSeconds(mc) === TIMER_DURATION,
);

const players: Player[] = ["p1", "p2"].map((id) => ({
  id,
  name: id,
  avatar: "🐼",
  score: 0,
  roundScore: 0,
  isBot: false,
  streak: 0,
}));
const round = [paris, slider, sort, scramble];
const start: GameState = {
  phase: GamePhase.PLAYING,
  mode: GameMode.STANDARD,
  players,
  currentPlayerId: "p1",
  isHost: true,
  gamePin: "1234",
  broadcastTitle: "Trivia",
  broadcastSubtitle: "",
  gameName: "Types",
  hostPassword: "",
  clientPin: null,
  clientPlayerId: null,
  joining: false,
  joinError: null,
  resuming: false,
  resumeError: null,
  totalRounds: 1,
  questionsPerRound: round.length,
  roundsConfig: [
    { roundNumber: 1, category: { id: "geo", name: "Geography", icon: "🌍", color: "bg-blue-500" }, questions: round },
  ],
  importPreview: null,
  currentRound: 1,
  questionsQueue: round,
  usedCategories: [],
  selectedCategory: "geo",
  bracket: [],
  championId: null,
  lanes: [],
  broadcastQuestionIndex: 0,
  broadcastRevealing: false,
  broadcastRevealSecondsLeft: REVEAL_DURATION,
  autoAdvance: true,
  losersBracket: false,
  qualifyingRounds: 0,
  botsEnabled: false,
  hostAnsweringEnabled: true,
  wheelSpinning: false,
  categoryRevealed: true,
  categoryLikes: [],
  categoryPoll: null,
  loading: false,
  error: null,
  contentWarning: null,
  initialPin: null,
  roomWarning: null,
};
let state: GameState = { ...start, lanes: buildRoundLanes(start) };
const seatOf = (id: string) => seatForPlayer(state.lanes, id)!;

check(
  "the first question's clock is the pin question's clock",
  seatOf("p1").timeLeft === questionSeconds(paris) && seatOf("p1").questionDuration === questionSeconds(paris),
  `${seatOf("p1").timeLeft}s`,
);

const parisSpot = [paris.pin!.x, paris.pin!.y, mapAspect(MAP_FRAMES.world)];
state = recordLaneAnswer(state, "p1", parisSpot);
const berlinSpot = (() => {
  const t = geoPinTarget(MAP_FRAMES.world, 52.52, 13.405, 1)!;
  return [t.x, t.y];
})();
state = recordLaneAnswer(state, "p2", berlinSpot);
const p1 = state.players.find((p) => p.id === "p1")!;
const p2 = state.players.find((p) => p.id === "p2")!;
check(
  "a pin on target scores in full, with the time bonus scaled to the pin's clock",
  p1.roundScore === answerPoints(1, questionSeconds(paris), questionSeconds(paris), 1) && p1.streak === 1,
  `${p1.roundScore} points`,
);
check(
  "a near-miss pin scores some points, but is not marked right and breaks no streak record",
  p2.roundScore > 0 && p2.roundScore < p1.roundScore && p2.streak === 0,
  `${p2.roundScore} points`,
);

// Finish the round and read the answer key the room is shown.
const ended: GameState = { ...state, phase: GamePhase.ROUND_END };
const snapshot = buildSnapshot(ended, "host");
const pinReview = snapshot.roundReview?.[0];
check(
  "the answer key counts a near miss as close, not as right",
  pinReview?.correctCount === 1 && pinReview?.closeCount === 1 && pinReview?.answeredCount === 2,
);
check(
  "the answer key carries where every pin landed, and the target to draw them against",
  pinReview?.responses?.length === 2 && Boolean(pinReview?.reveal.pin) && pinReview?.reveal.image === "map:world",
);
check(
  "a live snapshot never carries a pin's target",
  !JSON.stringify(buildSnapshot(start, "host")).includes(`"pin":`),
);

/* ------------------------------------------------------------------ *
 * 6. Export and import again
 * ------------------------------------------------------------------ */

section("6. Exporting a game and importing it again gives back the same questions");

const roundTrip = parseImportData(exportRoundsToCSV(report.contents));
const again = Object.values(roundTrip).flatMap((c: CategoryContent) => c.questions);
const same = (a: Question, b: Question | undefined): boolean => {
  if (!b) return false;
  const close = (x?: number, y?: number) => Math.abs((x ?? 0) - (y ?? 0)) < 1e-3;
  return (
    a.type === b.type &&
    a.options.join("|") === b.options.join("|") &&
    (a.pairs ?? []).join("|") === (b.pairs ?? []).join("|") &&
    (a.correctIndices ?? []).join() === (b.correctIndices ?? []).join() &&
    a.correctIndex === b.correctIndex &&
    (a.margin ?? "") === (b.margin ?? "") &&
    (a.unit ?? "") === (b.unit ?? "") &&
    (a.timeLimit ?? 0) === (b.timeLimit ?? 0) &&
    (a.image ?? "") === (b.image ?? "") &&
    close(a.pin?.x, b.pin?.x) && close(a.pin?.y, b.pin?.y) && close(a.pin?.radius, b.pin?.radius)
  );
};
const drifted = imported.filter((q) => !same(q, again.find((b) => b.text === q.text)));
check(
  "every type survives the round trip",
  drifted.length === 0 && again.length === imported.length,
  drifted.map((q) => `${q.type}: ${q.text}`).join(" / "),
);

/* ------------------------------------------------------------------ *
 * The example file
 * ------------------------------------------------------------------ */

section("The example file covers every type");

const repoRoot = process.env.PROBE_REPO_ROOT ?? process.cwd();
const example = parseImportDataWithReport(readFileSync(join(repoRoot, "questions.example.csv"), "utf8"));
const exampleTypes = new Set(Object.values(example.contents).flatMap((c) => c.questions).map((q) => q.type));
const missing = Object.values(QuestionType).filter((type) => !exampleTypes.has(type));
check(
  "questions.example.csv has at least one of every type, and every row plays",
  missing.length === 0 && example.skipped.length === 0,
  [missing.length ? `missing ${missing.join(", ")}` : "", example.skipped.map((s) => `row ${s.row}: ${s.reason}`).join("; ")]
    .filter(Boolean)
    .join(" — "),
);

console.log(failures === 0 ? "\nAll question-type checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);

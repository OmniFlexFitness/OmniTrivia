/**
 * The premade question bank, fetched and parsed by the app's own services.
 *
 * The bank is a Google Sheet somebody keeps editing, which is the good part —
 * new questions are live without a deploy — and also the risk: nothing in this
 * repository stops a row being typed in a shape the importer cannot read, and
 * the first anyone would know is a host tapping USE THE QUESTION BANK in front
 * of a room. So this pulls the real sheet down the real path and says what the
 * app makes of it.
 *
 * Run it with `npm run check-question-bank`. It needs the network and nothing
 * else — no key, no Firebase, no browser.
 */
import "./dom-stub";
import { DEFAULT_QUESTION_BANK } from "../../src/constants";
import {
  fetchDefaultQuestionBank,
  parseImportDataWithReport,
} from "../../src/services/importService";
import { isPlayable } from "../../src/services/questionQuality";
import { buildRoundsFromContent } from "../../src/services/questionSet";
import { isAnswerCorrect } from "../../src/services/scoring";
import { publicOptions } from "../../src/services/snapshot";
import { CategoryContent, Question, QuestionType } from "../../src/types";

let failures = 0;
const check = (label: string, passed: boolean, detail = ""): void => {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
};

console.log(`\nReading ${DEFAULT_QUESTION_BANK.name}\n${DEFAULT_QUESTION_BANK.url}\n`);

let csv = "";
try {
  csv = await fetchDefaultQuestionBank();
} catch (error: any) {
  console.log(`FAIL the bank could not be reached — ${error?.message ?? error}`);
  console.log(
    "\nThe sheet has to be shared as 'anyone with the link can view'.\n",
  );
  process.exit(1);
}

// `\r` counts: the sheet is exported CRLF, and a parser that splits on `\n`
// alone leaves one on the end of every last column.
const rows = csv.trim().split("\n").length - 1;
check("the bank downloads", csv.length > 0, `${rows} rows, ${csv.length} bytes`);

const report = parseImportDataWithReport(csv);
const contents: CategoryContent[] = Object.values(report.contents);
const questions: Question[] = contents.flatMap((c) => c.questions);

// A row is either played or eliminated for a reason the host is told — never
// lost without a word. Placeholder answers ("Placeholder 1") are eliminated on
// purpose, so they are counted here rather than treated as a failure.
check(
  "every row in the sheet is either a question or eliminated with a reason",
  questions.length + report.skipped.length === rows,
  `${questions.length} playable, ${report.skipped.length} eliminated, ${rows - questions.length - report.skipped.length} unaccounted for`,
);
check(
  "no placeholder makes it into a game",
  questions.every((q) => isPlayable(q)) &&
    !questions.some((q) => q.options.some((o) => /placeholder/i.test(o))),
);

check(
  "the bank has enough categories for a full night",
  contents.length >= 10,
  `${contents.length} categories`,
);

/* Every question has to be answerable and has to have exactly one answer that
 * the scoring service agrees is right. A question pointing past the end of its
 * own options is the failure that does not look like one: it plays, it just
 * never marks anybody correct. */
check(
  "every question points at an answer it actually has",
  questions.every(
    (q) =>
      q.options.length > 0 &&
      q.correctIndex >= 0 &&
      q.correctIndex < q.options.length,
  ),
);

const gradedRight = questions.filter((q) => {
  switch (q.type) {
    case QuestionType.TYPE_ANSWER:
      return isAnswerCorrect(q, q.options[0]);
    case QuestionType.SLIDER:
      return isAnswerCorrect(q, Number(q.options[3]));
    case QuestionType.PUZZLE:
      return isAnswerCorrect(q, [...q.options]);
    default:
      return isAnswerCorrect(q, q.correctIndex);
  }
});
check(
  "the right answer is scored as right, every time",
  gradedRight.length === questions.length,
  `${gradedRight.length} of ${questions.length}`,
);

/* A multiple-choice question with one option is a question with the answer
 * already on it. */
const tooFewOptions = questions.filter(
  (q) =>
    (q.type ?? QuestionType.MULTIPLE_CHOICE) === QuestionType.MULTIPLE_CHOICE &&
    q.options.length < 2,
);
check(
  "no multiple-choice question is left with a single option",
  tooFewOptions.length === 0,
  tooFewOptions
    .slice(0, 3)
    .map((q) => q.text)
    .join(" / "),
);

/* What the room is shown must not contain the answer. A typed answer publishes
 * no options at all — that is the check — and nothing else may publish an
 * empty list, because an empty list is a question nobody can answer. */
const leaks = questions.filter(
  (q) =>
    q.type !== QuestionType.TYPE_ANSWER && publicOptions(q).length === 0,
);
check("every published question still has something to answer", leaks.length === 0);

/* And the shape a host actually gets: three rounds of five out of a library
 * this size should come out full every time. */
const game = buildRoundsFromContent(contents, {
  maxCategories: 3,
  maxQuestions: 5,
});
check(
  "a three-round, five-question game comes out of the bank full",
  game.length === 3 && game.every((round) => round.questions.length === 5),
  game.map((r) => `${r.category.name}:${r.questions.length}`).join(", "),
);

const byType = new Map<string, number>();
questions.forEach((q) =>
  byType.set(q.type ?? "?", (byType.get(q.type ?? "?") ?? 0) + 1),
);

console.log("\nWhat is in the bank");
console.log(
  `  ${questions.length} questions across ${contents.length} categories`,
);
[...byType.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => console.log(`  ${String(count).padStart(5)}  ${type}`));
console.log(
  `  ${questions.filter((q) => !q.explanation).length} with no explanation (the reveal just shows the answer)`,
);

console.log(
  failures === 0
    ? "\nThe question bank is good to play.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);

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
  fetchFromGoogleSheet,
  parseImportDataWithReport,
} from "../../src/services/importService";
import { isPlayable } from "../../src/services/questionQuality";
import { buildRoundsFromContent } from "../../src/services/questionSet";
import { isAnswerCorrect } from "../../src/services/scoring";
import { botAnswerFor } from "../../src/services/botAnswers";
import { publicOptions } from "../../src/services/snapshot";
import { CategoryContent, Question, QuestionType } from "../../src/types";

let failures = 0;
const check = (label: string, passed: boolean, detail = ""): void => {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
};

/* Which tab a pasted link reads. Checked first, offline, against a stand-in
 * for Google's export endpoint, because the bank cannot exercise it: the
 * bank's link names its tab, and the link that needs the fallback (an Excel
 * file kept in Drive) names none. The stand-in answers the way docs.google.com
 * does: a tab id that exists exports that tab, one that does not is a 400, and
 * no id at all exports the leftmost tab. */
console.log("\nWhich tab a pasted link reads (offline)\n");

const SHEETS: Record<string, { leftmost: string; tabs: Record<string, string> }> = {
  // Made in Google Sheets, with tab 0 dragged off the left end.
  native: { leftmost: "7", tabs: { "0": "tab zero", "7": "tab seven" } },
  // An .xlsx opened from Drive: no tab 0, only large random ids.
  excel: { leftmost: "2132467210", tabs: { "2132467210": "first tab" } },
};
const asked: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const gid = url.searchParams.get("gid");
  asked.push(gid === null ? "no gid" : `gid=${gid}`);
  const sheet = SHEETS[url.pathname.split("/")[3]];
  const body = sheet?.tabs[gid ?? sheet.leftmost];
  return body === undefined
    ? new Response("Sorry, unable to open the file at this time.", { status: 400 })
    : new Response(body, { status: 200 });
}) as typeof fetch;

const readLink = async (path: string) => {
  asked.length = 0;
  try {
    const csv = await fetchFromGoogleSheet(`https://docs.google.com/spreadsheets/d/${path}`);
    return { csv, error: "", asked: asked.join(", ") };
  } catch (error: any) {
    return { csv: "", error: String(error?.message ?? error), asked: asked.join(", ") };
  }
};

const nativeNoGid = await readLink("native/edit?usp=sharing");
check(
  "a native sheet's link with no tab still reads tab 0, in one request",
  nativeNoGid.csv === "tab zero" && nativeNoGid.asked === "gid=0",
  nativeNoGid.asked,
);
const nativeTab = await readLink("native/edit#gid=7");
check(
  "a link that names a tab reads that tab",
  nativeTab.csv === "tab seven" && nativeTab.asked === "gid=7",
  nativeTab.asked,
);
const excelShare = await readLink(
  "excel/edit?usp=sharing&ouid=114124429795052735817&rtpof=true&sd=true",
);
check(
  "an Excel file's share link, which has no tab 0, falls back to its first tab",
  excelShare.csv === "first tab" && excelShare.asked === "gid=0, no gid",
  excelShare.asked || excelShare.error,
);
const excelTab = await readLink("excel/edit?gid=2132467210#gid=2132467210");
check(
  "an Excel file's link that names its tab reads it directly",
  excelTab.csv === "first tab" && excelTab.asked === "gid=2132467210",
  excelTab.asked,
);
const goneTab = await readLink("native/edit#gid=99");
check(
  "a named tab that is gone is an error, never quietly a different tab",
  goneTab.csv === "" && goneTab.error !== "" && goneTab.asked === "gid=99",
  goneTab.asked,
);
const unreachable = await readLink("missing/edit");
check(
  "a sheet that cannot be read at all is tried once each way, then explained",
  unreachable.asked === "gid=0, no gid" &&
    unreachable.error.includes("Anyone with the link can view") &&
    unreachable.error.includes("tab"),
  unreachable.error,
);

globalThis.fetch = realFetch;

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

// What a player who knows the answer would send, built the same way the
// bots build theirs — so every type in the sheet is graded on its own terms.
const gradedRight = questions.filter((q) => isAnswerCorrect(q, botAnswerFor(q, true)));
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

/* What the room is shown must not contain the answer. A typed answer, a
 * closest-number guess and a pin publish no options at all — that is the
 * check — and nothing else may publish an empty list, because an empty list
 * is a question nobody can answer. */
const NOTHING_TO_SHOW = new Set<QuestionType | undefined>([
  QuestionType.TYPE_ANSWER,
  QuestionType.NUMBER,
  QuestionType.PIN,
]);
const leaks = questions.filter(
  (q) => !NOTHING_TO_SHOW.has(q.type) && publicOptions(q).length === 0,
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

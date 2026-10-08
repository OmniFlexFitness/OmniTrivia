/**
 * Draws the pictures in QUESTION_FORMAT.md.
 *
 *   npm i --no-save playwright@1.56    # once; it does not touch package.json
 *   npx playwright install chromium    # once, if no Chromium is installed
 *   node scripts/generate-format-images.mjs            # everything
 *   node scripts/generate-format-images.mjs --sheets   # just the sheet pictures
 *
 * Two kinds of picture, both drawn from `questions.example.csv`, so neither can
 * show a row the importer would not take (`npm run check-question-types`
 * proves the example file imports, every format, nothing left out):
 *
 *   <format>-sheet.png  The format's rows from the template, turned on their
 *                       side, with what every cell it reads means.
 *   <format>-play.jpg   The same question in a real game: a player's phone
 *                       with an answer filled in, the big screen, and the
 *                       question's card in the answer key after the round.
 *
 * The game is the real app, played: this starts the Vite dev server, hosts a
 * game in one tab, opens the big screen in another and joins as a player in a
 * third, the way LOCAL_PLAY.md describes, and plays one round of one question
 * of every format. Nothing is mocked, so the pictures are what a room sees.
 *
 * The output is committed, so nobody needs to run this to read the guide —
 * only to redraw it after the example file, a format or a screen changes.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAP_FRAMES, geoPinTarget } from "../src/services/mapProjection.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const outDir = join(root, "docs", "images", "question-format");
const onlySheets = process.argv.includes("--sheets");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "\n  Playwright is not installed. Run this first (it does not touch package.json):\n" +
      "    npm i --no-save playwright@1.56\n" +
      "    npx playwright install chromium\n",
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * The example file, as the template lays it out
 * ------------------------------------------------------------------ */

/** One CSV line as cells. The format forbids line breaks inside a cell. */
const csvCells = (line) => {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
};

const csvLine = (cells) =>
  cells.map((cell) => (/[",]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",");

const lines = readFileSync(join(root, "questions.example.csv"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "");
const header = csvCells(lines[0]);
/** Every example row, with the row number it has in the template. */
const rows = lines.slice(1).map((line, i) => {
  const cells = csvCells(line);
  return {
    sheetRow: i + 2,
    raw: cells,
    cells: Object.fromEntries(header.map((name, c) => [name, cells[c] ?? ""])),
  };
});

const letter = (index) => {
  let n = index + 1;
  let text = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    text = String.fromCharCode(65 + r) + text;
    n = Math.floor((n - 1) / 26);
  }
  return text;
};

const escape = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ *
 * What each format reads, cell by cell
 * ------------------------------------------------------------------ */

/**
 * For each format: which example rows its sheet picture shows, its badge and
 * colours (the review screen's), and a note for every column it reads. A
 * `span` gives a run of columns one shared note; `show` adds a column worth
 * seeing even when it is empty. `type` is the format a game deals, for the
 * play picture; the shorthand has none of its own.
 */
const FORMATS = [
  {
    file: "multiple-choice",
    type: "MULTIPLE_CHOICE",
    badge: "Multiple choice",
    tone: ["#e0f2fe", "#0369a1"],
    limit: 1,
    notes: {
      type: "MULTIPLE_CHOICE, or leave it blank: this is the default",
      option1: "The choices, one per column. Two or more",
      correctAnswer: "The right option, as written in its column. Not its letter or number",
    },
    span: { option1: ["option1", "option4"] },
  },
  {
    file: "multi-select",
    type: "MULTI_SELECT",
    badge: "Multi-select",
    tone: ["#cffafe", "#0e7490"],
    notes: {
      type: "MULTI_SELECT. Required: a blank type reads as multiple choice",
      option1: "The choices, one per column. Three or more",
      correctAnswer: "Every right option, joined with | or ; (never commas)",
    },
    span: { option1: ["option1", "option4"] },
  },
  {
    file: "true-false",
    type: "TRUE_FALSE",
    badge: "True / false",
    tone: ["#f3e8ff", "#7e22ce"],
    limit: 1,
    notes: {
      type: "TRUE_FALSE (TF and True/False work too)",
      question: "A statement for the room to call",
      option1: "True and False, or leave both empty",
      correctAnswer: "True or False (T/F, Yes/No, Fact/Fiction and 1/0 work too)",
    },
    span: { option1: ["option1", "option2"] },
  },
  {
    file: "type-answer",
    type: "TYPE_ANSWER",
    badge: "Type answer",
    tone: ["#fef9c3", "#a16207"],
    notes: {
      type: "TYPE_ANSWER",
      option1: "Every spelling you accept. option1 is the one the reveal shows",
      correctAnswer: "Required, but once options are filled in they are the answer",
    },
    span: { option1: ["option1", "option3"] },
  },
  {
    file: "slider",
    type: "SLIDER",
    badge: "Slider",
    tone: ["#ffedd5", "#c2410c"],
    notes: {
      type: "SLIDER",
      option1: "Lowest number on the slider",
      option2: "Highest number on the slider",
      option3: "Step: how far one notch moves. Never leave it blank",
      option4: "Lowest answer that scores in full",
      option5: "Highest answer that scores in full",
      correctAnswer: "Required, but option4 and option5 are the answer when filled in",
      margin: "How much a near miss still scores",
    },
  },
  {
    file: "range",
    type: "RANGE",
    badge: "Range",
    tone: ["#fef3c7", "#b45309"],
    notes: {
      type: "RANGE",
      option1: "Lowest number on the scale",
      option2: "Highest number on the scale",
      option3: "Step",
      correctAnswer: "The exact answer players have to catch",
      unit: "What the number counts, shown after it",
    },
  },
  {
    file: "number",
    type: "NUMBER",
    badge: "Closest number",
    tone: ["#ecfccb", "#4d7c0f"],
    notes: {
      type: "NUMBER",
      option1: "Optional: a tolerance that still counts as dead on",
      correctAnswer: "The number. 384,400 km reads as 384,400 with the unit km",
      margin: "Optional: blank is medium (within a quarter of the answer)",
    },
    show: ["option1", "margin"],
  },
  {
    file: "pin",
    type: "PIN",
    badge: "Pin answer",
    tone: ["#d1fae5", "#047857"],
    notes: {
      type: "PIN",
      option1: "Latitude (north is positive)",
      option2: "Longitude (east is positive)",
      option3: "How many km away still scores in full",
      correctAnswer: "What the answer key calls the spot",
      image: "The map: world or usa. Or an https:// picture, in percent",
    },
  },
  {
    file: "puzzle",
    type: "PUZZLE",
    badge: "Puzzle · order",
    tone: ["#fee2e2", "#b91c1c"],
    notes: {
      type: "PUZZLE",
      option1: "The items in the RIGHT order. The game shuffles them",
      correctAnswer: "Required, but ignored when the options are filled in",
    },
    span: { option1: ["option1", "option4"] },
  },
  {
    file: "match",
    type: "MATCH",
    badge: "Puzzle · match",
    tone: ["#fce7f3", "#be185d"],
    notes: {
      type: "MATCH",
      option1: "One pair per column: item = partner. Two or more",
      correctAnswer: "Required, but not graded: anything readable",
    },
    span: { option1: ["option1", "option4"] },
  },
  {
    file: "categorize",
    type: "CATEGORIZE",
    badge: "Puzzle · sort",
    tone: ["#fae8ff", "#a21caf"],
    notes: {
      type: "CATEGORIZE",
      option1: "One item per column: item = group. Two to four groups",
      correctAnswer: "Required, but not graded: anything readable",
      timeLimit: "Optional: seconds on the clock, 5 to 120",
    },
    span: { option1: ["option1", "option6"] },
  },
  {
    file: "scramble",
    type: "SCRAMBLE",
    badge: "Puzzle · unscramble",
    tone: ["#ede9fe", "#6d28d9"],
    notes: {
      type: "SCRAMBLE",
      question: "The clue",
      option1: "Leave empty: the options are ignored",
      correctAnswer: "The word or phrase: 3 to 20 letters and digits",
    },
    show: ["option1"],
  },
  {
    file: "shorthand",
    badge: "Shorthand",
    tone: ["#f1f5f9", "#334155"],
    pick: (r) => r.cells.type === "",
    notes: {
      type: "Blank",
      option1: "Every option empty",
      correctAnswer: "True or False makes a true/false question; anything else a typed answer",
    },
    show: ["option1"],
  },
];

const rowsFor = (format) =>
  rows
    .filter(format.pick ?? ((r) => r.cells.type === format.type))
    .slice(0, format.limit ?? Infinity);

/* ------------------------------------------------------------------ *
 * The sheet pictures
 * ------------------------------------------------------------------ */

const ALWAYS = ["type", "category", "question", "correctAnswer"];

/** What a column means when a format has nothing particular to say about it. */
const GENERAL = {
  category: "Any name: one category is one spin of the wheel",
  question: "What players read",
};

/** The columns a picture shows, in sheet order. */
const columnsFor = (format, picked) => {
  const wanted = new Set([...ALWAYS, ...Object.keys(format.notes), ...(format.show ?? [])]);
  for (const [first, last] of Object.values(format.span ?? {})) {
    for (let c = header.indexOf(first); c <= header.indexOf(last); c += 1) wanted.add(header[c]);
  }
  // Anything a shown row fills in, apart from the long explanation, which
  // every format treats the same and the guide covers once.
  for (const row of picked) {
    for (const name of header) {
      if (row.cells[name] !== "" && name !== "explanation") wanted.add(name);
    }
  }
  return header.map((name, index) => ({ name, index })).filter((c) => wanted.has(c.name));
};

/**
 * One sheet picture: the format's rows turned on their side, so each cell gets
 * a line of its own with what it means beside it. A spreadsheet row of a sort
 * question runs to fifteen columns; on its side it fits a page.
 */
const sheetPage = (format, picked) => {
  const columns = columnsFor(format, picked);
  // A span's note sits on its first column; the rest of the span shares it.
  const sharedWith = new Map();
  for (const [first, last] of Object.values(format.span ?? {})) {
    for (let c = header.indexOf(first) + 1; c <= header.indexOf(last); c += 1) {
      sharedWith.set(header[c], first);
    }
  }

  const body = columns
    .map((c, i) => {
      const skipped = i > 0 && columns[i - 1].index !== c.index - 1;
      const own = format.notes[c.name];
      const used = Boolean(own) || sharedWith.has(c.name);
      const values = picked
        .map((row) => {
          const value = row.cells[c.name];
          return `<td class="value${used ? " used" : ""}${c.name === "type" && value ? " type" : ""}">${
            value === "" ? `<span class="empty">empty</span>` : escape(value)
          }</td>`;
        })
        .join("");
      const note = own
        ? `<td class="note used">${escape(own)}</td>`
        : sharedWith.has(c.name)
          ? `<td class="note used shared">same as ${escape(sharedWith.get(c.name))}</td>`
          : `<td class="note">${escape(GENERAL[c.name] ?? "")}</td>`;
      return `${skipped ? `<tr class="skip"><td colspan="${3 + picked.length}">⋯</td></tr>` : ""}<tr>
        <th class="letter">${letter(c.index)}</th>
        <td class="name${used ? " used" : ""}">${escape(c.name)}</td>${values}${note}</tr>`;
    })
    .join("");

  const [paper, ink] = format.tone;
  const valueWidth = picked.length > 1 ? 210 : 280;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #1f2937; }
    #card { display: inline-block; padding: 16px 18px 18px; background: #ffffff; }
    .title { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .badge { background: ${paper}; color: ${ink}; font-weight: 700; font-size: 14px;
      padding: 4px 11px; border-radius: 999px; }
    .where { color: #6b7280; font-size: 12.5px; }
    table { border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e2e3e3; padding: 6px 10px; vertical-align: top; line-height: 1.35; }
    thead th { background: #f8f9fa; color: #5f6368; font-weight: 400; font-size: 11.5px; text-align: left; }
    th.letter { background: #f8f9fa; color: #5f6368; font-weight: 400; font-size: 11.5px; width: 34px; text-align: center; }
    td.name { font-family: "DejaVu Sans Mono", Consolas, monospace; font-size: 12px; width: 128px; color: #374151; }
    td.value { width: ${valueWidth}px; max-width: ${valueWidth}px; overflow-wrap: anywhere; }
    td.note { width: 330px; color: #6b7280; }
    td.used { background: ${paper}; }
    td.name.used { color: ${ink}; font-weight: 700; }
    td.note.used { color: ${ink}; font-weight: 600; }
    td.note.shared { font-weight: 400; font-style: italic; }
    td.type { font-weight: 700; color: ${ink}; }
    .empty { color: #9ca3af; font-style: italic; }
    tr.skip td { border-left: none; border-right: none; color: #9ca3af; text-align: center; padding: 1px; font-size: 11px; background: #ffffff; }
  </style></head><body><div id="card">
    <div class="title"><span class="badge">${escape(format.badge)}</span>
      <span class="where">questions.template.xlsx · Questions tab</span></div>
    <table><thead><tr><th>col</th><th>heading</th>${picked
      .map((r) => `<th>row ${r.sheetRow}</th>`)
      .join("")}<th>what it means</th></tr></thead><tbody>${body}</tbody></table>
  </div></body></html>`;
};

const drawSheets = async (browser) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1400, height: 600 } });
  const tab = await context.newPage();
  for (const format of FORMATS) {
    const picked = rowsFor(format);
    if (picked.length === 0) throw new Error(`questions.example.csv has no ${format.badge} row`);
    await tab.setContent(sheetPage(format, picked));
    const path = join(outDir, `${format.file}-sheet.png`);
    await tab.locator("#card").screenshot({ path });
    console.log(`wrote ${path.slice(root.length + 1)}`);
  }
  await context.close();
};

/* ------------------------------------------------------------------ *
 * The game, played
 * ------------------------------------------------------------------ */

/** The one category the round is played from: one question of every format. */
const ROUND = "Every Format";
const playing = FORMATS.filter((f) => f.type).map((format) => ({ format, row: rowsFor(format)[0] }));
const roundCsv = [
  csvLine(header),
  ...playing.map(({ row }) => csvLine(row.raw.map((cell, c) => (header[c] === "category" ? ROUND : cell)))),
].join("\n");

const lockButton = (p, name) => p.getByRole("button", { name }).click();
/** A built-in map's pin target, worked out by the game's own projection. */
const pinSpot = (row) =>
  geoPinTarget(
    MAP_FRAMES[row.cells.image],
    Number(row.cells.option1),
    Number(row.cells.option2),
    Number(row.cells.option3),
  );

/**
 * How a player answers each format: `fill` puts an answer in without sending
 * it, so the phone can be pictured mid-answer; `lock` sends it. Multiple
 * choice and true/false send on the tap, so their phones are pictured first.
 * Mostly right answers, and one near miss, so the answer key has something to
 * show.
 */
const ANSWERS = {
  MULTIPLE_CHOICE: {
    lock: (p, row) => p.locator("button.cyber-option", { hasText: row.cells.correctAnswer }).first().click(),
  },
  TRUE_FALSE: {
    lock: (p, row) => p.getByRole("button", { name: row.cells.correctAnswer, exact: true }).click(),
  },
  MULTI_SELECT: {
    fill: async (p, row) => {
      for (const answer of row.cells.correctAnswer.split("|")) {
        await p.getByRole("checkbox", { name: new RegExp(`\\b${answer}\\b`) }).click();
      }
    },
    lock: (p) => lockButton(p, /^lock in \d+$/i),
  },
  TYPE_ANSWER: {
    fill: (p, row) => p.getByPlaceholder("Type your answer…").fill(row.cells.correctAnswer),
    lock: (p) => lockButton(p, /^lock it in$/i),
  },
  SLIDER: {
    fill: (p) => p.getByRole("button", { name: "Down a step" }).click(),
    lock: (p) => lockButton(p, /^lock it in$/i),
  },
  RANGE: {
    fill: async (p) => {
      // The handles start at 30% and 70% of 5,000–10,000 m. Ten steps of 10 m
      // a press: catch 8,849 m between 8,600 and 9,100, a tenth of the scale.
      await p.getByRole("slider", { name: "High end of your range" }).focus();
      for (let i = 0; i < 6; i += 1) await p.keyboard.press("PageUp");
      await p.getByRole("slider", { name: "Low end of your range" }).focus();
      for (let i = 0; i < 21; i += 1) await p.keyboard.press("PageUp");
    },
    lock: (p) => lockButton(p, /^lock in this range$/i),
  },
  NUMBER: {
    // A near miss: 200 against 206 still scores most of the points.
    fill: (p) => p.getByLabel("Your answer, as a number").fill("200"),
    lock: (p) => lockButton(p, /^lock in guess$/i),
  },
  PIN: {
    fill: async (p, row) => {
      const board = p.getByRole("application", { name: /tap to drop your pin/ });
      await p.waitForFunction(() => !document.body.innerText.includes("Loading map…"));
      const box = await board.boundingBox();
      const spot = pinSpot(row);
      // Just off the peak, inside the ring.
      await board.click({
        position: { x: 2 + (spot.x + 0.006) * (box.width - 4), y: 2 + (spot.y - 0.01) * (box.height - 4) },
      });
    },
    lock: (p) => lockButton(p, /^lock in pin$/i),
  },
  PUZZLE: {
    fill: async (p, row) => {
      const target = header
        .filter((name) => /^option\d+$/.test(name))
        .map((name) => row.cells[name])
        .filter(Boolean);
      for (let i = 0; i < target.length; i += 1) {
        const order = await p
          .locator('button[aria-label^="Move "][aria-label$=" up"]')
          .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label").slice(5, -3)));
        for (let j = order.indexOf(target[i]); j > i; j -= 1) {
          await p.getByRole("button", { name: `Move ${target[i]} up`, exact: true }).click();
          await p.waitForTimeout(150);
        }
      }
    },
    lock: (p) => lockButton(p, /^lock in this order$/i),
  },
  MATCH: {
    fill: async (p, row) => {
      for (const pair of header.filter((n) => /^option\d+$/.test(n)).map((n) => row.cells[n]).filter(Boolean)) {
        const [item, partner] = pair.split("=").map((side) => side.trim());
        await p.getByRole("button", { name: item, exact: true }).click();
        await p.getByRole("button", { name: partner, exact: true }).click();
      }
    },
    lock: (p) => lockButton(p, /^lock in pairs$/i),
  },
  CATEGORIZE: {
    fill: async (p, row) => {
      for (const pair of header.filter((n) => /^option\d+$/.test(n)).map((n) => row.cells[n]).filter(Boolean)) {
        const [item, group] = pair.split("=").map((side) => side.trim());
        await p
          .locator(`xpath=//span[normalize-space()='${item}']/following-sibling::*//button[normalize-space()='${group}']`)
          .click();
      }
    },
    lock: (p) => lockButton(p, /^lock in sort$/i),
  },
  SCRAMBLE: {
    fill: async (p, row) => {
      await p.evaluate(() => document.activeElement?.blur());
      await p.keyboard.type(row.cells.correctAnswer.replace(/[^a-z0-9]/gi, "").toUpperCase(), { delay: 40 });
    },
    lock: (p) => lockButton(p, /^lock in$/i),
  },
};

/** Poll until `test` holds, or give up with a message saying what never came. */
const until = async (what, test, timeout = 60_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await test().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`gave up waiting for ${what}`);
};

const headingOf = (p) =>
  p.locator("h1.cyber-question").first().textContent({ timeout: 1000 }).then((t) => (t ?? "").trim());

/**
 * The phone, scrolled the way a player would have it: the question and as
 * much of the answer as fits, with the match bar above it for context.
 */
const shootPhone = async (p) => {
  await p.evaluate(() => {
    const question = document.querySelector("h1.cyber-question");
    const top = question ? question.getBoundingClientRect().top + window.scrollY : 0;
    const room = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, Math.min(room, top - 180)));
  });
  await p.waitForTimeout(300);
  return p.screenshot();
};

const playGame = async (browser) => {
  const { createServer } = await import("vite");
  const server = await createServer({
    root,
    logLevel: "error",
    // No hot reload: an edit under src/ mid-run would reset the game.
    server: { host: "127.0.0.1", port: 5199, strictPort: false, open: false, hmr: false },
  });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 720 } });
  const shots = new Map();
  try {
    // The host: one round of every format, no bots, straight to the review.
    const host = await context.newPage();
    await host.goto(base, { waitUntil: "networkidle" });
    await host.getByRole("button", { name: "HOST GAME" }).click();
    await host.locator("input[type=range]").nth(0).fill("1");
    await host.locator("input[type=range]").nth(1).fill(String(playing.length));
    await host.locator("button", { hasText: "BOTS ON" }).click();
    await host.getByRole("button", { name: "IMPORT MY OWN QUESTIONS" }).click();
    await host.locator("input[type=file]").setInputFiles({
      name: "every-format.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(roundCsv),
    });
    await host.locator("button", { hasText: "BUILD THE GAME" }).click();
    await host.locator("button", { hasText: "APPROVE & OPEN LOBBY" }).waitFor();
    await host.setViewportSize({ width: 1280, height: 1150 });
    await host.waitForTimeout(800);
    await host.screenshot({
      path: join(outDir, "review-screen.jpg"),
      type: "jpeg",
      quality: 82,
      clip: { x: 180, y: 0, width: 920, height: 1150 },
    });
    console.log("wrote docs/images/question-format/review-screen.jpg");
    await host.setViewportSize({ width: 1280, height: 720 });

    await host.locator("button", { hasText: "APPROVE & OPEN LOBBY" }).click();
    await host.getByText("GAME PIN").waitFor();
    const pin = (await host.locator("body").innerText()).match(/GAME PIN\s+(\d{4,6})/)[1];

    const big = await context.newPage();
    await big.goto(`${base}?view=broadcast`, { waitUntil: "networkidle" });
    const player = await context.newPage();
    await player.setViewportSize({ width: 390, height: 844 });
    await player.goto(`${base}?pin=${pin}`, { waitUntil: "networkidle" });
    await player.locator("input[type=text]").nth(1).fill("Jordan");
    await player.locator("button", { hasText: "JOIN GAME" }).click();
    await host.getByText("Jordan").first().waitFor();

    // The host runs the show rather than playing, so the one player sets the
    // pace and the big screen follows them.
    await host.locator("button", { hasText: "START GAME" }).click();
    await host.locator("button", { hasText: "ANSWERING ON" }).click();
    await host.locator("button", { hasText: "SPIN THE WHEEL" }).click();
    await host.locator("button", { hasText: "START ROUND" }).click({ timeout: 30_000 });

    let previous = "";
    for (let n = 0; n < playing.length; n += 1) {
      await until("the next question on the phone", async () => {
        const text = await headingOf(player);
        return text !== "" && text !== previous;
      });
      const text = await headingOf(player);
      previous = text;
      const entry = playing.find(({ row }) => row.cells.question === text);
      if (!entry) throw new Error(`a question that is not in the round: ${text}`);
      const { format, row } = entry;

      await until(`the big screen on "${text}"`, async () => (await headingOf(big)) === text);
      await big.waitForTimeout(1500);
      const bigShot = await big.screenshot();

      await player.waitForTimeout(700);
      const answer = ANSWERS[format.type];
      if (answer.fill) await answer.fill(player, row);
      await player.waitForTimeout(400);
      const phoneShot = await shootPhone(player);
      await player.evaluate(() => window.scrollTo(0, 0));
      await answer.lock(player, row);
      shots.set(format.type, { phone: phoneShot, big: bigShot });
      console.log(`played ${format.badge}`);

      const next = player.getByRole("button", { name: /next question|finish the round/i });
      await next.click({ timeout: 10_000 }).catch(() => {});
    }

    // Round over: the answer key goes up on the big screen.
    await until("the answer key", async () => (await big.getByText("Answer key").count()) > 0);
    await big.setViewportSize({ width: 1280, height: 4200 });
    await big.waitForTimeout(2000);
    for (const { format, row } of playing) {
      const card = big
        .getByText(row.cells.question, { exact: true })
        .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' cyber-panel ')][1]");
      const box = await card.boundingBox();
      shots.get(format.type).key = await big.screenshot({
        clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 },
      });
    }
  } finally {
    await context.close();
    await server.close();
  }
  return shots;
};

/* ------------------------------------------------------------------ *
 * The play pictures: phone, big screen and answer key side by side
 * ------------------------------------------------------------------ */

const dataUrl = (png) => `data:image/png;base64,${png.toString("base64")}`;

const playPage = (format, shot) => {
  const [paper, ink] = format.tone;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #070b18; font-family: Arial, Helvetica, sans-serif; }
    #card { display: inline-grid; grid-template-columns: 300px 620px; gap: 22px; padding: 20px 22px 22px;
      background: radial-gradient(circle at 20% 0%, #13183a 0%, #070b18 60%); }
    .top { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
    .badge { background: ${paper}; color: ${ink}; font-weight: 700; font-size: 14px; padding: 4px 11px; border-radius: 999px; }
    .title { color: #94a3b8; font-size: 13px; }
    figure { margin: 0; display: flex; flex-direction: column; gap: 8px; }
    figcaption { color: #22d3ee; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
    .phone { width: 300px; border-radius: 26px; border: 3px solid #1e293b; box-shadow: 0 0 0 1px #334155, 0 10px 30px rgba(0,0,0,.5); }
    .screen { width: 620px; border-radius: 8px; border: 1px solid #1e293b; }
    .key { width: 620px; }
    .right { display: flex; flex-direction: column; gap: 18px; }
  </style></head><body><div id="card">
    <div class="top"><span class="badge">${escape(format.badge)}</span>
      <span class="title">One question, played: what each screen shows</span></div>
    <figure><figcaption>On each phone</figcaption><img class="phone" src="${dataUrl(shot.phone)}"></figure>
    <div class="right">
      <figure><figcaption>On the big screen</figcaption><img class="screen" src="${dataUrl(shot.big)}"></figure>
      <figure><figcaption>In the answer key, when the round ends</figcaption><img class="key" src="${dataUrl(shot.key)}"></figure>
    </div>
  </div></body></html>`;
};

const drawPlays = async (browser, shots) => {
  const context = await browser.newContext({ deviceScaleFactor: 1.5, viewport: { width: 1100, height: 900 } });
  const tab = await context.newPage();
  for (const { format } of playing) {
    await tab.setContent(playPage(format, shots.get(format.type)));
    await tab.waitForFunction(() => [...document.images].every((img) => img.complete));
    const path = join(outDir, `${format.file}-play.jpg`);
    await tab.locator("#card").screenshot({ path, type: "jpeg", quality: 84 });
    console.log(`wrote ${path.slice(root.length + 1)}`);
  }
  await context.close();
};

/* ------------------------------------------------------------------ */

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  await drawSheets(browser);
  if (!onlySheets) await drawPlays(browser, await playGame(browser));
} finally {
  await browser.close();
}

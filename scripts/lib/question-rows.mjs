/**
 * The CSV side of `scripts/generate-questions.mjs`: the schema for each
 * round's one "special" question, what to tell the model about it, and how it
 * becomes a row the importer reads (see QUESTION_FORMAT.md).
 *
 * Kept apart from the script so the rows can be checked without calling the
 * API — `node scripts/lib/question-rows.mjs` prints a sample of every format.
 */
import * as z from "zod";

/** Option columns written per row: enough for a six-item sort. */
export const OPTION_COLUMNS = 8;

export const HEADER = [
  "type",
  "category",
  "question",
  ...Array.from({ length: OPTION_COLUMNS }, (_, i) => `option${i + 1}`),
  "correctAnswer",
  "explanation",
  "image",
  "margin",
  "unit",
  "timeLimit",
].join(",");

/**
 * The importer's parser splits on newlines before it looks at quotes, and it
 * treats every `"` as a delimiter toggle rather than honouring `""` escapes.
 * So: no newlines and no double quotes reach the file at all. Commas are fine
 * inside a quoted field, which is the one case that does work.
 */
export const clean = (value) =>
  String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/["“”]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const field = (value) => {
  const text = clean(value);
  return text.includes(",") ? `"${text}"` : text;
};

export const row = (type, category, question, options, correctAnswer, explanation, extras = {}) => {
  const padded = [...options.map(clean), ...Array(OPTION_COLUMNS).fill("")].slice(0, OPTION_COLUMNS);
  return [
    type,
    category,
    question,
    ...padded,
    correctAnswer,
    explanation,
    extras.image ?? "",
    extras.margin ?? "",
    extras.unit ?? "",
    extras.timeLimit ?? "",
  ]
    .map(field)
    .join(",");
};

/** One special question per round, in one of these formats. */
export const SPECIALS = {
  slider: {
    schema: z.object({
      question: z.string(),
      min: z.number(),
      max: z.number(),
      step: z.number(),
      correctLow: z.number(),
      correctHigh: z.number(),
      exactAnswer: z.string(),
      explanation: z.string(),
    }),
    brief:
      "a numeric guess answered on a slider. Give a min and max that bracket " +
      "the answer without giving it away, a sensible step, and a " +
      "correctLow/correctHigh window generous enough that a good guess scores.",
    toRow: (category, s) =>
      row("SLIDER", category, s.question, [s.min, s.max, s.step, s.correctLow, s.correctHigh], s.exactAnswer, s.explanation, { margin: "low" }),
  },
  range: {
    schema: z.object({
      question: z.string(),
      min: z.number(),
      max: z.number(),
      step: z.number(),
      answer: z.number(),
      unit: z.string(),
      explanation: z.string(),
    }),
    brief:
      "a number players catch between two handles — the tighter the range, " +
      "the more it pays. Give a min and max wide enough that the answer is not " +
      "obvious from the scale, a sensible step, the exact answer, and the unit (or empty).",
    toRow: (category, s) =>
      row("RANGE", category, s.question, [s.min, s.max, s.step], s.answer, s.explanation, { unit: s.unit }),
  },
  number: {
    schema: z.object({
      question: z.string(),
      answer: z.number(),
      unit: z.string(),
      explanation: z.string(),
    }),
    brief:
      "a closest-guess number question — no scale is shown and the nearest " +
      "guess scores the most. Pick a number with one defensible value. Give the unit (or empty).",
    toRow: (category, s) =>
      row("NUMBER", category, s.question, [], s.answer, s.explanation, { unit: s.unit }),
  },
  pin: {
    schema: z.object({
      question: z.string(),
      map: z.enum(["world", "usa"]),
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number(),
      placeName: z.string(),
      explanation: z.string(),
    }),
    brief:
      "a pin-the-place question on a built-in map: map is world, or usa for " +
      "the lower 48 states only. Pick a famous place with unambiguous " +
      "coordinates (decimal degrees) and a radius that counts as right — " +
      "300-800 km on the world map, 60-250 km on the US map.",
    toRow: (category, s) =>
      row("PIN", category, s.question, [s.latitude, s.longitude, s.radiusKm], s.placeName, s.explanation, { image: s.map }),
  },
  puzzle: {
    schema: z.object({
      question: z.string(),
      orderedItems: z.array(z.string()).min(3).max(6),
      explanation: z.string(),
    }),
    brief:
      "an ordering question with exactly 4 items. Put orderedItems in the " +
      "CORRECT order; the game shuffles them for players. Order by something " +
      "unambiguous, like date.",
    toRow: (category, s) =>
      row("PUZZLE", category, s.question, s.orderedItems, s.orderedItems.map(clean).join("|"), s.explanation),
  },
  match: {
    schema: z.object({
      question: z.string(),
      pairs: z.array(z.object({ item: z.string(), partner: z.string() })).min(3).max(5),
      explanation: z.string(),
    }),
    brief:
      "a matching puzzle: 4 pairs to connect, every partner different. Never " +
      "use the characters = or | inside an item or partner.",
    toRow: (category, s) =>
      row("MATCH", category, s.question, s.pairs.map((p) => `${clean(p.item)} = ${clean(p.partner)}`), "See the pairs", s.explanation),
  },
  categorize: {
    schema: z.object({
      question: z.string(),
      items: z.array(z.object({ item: z.string(), group: z.string() })).min(4).max(8),
      explanation: z.string(),
    }),
    brief:
      "a sorting puzzle: 6 items, each belonging to one of exactly 2 or 3 " +
      "groups (at least 2 items per group). Never use = or | in an item or group.",
    toRow: (category, s) =>
      row("CATEGORIZE", category, s.question, s.items.map((p) => `${clean(p.item)} = ${clean(p.group)}`), "See the groups", s.explanation),
  },
  scramble: {
    schema: z.object({
      clue: z.string(),
      word: z.string(),
      explanation: z.string(),
    }),
    brief:
      "an unscramble: a clue, and a single word or two-word name of 5 to 12 " +
      "letters that players rebuild from its shuffled letters.",
    toRow: (category, s) => row("SCRAMBLE", category, s.clue, [], s.word, s.explanation),
  },
  multiSelect: {
    schema: z.object({
      question: z.string(),
      options: z.array(z.string()).min(4).max(5),
      correct: z.array(z.string()).min(2).max(3),
      explanation: z.string(),
    }),
    brief:
      "a select-all-that-apply question: 4 or 5 options of which 2 or 3 are " +
      "right. correct repeats the right options word for word.",
    toRow: (category, s) =>
      row("MULTI_SELECT", category, s.question, s.options, s.correct.map(clean).join("|"), s.explanation),
  },
  typeAnswer: {
    schema: z.object({
      question: z.string(),
      acceptedAnswers: z.array(z.string()).min(1).max(5),
      explanation: z.string(),
    }),
    brief:
      "a short free-text question. acceptedAnswers must list every spelling you " +
      "would accept out loud (full name, surname only, common variants) — " +
      "matching is exact apart from case and spacing.",
    toRow: (category, s) =>
      row("TYPE_ANSWER", category, s.question, s.acceptedAnswers, s.acceptedAnswers[0], s.explanation),
  },
};

// `node scripts/lib/question-rows.mjs` prints one row of every format.
if (import.meta.url === `file://${process.argv[1]}`) {
  const samples = {
    slider: { question: "Apollo 11 landed in?", min: 1950, max: 1990, step: 1, correctLow: 1969, correctHigh: 1969, exactAnswer: "1969", explanation: "x" },
    range: { question: "Everest in metres?", min: 5000, max: 10000, step: 10, answer: 8849, unit: "m", explanation: "x" },
    number: { question: "Bones in an adult?", answer: 206, unit: "", explanation: "x" },
    pin: { question: "Drop a pin on Paris.", map: "world", latitude: 48.8566, longitude: 2.3522, radiusKm: 400, placeName: "Paris", explanation: "x" },
    puzzle: { question: "Order these.", orderedItems: ["A", "B", "C", "D"], explanation: "x" },
    match: { question: "Match these.", pairs: [{ item: "Au", partner: "Gold" }, { item: "Ag", partner: "Silver" }, { item: "Fe", partner: "Iron" }], explanation: "x" },
    categorize: { question: "Sort these.", items: [{ item: "Tomato", group: "Fruit" }, { item: "Carrot", group: "Vegetable" }, { item: "Pepper", group: "Fruit" }, { item: "Leek", group: "Vegetable" }], explanation: "x" },
    scramble: { clue: "An instrument", word: "Saxophone", explanation: "x" },
    multiSelect: { question: "Noble gases?", options: ["Helium", "Nitrogen", "Argon", "Oxygen"], correct: ["Helium", "Argon"], explanation: "x" },
    typeAnswer: { question: "The quiet Beatle?", acceptedAnswers: ["George Harrison", "Harrison"], explanation: "x" },
  };
  console.log(HEADER);
  for (const [name, sample] of Object.entries(samples)) {
    console.log(SPECIALS[name].toRow("Sample", SPECIALS[name].schema.parse(sample)));
  }
}

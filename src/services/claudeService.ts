import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Question, QuestionType } from "../types";
import { currentIdToken } from "./remoteRoom";
import { rowToQuestion } from "./importService";

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

/**
 * A server that holds the Anthropic key so this bundle does not have to.
 *
 * Set, every request goes there instead of to Anthropic: the browser proves
 * who it is with its Firebase ID token, and the proxy adds the real key on the
 * far side. That is what lets the deployed site generate questions at all —
 * a key inlined here would be readable by everyone who loads the page.
 *
 * See worker/ for the proxy and MULTIPLAYER.md for setting it up.
 */
const proxyUrl = (import.meta.env.VITE_ANTHROPIC_PROXY_URL || "").replace(/\/+$/, "");

/**
 * Identity-linked keys are rejected unless the request names the workspace it
 * acts in ("anthropic-workspace-id is required when authenticating with an
 * identity-linked API key"). Ordinary keys carry their own workspace and need
 * nothing here, so the header is only sent when this is set.
 */
const workspaceId = import.meta.env.VITE_ANTHROPIC_WORKSPACE_ID || "";

// A live game cannot sit on a hanging request while a room waits, so give the
// API a hard ceiling and fall back to placeholders past it. Generation runs at
// setup time, not mid-game, so this is generous enough for adaptive thinking.
const REQUEST_TIMEOUT_MS = 90000;

const MODEL = "claude-opus-5";

/**
 * How this talks to Claude, in preference order.
 *
 * With a proxy configured the key is on the server and nothing sensitive is in
 * this bundle. Without one, a key set here is inlined by Vite and readable by
 * anyone who loads the app — fine for `npm run dev` on your own machine, not
 * for a public site. `dangerouslyAllowBrowser` acknowledges that; without it
 * the SDK refuses to construct at all. See LOCAL_PLAY.md for the alternatives.
 */
/**
 * Adds this device's identity to every proxied request.
 *
 * The token is fetched per call rather than held: Firebase refreshes it as it
 * nears expiry, and a host who set up a game an hour before the room filled up
 * would otherwise be turned away by their own proxy.
 */
const proxyFetch: typeof fetch = async (input, init) => {
  const token = await currentIdToken();

  // The proxy will not spend anything for a caller it cannot identify, and the
  // identity is the Firebase sign-in the rest of the app already does. Without
  // it every request comes back 401 and the host sees placeholder questions
  // with nothing explaining why — so say it here, where the reason is known.
  if (!token) {
    throw new Error(
      "Question generation goes through a proxy that needs this site's Firebase " +
        "sign-in, and Firebase is not configured in this build. Set the " +
        "VITE_FIREBASE_* repository variables (see MULTIPLAYER.md) and deploy again.",
    );
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

const client = proxyUrl
  ? new Anthropic({
      // The proxy supplies the real key; the SDK only requires that this is
      // set at all, and it is never sent anywhere that could use it.
      apiKey: "proxied",
      baseURL: proxyUrl,
      fetch: proxyFetch,
      dangerouslyAllowBrowser: true,
    })
  : apiKey
    ? new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        ...(workspaceId
          ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
          : {}),
      })
    : null;

/**
 * How each question type is written, for the model — the same column rules a
 * spreadsheet follows (see QUESTION_FORMAT.md), because what comes back goes
 * through the very same converter as an imported row.
 */
const TYPE_INSTRUCTIONS: Record<QuestionType, string> = {
  [QuestionType.MULTIPLE_CHOICE]:
    "MULTIPLE_CHOICE — options: exactly 4 short choices (one to four words), one right and three that are plausible but clearly wrong, all of them things the room has heard of. correctAnswer: the right option, word for word.",
  [QuestionType.MULTI_SELECT]:
    'MULTI_SELECT — a "which of these…" question. options: 4 or 5 well-known choices, of which exactly 2 or 3 are right, and the right ones obviously right to anyone who knows the subject at all. correctAnswer: every right option, word for word, joined with " | ".',
  [QuestionType.TRUE_FALSE]:
    'TRUE_FALSE — text is a short statement, not a question, that sounds plausible either way. options: []. correctAnswer: "True" or "False". Aim for roughly half false. A false statement is a believable near miss, never a nonsense one.',
  [QuestionType.TYPE_ANSWER]:
    "TYPE_ANSWER — players type the answer, so the answer is a single word or a famous name everybody can spell. options: every spelling to accept, canonical first (full name, surname, common variants and misspellings). correctAnswer: the canonical answer.",
  [QuestionType.SLIDER]:
    "SLIDER — players slide to a number people have a rough feel for (a famous year, a height, a count), never a statistic. options: [min, max, step, lowestCorrect, highestCorrect] as plain numbers; bracket the answer without centring on it, and make the correct window generous — a sensible guess should land in it. correctAnswer: the true value. unit: what it counts, if anything.",
  [QuestionType.RANGE]:
    "RANGE — players drag two handles to catch a number they have a rough feel for; the tighter, the more it pays. options: [min, max, step] as plain numbers, a scale wide enough that the answer is not obvious from it. correctAnswer: the exact number. unit: what it counts, if anything.",
  [QuestionType.NUMBER]:
    "NUMBER — closest guess wins, no scale shown, so the answer must be a number most people roughly know (days in a year, states in the US, players on a football team). options: []. correctAnswer: the exact number, digits only. unit: what it counts, if anything. Only for numbers with one defensible value.",
  [QuestionType.PIN]:
    'PIN — players drop a pin on a built-in map. map: "world" or "usa" (the lower 48 only). text: "Drop a pin on …" or a clue to a place. Only iconic places — famous cities, countries, landmarks — with unambiguous coordinates. options: [latitude, longitude, radiusKm] in decimal degrees; be generous with the radius, 600–800 km on the world map and 150–250 km on the US map. correctAnswer: the place\'s name.',
  [QuestionType.PUZZLE]:
    'PUZZLE — put items in order. options: 4 famous items in the CORRECT order, by something unarguable (usually date), and far apart in it — decades between events, not years — so nobody has to know exact figures to get it. correctAnswer: the same items joined with " | ".',
  [QuestionType.MATCH]:
    'MATCH — pair items up. options: 4 famous pairs, each written "item = partner", where every partner plainly belongs to one item (country and capital, band and singer); every partner different. correctAnswer: "See the pairs".',
  [QuestionType.CATEGORIZE]:
    'CATEGORIZE — sort items into groups. options: 6 everyday items, each written "item = group", using exactly 2 groups of 3 (3 groups only if they are obvious), with every item plainly in one group and no borderline cases. correctAnswer: "See the groups".',
  [QuestionType.SCRAMBLE]:
    "SCRAMBLE — players rebuild a word from its shuffled letters. text: a clue that points straight at the word. options: []. correctAnswer: one common word of 5 to 8 letters that the whole room knows.",
};

/** Every type a generated game can use. */
export const GENERATABLE_TYPES: QuestionType[] = Object.values(QuestionType);

/**
 * Who the questions are for, and what that rules out.
 *
 * The first sets were written like a quiz for people who follow the subject
 * — the last emperor of the Western Roman Empire, the session player on a
 * 1978 single — and a bar full of friends, families and regulars sat and
 * guessed. The game is head-to-head and scored on speed, so it does not need
 * hard questions to be competitive; it needs ones the whole room has a real
 * shot at and recognises when the answer is read out.
 */
export const SYSTEM_PROMPT =
  "You write trivia questions for a bar-night game played on phones by a " +
  "mixed room — friends, families, regulars, people who have had a drink. " +
  "Write for general appeal: ask about things most adults have heard of, " +
  "that a person can get from everyday knowledge or by thinking it through, " +
  "with answers the whole room recognises when they are read out. The game " +
  "is head-to-head and scored on speed, so it does not need hard questions " +
  "to be competitive — it needs ones everybody has a real shot at. " +
  "Never ask for an exact year, a precise statistic, a minor character, a " +
  "specific episode, a name only an enthusiast knows, or anything that takes " +
  "two facts to work out. Every question must have exactly one defensibly " +
  "correct answer, and wrong options must be plausible but clearly wrong to " +
  "someone who knows the subject at all. Keep every question to one plain " +
  "sentence, ideally under 90 characters, with no double negatives and no " +
  "trick wording — it is read against a clock. Never repeat a question or a " +
  "subject within a set, and skip the most worn-out pub quiz questions.";

/** How hard a set should run, top to bottom. Sent with every request. */
export const DIFFICULTY_LADDER =
  "Difficulty: about half the questions easy (most of the room gets them), " +
  "about a third medium (half the room gets them), and at most one in six a " +
  "stretch — one a person can still reason or eliminate their way to, never " +
  "specialist knowledge. If you are not sure most people have heard of the " +
  "answer, make the question easier.";

/**
 * What share of a set each format gets.
 *
 * Multiple choice and true/false are the backbone: quick to read, quick to
 * answer, and the format never gets in the way of the question. Everything
 * else — pins, puzzles, sliders — takes longer to do and is harder in itself,
 * so those are rationed to a question or two per set and written as the
 * easiest questions in it. A host who turns the classic formats off in the
 * picker gets the other formats, still written easy.
 */
export const formatMix = (allowed: readonly QuestionType[], count: number): string => {
  if (allowed.length === 1) return `Every question is ${allowed[0]}.`;

  const backboneTypes = new Set<QuestionType>([
    QuestionType.MULTIPLE_CHOICE,
    QuestionType.TRUE_FALSE,
  ]);
  const classic = allowed.filter((type) => backboneTypes.has(type));
  const others = allowed.filter((type) => !backboneTypes.has(type));
  const otherLimit = Math.max(1, Math.round(count / 6));
  const pick =
    "pick the one that suits the question — PIN for a famous place, SLIDER, " +
    "RANGE or NUMBER for a number people have a feel for, PUZZLE for a " +
    "timeline, MATCH for pairs, CATEGORIZE for sorting, SCRAMBLE for one " +
    "common word";

  if (others.length === 0) {
    return classic.length === 2
      ? "Formats: about three quarters MULTIPLE_CHOICE and the rest TRUE_FALSE."
      : `Every question is ${classic[0]}.`;
  }

  if (classic.length === 0) {
    return (
      `Formats: spread the questions across ${others.join(", ")} and ${pick}. ` +
      "These formats take longer to answer and are harder in themselves, so " +
      "every question is written easy."
    );
  }

  const backbone =
    classic.length === 2
      ? "about two thirds MULTIPLE_CHOICE and about one in five TRUE_FALSE"
      : `most of them ${classic[0]}`;
  return (
    `Formats: ${backbone}. The other formats (${others.join(", ")}) together ` +
    `get at most ${otherLimit} of the ${count} questions — ${pick}. Those take ` +
    "longer to answer and are harder in themselves, so they are the easiest " +
    "questions in the set, and never two of the same format."
  );
};

/**
 * The shape the model fills. One flat object per question rather than a
 * union per type: the converter already knows what each type's columns
 * mean, and a flat shape is one the model fills reliably.
 */
const generatedShape = (types: QuestionType[]) =>
  z.object({
    questions: z.array(
      z.object({
        type: z.enum(types as [QuestionType, ...QuestionType[]]),
        text: z.string(),
        options: z.array(z.string()),
        correctAnswer: z.string(),
        explanation: z.string(),
        map: z.enum(["", "world", "usa"]),
        unit: z.string(),
      }),
    ),
  });

export type GeneratedQuestion = z.infer<ReturnType<typeof generatedShape>>["questions"][number];

/**
 * What the model wrote, as questions — through `rowToQuestion`, exactly as a
 * spreadsheet row would be read. A question the converter refuses is dropped
 * with its reason logged, rather than played with a guessed answer.
 */
export const questionsFromGenerated = (
  category: string,
  generated: readonly GeneratedQuestion[],
  stamp: number = Date.now(),
): Question[] =>
  generated.flatMap((q, index) => {
    const result = rowToQuestion(
      {
        type: q.type,
        category,
        question: q.text,
        options: q.options.map((o) => String(o)),
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        image: q.type === QuestionType.PIN ? q.map || "world" : "",
        unit: q.unit,
      },
      `${category}-${stamp}-${index}`,
    );
    if ("skip" in result) {
      console.warn(`Dropped a generated ${q.type} question (${result.skip}): ${q.text}`);
      return [];
    }
    return [result.question];
  });

export interface GenerationResult {
  questions: Question[];
  /** True when `questions` are placeholders rather than real generated content. */
  usedFallback: boolean;
  /** Human-readable reason for the fallback, if any. */
  error: string | null;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Request timed out after ${ms / 1000}s`)),
        ms,
      ),
    ),
  ]);

export const generateQuestions = async (
  category: string,
  count: number = 5,
  /** The formats to write in. Empty or omitted means every format. */
  types: readonly QuestionType[] = GENERATABLE_TYPES,
): Promise<GenerationResult> => {
  if (!client) {
    return fallback(
      category,
      count,
      "No VITE_ANTHROPIC_API_KEY is set, so no questions could be generated.",
    );
  }

  const allowed = types.length > 0 ? [...new Set(types)] : GENERATABLE_TYPES;
  const mix = formatMix(allowed, count);

  try {
    const response = await withTimeout(
      client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `Write ${count} trivia questions about "${category}" for a mixed room.\n` +
              `${DIFFICULTY_LADDER}\n` +
              `${mix}\n\n` +
              `Formats you may use, and how to fill each one:\n` +
              allowed.map((type) => `- ${TYPE_INSTRUCTIONS[type]}`).join("\n") +
              `\n\nFor every question: explanation is a one-sentence fun fact ` +
              `worth reading aloud. map is "" except on PIN. unit is "" unless ` +
              `the format uses one.`,
          },
        ],
        output_config: {
          format: zodOutputFormat(generatedShape(allowed)),
        },
      }),
      REQUEST_TIMEOUT_MS,
    );

    // A safety decline stops generation without throwing; check before reading.
    if (response.stop_reason === "refusal") {
      return fallback(
        category,
        count,
        `The model declined to generate questions for "${category}"` +
          `${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : "."}`,
      );
    }

    // parsed_output is null when the response could not be parsed.
    const parsed = response.parsed_output;
    if (!parsed) {
      return fallback(
        category,
        count,
        "The model's response did not match the expected question format.",
      );
    }

    const questions = questionsFromGenerated(category, parsed.questions);
    if (questions.length === 0) {
      return fallback(category, count, "The model returned no usable questions.");
    }

    return { questions, usedFallback: false, error: null };
  } catch (error: any) {
    return fallback(category, count, describeError(error));
  }
};

/** Turn an SDK error into something a host reading the review screen can act on. */
const describeError = (error: any): string => {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check VITE_ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "The Anthropic API key is not allowed to use this model.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Wait a moment and try again.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    // An org-level key is refused until the request names a workspace to bill,
    // and the raw message does not say where that goes. Where it goes depends
    // on which side is holding the key: through the proxy the browser never
    // sees it, so nothing in this bundle can fix it.
    if (/workspace/i.test(error.message)) {
      if (proxyUrl) {
        return (
          "The Anthropic key the proxy holds is not scoped to a workspace, so " +
          "Anthropic will not bill it. Either re-run `npm run worker:secret` " +
          "with a key created inside a workspace, or name the workspace on " +
          "the Worker with `npx wrangler@latest secret put " +
          "ANTHROPIC_WORKSPACE_ID --config worker/wrangler.toml`. Either takes " +
          "effect immediately. See worker/README.md."
        );
      }
      return (
        "This Anthropic key is not scoped to a workspace, so the request has " +
        "to name one. Set VITE_ANTHROPIC_WORKSPACE_ID in .env to the " +
        "workspace id and restart the dev server."
      );
    }
    return `The Anthropic API rejected the request: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    // A browser that refuses a request never reports *why* to the page, so this
    // arrives looking exactly like an unplugged cable. Through the proxy it
    // almost never is one: the usual cause is the Worker declining a header the
    // SDK sends, which blocks the preflight so the request is never made. The
    // network tab shows it as a failed OPTIONS; `npm run check-live` names it.
    if (proxyUrl) {
      return (
        `Could not reach the question proxy at ${proxyUrl}. It is either down, ` +
        `or it refused the browser's preflight — run \`npm run check-live\` to ` +
        `see which, then \`npm run worker:deploy\` if the Worker needs updating.`
      );
    }
    return "Could not reach the Anthropic API. Check the network connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error ${error.status}: ${error.message}`;
  }
  return `Could not generate questions (${error?.message || "unknown error"}).`;
};

const fallback = (
  category: string,
  count: number,
  reason: string,
): GenerationResult => {
  console.warn(`Falling back to placeholder questions: ${reason}`);
  return {
    questions: getMockQuestions(category, count),
    usedFallback: true,
    error: reason,
  };
};

const getMockQuestions = (category: string, count: number): Question[] => {
  return Array.from({ length: count }).map((_, i) => ({
    id: `mock-${category}-${i}-${Date.now()}`,
    category,
    text: `Placeholder question #${i + 1} about ${category} — question generation failed.`,
    options: ["Option A", "Option B", "Option C", "Option D"],
    correctIndex: 0,
    explanation: "This is a placeholder, not a real question.",
    type: QuestionType.MULTIPLE_CHOICE,
  }));
};

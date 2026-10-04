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
    "MULTIPLE_CHOICE — options: exactly 4 choices, one right and three plausible but clearly wrong. correctAnswer: the right option, word for word.",
  [QuestionType.MULTI_SELECT]:
    'MULTI_SELECT — a "which of these…" question. options: 4 or 5 choices, of which 2 or 3 are right. correctAnswer: every right option, word for word, joined with " | ".',
  [QuestionType.TRUE_FALSE]:
    'TRUE_FALSE — text is a statement, not a question. options: []. correctAnswer: "True" or "False". Aim for roughly half false.',
  [QuestionType.TYPE_ANSWER]:
    "TYPE_ANSWER — players type the answer. options: every spelling to accept, canonical first (full name, surname, common variants). correctAnswer: the canonical answer.",
  [QuestionType.SLIDER]:
    "SLIDER — players slide to a number. options: [min, max, step, lowestCorrect, highestCorrect] as plain numbers; bracket the answer without centring on it, keep the correct window narrow but reachable with the step. correctAnswer: the true value. unit: what it counts, if anything.",
  [QuestionType.RANGE]:
    "RANGE — players drag two handles to catch the answer; the tighter, the more it pays. options: [min, max, step] as plain numbers, a scale wide enough that the answer is not obvious from it. correctAnswer: the exact number. unit: what it counts, if anything.",
  [QuestionType.NUMBER]:
    "NUMBER — closest guess wins, no scale shown. options: []. correctAnswer: the exact number, digits only. unit: what it counts, if anything. Only for numbers with one defensible value.",
  [QuestionType.PIN]:
    'PIN — players drop a pin on a built-in map. map: "world" or "usa" (the lower 48 only). text: "Drop a pin on …" or a clue to a place. options: [latitude, longitude, radiusKm] in decimal degrees; radius 300–800 km on the world map, 60–250 km on the US map. correctAnswer: the place\'s name. Only famous places with unambiguous coordinates.',
  [QuestionType.PUZZLE]:
    'PUZZLE — put items in order. options: 4 items in the CORRECT order, by something unarguable (usually date). correctAnswer: the same items joined with " | ".',
  [QuestionType.MATCH]:
    'MATCH — pair items up. options: 4 pairs, each written "item = partner"; every partner different. correctAnswer: "See the pairs".',
  [QuestionType.CATEGORIZE]:
    'CATEGORIZE — sort items into groups. options: 6 items, each written "item = group", using exactly 2 or 3 groups with at least 2 items each. correctAnswer: "See the groups".',
  [QuestionType.SCRAMBLE]:
    "SCRAMBLE — players rebuild a word from its shuffled letters. text: the clue. options: []. correctAnswer: one word or a two-word name, 5 to 12 letters.",
};

/** Every type a generated game can use. */
export const GENERATABLE_TYPES: QuestionType[] = Object.values(QuestionType);

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
  const mix =
    allowed.length === 1
      ? `Every question is ${allowed[0]}.`
      : `Mix the formats so the round does not look the same twice in a row` +
        (allowed.includes(QuestionType.MULTIPLE_CHOICE)
          ? ": about half MULTIPLE_CHOICE, and the rest spread across the other formats"
          : ": spread them across the formats") +
        ", picking for each question the format that suits it — PIN for places, SLIDER, RANGE or NUMBER for years and quantities, PUZZLE for timelines, MATCH for pairs, CATEGORIZE for sorting, SCRAMBLE for a single memorable word.";

  try {
    const response = await withTimeout(
      client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system:
          "You write pub-trivia questions for a fast, head-to-head game played " +
          "on phones. Every question must have exactly one defensibly correct " +
          "answer, and wrong options must be plausible but clearly wrong. " +
          "Prefer questions a general audience can reason about over obscure " +
          "recall. Never repeat a question within a set. Keep every question " +
          "short enough to read in a few seconds.",
        messages: [
          {
            role: "user",
            content:
              `Write ${count} trivia questions about "${category}".\n` +
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

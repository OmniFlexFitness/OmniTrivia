import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Question, QuestionType } from "../types";
import { currentIdToken } from "./remoteRoom";

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

// The model fills this shape directly — no JSON hidden in markdown fences, and
// no hand-rolled parsing of a free-text response.
const GeneratedQuestions = z.object({
  questions: z.array(
    z.object({
      text: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number().int(),
      explanation: z.string(),
    }),
  ),
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
): Promise<GenerationResult> => {
  if (!client) {
    return fallback(
      category,
      count,
      "No VITE_ANTHROPIC_API_KEY is set, so no questions could be generated.",
    );
  }

  try {
    const response = await withTimeout(
      client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system:
          "You write pub-trivia questions. Every question must have exactly one " +
          "defensibly correct answer and three plausible but clearly wrong " +
          "distractors. Prefer questions a general audience can reason about " +
          "over obscure recall. Never repeat a question within a set.",
        messages: [
          {
            role: "user",
            content:
              `Write ${count} multiple-choice trivia questions about "${category}".\n` +
              `Each needs exactly 4 options, the 0-based index of the correct ` +
              `option, and a one-sentence fun fact explaining the answer.`,
          },
        ],
        output_config: {
          format: zodOutputFormat(GeneratedQuestions),
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

    const questions = parsed.questions
      .map((q, index) => {
        const options = q.options.map((o) => String(o));
        // A question the players cannot answer is worse than one fewer question.
        if (!q.text || options.length < 2) return null;

        const correctIndex =
          Number.isInteger(q.correctIndex) &&
          q.correctIndex >= 0 &&
          q.correctIndex < options.length
            ? q.correctIndex
            : 0;

        return {
          id: `${category}-${Date.now()}-${index}`,
          category,
          text: q.text,
          options,
          correctIndex,
          explanation: q.explanation || "No explanation provided.",
          type: QuestionType.MULTIPLE_CHOICE,
        } as Question;
      })
      .filter((q): q is Question => q !== null);

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
    // Identity-linked keys fail this way until a workspace is named, and the
    // raw message does not say where to put it.
    if (/workspace/i.test(error.message)) {
      return (
        "This Anthropic key is tied to a workspace and the request did not " +
        "name one. Set VITE_ANTHROPIC_WORKSPACE_ID in .env to the workspace " +
        "id (starts with wrkspc_) and restart the dev server."
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

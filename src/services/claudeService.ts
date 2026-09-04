import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Question, QuestionType } from "../types";

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

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
 * The key is inlined into the bundle Vite serves, so it is readable by anyone
 * who loads the app. `dangerouslyAllowBrowser` is required to acknowledge that;
 * without it the SDK refuses to construct. See LOCAL_PLAY.md for the safer
 * alternatives (restricted key, loopback-only play, or importing questions and
 * running with no key at all).
 */
const client = apiKey
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

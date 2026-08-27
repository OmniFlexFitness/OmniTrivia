import { GoogleGenerativeAI } from "@google/generative-ai";
import { Question, QuestionType } from "../types";

const apiKey = import.meta.env.VITE_API_KEY || "";

// A live game cannot sit on a hanging request while a room waits, so give the
// API a hard ceiling and fall back to placeholders past it.
const REQUEST_TIMEOUT_MS = 20000;

// Initialize Gemini
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

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
  if (!genAI) {
    return fallback(
      category,
      count,
      "No VITE_API_KEY is set, so no questions could be generated.",
    );
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Generate ${count} trivia questions about "${category}". 
    The questions should be challenging but fun. 
    Provide 4 options for each question. 
    Indicate the index (0-3) of the correct answer.
    Also provide a short fun fact explanation.
    
    Return the response as a valid JSON array with objects containing:
    - text: the question text
    - options: array of 4 string options
    - correctIndex: number 0-3 indicating correct answer
    - explanation: short explanation`;

    const result = await withTimeout(
      model.generateContent(prompt),
      REQUEST_TIMEOUT_MS,
    );
    const response = await result.response;
    const rawData = response.text();

    if (!rawData) throw new Error("Empty response from Gemini");

    // Extract JSON from the response (it might be wrapped in markdown code blocks)
    let jsonStr = rawData;
    const jsonMatch = rawData.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let parsedData;
    try {
      parsedData = JSON.parse(jsonStr.trim());
    } catch (e) {
      return fallback(
        category,
        count,
        "Gemini returned a response that could not be parsed as JSON.",
      );
    }

    if (!Array.isArray(parsedData)) {
      return fallback(
        category,
        count,
        "Gemini returned a response that was not a list of questions.",
      );
    }

    const questions = parsedData
      .map((q: any, index: number) => {
        const options = Array.isArray(q.options)
          ? q.options.map((o: any) => String(o))
          : [];
        // A question the players cannot answer is worse than one fewer question.
        if (!q.text || options.length < 2) return null;

        const correctIndex =
          typeof q.correctIndex === "number" &&
          q.correctIndex >= 0 &&
          q.correctIndex < options.length
            ? q.correctIndex
            : 0;

        return {
          id: `${category}-${Date.now()}-${index}`,
          category,
          text: String(q.text),
          options,
          correctIndex,
          explanation: q.explanation || "No explanation provided.",
          type: QuestionType.MULTIPLE_CHOICE,
        } as Question;
      })
      .filter((q): q is Question => q !== null);

    if (questions.length === 0) {
      return fallback(
        category,
        count,
        "Gemini returned no usable questions.",
      );
    }

    return { questions, usedFallback: false, error: null };
  } catch (error: any) {
    return fallback(
      category,
      count,
      `Could not reach the Gemini API (${error?.message || "unknown error"}).`,
    );
  }
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

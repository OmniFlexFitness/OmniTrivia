import { GoogleGenerativeAI } from "@google/generative-ai";
import { Question } from "../types";

const apiKey = import.meta.env.VITE_API_KEY || "";

// Initialize Gemini
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const generateQuestions = async (
  category: string,
  count: number = 5,
): Promise<Question[]> => {
  if (!genAI) {
    console.warn("No API Key provided. Returning mock data.");
    return getMockQuestions(category, count);
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

    const result = await model.generateContent(prompt);
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
      console.error("Failed to parse JSON:", e);
      return getMockQuestions(category, count);
    }

    if (!Array.isArray(parsedData)) {
      console.error("Response is not an array:", parsedData);
      return getMockQuestions(category, count);
    }

    return parsedData.map((q: any, index: number) => ({
      id: `${category}-${Date.now()}-${index}`,
      category,
      text: q.text || "Unknown Question",
      options: Array.isArray(q.options) ? q.options : ["A", "B", "C", "D"],
      correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
      explanation: q.explanation || "No explanation provided.",
    }));
  } catch (error) {
    console.error("Gemini API Error:", error);
    return getMockQuestions(category, count);
  }
};

const getMockQuestions = (category: string, count: number): Question[] => {
  return Array.from({ length: count }).map((_, i) => ({
    id: `mock-${i}`,
    category,
    text: `This is a mock question #${i + 1} about ${category} because the API key is missing or failed.`,
    options: ["Option A", "Option B", "Option C", "Option D"],
    correctIndex: 0,
    explanation: "This is a fallback explanation.",
  }));
};

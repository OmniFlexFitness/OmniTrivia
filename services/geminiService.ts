import { GoogleGenAI, Type } from '@google/genai';
import { Question } from '../types';

const apiKey = process.env.API_KEY;

// Initialize Gemini
const ai = apiKey ? new GoogleGenAI({ apiKey, vertexai: true }) : null;

export const generateQuestions = async (category: string, count: number = 5): Promise<Question[]> => {
  if (!ai) {
    console.warn("No API Key provided. Returning mock data.");
    return getMockQuestions(category, count);
  }

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `Generate ${count} trivia questions about "${category}". 
    The questions should be challenging but fun. 
    Provide 4 options for each question. 
    Indicate the index (0-3) of the correct answer.
    Also provide a short fun fact explanation.`;

    const response = await ai.models.generateContent({
      model,
      contents: {
        role: 'user',
        parts: [{ text: prompt }]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              options: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              correctIndex: { type: Type.INTEGER },
              explanation: { type: Type.STRING }
            },
            required: ['text', 'options', 'correctIndex', 'explanation']
          }
        }
      }
    });

    const rawData = response.text;
    if (!rawData) throw new Error("Empty response from Gemini");

    let parsedData;
    try {
      parsedData = JSON.parse(rawData);
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
      correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
      explanation: q.explanation || "No explanation provided."
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
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctIndex: 0,
    explanation: "This is a fallback explanation."
  }));
};
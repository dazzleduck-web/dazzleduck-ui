import { getGeminiErrorMessage } from "./geminiErrors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const VALIDATION_PROMPT = "Hello";

export const validateApiKey = async (apiKey, model) => {
  if (!apiKey?.trim()) {
    return {
      isValid: false,
      validationError: "API key is required",
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const aiModel = genAI.getGenerativeModel({ model });

    const result = await aiModel.generateContent(VALIDATION_PROMPT);
    const response = await result.response;
    const text = response.text();

    if (text) {
      return {
        isValid: true,
        validationError: null,
      };
    }

    return {
      isValid: false,
      validationError: "API key validation failed: No response from Gemini",
    };
  } catch (error) {
    return {
      isValid: false,
      validationError: getGeminiErrorMessage(error, "API key validation failed"),
    };
  }
};

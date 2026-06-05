/**
 * Gemini utility functions
 * Helper functions for Gemini API integration
 */

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

/**
 * Normalize user message
 */
export function normalizeMessage(message) {
  return (message || "").trim();
}

/**
 * Build tool call record for chat transcript
 */
export function buildToolCallRecord(name, args, result, status = "completed") {
  return {
    name,
    args,
    status,
    result,
  };
}

/**
 * Build pending action object for confirmation flow
 */
export function buildPendingAction(tool, data = {}) {
  return {
    tool,
    ...data,
  };
}

/**
 * Convert frontend history format to Gemini format
 */
export function toGeminiHistory(history = []) {
  const normalized = [];
  let seenUserMessage = false;

  for (const item of history) {
    if (!item || typeof item.content !== "string" || !item.content.trim()) {
      continue;
    }

    const role = item.role === "assistant" ? "model" : "user";
    if (!seenUserMessage) {
      if (role !== "user") {
        continue;
      }
      seenUserMessage = true;
    }

    normalized.push({
      role,
      parts: [{ text: item.content }],
    });
  }

  return normalized;
}

/**
 * Extract function calls from Gemini response
 */
export function extractFunctionCalls(response) {
  if (!response) return [];

  if (typeof response.functionCalls === "function") {
    try {
      return response.functionCalls() || [];
    } catch (error) {
      if (isDev) {
        console.debug("[gemini:utils] response.functionCalls() failed", error);
      }
    }
  }

  return response.functionCalls || [];
}

/**
 * Safely extract Gemini response text
 */
export function extractResponseText(response) {
  if (!response || typeof response.text !== "function") {
    throw new Error("Gemini returned an invalid response.");
  }

  try {
    return response.text()?.trim() || "";
  } catch (error) {
    if (isDev) {
      console.debug("[gemini:utils] response.text() failed", error);
    }
    throw new Error("Gemini returned an invalid response.");
  }
}

export default {
  normalizeMessage,
  buildToolCallRecord,
  buildPendingAction,
  toGeminiHistory,
  extractFunctionCalls,
  extractResponseText,
};

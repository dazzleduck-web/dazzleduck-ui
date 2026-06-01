/**
 * Intent routing and detection utilities for AI agent
 * Browser-native intent routing for the AI assistant
 */

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

/**
 * Normalize user message for intent detection
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
        console.debug("[gemini:intents] response.functionCalls() failed, falling back to property", error);
      }
    }
  }

  return response.functionCalls || [];
}

/**
 * Safely extract Gemini response text without throwing on malformed responses
 */
export function extractResponseText(response) {
  if (!response || typeof response.text !== "function") {
    throw new Error("Gemini returned an invalid response.");
  }

  try {
    return response.text()?.trim() || "";
  } catch (error) {
    if (isDev) {
      console.debug("[gemini:intents] response.text() failed", error);
    }
    throw new Error("Gemini returned an invalid response.");
  }
}

/**
 * Run direct intent handling (bypass Gemini for VERY OBVIOUS requests only)
 * Let Gemini handle anything that requires understanding
 */
export async function runDirectIntent(message, context) {
  const lowerMessage = message.toLowerCase().trim();

  // ONLY handle extremely simple, obvious requests
  // Everything else goes to Gemini for actual understanding

  // Very basic database listing (only if explicitly requested)
  if (/^(show|list|what are|which).*databases?\?*$/.test(lowerMessage)) {
    const { listDatabases } = context;
    const toolResult = await listDatabases();
    return {
      reply: `Found ${toolResult.count} database${toolResult.count === 1 ? "" : "s"}.`,
      toolCalls: [buildToolCallRecord("listDatabases", {}, toolResult)],
      pendingQuery: null,
      results: toolResult.databases || [],
    };
  }

  // Very basic table listing (only if explicitly requested)
  if (/^(show|list).*tables?\?*$/.test(lowerMessage)) {
    const { listTables } = context;
    const toolResult = await listTables();
    return {
      reply: `Found ${toolResult.count} table${toolResult.count === 1 ? "" : "s"}.`,
      toolCalls: [buildToolCallRecord("listTables", {}, toolResult)],
      pendingQuery: null,
      results: toolResult.rows || [],
    };
  }

  // Very basic named query listing (only if explicitly requested)
  if (/^(show|list|what).*named queries?\?*$/.test(lowerMessage)) {
    const { listNamedQueries } = context;
    const toolResult = await listNamedQueries();
    return {
      reply: `Found ${toolResult.count} named quer${toolResult.count === 1 ? "y" : "ies"}.`,
      toolCalls: [buildToolCallRecord("listNamedQueries", {}, toolResult)],
      pendingQuery: null,
      results: toolResult.namedQueries || [],
    };
  }

  // For everything else, let Gemini actually understand the request
  return null;
}

export default {
  // Direct routing
  runDirectIntent,
  normalizeMessage,

  // Builder utilities
  buildToolCallRecord,
  buildPendingAction,

  // Format conversion
  toGeminiHistory,
  extractFunctionCalls,
};

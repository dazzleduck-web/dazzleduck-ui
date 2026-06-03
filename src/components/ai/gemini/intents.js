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
 * @param {string} message - User message to match
 * @param {Function} callTool - Unified tool execution function (callTool(name, args))
 */
export async function runDirectIntent(message, callTool) {
  const lowerMessage = message.toLowerCase().trim();
  const tableMatch = lowerMessage.match(/^(show|list).*\btables?\b(?:\s+(?:from|in)\s+(.+?))?\??$/i);
  const bulkNamedQueryMatch = lowerMessage.match(/^(run|execute)(?:\s+all)?\s+named quer(?:y|ies)(?:\s+(?:from|in)\s+(.+?))?\??$/i);

  // ONLY handle extremely simple, obvious requests
  // Everything else goes to Gemini for actual understanding

  // Very basic database listing (only if explicitly requested)
  if (/^(show|list|what are|which).*databases?\?*$/.test(lowerMessage)) {
    const toolResult = await callTool("listDatabases");
    return {
      reply: `Found ${toolResult.count} database${toolResult.count === 1 ? "" : "s"}.`,
      toolCalls: [buildToolCallRecord("listDatabases", {}, toolResult)],
      pendingQuery: null,
      results: toolResult.databases || [],
    };
  }

  // Very basic table listing (only if explicitly requested)
  if (tableMatch) {
    const databaseName = tableMatch[2]?.trim()?.replace(/^["'`]|["'`]$/g, "") || "";
    const toolResult = await callTool("listTables", { databaseName });

    const reply = toolResult.message
      || (databaseName
        ? `Found ${toolResult.count} table${toolResult.count === 1 ? "" : "s"} in ${databaseName}.`
        : `Found ${toolResult.count} table${toolResult.count === 1 ? "" : "s"}.`);

    return {
      reply,
      toolCalls: [buildToolCallRecord("listTables", { databaseName }, toolResult)],
      pendingQuery: null,
      results: toolResult.rows || [],
    };
  }

  // Very basic named query listing (only if explicitly requested)
  if (/^(show|list|what).*named queries?\?*$/.test(lowerMessage)) {
    const toolResult = await callTool("listNamedQueries");
    return {
      reply: `Found ${toolResult.count} named quer${toolResult.count === 1 ? "y" : "ies"}.`,
      toolCalls: [buildToolCallRecord("listNamedQueries", {}, toolResult)],
      pendingQuery: null,
      results: toolResult.namedQueries || [],
    };
  }

  // Very basic bulk named query execution (only if explicitly requested)
  if (bulkNamedQueryMatch) {
    const queryGroup = bulkNamedQueryMatch[2]?.trim()?.replace(/^["'`]|["'`]$/g, "") || "";
    const toolResult = await callTool("executeAllNamedQueries", { queryGroup });

    return {
      reply: toolResult.message
        || (queryGroup
          ? `Prepared all named queries in group ${queryGroup} for review.`
          : "Prepared all named queries for review."),
      toolCalls: [buildToolCallRecord("executeAllNamedQueries", { queryGroup }, toolResult)],
      pendingQuery: toolResult.requiresConfirmation
        ? buildPendingAction("executeAllNamedQueries", {
            queryGroup: toolResult.queryGroup || queryGroup,
            explanation: toolResult.explanation || "Bulk named query execution requires confirmation.",
          })
        : null,
      results: Array.isArray(toolResult.rows) ? toolResult.rows : [],
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

const MESSAGE_KIND = {
  text: "text",
  queryResult: "query-result",
  error: "error",
  confirmation: "confirmation",
};

const createMessageId = () => (
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `ai-msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const normalizeRole = (role) => (role === "assistant" ? "assistant" : "user");

const normalizeKind = (kind, message = {}) => {
  if (kind === MESSAGE_KIND.queryResult) return MESSAGE_KIND.queryResult;
  if (kind === MESSAGE_KIND.error || message.error) return MESSAGE_KIND.error;
  if (kind === MESSAGE_KIND.confirmation) return MESSAGE_KIND.confirmation;
  return MESSAGE_KIND.text;
};

/**
 * Create a normalized chat message record.
 */
export const createChatMessage = ({
  id,
  role,
  kind = MESSAGE_KIND.text,
  content = "",
  toolCalls = [],
  result = null,
  error = null,
} = {}) => ({
  id: id || createMessageId(),
  role: normalizeRole(role),
  kind: normalizeKind(kind, { error }),
  content,
  toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
  result,
  error,
});

/**
 * Normalize legacy messages loaded from storage into the structured shape.
 */
export const normalizeChatMessage = (message) => {
  if (!message || typeof message !== "object") {
    return null;
  }

  return createChatMessage({
    id: message.id,
    role: message.role,
    kind: message.kind,
    content: message.content ?? "",
    toolCalls: message.toolCalls,
    result: message.result ?? null,
    error: message.error ?? null,
  });
};

export const createTextMessage = (role, content, toolCalls = []) => (
  createChatMessage({ role, kind: MESSAGE_KIND.text, content, toolCalls })
);

/**
 * Create a query-result message record.
 */
export const createQueryResultMessage = ({
  content = "",
  result = null,
  toolCalls = [],
} = {}) => {
  return createChatMessage({
    role: "assistant",
    kind: MESSAGE_KIND.queryResult,
    content,
    toolCalls,
    result,
  });
};

export const createErrorMessage = (content) => (
  createChatMessage({ role: "assistant", kind: MESSAGE_KIND.error, content, error: content })
);

export const createConfirmationMessage = (content, result = null) => (
  createChatMessage({ role: "assistant", kind: MESSAGE_KIND.confirmation, content, result })
);

export { MESSAGE_KIND };

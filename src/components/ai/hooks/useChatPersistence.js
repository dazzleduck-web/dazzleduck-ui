import { useCallback, useEffect } from "react";
import { normalizeChatMessage } from "../util/chatMessageUtils";
import { PERSISTENCE_MAX_MESSAGES } from "../config/aiConstants";

const STORAGE_KEY = "dazzleduck_ai_chat";

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

// No-op storage for graceful degradation when sessionStorage is unavailable
const noOpStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const storage = typeof sessionStorage !== "undefined" ? sessionStorage : noOpStorage;

const safeStringify = (value) => JSON.stringify(value, (_key, currentValue) => (
  typeof currentValue === "bigint" ? currentValue.toString() : currentValue
));

const saveChatState = (state, storageKey = STORAGE_KEY) => {
  try {
    const compactState = {
      messages: state.messages.slice(-PERSISTENCE_MAX_MESSAGES),
      resultRows: Array.isArray(state.resultRows) ? state.resultRows : [],
      resultMetadata: state.resultMetadata,
      timestamp: Date.now(),
    };
    storage.setItem(storageKey, safeStringify(compactState));
  } catch (error) {
    if (isDev) {
      console.warn("Failed to save chat state:", error);
    }
    if (error.name === "QuotaExceededError") {
      try {
        storage.removeItem(storageKey);
      } catch (e) {
        if (isDev) {
          console.error("Failed to clear storage:", e);
        }
      }
    }
  }
};

const loadChatState = (storageKey = STORAGE_KEY) => {
  try {
    const saved = storage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.messages && Array.isArray(parsed.messages)) {
        return {
          messages: parsed.messages
            .map((message) => normalizeChatMessage(message))
            .filter(Boolean),
          resultRows: Array.isArray(parsed.resultRows) ? parsed.resultRows : [],
          resultMetadata: parsed.resultMetadata || null,
        };
      }
    }
  } catch (error) {
    if (isDev) {
      console.warn("Failed to load chat state:", error);
    }
  }
  return null;
};

export function useChatPersistence({
  messages,
  resultRows,
  resultMetadata,
  setMessages,
  setResultRows,
  setResultMetadata,
  storageKey = STORAGE_KEY,
} = {}) {
  useEffect(() => {
    const savedState = loadChatState(storageKey);
    if (savedState) {
      setMessages(savedState.messages);
      setResultRows(savedState.resultRows);
      setResultMetadata(savedState.resultMetadata);
    }
  }, [setMessages, setResultRows, setResultMetadata, storageKey]);

  useEffect(() => {
    if (messages.length > 1) {
      saveChatState({ messages, resultRows, resultMetadata }, storageKey);
    }
  }, [messages, resultRows, resultMetadata, storageKey]);

  const clearChatPersistence = useCallback(() => {
    try {
      storage.removeItem(storageKey);
    } catch (error) {
      if (isDev) {
        console.warn("Failed to clear chat storage:", error);
      }
    }
  }, [storageKey]);

  return {
    clearChatPersistence,
  };
}

export default useChatPersistence;

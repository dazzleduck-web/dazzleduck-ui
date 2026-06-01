import { useCallback, useEffect } from "react";

const STORAGE_KEY = "dazzleduck_ai_chat";
const MAX_MESSAGES = 100;

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

const saveChatState = (state, storageKey = STORAGE_KEY) => {
  try {
    const compactState = {
      messages: state.messages.slice(-MAX_MESSAGES),
      resultMetadata: state.resultMetadata,
      timestamp: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(compactState));
  } catch (error) {
    if (isDev) {
      console.warn("Failed to save chat state:", error);
    }
    if (error.name === "QuotaExceededError") {
      try {
        localStorage.removeItem(storageKey);
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
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.messages && Array.isArray(parsed.messages)) {
        return {
          messages: parsed.messages,
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
  resultMetadata,
  setMessages,
  setResultMetadata,
  storageKey = STORAGE_KEY,
} = {}) {
  useEffect(() => {
    const savedState = loadChatState(storageKey);
    if (savedState) {
      setMessages(savedState.messages);
      setResultMetadata(savedState.resultMetadata);
    }
  }, [setMessages, setResultMetadata, storageKey]);

  useEffect(() => {
    if (messages.length > 1) {
      saveChatState({ messages, resultMetadata }, storageKey);
    }
  }, [messages, resultMetadata, storageKey]);

  const clearChatPersistence = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
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

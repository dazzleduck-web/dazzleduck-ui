import { useEffect } from "react";

const DEFAULT_MAX_MESSAGES = 100;
const DEFAULT_COMPACT_THRESHOLD = 80;
const DEFAULT_KEEP_COUNT = 30;

const compactMessages = (messages, keepCount = DEFAULT_KEEP_COUNT, maxMessages = DEFAULT_MAX_MESSAGES) => {
  if (messages.length <= maxMessages) return messages;

  const welcomeMessage = messages[0];
  const recentMessages = messages.slice(-keepCount);

  return [welcomeMessage, ...recentMessages];
};

export function useConversationCompaction({
  messages,
  setMessages,
  maxMessages = DEFAULT_MAX_MESSAGES,
  compactThreshold = DEFAULT_COMPACT_THRESHOLD,
  keepCount = DEFAULT_KEEP_COUNT,
} = {}) {
  useEffect(() => {
    if (messages.length > compactThreshold) {
      const compacted = compactMessages(messages, keepCount, maxMessages);
      if (compacted.length < messages.length) {
        setMessages(compacted);
      }
    }
  }, [messages, setMessages, maxMessages, compactThreshold, keepCount]);
}

export default useConversationCompaction;

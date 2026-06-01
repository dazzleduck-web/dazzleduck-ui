/**
 * useGeminiChat Hook
 * Main chat hook that manages Gemini interactions, tool calls, and conversation state
 * Enhanced with localStorage persistence and smart history compaction
 */

import { useState, useCallback } from "react";
import { GoogleGenerativeAI, FunctionCallingMode } from "@google/generative-ai";
import { useAIConfig } from "../../../context/useAIConfig";
import { useQueryDashboard } from "../../../context/QueryDashboardContext";
import { SYSTEM_PROMPT } from "../gemini/systemPrompts";
import {
  toGeminiHistory,
  extractFunctionCalls,
  extractResponseText,
  runDirectIntent,
  normalizeMessage,
  buildPendingAction,
  buildToolCallRecord,
} from "../gemini/intents";
import { getGeminiErrorMessage } from "../../../services/geminiErrors";
import { toolDefinitions } from "../tools/toolRegistry";
import { useChatPersistence } from "./useChatPersistence";
import { useConversationCompaction } from "./useConversationCompaction";
import { useToolExecution } from "./useToolExecution";

const COMPACT_THRESHOLD = 80; // Start compacting at this threshold

const initialMessages = [
  {
    role: "assistant",
    content: "Ask me about tables, schemas, or data. I can draft a read-only query and let you review it before execution.",
    toolCalls: [],
  },
];

// Estimate token count (rough estimate: ~4 chars per token)
const estimateTokens = (text) => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

// Estimate total conversation tokens
const estimateConversationTokens = (messages) => {
  let totalTokens = 0;
  messages.forEach(msg => {
    totalTokens += estimateTokens(msg.content);
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      // Add estimated tokens for tool calls
      totalTokens += msg.toolCalls.length * 50; // Rough estimate per tool call
    }
  });
  return totalTokens;
};

const extractResultRows = (toolName, toolResult, fallbackRows = []) => {
  if (Array.isArray(toolResult?.rows)) {
    return toolResult.rows;
  }

  if (Array.isArray(toolResult?.columns)) {
    return toolResult.columns;
  }

  if (toolName === "listDatabases" && Array.isArray(toolResult?.databases)) {
    return toolResult.databases;
  }

  if (toolName === "listNamedQueries" && Array.isArray(toolResult?.namedQueries)) {
    return toolResult.namedQueries;
  }

  return Array.isArray(fallbackRows) ? fallbackRows : [];
};

const isListTool = (toolName) =>
  toolName === "listDatabases" ||
  toolName === "listTables" ||
  toolName === "listNamedQueries";

export const useGeminiChat = ({ showPopup } = {}) => {
  const { config } = useAIConfig();
  const queryDashboard = useQueryDashboard();

  const [messages, setMessages] = useState(initialMessages);
  const [loading, setLoading] = useState(false);
  const [pendingQuery, setPendingQuery] = useState(null);
  const [pendingQueryLoading, setPendingQueryLoading] = useState(false);
  const [resultRows, setResultRows] = useState([]);
  const [resultMetadata, setResultMetadata] = useState(null);
  const [error, setError] = useState(null);
  const { clearChatPersistence } = useChatPersistence({
    messages,
    resultMetadata,
    setMessages,
    setResultMetadata,
  });
  useConversationCompaction({
    messages,
    setMessages,
    compactThreshold: COMPACT_THRESHOLD,
  });
  const {
    callTool,
    listDatabases,
    listTables,
    listNamedQueries,
    getNamedQuery,
    executeQuery,
    executeNamedQuery,
    describeTable,
  } = useToolExecution();

  // Main chat function
  const sendMessage = useCallback(async (userMessage) => {
    const normalizedMessage = normalizeMessage(userMessage);

    if (!normalizedMessage) {
      return;
    }

    if (!config.geminiApiKey || !config.isValid) {
      setError("Please configure your Gemini API key first.");
      return;
    }

    if (!queryDashboard.connectionInfo?.serverUrl || !queryDashboard.jwtToken) {
      setError("Please connect to a DazzleDuck server first.");
      return;
    }

    setLoading(true);
    setError(null);

    // Add user message
    const userMessageObj = { role: "user", content: normalizedMessage, toolCalls: [] };
    setMessages((prev) => [...prev, userMessageObj]);

    try {
      // Create intent context
      const intentContext = {
        listDatabases,
        listTables,
        listNamedQueries,
        getNamedQuery,
        executeQuery,
        executeNamedQuery,
        describeTable,
      };

      // Try direct intent routing first
      const directResponse = await runDirectIntent(normalizedMessage, intentContext);

      if (directResponse) {
        // Direct intent handled successfully
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: directResponse.reply,
            toolCalls: directResponse.toolCalls || [],
          },
        ]);

        setResultRows(extractResultRows(null, directResponse, directResponse.results));
        setResultMetadata({ preferredDisplay: "table" });

        if (directResponse.pendingQuery) {
          setPendingQuery(directResponse.pendingQuery);
        }

        setLoading(false);
        return;
      }

      // Fall back to Gemini for complex requests
      const genAI = new GoogleGenerativeAI(config.geminiApiKey);
      const toolConfig = {
        functionCallingConfig: {
          mode: FunctionCallingMode.AUTO,
        },
      };

      const model = genAI.getGenerativeModel({
        model: config.geminiModel,
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: toolDefinitions }],
        toolConfig,
      });

      const chat = model.startChat({
        history: toGeminiHistory(messages),
        tools: [{ functionDeclarations: toolDefinitions }],
        toolConfig,
      });

      const toolCalls = [];
      let latestResults = [];
      let nextInput = normalizedMessage;

      // Multi-turn tool execution
      for (let turn = 0; turn < 5; turn += 1) {
        const result = await chat.sendMessage(nextInput);
        const response = result?.response;
        if (!response) {
          throw new Error("Gemini returned an invalid response.");
        }

        const functionCalls = extractFunctionCalls(response);
        const replyText = extractResponseText(response);

        if (functionCalls.length === 0) {
          // No more tool calls, we're done
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: replyText || "Done.",
              toolCalls,
            },
          ]);

          setResultRows(latestResults);
          setLoading(false);
          return;
        }

        const functionResponses = [];

        for (const call of functionCalls) {
          const toolName = call.name;
          const args = call.args || {};

          // Execute tool
          const toolResult = await callTool(toolName, args);

          // Handle confirmation requirements
          if (toolName === "executeQuery" && toolResult.requiresConfirmation) {
            toolCalls.push(buildToolCallRecord(toolName, args, toolResult, "pending_confirmation"));

            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: toolResult.message,
                toolCalls,
              },
            ]);

            setPendingQuery(
              buildPendingAction("executeQuery", {
                query: toolResult.query,
                explanation: toolResult.explanation || args.explanation || "",
              })
            );
            setResultRows([]);
            setLoading(false);
            return;
          }

          if (toolName === "executeNamedQuery" && toolResult.requiresConfirmation) {
            toolCalls.push(buildToolCallRecord(toolName, args, toolResult, "pending_confirmation"));

            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: toolResult.message,
                toolCalls,
              },
            ]);

            setPendingQuery(
              buildPendingAction("executeNamedQuery", {
                queryName: toolResult.queryName || args.queryName,
                parameters: toolResult.parameters || args.parameters || {},
                explanation: toolResult.explanation || "Named query execution requires confirmation.",
              })
            );
            setResultRows([]);
            setLoading(false);
            return;
          }

          // Tool completed successfully
          toolCalls.push(buildToolCallRecord(toolName, args, toolResult));

          latestResults = extractResultRows(toolName, toolResult);

          // Extract result metadata for display type
          if (isListTool(toolName)) {
            setResultMetadata({ preferredDisplay: "table" });
          } else if (toolResult.namedQuery) {
            setResultMetadata({
              queryName: toolResult.queryName,
              preferredDisplay: toolResult.namedQuery.preferred_display || "table",
            });
          } else {
            setResultMetadata(null);
          }

          functionResponses.push({
            functionResponse: {
              name: toolName,
              response: toolResult,
            },
          });
        }

        nextInput = functionResponses;
      }

      // If we get here, we reached max turns
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I reached the maximum number of tool turns. Please try a simpler request.",
          toolCalls,
        },
      ]);

      setResultRows(latestResults);
    } catch (error) {
      const errorMessage = getGeminiErrorMessage(error, "Failed to process request");

      setError(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errorMessage,
          toolCalls: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [
    config,
    queryDashboard,
    messages,
    callTool,
    listDatabases,
    listTables,
    listNamedQueries,
    getNamedQuery,
    executeQuery,
    executeNamedQuery,
    describeTable,
  ]);

  // Confirm and execute pending query
  const confirmQuery = useCallback(async () => {
    if (!pendingQuery || pendingQueryLoading) {
      return;
    }

    setPendingQueryLoading(true);
    setError(null);

    try {
      const action = pendingQuery;
      const tool = action?.tool || "executeQuery";
      let result;

      if (tool === "executeNamedQuery") {
        const queryName = action.queryName?.trim();
        if (!queryName) {
          throw new Error("queryName is required");
        }

        const parameters = action.parameters || {};
        result = await callTool("executeNamedQuery", { queryName, parameters, confirmed: true });

        const rows = Array.isArray(result?.rows)
          ? result.rows
          : Array.isArray(result)
            ? result
            : [];
        const rowCount = Number.isFinite(result?.rowCount) ? result.rowCount : rows.length;

        // Set result metadata for display type
        if (result?.namedQuery) {
          setResultMetadata({
            queryName: queryName,
            preferredDisplay: result.namedQuery.preferred_display || "table",
          });
        } else {
          setResultMetadata(null);
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Named query executed successfully. Found ${rowCount} row${rowCount === 1 ? "" : "s"}.`,
            toolCalls: [
              buildToolCallRecord(
                "executeNamedQuery",
                { queryName, parameters, confirmed: true },
                { ...result, rows, rowCount }
              ),
            ],
          },
        ]);

        setResultRows(extractResultRows("executeNamedQuery", result, rows));
      } else {
        const finalQuery = action?.query;
        if (!finalQuery?.trim()) {
          throw new Error("query is required");
        }

        const explanation = action?.explanation || "";
        result = await callTool("executeQuery", { query: finalQuery, explanation, confirmed: true });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Query executed successfully. Found ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}.`,
            toolCalls: [
              buildToolCallRecord("executeQuery", { query: finalQuery, explanation, confirmed: true }, result),
            ],
          },
        ]);

        setResultRows(extractResultRows("executeQuery", result));
        setResultMetadata(null); // Reset metadata for direct SQL queries
      }

      setPendingQuery(null);
    } catch (error) {
      const errorMessage = getGeminiErrorMessage(error, "Failed to execute query");
      setError(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errorMessage,
          toolCalls: [],
        },
      ]);
    } finally {
      setPendingQueryLoading(false);
    }
  }, [pendingQuery, pendingQueryLoading, callTool]);

  // Cancel pending query
  const cancelQuery = useCallback(() => {
    setPendingQuery(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "Query cancelled.",
        toolCalls: [],
      },
    ]);
  }, []);

  // Clear conversation
  const clearConversation = useCallback(() => {
    setMessages(initialMessages);
    setResultRows([]);
    setResultMetadata(null);
    setPendingQuery(null);
    setError(null);

    clearChatPersistence();
    if (typeof showPopup === "function") {
      showPopup("Conversation cleared successfully", "success");
    }
  }, [showPopup, clearChatPersistence]);

  return {
    // State
    messages,
    loading,
    pendingQuery,
    pendingQueryLoading,
    resultRows,
    resultMetadata,
    error,

    // Actions
    sendMessage,
    confirmQuery,
    cancelQuery,
    clearConversation,

    // Computed
    hasError: !!error,
    canChat: config.isValid && config.geminiApiKey && queryDashboard.connectionInfo?.serverUrl && queryDashboard.jwtToken,
    hasPendingAction: !!pendingQuery,

    // Chat statistics
    messageCount: messages.length,
    estimatedTokens: estimateConversationTokens(messages),
    isCompacted: messages.length > COMPACT_THRESHOLD,
  };
};

export default useGeminiChat;

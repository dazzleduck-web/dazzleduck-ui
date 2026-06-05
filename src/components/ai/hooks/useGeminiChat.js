/**
 * useGeminiChat Hook
 * Main chat hook that manages Gemini interactions, tool calls, and conversation state
 * Enhanced with sessionStorage persistence and smart history compaction
 */

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { GoogleGenerativeAI, FunctionCallingMode } from "@google/generative-ai";
import { useAIConfig } from "../../../context/useAIConfig";
import { useQueryDashboard } from "../../../context/QueryDashboardContext";
import { SYSTEM_PROMPT } from "../gemini/systemPrompts";
import {
  toGeminiHistory,
  extractFunctionCalls,
  extractResponseText,
  normalizeMessage,
  buildPendingAction,
  buildToolCallRecord,
} from "../gemini/geminiUtils";
import { getGeminiErrorMessage } from "../../../services/geminiErrors";
import { toolDefinitions } from "../tools/toolRegistry";
import { useChatPersistence } from "./useChatPersistence";
import { useConversationCompaction } from "./useConversationCompaction";
import { useToolExecution } from "./useToolExecution";
import {
  createTextMessage,
  createErrorMessage,
  createConfirmationMessage,
} from "../util/chatMessageUtils";
import {
  extractResultRows,
  getResultMetadata,
  createExecutionResultMessage,
  buildBulkNamedQueryExecutionResult,
} from "./resultMessageHelpers";
import { COMPACTION_TRIGGER_THRESHOLD, COMPACTION_MAX_MESSAGES, COMPACTION_KEEP_COUNT, MAX_TOOL_TURNS } from "../config/aiConstants";

const initialMessages = [
  createTextMessage(
    "assistant",
    "Ask me about tables, schemas, or data. I can draft a read-only query and let you review it before execution."
  ),
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
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const { clearChatPersistence } = useChatPersistence({
    messages,
    resultRows,
    resultMetadata,
    setMessages,
    setResultRows,
    setResultMetadata,
  });
  useConversationCompaction({
    messages,
    setMessages,
    compactThreshold: COMPACTION_TRIGGER_THRESHOLD,
    maxMessages: COMPACTION_MAX_MESSAGES,
    keepCount: COMPACTION_KEEP_COUNT,
  });
  const { callTool } = useToolExecution();

  // Memoize GoogleGenerativeAI client to avoid recreating on every message
  const genAI = useMemo(
    () => new GoogleGenerativeAI(config.geminiApiKey),
    [config.geminiApiKey]
  );

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
    const userMessageObj = createTextMessage("user", normalizedMessage);
    setMessages((prev) => [...prev, userMessageObj]);

    try {
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
        history: toGeminiHistory(messagesRef.current),
        tools: [{ functionDeclarations: toolDefinitions }],
        toolConfig,
      });

      const toolCalls = [];
      let latestResults = [];
      let hasResultPanelUpdate = false;
      let nextInput = normalizedMessage;

      // Multi-turn tool execution
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
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
            createTextMessage("assistant", replyText || "Done.", toolCalls),
          ]);

          if (hasResultPanelUpdate) {
            setResultRows(latestResults);
          }
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
              createConfirmationMessage(toolResult.message, {
                query: toolResult.query,
                explanation: toolResult.explanation || args.explanation || "",
              }),
            ]);

            setPendingQuery(
              buildPendingAction("executeQuery", {
                query: toolResult.query,
                explanation: toolResult.explanation || args.explanation || "",
              })
            );
            return;
          }

          if (toolName === "executeNamedQuery" && toolResult.requiresConfirmation) {
            toolCalls.push(buildToolCallRecord(toolName, args, toolResult, "pending_confirmation"));

            setMessages((prev) => [
              ...prev,
              createConfirmationMessage(toolResult.message, {
                queryName: toolResult.queryName || args.queryName,
                parameters: toolResult.parameters || args.parameters || {},
                explanation: toolResult.explanation || "Named query execution requires confirmation.",
              }),
            ]);

            setPendingQuery(
              buildPendingAction("executeNamedQuery", {
                queryName: toolResult.queryName || args.queryName,
                parameters: toolResult.parameters || args.parameters || {},
                explanation: toolResult.explanation || "Named query execution requires confirmation.",
              })
            );
            return;
          }

          if (toolName === "executeAllNamedQueries" && toolResult.requiresConfirmation) {
            toolCalls.push(buildToolCallRecord(toolName, args, toolResult, "pending_confirmation"));

            setMessages((prev) => [
              ...prev,
              createConfirmationMessage(toolResult.message, {
                queryGroup: toolResult.queryGroup || args.queryGroup || "",
                explanation: toolResult.explanation || "Bulk named query execution requires confirmation.",
              }),
            ]);

            setPendingQuery(
              buildPendingAction("executeAllNamedQueries", {
                queryGroup: toolResult.queryGroup || args.queryGroup || "",
                explanation: toolResult.explanation || "Bulk named query execution requires confirmation.",
              })
            );
            return;
          }

          if (toolName === "getNamedQuery") {
            toolCalls.push(buildToolCallRecord(toolName, args, toolResult));

            functionResponses.push({
              functionResponse: {
                name: toolName,
                response: toolResult,
              },
            });
            continue;
          }

          // Tool completed successfully
          toolCalls.push(buildToolCallRecord(toolName, args, toolResult));

          latestResults = extractResultRows(toolName, toolResult);
          hasResultPanelUpdate = true;
          setResultMetadata(getResultMetadata(toolName, toolResult, null));
          setResultRows(latestResults);

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
      const maxTurnsMessage = "Your question required too many steps to answer. Try breaking it into smaller questions or being more specific.";
      if (isDev) {
        console.warn(`[AI] Max tool turns (${MAX_TOOL_TURNS}) exceeded. Tool calls made:`, toolCalls.map(tc => `${tc.name}(${JSON.stringify(tc.args)})`).join(", "));
      }
      setMessages((prev) => [
        ...prev,
        createTextMessage("assistant", maxTurnsMessage, toolCalls),
      ]);
      if (hasResultPanelUpdate) {
        setResultRows(latestResults);
      }
    } catch (error) {
      const errorMessage = getGeminiErrorMessage(error, "Failed to process request");

      setError(errorMessage);
      setMessages((prev) => [
        ...prev,
        createErrorMessage(errorMessage),
      ]);
    } finally {
      setLoading(false);
    }
  }, [
    config,
    queryDashboard,
    genAI,
    callTool,
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

        const successMessage = `Named query executed successfully. Found ${rowCount} row${rowCount === 1 ? "" : "s"}.`;
        const resultMessage = createExecutionResultMessage({
          toolName: "executeNamedQuery",
          rows: extractResultRows("executeNamedQuery", result, rows),
          metadata: result?.namedQuery
            ? {
                queryName,
                preferredDisplay: result.namedQuery.preferred_display || "table",
              }
            : null,
          queryName,
        });

        setMessages((prev) => [
          ...prev,
          createTextMessage(
            "assistant",
            successMessage,
            [
              buildToolCallRecord(
                "executeNamedQuery",
                { queryName, parameters, confirmed: true },
                { ...result, rows, rowCount }
              ),
            ]
          ),
          ...(resultMessage ? [resultMessage] : []),
        ]);

        setResultRows(extractResultRows("executeNamedQuery", result, rows));
      } else if (tool === "executeAllNamedQueries") {
        const queryGroup = action.queryGroup?.trim() || "";
        const explanation = action.explanation || "";
        result = await callTool("executeAllNamedQueries", { queryGroup, confirmed: true, explanation });
        const bulkExecutionResult = buildBulkNamedQueryExecutionResult(result, queryGroup);

        setMessages((prev) => [
          ...prev,
          createTextMessage(
            "assistant",
            bulkExecutionResult.successMessage,
            [
              buildToolCallRecord(
                "executeAllNamedQueries",
                { queryGroup, explanation, confirmed: true },
                result
              ),
            ]
          ),
          ...(bulkExecutionResult.resultMessage ? [bulkExecutionResult.resultMessage] : []),
        ]);

        setResultRows(bulkExecutionResult.rows);
        setResultMetadata(bulkExecutionResult.metadata);
      } else {
        const finalQuery = action?.query;
        if (!finalQuery?.trim()) {
          throw new Error("query is required");
        }

        const explanation = action?.explanation || "";
        result = await callTool("executeQuery", { query: finalQuery, explanation, confirmed: true });

        const successMessage = `Query executed successfully. Found ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}.`;
        const resultRowsForChat = extractResultRows("executeQuery", result);
        const resultMessage = createExecutionResultMessage({
          toolName: "executeQuery",
          rows: resultRowsForChat,
          metadata: null,
        });

        setMessages((prev) => [
          ...prev,
          createTextMessage(
            "assistant",
            successMessage,
            [
              buildToolCallRecord("executeQuery", { query: finalQuery, explanation, confirmed: true }, result),
            ]
          ),
          ...(resultMessage ? [resultMessage] : []),
        ]);

        setResultRows(resultRowsForChat);
        setResultMetadata(null); // Reset metadata for direct SQL queries
      }

      setPendingQuery(null);
    } catch (error) {
      const errorMessage = getGeminiErrorMessage(error, "Failed to execute query");
      setError(errorMessage);
      setMessages((prev) => [...prev, createErrorMessage(errorMessage)]);
      setPendingQuery(null);
    } finally {
      setPendingQueryLoading(false);
    }
  }, [pendingQuery, pendingQueryLoading, callTool]);

  // Cancel pending query
  const cancelQuery = useCallback(() => {
    setPendingQuery(null);
    setMessages((prev) => [
      ...prev,
      createTextMessage("assistant", "Query cancelled."),
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

  // Memoize token estimation to avoid recalculation on every render
  const estimatedTokens = useMemo(
    () => estimateConversationTokens(messages),
    [messages]
  );

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
    canChat: config.isValid && config.geminiApiKey && queryDashboard.connectionInfo?.serverUrl && queryDashboard.jwtToken && !loading && !pendingQuery && !pendingQueryLoading,
    hasPendingAction: !!pendingQuery,

    // Chat statistics
    messageCount: messages.length,
    estimatedTokens,
    isCompacted: messages.length > COMPACTION_TRIGGER_THRESHOLD,
  };
};

export default useGeminiChat;

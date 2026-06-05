import React, { useEffect, useMemo, useRef, useState } from "react";
import { AiOutlineSend, AiOutlineClear, AiOutlineReload, AiOutlineSetting } from "react-icons/ai";
import { useAIConfig } from "./hooks/useAIConfig";
import { useGeminiChat } from "./hooks/useGeminiChat";
import MessageRenderer from "./util/MessageRenderer";
import BulkNamedQueryResults from "./util/BulkNamedQueryResults";
import ResultVisualization from "./util/ResultVisualization";
import SQLPreviewModal from "./util/SQLPreviewModal";
import SuggestedPrompts from "./util/SuggestedPrompts";
import AIConfigPanel from "./page/AIConfigPanel";
import AIErrorBoundary from "./page/AIErrorBoundary";
import ConfigErrorBoundary from "./page/ConfigErrorBoundary";

const AIChat = ({ showPopup } = {}) => {
  const aiConfig = useAIConfig();
  const geminiChat = useGeminiChat({ showPopup });

  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  // Display type for the bottom results panel (current result)
  // Message history ResultVisualization instances manage their own display type independently
  const [resultDisplayType, setResultDisplayType] = useState("table");

  const resultRows = useMemo(
    () => (Array.isArray(geminiChat.resultRows) ? geminiChat.resultRows : []),
    [geminiChat.resultRows]
  );

  const bulkResultsData = geminiChat.resultMetadata?.bulkResultsData || null;

  const latestToolSummary = useMemo(() => {
    // Iterate backwards from the end to find the latest assistant message with tool calls
    // This avoids O(n) array spread and reverse operations
    for (let i = geminiChat.messages.length - 1; i >= 0; i--) {
      const message = geminiChat.messages[i];
      if (message.role === "assistant" && message.toolCalls?.length) {
        return message.toolCalls;
      }
    }
    return [];
  }, [geminiChat.messages]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [geminiChat.messages, geminiChat.loading]);

  useEffect(() => {
    // Reset display type when results change (start with metadata preference)
    if (bulkResultsData || resultRows.length > 0) {
      const preferredDisplay = geminiChat.resultMetadata?.preferredDisplay || "table";
      setResultDisplayType(preferredDisplay);
    } else {
      setResultDisplayType("table");
    }
  }, [bulkResultsData, resultRows.length, geminiChat.resultMetadata?.preferredDisplay]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || geminiChat.loading) return;
    setInput("");
    await geminiChat.sendMessage(trimmed);
  };

  const handleConfirmQuery = async () => {
    await geminiChat.confirmQuery();
    setTimeout(() => document.querySelector("textarea")?.focus(), 0);
  };

  const handleCancelQuery = () => {
    geminiChat.cancelQuery();
    setTimeout(() => document.querySelector("textarea")?.focus(), 0);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedPrompt = (prompt) => {
    setInput(prompt);
    setTimeout(() => {
      const textarea = document.querySelector("textarea");
      if (textarea) textarea.focus();
    }, 0);
  };

  const clearConversation = () => {
    geminiChat.clearConversation();
  };

  return (
    <AIErrorBoundary onReset={() => geminiChat.clearConversation()}>
      <div className="mx-2 py-6 sm:mx-4 md:mx-10">
        <div className="flex flex-col gap-8">

          {/* ── Chat Section ─────────────────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">

            {/* Header */}
            <header className="flex items-center justify-between bg-slate-950 px-5 py-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold tracking-tight text-white">
                  AI Assistant
                </h2>
                <p className="text-xs text-slate-400">
                  {aiConfig.hasValidConfig
                    ? `${aiConfig.model} · Ready`
                    : "Configure your Gemini API key to get started"}
                </p>

                {geminiChat.messageCount > 10 && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>{geminiChat.messageCount} messages</span>
                    <span>·</span>
                    <span>~{geminiChat.estimatedTokens?.toLocaleString()} tokens</span>
                    {geminiChat.isCompacted && (
                      <>
                        <span>·</span>
                        <span className="text-slate-400">Compacted</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigPanel(!showConfigPanel)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
                  title={showConfigPanel ? "Close configuration" : "Open configuration"}
                >
                  <AiOutlineSetting className="text-sm" />
                  {showConfigPanel ? "Close" : "Config"}
                </button>

                <button
                  type="button"
                  onClick={clearConversation}
                  disabled={geminiChat.pendingQueryLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  title={geminiChat.pendingQueryLoading ? "Cannot clear while executing query" : "Clear conversation"}
                >
                  <AiOutlineClear className="text-sm" />
                  Clear
                </button>
              </div>
            </header>

            {/* Config panel */}
            {(aiConfig.needsConfig || showConfigPanel) && (
              <div className="border-b border-slate-200 bg-slate-50 p-4">
                <ConfigErrorBoundary>
                  <AIConfigPanel />
                </ConfigErrorBoundary>
              </div>
            )}

            {/* Error banner */}
            {geminiChat.error && (
              <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700">{geminiChat.error}</p>
                {!aiConfig.hasValidConfig && (
                  <button
                    type="button"
                    onClick={() => setShowConfigPanel(true)}
                    className="mt-1.5 text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-800"
                  >
                    Configure API Key →
                  </button>
                )}
              </div>
            )}

            {/* Chat body - Messages and Input */}
            <div className="flex h-[90vh] flex-col bg-slate-50">

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                className="flex-1 space-y-2 overflow-y-auto bg-neutral-100 p-4 md:p-5"
                role="log"
                aria-live="polite"
                aria-label="Chat messages"
              >
                {geminiChat.messages.length <= 1 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-full max-w-2xl px-4">
                      <SuggestedPrompts onPromptSelect={handleSuggestedPrompt} />
                    </div>
                  </div>
                )}

                {geminiChat.messages.map((message, index) => (
                  <MessageRenderer
                    key={message.id || `${message.role}-${index}`}
                    message={message}
                    showPopup={showPopup}
                  />
                ))}

                {geminiChat.loading && (
                  <div className="w-fit rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-400 shadow-sm">
                    Thinking…
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t-2 border-slate-300 bg-gradient-to-b from-slate-200 to-slate-300 px-5 py-4">
                <div className="flex items-end gap-3 rounded-xl border border-neutral-300 bg-white px-4 py-3 shadow-md transition-all">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      aiConfig.hasValidConfig
                        ? "Ask a database question…"
                        : "Configure your API key first…"
                    }
                    rows={2}
                    disabled={!aiConfig.hasValidConfig}
                    className="min-h-[48px] flex-1 resize-none py-2 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-500 placeholder:font-normal disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={geminiChat.loading || geminiChat.pendingQueryLoading || !input.trim() || !aiConfig.hasValidConfig}
                    className="mb-0.5 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                    title={geminiChat.pendingQueryLoading ? "Cannot send while executing query" : "Send message"}
                  >
                    {geminiChat.loading ? (
                      <AiOutlineReload className="text-sm animate-spin" />
                    ) : (
                      <AiOutlineSend className="text-sm" />
                    )}
                    Send
                  </button>
                </div>
                <p className="mt-2 px-1 text-xs text-slate-600 font-medium">
                  Enter to send · Shift+Enter for new line
                </p>
              </div>
            </div>
          </section>

          {/* ── Results Section ─────────────────────────────────── */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Query Results</h3>
              <p className="text-xs text-slate-500 mt-0.5">Results from confirmed queries</p>
            </div>

            <div className="rounded-xl p-4">
              {bulkResultsData ? (
                <BulkNamedQueryResults
                  bulkResultsData={bulkResultsData}
                  showPopup={showPopup}
                />
              ) : resultRows.length > 0 ? (
                <ResultVisualization
                  title="Results"
                  rows={resultRows}
                  metadata={geminiChat.resultMetadata}
                  displayType={resultDisplayType}
                  onDisplayTypeChange={setResultDisplayType}
                  showPopup={showPopup}
                  showDisplaySelector={true}
                  defaultRows={10}
                />
              ) : (
                <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-xs text-slate-400">
                  Results from confirmed queries will appear here.
                </div>
              )}
            </div>

            {/* Tool calls */}
            {latestToolSummary.length > 0 && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Tool calls
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {latestToolSummary.map((tool, index) => (
                    <span
                      key={`${tool.name}-${index}`}
                      className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                    >
                      {tool.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <SQLPreviewModal
            pendingQuery={geminiChat.pendingQuery}
            onConfirm={handleConfirmQuery}
            onCancel={handleCancelQuery}
            loading={geminiChat.pendingQueryLoading}
          />
        </div>
      </div>
    </AIErrorBoundary>
  );
};

export default AIChat;
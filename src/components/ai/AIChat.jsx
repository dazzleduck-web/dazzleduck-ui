import React, { useEffect, useMemo, useRef, useState } from "react";
import { AiOutlineSend, AiOutlineClear, AiOutlineReload, AiOutlineSetting } from "react-icons/ai";
import { FiGrid, FiTrendingUp, FiBarChart2, FiPieChart } from "react-icons/fi";
import { IoMdArrowDropdown } from "react-icons/io";
import { useAIConfig } from "./hooks/useAIConfig";
import { useGeminiChat } from "./hooks/useGeminiChat";
import DataTable from "../dashboardcomponents/DataTable";
import DisplayCharts from "../DisplayCharts";
import ChatMessage from "./util/ChatMessage";
import SQLPreviewModal from "./util/SQLPreviewModal";
import AIConfigPanel from "./page/AIConfigPanel";
import AIErrorBoundary from "./page/AIErrorBoundary";
import ConfigErrorBoundary from "./page/ConfigErrorBoundary";
import { useVisualizationFallback } from "../utils/useVisualizationFallback";

// Display options for AI results
const DISPLAY_OPTIONS = [
  { value: "table", label: "Table View", icon: <FiGrid size={16} /> },
  { value: "line", label: "Line Chart", icon: <FiTrendingUp size={16} /> },
  { value: "bar", label: "Bar Chart", icon: <FiBarChart2 size={16} /> },
  { value: "pie", label: "Pie Chart", icon: <FiPieChart size={16} /> },
];

// Display type selector component
const DisplayTypeSelect = ({ value, onChange }) => {
  const selectedOption =
    DISPLAY_OPTIONS.find(opt => opt.value === value) || DISPLAY_OPTIONS[0];

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-300">Display:</span>

      <div className="relative">
        {/* Left icon */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
          {selectedOption.icon}
        </div>

        {/* Native select */}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none  bg-gray-800  hover:bg-gray-700  text-white text-xs border  border-gray-500 rounded pl-8 pr-7 py-1 cursor-pointer focus:outline-none focus:ring-2  focus:ring-blue-500 transition-colors
                    "
        >
          {DISPLAY_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="bg-gray-800 text-white"
            >
              {opt.label}
            </option>
          ))}
        </select>

        {/* Custom arrow */}
        <div className="absolute right-2 top-3.5 -translate-y-1/2 text-md text-gray-300 pointer-events-none">
          <IoMdArrowDropdown />
        </div>
      </div>
    </div>
  );
};

const AIChat = ({ showPopup } = {}) => {
  const aiConfig = useAIConfig();
  const geminiChat = useGeminiChat({ showPopup });

  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [resultDisplayType, setResultDisplayType] = useState("table");

  const resultRows = useMemo(
    () => (Array.isArray(geminiChat.resultRows) ? geminiChat.resultRows : []),
    [geminiChat.resultRows]
  );

  const latestToolSummary = useMemo(() => {
    const lastAssistant = [...geminiChat.messages].reverse().find((message) => message.role === "assistant" && message.toolCalls?.length);
    return lastAssistant?.toolCalls || [];
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

  // Reset display type when new results arrive, respecting named query preferred_display
  useEffect(() => {
    if (resultRows.length > 0) {
      // Use preferred_display from named query if available, otherwise default to table
      const preferredDisplay = geminiChat.resultMetadata?.preferredDisplay || "table";
      setResultDisplayType(preferredDisplay);
    } else {
      // Reset to table when no results
      setResultDisplayType("table");
    }
  }, [geminiChat.resultMetadata, resultRows]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || geminiChat.loading) return;

    setInput("");

    await geminiChat.sendMessage(trimmed);
  };

  const handleConfirmQuery = async () => {
    await geminiChat.confirmQuery();
  };

  const handleCancelQuery = () => {
    geminiChat.cancelQuery();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const clearConversation = () => {
    geminiChat.clearConversation();
  };

  return (
    <AIErrorBoundary onReset={() => {
      // Reset AI chat state on error
      geminiChat.clearConversation();
    }}>
      <div className="mx-2 sm:mx-4 md:mx-10">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">AI Assistant</h2>
            <p className="text-sm text-slate-300">
              {aiConfig.hasValidConfig
                ? `Powered by ${aiConfig.model} - Ready to help`
                : "Configure your Gemini API key to get started"
              }
            </p>
            {geminiChat.messageCount > 10 && (
              <p className="text-xs text-slate-400 mt-1">
                {geminiChat.messageCount} messages • ~{geminiChat.estimatedTokens?.toLocaleString()} tokens
                {geminiChat.isCompacted && " • History compacted"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              title={showConfigPanel ? "Close configuration" : "Open configuration"}
            >
              <AiOutlineSetting />
              {showConfigPanel ? "Close" : "Config"}
            </button>
            <button
              type="button"
              onClick={clearConversation}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <AiOutlineClear />
              Clear
            </button>
          </div>
        </div>

        {/* Show configuration panel when manually opened or when config is needed */}
        {aiConfig.needsConfig || showConfigPanel ? (
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <ConfigErrorBoundary>
              <AIConfigPanel minimal={true} />
            </ConfigErrorBoundary>
          </div>
        ) : null}

        {/* Show error message if present */}
        {geminiChat.error && (
          <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{geminiChat.error}</p>
            {!aiConfig.hasValidConfig && (
              <button
                type="button"
                onClick={() => setShowConfigPanel(true)}
                className="mt-2 text-sm font-medium text-red-700 hover:text-red-900"
              >
                Configure API Key
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-col h-[70vh] border-b border-slate-200">
            <div ref={messagesContainerRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
              {geminiChat.messages.map((message, index) => (
                <ChatMessage key={`${message.role}-${index}`} message={message} />
              ))}

              {geminiChat.loading && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                  Thinking...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-200 bg-white p-4">
              <div className="flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    aiConfig.hasValidConfig
                      ? "Ask a database question..."
                      : "Configure your API key first..."
                  }
                  rows={2}
                  disabled={!aiConfig.hasValidConfig}
                  className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={geminiChat.loading || !input.trim() || !aiConfig.hasValidConfig}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {geminiChat.loading ? <AiOutlineReload className="animate-spin" /> : <AiOutlineSend />}
                  Send
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Enter to send, Shift+Enter for a newline.
              </p>
            </div>
          </div>

          <div className="flex-1 bg-slate-100 p-4 overflow-y-auto">
              {resultRows.length > 0 ? (
                resultDisplayType === "table" ? (
                  <DataTable
                    title="AI Results"
                    data={resultRows}
                    defaultRows={10}
                    headerActions={
                      <DisplayTypeSelect
                        value={resultDisplayType}
                        onChange={setResultDisplayType}
                      />
                    }
                  />
                ) : (
                  <DisplayResultWithFallback
                    resultRows={resultRows}
                    resultDisplayType={resultDisplayType}
                    onDisplayTypeChange={setResultDisplayType}
                    title="AI Results"
                    showPopup={showPopup}
                  />
                )
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  Results from confirmed queries will appear here.
                </div>
            )}

            {latestToolSummary.length > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Latest Tool Calls</h3>
                <div className="flex flex-wrap gap-2">
                  {latestToolSummary.map((tool, index) => (
                    <span
                      key={`${tool.name}-${index}`}
                      className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {tool.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

        <SQLPreviewModal
          pendingQuery={geminiChat.pendingQuery}
          onConfirm={handleConfirmQuery}
          onCancel={handleCancelQuery}
          loading={geminiChat.pendingQueryLoading}
        />
      </div>
    </AIErrorBoundary>
  );
};

// Helper component to handle chart fallback to table
const DisplayResultWithFallback = ({ resultRows, resultDisplayType, onDisplayTypeChange, title, showPopup }) => {
  const { fallbackToTable, handleDisplayChange } = useVisualizationFallback({
    displayType: resultDisplayType,
    data: resultRows,
    onDisplayChange: onDisplayTypeChange,
    showPopup,
    invalidDataReason: "Invalid data structure",
  });

  // If we're falling back to table, show table with message
  if (fallbackToTable || resultDisplayType === "table") {
    return (
      <DataTable
        title={title}
        data={resultRows}
        defaultRows={10}
        headerActions={
          <DisplayTypeSelect
            value={resultDisplayType}
            onChange={handleDisplayChange}
          />
        }
      />
    );
  }

  // Try to render chart
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden">
      <div className="bg-gray-700 px-4 py-3 flex justify-between items-center">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <DisplayTypeSelect
          value={resultDisplayType}
          onChange={handleDisplayChange}
        />
      </div>
      <div className="p-4">
        <DisplayCharts
          data={resultRows || []}
          view={resultDisplayType}
          width={1200}
          height={500}
        />
      </div>
    </div>
  );
};

export default AIChat;

import React from "react";
import ChatMessage from "./ChatMessage";
import ResultVisualization from "./ResultVisualization";
import BulkNamedQueryResults from "./BulkNamedQueryResults";
import { MESSAGE_KIND } from "./chatMessageUtils";

/**
 * Central message renderer for the AI assistant conversation.
 * Keeps message-type branching in one place so new message kinds stay isolated.
 *
 * Note: Message history ResultVisualization instances manage their own display type state.
 * This is intentional - users may want to view historical results differently than the current result.
 * The bottom panel (current results) is controlled by AIChat's resultDisplayType state.
 */
const MessageRenderer = ({ message, showPopup }) => {
  const result = message?.result || {};
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const bulkResultsData = result.bulkResultsData || null;

  switch (message?.kind) {
    case MESSAGE_KIND.queryResult: {
      if (bulkResultsData) {
        return (
          <div className="flex justify-center items-center">
            <div className="w-full max-w-[92%] px-4 py-3">
              <BulkNamedQueryResults
                bulkResultsData={bulkResultsData}
                showPopup={showPopup}
                summaryText={message.content}
              />
            </div>
          </div>
        );
      }

      if (rows.length === 0) {
        return null;
      }

      return (
        <div className="flex justify-center items-center">
          <div className="w-full max-w-[92%] px-4 py-3">
            {message.content ? (
              <div className="mb-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {message.content}
              </div>
            ) : null}

            <ResultVisualization
              title={result.title || "AI Results"}
              rows={rows}
              metadata={result.metadata || {}}
              showPopup={showPopup}
              showDisplaySelector={true}
              defaultRows={5}
            />
          </div>
        </div>
      );
    }
    case MESSAGE_KIND.error:
      return <ChatMessage message={message} variant="error" />;
    case MESSAGE_KIND.confirmation:
      return <ChatMessage message={message} variant="confirmation" />;
    case MESSAGE_KIND.text:
    default:
      return <ChatMessage message={message} />;
  }
};

export default MessageRenderer;

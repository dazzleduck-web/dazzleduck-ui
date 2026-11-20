import React from "react";
import { HiOutlineSparkles } from "react-icons/hi";
import { aiDetails } from "./aiDetails";

/**
 * Shown above a result produced from a question: badge, model/time/tries,
 * the AI's one-line explanation and the "View generated SQL" toggle.
 */
const AiRunSummary = ({ ai, showSql, onToggleSql, className = "" }) => {
    if (!ai?.generatedSql) return null;
    const details = aiDetails(ai);

    return (
        <div className={`flex flex-col gap-1 ${className}`} data-testid="ai-run-summary">
            <div className="flex flex-wrap items-center gap-2">
                <span
                    className="flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full bg-amber-100 text-amber-900"
                    title={details || undefined}
                >
                    <HiOutlineSparkles /> {ai.failed ? "AI-generated SQL failed" : "AI-generated from your question"}
                </span>
                {details && <span className="text-xs text-gray-500">{details}</span>}
                <button
                    onClick={onToggleSql}
                    className="text-sm px-3 py-1 rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50 cursor-pointer"
                >
                    {showSql ? "Hide generated SQL" : "View generated SQL"}
                </button>
            </div>
            {ai.explanation && !ai.failed && (
                <p className="text-sm text-gray-600" data-testid="ai-explanation">{ai.explanation}</p>
            )}
        </div>
    );
};

export default AiRunSummary;

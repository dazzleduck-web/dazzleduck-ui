import React, { useState } from "react";
import { HiOutlineClipboardCopy, HiOutlineCheck, HiOutlinePencilAlt, HiOutlineX } from "react-icons/hi";
import { aiDetails } from "./aiDetails";

/**
 * Read-only view of the SQL the AI generated for a question.
 * "Use as SQL" puts the SQL into the query box so the user can edit it.
 */
const GeneratedSqlPanel = ({ ai, onUseAsSql, onClose }) => {
    const [copied, setCopied] = useState(false);
    if (!ai?.generatedSql) return null;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(ai.generatedSql);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard not available */
        }
    };

    const details = aiDetails(ai);

    return (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50" data-testid="generated-sql-panel">
            <div className="flex items-center justify-between px-4 py-2 border-b border-amber-200">
                <div className="text-sm text-amber-900">
                    <span className="font-semibold">Generated SQL</span>
                    {details && <span className="ml-2 text-amber-700">({details})</span>}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copy}
                        className="flex items-center gap-1 text-sm px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100 cursor-pointer"
                    >
                        {copied ? <HiOutlineCheck /> : <HiOutlineClipboardCopy />} {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                        onClick={() => onUseAsSql(ai.generatedSql)}
                        className="flex items-center gap-1 text-sm px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100 cursor-pointer"
                        title="Put this SQL into the query box so you can edit it"
                    >
                        <HiOutlinePencilAlt /> Use as SQL
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-amber-100 cursor-pointer"
                        aria-label="Close generated SQL"
                    >
                        <HiOutlineX />
                    </button>
                </div>
            </div>
            <pre className="m-3 p-3 rounded bg-slate-900 text-slate-100 text-sm whitespace-pre-wrap break-words">
                {ai.generatedSql}
            </pre>
        </div>
    );
};

export default GeneratedSqlPanel;

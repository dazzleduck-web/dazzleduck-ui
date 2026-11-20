import React, { useState } from "react";
import { HiOutlineChevronDoubleUp, HiOutlineChevronDoubleDown, HiOutlineX, HiOutlineSparkles } from "react-icons/hi";
import QueryResults from "./QueryResults";
import VariableManager from "./VariableManager";
import GeneratedSqlPanel from "../ai/GeneratedSqlPanel";
import AiRunSummary from "../ai/AiRunSummary";

const QueryRow = ({
    row,
    result,
    queryId,
    isConnected,
    isCancelling,
    aiEnabled = false,
    aiHint = false,
    totalRows,
    updateRow,
    removeRow,
    handleRunQuery,
    handleCancelQuery,
    clearRowResults
}) => {
    const {
        data = [], loading = false, error = null, phase = null,
        message = null, ai = null, canTreatAsQuestion = false,
    } = result || {};
    const variables = row.variables || {};

    // State for editable Results title
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState(row.resultTitle || "Results");
    const [showGeneratedSql, setShowGeneratedSql] = useState(false);

    const runLabel = loading ? (phase === "generating" ? "Generating SQL..." : "Running...") : "Run";

    const applyGeneratedSql = (sql) => {
        updateRow(row.id, "query", sql);
        setShowGeneratedSql(false);
    };

    // Available view options
    const views = ["table", "line", "bar", "pie"];
    // Handle updating variables for this row
    const handleUpdateVariables = (updatedVariables) => {
        updateRow(row.id, "variables", updatedVariables);
    };

    // Handle Results title editing
    const handleTitleDoubleClick = () => {
        setIsEditingTitle(true);
        setTitleValue(row.resultTitle || "Results");
    };

    const handleTitleSave = () => {
        if (titleValue.trim() && titleValue.trim() !== "Results") {
            updateRow(row.id, "resultTitle", titleValue.trim());
        } else {
            updateRow(row.id, "resultTitle", "");
        }
        setIsEditingTitle(false);
    };

    const handleTitleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleTitleSave();
        }
    };

    return (
        <div className="relative max-w-[85dvw] mx-auto bg-white rounded-2xl shadow-2xl p-8 border border-gray-300 flex flex-col overflow-hidden">
            {/* Collapse toggle */}
            <div className="absolute top-0 left-0 w-full h-2.5 bg-gray-800 z-10">
                <div
                    className={`absolute -bottom-3.5 ${row.showPanel ? "-bottom-4.5" : ""
                        } left-1/2 -translate-x-1/2 w-50 h-13 bg-gray-800 cursor-pointer rounded-b-full z-10 transition-all duration-300`}
                    onClick={() => updateRow(row.id, "showPanel", !row.showPanel)}
                >
                    <button
                        onClick={() => updateRow(row.id, "showPanel", !row.showPanel)}
                        className="absolute top-7 left-1/2 -translate-x-1/2 z-20 rounded-full text-white h-6 cursor-pointer"
                    >
                        {row.showPanel ? (
                            <HiOutlineChevronDoubleUp className="text-lg" />
                        ) : (
                            <HiOutlineChevronDoubleDown className="text-lg" />
                        )}
                    </button>
                </div>
            </div>

            {/* Remove button */}
            <button
                onClick={() => removeRow(row.id)}
                disabled={totalRows === 1}
                className="absolute -right-5 hover:right-0 top-4 w-12 border p-1 rounded-full rounded-r-lg text-sm font-medium hover:bg-red-500 hover:text-white transition-all duration-300 disabled:opacity-50 cursor-pointer"
            >
                <HiOutlineX className="text-xl" />
            </button>

            {/* Query Editor */}
            <div
                className={`overflow-hidden mt-5 shadow-lg rounded-xl transition-all duration-500 ease-in-out ${row.showPanel
                    ? "max-h-150 opacity-100"
                    : "max-h-0 opacity-0"
                    }`}
            >
                <div className="flex flex-col flex-1 bg-gray-50 rounded-xl border border-gray-300 p-6">
                    <div className="flex justify-between items-start mb-2">
                        <h2 className="text-2xl w-full font-semibold text-gray-800">
                            SQL Query #{row.id.split("-")[0]}
                            {queryId && (
                                <span className="text-sm text-gray-500 ml-2">
                                    (Query ID: {queryId})
                                </span>
                            )}
                        </h2>
                        {/* Variable Manager - top right */}
                        <VariableManager
                            query={row.query}
                            variables={variables}
                            onUpdateVariables={handleUpdateVariables}
                        />
                    </div>
                    <textarea
                        value={row.query}
                        onChange={(e) => updateRow(row.id, "query", e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && e.shiftKey && isConnected) {
                                e.preventDefault();
                                handleRunQuery(row);
                            }
                        }}
                        placeholder={aiEnabled
                            ? "SQL or a question, e.g. SELECT * FROM read_arrow('/your/file.arrow')  or  count rows per type"
                            : "e.g. SELECT * FROM read_arrow('/your/file.arrow');"}
                        rows={5}
                        className="w-full border border-gray-400 rounded-lg p-3 text-sm h-35 scrollbar-custom"
                    />
                    <div className="flex justify-end items-center gap-3 mt-3">
                        {aiHint && (
                            <p className="mr-auto text-xs text-gray-500" data-testid="ai-hint">
                                Add an AI key in Connection Settings to ask in plain English.
                            </p>
                        )}
                        <button
                            onClick={() => handleRunQuery(row)}
                            disabled={loading || !isConnected}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition disabled:opacity-50 cursor-pointer"
                        >
                            {runLabel}
                        </button>
                        <button
                            onClick={() => handleCancelQuery(row)}
                            disabled={!isConnected || isCancelling || !loading || (phase !== "generating" && !queryId)}
                            className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition disabled:opacity-50 cursor-pointer"
                        >
                            {isCancelling ? "Canceling..." : "Cancel"}
                        </button>
                        <button
                            onClick={() => clearRowResults(row.id)}
                            disabled={loading || data.length === 0}
                            className="bg-gray-400 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-md transition disabled:opacity-50 cursor-pointer"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            {/* Results */}
            <div
                className={`flex flex-col flex-1 transition-all duration-500 ease-in-out ${row.showPanel ? "mt-6" : "mt-0"
                    }`}
            >
                <div className="flex justify-between items-center mb-2">
                    {isEditingTitle ? (
                        <input
                            type="text"
                            value={titleValue}
                            onChange={(e) => setTitleValue(e.target.value)}
                            onKeyDown={handleTitleKeyDown}
                            onBlur={handleTitleSave}
                            className="text-2xl font-semibold text-gray-800 border border-neutral-300 bg-neutral-100 rounded px-2 py-1 focus:outline-none"
                            autoFocus
                        />
                    ) : (
                        <h2 className="text-2xl font-semibold text-gray-800 hover:bg-neutral-50 border border-transparent rounded px-2 py-1 cursor-text transition select-none"
                            onDoubleClick={handleTitleDoubleClick}
                            title="Double-click to edit"
                        >
                            {row.resultTitle || "Results"}
                        </h2>
                    )}

                    {/* AI badge + generated SQL toggle */}
                    {!loading && (
                        <AiRunSummary
                            ai={ai}
                            showSql={showGeneratedSql}
                            onToggleSql={() => setShowGeneratedSql((v) => !v)}
                            className="mr-auto ml-4"
                        />
                    )}

                    {/* View selection radio buttons */}
                    <div className="flex items-center gap-5">
                        {views.map((v) => (
                            <label
                                key={v}
                                className="flex items-center text-sm cursor-pointer"
                            >
                                <input
                                    type="radio"
                                    name={`view-${row.id}`}
                                    value={v}
                                    checked={row.view === v}
                                    onChange={() => updateRow(row.id, "view", v)}
                                    className="mr-1 cursor-pointer"
                                />
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                            </label>
                        ))}
                    </div>
                </div>

                {showGeneratedSql && !loading && (
                    <GeneratedSqlPanel
                        ai={ai}
                        onUseAsSql={applyGeneratedSql}
                        onClose={() => setShowGeneratedSql(false)}
                    />
                )}

                <QueryResults
                    data={data}
                    loading={loading}
                    loadingText={phase === "generating" ? "Generating SQL from your question..." : undefined}
                    error={error}
                    message={message}
                    view={row.view}
                    isConnected={isConnected}
                />

                {canTreatAsQuestion && !loading && (
                    <div className="mt-2 flex justify-end">
                        <button
                            onClick={() => handleRunQuery(row, { forceQuestion: true })}
                            className="flex items-center gap-1 text-sm px-3 py-1 rounded-md border border-amber-500 text-amber-800 hover:bg-amber-50 cursor-pointer"
                        >
                            <HiOutlineSparkles /> Treat as a question instead
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QueryRow;
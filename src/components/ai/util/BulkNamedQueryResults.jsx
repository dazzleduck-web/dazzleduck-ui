import React, { useEffect, useMemo, useState } from "react";
import { MAX_ROWS_PER_QUERY } from "../tools/toolRegistry";
import ResultVisualization from "./ResultVisualization";

const BulkNamedQueryResults = ({ bulkResultsData, showPopup, summaryText = "" }) => {
  const [displayOverrides, setDisplayOverrides] = useState({});

  const summary = useMemo(() => {
    if (!bulkResultsData) return null;

    return {
      total: Number.isFinite(bulkResultsData.total)
        ? bulkResultsData.total
        : Array.isArray(bulkResultsData.results)
          ? bulkResultsData.results.length
          : 0,
      results: Array.isArray(bulkResultsData.results) ? bulkResultsData.results : [],
      errors: Array.isArray(bulkResultsData.errors) ? bulkResultsData.errors : [],
      queryGroup: bulkResultsData.queryGroup || null,
    };
  }, [bulkResultsData]);

  useEffect(() => {
    setDisplayOverrides({});
  }, [bulkResultsData]);

  const handleDisplayChange = (queryName, type) => {
    setDisplayOverrides((prev) => ({ ...prev, [queryName]: type }));
  };

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Summary text from AI */}
      {summaryText ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
          {summaryText}
        </p>
      ) : null}

      {/* Summary header — matches the chart header bar style */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Named Query Results</h3>
            <p className="text-xs text-slate-400">
              {summary.total} {summary.total === 1 ? "query" : "queries"} executed
              {summary.queryGroup ? ` · group: ${summary.queryGroup}` : ""}
            </p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
            {summary.total} results
          </span>
        </div>
      </div>

      {/* Individual query results — using ResultVisualization for identical rendering */}
      {summary.results.map((result, index) => (
        <div key={result.queryName || index} className="space-y-1.5">
          {result.truncated ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Showing first {MAX_ROWS_PER_QUERY.toLocaleString("en-US")} of{" "}
              {Number.isFinite(result.totalRowCount)
                ? result.totalRowCount.toLocaleString("en-US")
                : "0"}{" "}
              total rows
            </div>
          ) : null}

          <ResultVisualization
            title={result.queryName || "Named Query"}
            rows={result.data || []}
            metadata={{ preferredDisplay: result.preferredDisplay || "table" }}
            displayType={displayOverrides[result.queryName]}
            onDisplayTypeChange={(type) => handleDisplayChange(result.queryName, type)}
            showPopup={showPopup}
            showDisplaySelector={true}
            defaultRows={5}
          />
        </div>
      ))}

      {/* Failed queries */}
      {summary.errors.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-red-200 bg-white">
          <div className="border-b border-red-200 bg-red-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-red-700">Failed Queries</h3>
            <p className="text-xs text-red-500">
              {summary.errors.length} {summary.errors.length === 1 ? "query" : "queries"} could not be executed
            </p>
          </div>
          <div className="space-y-2 p-3">
            {summary.errors.map((error, index) => (
              <div
                key={`${error.queryName}-${index}`}
                className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5"
              >
                <p className="text-xs font-medium text-red-900">{error.queryName}</p>
                <p className="mt-1 break-all font-mono text-xs text-red-600">{error.error}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkNamedQueryResults;
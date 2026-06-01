import React from "react";
import { AiOutlineCheck, AiOutlineClose } from "react-icons/ai";

const SQLPreviewModal = ({ pendingQuery, onConfirm, onCancel, loading = false }) => {
  if (!pendingQuery) return null;

  const isNamedQuery = pendingQuery.tool === "executeNamedQuery";
  const title = isNamedQuery ? "Named Query Preview" : "SQL Preview";
  const subtitle = isNamedQuery
    ? "Review the named query before it runs."
    : "Review the generated query before it runs.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="border-b border-slate-200 bg-slate-900 px-6 py-4 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
        </div>

        <div className="space-y-4 p-6 overflow-y-auto flex-1">
          {isNamedQuery && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 max-h-[200px] overflow-y-auto">
              <div className="font-medium text-slate-900">Named query</div>
              <div className="mt-1 font-mono text-xs text-slate-600">
                {pendingQuery.queryName}
              </div>
              {pendingQuery.namedQuery?.description && (
                <div className="mt-2 text-sm text-slate-700">
                  {pendingQuery.namedQuery.description}
                </div>
              )}
              {pendingQuery.parameters && Object.keys(pendingQuery.parameters).length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 font-medium text-slate-900">Parameters</div>
                  <div className="max-h-[150px] overflow-y-auto">
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-slate-700">
                      {JSON.stringify(pendingQuery.parameters, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {pendingQuery.explanation && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {pendingQuery.explanation}
            </div>
          )}

          {pendingQuery.query && (
            <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 max-h-[300px] overflow-y-auto">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-6 text-emerald-300">
                {pendingQuery.query}
              </pre>
            </div>
          )}

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {isNamedQuery
              ? "This named query will only run after you confirm it."
              : "This query is read-only. It will only run after you confirm it."}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 flex-shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            disabled={loading}
          >
            <AiOutlineClose />
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            <AiOutlineCheck />
            {loading ? "Executing..." : "Execute"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SQLPreviewModal;

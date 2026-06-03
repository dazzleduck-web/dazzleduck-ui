import React, { useRef, useEffect } from "react";
import { AiOutlineCheck, AiOutlineClose } from "react-icons/ai";

const SQLPreviewModal = ({ pendingQuery, onConfirm, onCancel, loading = false }) => {
  const modalRef = useRef(null);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!pendingQuery) return;

    const handleEscapeKey = (event) => {
      if (event.key === "Escape" && !loading) {
        onCancel();
      }
    };

    // Focus trap: keep focus within modal
    const handleFocusTrap = (event) => {
      if (!modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // If focus is moving out of modal, loop it back
      if (event.shiftKey) {
        // Shift+Tab
        if (document.activeElement === firstElement) {
          lastElement.focus();
          event.preventDefault();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          firstElement.focus();
          event.preventDefault();
        }
      }
    };

    const handleKeyDown = (event) => {
      handleEscapeKey(event);
      if (event.key === "Tab") {
        handleFocusTrap(event);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Focus the confirm button when modal opens
    const confirmButton = modalRef.current?.querySelector("button:last-of-type");
    if (confirmButton) {
      confirmButton.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingQuery, onCancel, loading]);

  if (!pendingQuery) return null;

  const isNamedQuery = pendingQuery.tool === "executeNamedQuery";
  const isBulkNamedQuery = pendingQuery.tool === "executeAllNamedQueries";
  const title = isBulkNamedQuery
    ? "Named Queries Preview"
    : (isNamedQuery ? "Named Query Preview" : "SQL Preview");
  const subtitle = isNamedQuery
    ? "Review the named query before it runs."
    : (isBulkNamedQuery
      ? "Review the bulk named-query execution before it runs."
      : "Review the generated query before it runs.");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      onClick={!loading ? onCancel : undefined}
      onKeyDown={(e) => e.key === "Escape" && !loading && onCancel()}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sql-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-6 py-5">
          <h3 id="sql-preview-title" className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-6">
          {(isNamedQuery || isBulkNamedQuery) && (
            <div className="max-h-[220px] overflow-y-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              <div className="font-medium text-slate-900">
                {isBulkNamedQuery ? "Named queries" : "Named query"}
              </div>
              {!isBulkNamedQuery && (
                <>
                  <div className="mt-1 font-mono text-xs text-slate-600">
                    {pendingQuery.queryName}
                  </div>
                  {pendingQuery.namedQuery?.description && (
                    <div className="mt-2 text-sm text-slate-700">
                      {pendingQuery.namedQuery.description}
                    </div>
                  )}
                </>
              )}
              {isBulkNamedQuery && pendingQuery.queryGroup && (
                <div className="mt-1 font-mono text-xs text-slate-600">
                  Group: {pendingQuery.queryGroup}
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
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {pendingQuery.explanation}
            </div>
          )}

          {pendingQuery.query && (
            <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 shadow-inner">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-6 text-emerald-300">
                {pendingQuery.query}
              </pre>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            {isBulkNamedQuery
              ? "These named queries will only run after you confirm it."
              : isNamedQuery
              ? "This named query will only run after you confirm it."
              : "This query is read-only. It will only run after you confirm it."}
          </div>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            disabled={loading}
          >
            <AiOutlineClose />
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
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

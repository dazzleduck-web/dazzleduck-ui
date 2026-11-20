import { useState, useRef } from "react";
import { v4 as uuid } from "uuid";
import { DISABLED_AI } from "../context/aiContextCore";
import { isAbortError } from "../ai/errors";
import { fitDisplay } from "../ai/displayFit";

const DEFAULT_VIEW = "table";
const MAX_AI_HISTORY = 3;

// What the result panel shows about an AI run (badge, explanation, model · time · tries)
const aiInfoOf = (resolved) => ({
    generatedSql: resolved.generatedSql,
    explanation: resolved.explanation,
    model: resolved.meta?.model,
    ms: resolved.meta?.ms,
    attempts: resolved.meta?.attempts,
    reused: Boolean(resolved.meta?.reused),
});

// Follow-up memory after an AI run: the last run (for reuse) and the last few turns (for "now only…")
const nextAiMemory = (prev, question, resolved, display = resolved.display) => {
    if (resolved.meta?.reused) return prev;
    return {
        last: { question, sql: resolved.generatedSql, display, explanation: resolved.explanation, meta: resolved.meta },
        history: [...(prev.history || []), { question, sql: resolved.generatedSql }].slice(-MAX_AI_HISTORY),
    };
};

/**
 * One AI-assisted run, shared by query rows and Search:
 * resolve (typed SQL runs as is; a question becomes checked SQL) → execute →
 * if AI SQL fails, one repair attempt with the server's error → execute.
 * `signal` cancels the whole run (aborted while executing = the user cancelled the query).
 *
 * @returns {Promise<
 *   {status: "ok", result: object, resolved: object} |
 *   {status: "message", message: string} |
 *   {status: "cancelled", resolved?: object} |
 *   {status: "error", error: string, resolved?: object, generatedSql?: string}>}
 */
async function runAiAssisted({ ai, url, args, signal, execute }) {
    let resolved = { source: "user", sqlToRun: args.text };
    if (ai.enabled && ai.resolve) {
        try {
            resolved = await ai.resolve(url, { ...args, signal });
        } catch (err) {
            if (signal.aborted || isAbortError(err)) return { status: "cancelled" };
            return { status: "error", error: err?.message || "AI request failed", generatedSql: err?.generatedSql };
        }
        if (signal.aborted) return { status: "cancelled" };
        if (resolved.source === "message") return { status: "message", message: resolved.message };
    }

    try {
        return { status: "ok", result: await execute(resolved.sqlToRun), resolved };
    } catch (err) {
        const error = err?.message || "Query failed";
        if (resolved.source !== "ai") return { status: "error", error, resolved };
        if (signal.aborted) return { status: "cancelled", resolved }; // cancelled, not a SQL error: don't repair
        if (ai.repair) {
            try {
                const fixed = await ai.repair(url, { ...args, failedSql: resolved.sqlToRun, error, signal });
                if (signal.aborted) return { status: "cancelled", resolved };
                if (fixed.source === "ai") return { status: "ok", result: await execute(fixed.sqlToRun), resolved: fixed };
            } catch (repairErr) {
                if (signal.aborted || isAbortError(repairErr)) return { status: "cancelled", resolved };
                /* otherwise report the original error */
            }
        }
        return { status: "error", error, resolved };
    }
}

// Substitute variables in the query (also strips default values like {variable:default})
export const substituteVariables = (query, variables) => {
    let substitutedQuery = query;
    Object.entries(variables).forEach(([name, value]) => {
        // Skip empty variable names (to avoid replacing {})
        if (!name || name.trim() === "") {
            return;
        }
        // Replace {variable_name} or {variable_name:default} with the value
        // Escape special regex characters in variable name
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match {name} or {name:default} patterns that are NOT preceded by \
        const pattern = new RegExp(`(?<!\\\\)\\{${escapedName}(?::[^}]*)?\\}`, 'g');
        substitutedQuery = substitutedQuery.replace(pattern, value || '');
    });
    // Convert escaped braces back to literal braces (\{ -> {, \} -> })
    substitutedQuery = substitutedQuery.replace(/\\{/g, '{').replace(/\\}/g, '}');
    return substitutedQuery;
};

export const useQueryManagement = (executeQuery, cancelQuery, isConnected, connection, ai = DISABLED_AI) => {
    const [rows, setRows] = useState([
        { id: "1-" + uuid(), showPanel: true, query: "", view: DEFAULT_VIEW, variables: {}, resultTitle: "" },
    ]);
    const [results, setResults] = useState({});
    const [queryIds, setQueryIds] = useState({});
    const [cancellingQueries, setCancellingQueries] = useState({});
    const [isRunningAll, setIsRunningAll] = useState(false);
    const [searchData, setSearchData] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    // AI info for the last search ({generatedSql, explanation, ...}) and its follow-up memory
    const [searchAi, setSearchAi] = useState(null);
    const searchAiMemory = useRef({ last: null, history: [] });
    const searchController = useRef(null);

    const nextId = useRef(2);
    const queryIdCounter = useRef(1);
    // One AbortController per row run: aborting it cancels SQL generation, repair, or marks a
    // server-side cancel so it isn't treated as a SQL error
    const runControllers = useRef({});
    // SQL each row is executing on the server right now (for an AI row: the generated SQL, not the question)
    const runningSql = useRef({});
    // Latest rows, so a run can look at other rows' text (file sources for the AI schema)
    const rowsRef = useRef(rows);
    rowsRef.current = rows;

    const generateQueryId = () => {
        return queryIdCounter.current++;
    };

    const addRow = () => {
        const newId = nextId.current++ + "-" + uuid();
        setRows((prev) => [
            ...prev,
            { id: newId, showPanel: true, query: "", view: DEFAULT_VIEW, variables: {}, resultTitle: "" },
        ]);
    };

    const removeRow = (id) => {
        if (rows.length === 1) return;
        setRows((prev) => prev.filter((r) => r.id !== id));
        setResults((prev) => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
        });
        setQueryIds((prev) => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
        });
    };

    const updateRow = (id, key, value) => {
        setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, [key]: value } : r))
        );
    };

    // Remember the AI result on the row (in memory only): view, last run, follow-up history.
    // The AI chose the display before the query ran: keep it only if the result can be drawn that way.
    const rememberAiRun = (rowId, question, resolved, data) => {
        if (resolved.meta?.reused) return;
        const view = fitDisplay(resolved.display, data);
        setRows((prev) => prev.map((r) => {
            if (r.id !== rowId) return r;
            const memory = nextAiMemory({ history: r.aiHistory }, question, resolved, view);
            return { ...r, view, aiLast: memory.last, aiHistory: memory.history };
        }));
    };

    // Inputs the AI needs besides the question: other rows' text (file sources) and claims
    const aiContextArgs = (text, excludeRowId) => ({
        text,
        rowTexts: rowsRef.current
            .filter((r) => r.id !== excludeRowId && r.query?.trim())
            .map((r) => substituteVariables(r.query, r.variables || {})),
        claims: connection.claims,
    });

    const setPhase = (rowId, phase) =>
        setResults((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] || { data: [] }), loading: true, error: null, phase } }));

    const runQueryForRow = async (row, { forceQuestion = false } = {}) => {
        const { url, splitSize } = connection;

        if (!isConnected) {
            return { data: [], error: "Not connected — click Connect", queryId: null };
        }
        if (!row.query?.trim()) {
            return { data: [], error: "Empty query — skipped", queryId: null };
        }

        // Substitute variables in the query
        const queryWithVars = substituteVariables(row.query, row.variables || {});

        const controller = new AbortController();
        runControllers.current[row.id] = controller;
        const execute = async (sql) => {
            const queryId = generateQueryId();
            setQueryIds(prev => ({ ...prev, [row.id]: queryId }));
            setPhase(row.id, "running");
            runningSql.current[row.id] = sql;
            try {
                return await executeQuery(url, sql, splitSize, null, queryId);
            } finally {
                delete runningSql.current[row.id];
            }
        };

        let run;
        try {
            run = await runAiAssisted({
                ai, url, execute, signal: controller.signal,
                args: {
                    ...aiContextArgs(queryWithVars, row.id),
                    history: row.aiHistory || [],
                    reuse: row.aiLast,
                    forceQuestion,
                    onPhase: (phase) => setPhase(row.id, phase),
                },
            });
        } finally {
            if (runControllers.current[row.id] === controller) delete runControllers.current[row.id];
        }

        const isAi = run.resolved?.source === "ai";
        switch (run.status) {
            case "ok":
                if (!isAi) return { data: run.result.data, error: null, queryId: run.result.queryId, ai: null };
                rememberAiRun(row.id, queryWithVars, run.resolved, run.result.data);
                return { data: run.result.data, error: null, queryId: run.result.queryId, ai: aiInfoOf(run.resolved) };
            case "message":
                return { data: [], error: null, queryId: null, message: run.message };
            case "cancelled":
                return { data: [], error: "Cancelled.", queryId: null, ai: isAi ? aiInfoOf(run.resolved) : null };
            default:
                if (isAi) return { data: [], error: run.error, queryId: null, ai: { ...aiInfoOf(run.resolved), failed: true } };
                return {
                    data: [], error: run.error, queryId: null,
                    ai: run.generatedSql ? { generatedSql: run.generatedSql, failed: true } : null,
                    canTreatAsQuestion: Boolean(run.resolved?.unclear),
                };
        }
    };

    const toResultState = (result) => ({
        data: result.data,
        loading: false,
        error: result.error,
        message: result.message || null,
        ai: result.ai || null,
        canTreatAsQuestion: Boolean(result.canTreatAsQuestion),
    });

    const handleRunQuery = async (row, options) => {
        const id = row.id;
        setResults(prev => ({ ...prev, [id]: { data: [], loading: true, error: null, phase: "running" } }));

        const result = await runQueryForRow(row, options);

        setResults(prev => ({ ...prev, [id]: toResultState(result) }));
    };

    const handleCancelQuery = async (row) => {
        const id = row.id;

        // Not executing on the server (detecting, generating or repairing SQL): just abort the run
        const controller = runControllers.current[id];
        if (controller && !runningSql.current[id]) {
            controller.abort();
            return;
        }

        const queryId = queryIds[id];

        if (!queryId) {
            setResults(prev => ({
                ...prev,
                [id]: {
                    ...prev[id],
                    error: "No active query to cancel for this row"
                },
            }));
            return;
        }

        if (!isConnected) {
            setResults(prev => ({
                ...prev,
                [id]: { ...prev[id], error: "Not connected — cannot cancel" },
            }));
            return;
        }

        setCancellingQueries(prev => ({ ...prev, [id]: true }));

        try {
            const { url } = connection;
            const cleanUrl = url.trim();
            const runningQuery = runningSql.current[id] ?? row.query;
            controller?.abort(); // so the run treats the failed query as cancelled, not as a SQL error
            const result = await cancelQuery(cleanUrl, runningQuery, queryId);

            if (result.success) {
                setResults(prev => ({
                    ...prev,
                    [id]: {
                        data: prev[id]?.data || [],
                        loading: false,
                        error: `Query cancelled (status: ${result.status})`,
                    },
                }));
            } else {
                setResults(prev => ({
                    ...prev,
                    [id]: {
                        ...prev[id],
                        error: `Cancel failed with status: ${result.status}`,
                    },
                }));
            }

            setQueryIds(prev => {
                const updated = { ...prev };
                delete updated[id];
                return updated;
            });
        } catch (err) {
            setResults(prev => ({
                ...prev,
                [id]: {
                    ...prev[id],
                    error: `Cancel error: ${err?.message || "Unknown error"}`,
                },
            }));
        } finally {
            setCancellingQueries(prev => ({ ...prev, [id]: false }));
        }
    };

    const runAllQueries = async () => {
        if (!isConnected || isRunningAll) return;
        setIsRunningAll(true);
        const loadingState = {};

        rows.forEach(row => {
            loadingState[row.id] = { data: [], loading: true, error: null };
        });
        setResults(prev => ({ ...prev, ...loadingState }));

        const promises = rows.map(async (row) => {
            const id = row.id;
            try {
                const result = await runQueryForRow(row);
                setResults(prev => ({ ...prev, [id]: toResultState(result) }));
            } catch (err) {
                setResults(prev => ({
                    ...prev,
                    [id]: {
                        data: [],
                        loading: false,
                        error: err?.message || "Query failed"
                    }
                }));
            }
        });
        await Promise.all(promises);
        setIsRunningAll(false);
    };

    const runSearchQuery = async (query) => {
        setSearchError("");
        setSearchAi(null);
        if (!isConnected) {
            setSearchData([]);
            setSearchError("Not connected — Connect first to search");
            return;
        }
        if (!query?.trim()) {
            setSearchData([]);
            setSearchError("Enter a query to search");
            return;
        }

        // A new search replaces one that is still generating SQL
        searchController.current?.abort();
        const controller = new AbortController();
        searchController.current = controller;
        const { url } = connection;
        const memory = searchAiMemory.current;
        setSearchLoading(true);
        try {
            const run = await runAiAssisted({
                ai, url, signal: controller.signal,
                execute: (sql) => executeQuery(url, sql, 0, null, null),
                args: { ...aiContextArgs(query), history: memory.history, reuse: memory.last },
            });
            if (controller.signal.aborted || run.status === "cancelled") return; // a newer search took over

            const isAi = run.resolved?.source === "ai";
            if (run.status === "ok") {
                if (isAi) {
                    searchAiMemory.current = nextAiMemory(memory, query, run.resolved);
                    setSearchAi(aiInfoOf(run.resolved));
                }
                const rows = Array.isArray(run.result?.data) ? run.result.data : [];
                setSearchData(rows);
                if (rows.length === 0) setSearchError("No results found");
                return;
            }
            setSearchData([]);
            setSearchError(run.status === "message" ? run.message : run.error || "Search query failed");
            if (isAi) setSearchAi({ ...aiInfoOf(run.resolved), failed: true });
            else if (run.generatedSql) setSearchAi({ generatedSql: run.generatedSql, failed: true });
        } finally {
            if (searchController.current === controller) {
                searchController.current = null;
                setSearchLoading(false);
            }
        }
    };

    const clearRowResults = (id) => {
        setResults((prev) => ({
            ...prev,
            [id]: { data: [], loading: false, error: null },
        }));
    };

    const resetRows = () => {
        setRows([{ id: "1-" + uuid(), showPanel: true, query: "", view: DEFAULT_VIEW, variables: {}, resultTitle: "" }]);
        setResults({});
        setQueryIds({});
        nextId.current = 2;
        searchController.current?.abort();
        Object.values(runControllers.current).forEach((c) => c.abort());
        runControllers.current = {};
        runningSql.current = {};
        searchAiMemory.current = { last: null, history: [] };
        setSearchAi(null);
    };

    const restoreRows = (queries) => {
        if (queries && queries.length > 0) {
            const restoredRows = queries.map((q, index) => ({
                id: (index + 1) + "-" + uuid(),
                showPanel: true,
                query: q.query,
                view: DEFAULT_VIEW,
                variables: q.variables || {},
                resultTitle: q.resultTitle || ""
            }));

            setRows(restoredRows);
            nextId.current = queries.length + 1;
            setResults({});
        }
    };

    const toggleAllRows = () => {
        const allCollapsed = rows.every(row => !row.showPanel);
        setRows(prev =>
            prev.map(r => ({ ...r, showPanel: allCollapsed }))
        );
    };

    return {
        rows,
        results,
        queryIds,
        cancellingQueries,
        isRunningAll,
        addRow,
        removeRow,
        updateRow,
        handleRunQuery,
        handleCancelQuery,
        runAllQueries,
        clearRowResults,
        resetRows,
        restoreRows,
        toggleAllRows,
        searchData,
        searchLoading,
        searchError,
        searchQuery,
        setSearchQuery,
        runSearchQuery,
        searchAi,
    };
};
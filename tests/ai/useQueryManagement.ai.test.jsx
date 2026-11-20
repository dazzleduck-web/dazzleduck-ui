import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQueryManagement } from "../../src/hooks/useQueryManagement";
import { AiError } from "../../src/ai/errors";

const connection = { url: "http://localhost:8081", splitSize: 0, claims: {} };

const chartRows = [{ kind: "a", n: 1 }, { kind: "b", n: 2 }];
const setup = (ai, executeQuery = vi.fn(async (_u, _sql, _s, _j, id) => ({ data: chartRows, queryId: id }))) => {
    const hook = renderHook(() => useQueryManagement(executeQuery, vi.fn(), true, connection, ai));
    const rowId = () => hook.result.current.rows[0].id;
    const setQuery = (q) => act(() => hook.result.current.updateRow(rowId(), "query", q));
    const run = (opts) => act(() => hook.result.current.handleRunQuery(hook.result.current.rows[0], opts));
    return { hook, executeQuery, rowId, setQuery, run };
};

const aiResult = {
    source: "ai", sqlToRun: "SELECT 1\nLIMIT 1000", generatedSql: "SELECT 1\nLIMIT 1000",
    display: "bar", explanation: "one", meta: { model: "m", ms: 5, attempts: 1 },
};

describe("useQueryManagement with the AI assistant", () => {
    it("runs typed SQL unchanged when AI is disabled", async () => {
        const { hook, executeQuery, setQuery, run } = setup(undefined);
        setQuery("SELECT 42");
        await run();
        expect(executeQuery.mock.calls[0][1]).toBe("SELECT 42");
        expect(hook.result.current.results[hook.result.current.rows[0].id].ai).toBeNull();
    });

    it("executes AI SQL, sets the view and remembers it for follow-ups", async () => {
        const ai = { enabled: true, resolve: vi.fn(async () => aiResult), repair: vi.fn() };
        const { hook, executeQuery, rowId, setQuery, run } = setup(ai);
        setQuery("count things");
        await run();

        expect(ai.resolve.mock.calls[0][1]).toMatchObject({ text: "count things", history: [] });
        expect(executeQuery.mock.calls[0][1]).toBe("SELECT 1\nLIMIT 1000");
        const row = hook.result.current.rows[0];
        expect(row.view).toBe("bar");
        expect(row.aiHistory).toEqual([{ question: "count things", sql: "SELECT 1\nLIMIT 1000" }]);
        expect(hook.result.current.results[rowId()]).toMatchObject({
            loading: false, error: null, ai: { generatedSql: "SELECT 1\nLIMIT 1000", model: "m" },
        });
    });

    it("falls back to a table when the result can't be drawn as the chosen chart", async () => {
        const ai = { enabled: true, resolve: vi.fn(async () => ({ ...aiResult, display: "pie" })), repair: vi.fn() };
        const executeQuery = vi.fn(async (_u, _s, _p, _j, id) => ({ data: [{ name: "x", city: "y" }], queryId: id }));
        const { hook, setQuery, run } = setup(ai, executeQuery);
        setQuery("people as a pie");
        await run();
        expect(hook.result.current.rows[0].view).toBe("table");
    });

    it("Search runs questions through the AI and shows the generated SQL", async () => {
        const ai = { enabled: true, resolve: vi.fn(async () => aiResult), repair: vi.fn() };
        const { hook, executeQuery } = setup(ai);
        await act(() => hook.result.current.runSearchQuery("count things"));
        expect(ai.resolve.mock.calls[0][1]).toMatchObject({ text: "count things", history: [] });
        expect(executeQuery.mock.calls[0][1]).toBe("SELECT 1\nLIMIT 1000");
        expect(hook.result.current.searchData).toEqual(chartRows);
        expect(hook.result.current.searchAi).toMatchObject({ generatedSql: "SELECT 1\nLIMIT 1000", explanation: "one" });

        await act(() => hook.result.current.runSearchQuery("only a"));
        expect(ai.resolve.mock.calls[1][1].history).toEqual([{ question: "count things", sql: "SELECT 1\nLIMIT 1000" }]);
    });

    it("Search shows an AI message as the result text", async () => {
        const ai = { enabled: true, resolve: vi.fn(async () => ({ source: "message", message: "Hello!" })), repair: vi.fn() };
        const { hook, executeQuery } = setup(ai);
        await act(() => hook.result.current.runSearchQuery("hi"));
        expect(executeQuery).not.toHaveBeenCalled();
        expect(hook.result.current.searchError).toBe("Hello!");
    });

    it("Search runs plain SQL unchanged when AI is disabled", async () => {
        const { hook, executeQuery } = setup(undefined);
        await act(() => hook.result.current.runSearchQuery("SELECT 42"));
        expect(executeQuery.mock.calls[0][1]).toBe("SELECT 42");
        expect(hook.result.current.searchAi).toBeNull();
    });

    it("shows an AI message without running anything", async () => {
        const ai = { enabled: true, resolve: vi.fn(async () => ({ source: "message", message: "Hello!" })) };
        const { hook, executeQuery, rowId, setQuery, run } = setup(ai);
        setQuery("hi");
        await run();
        expect(executeQuery).not.toHaveBeenCalled();
        expect(hook.result.current.results[rowId()]).toMatchObject({ message: "Hello!", error: null });
    });

    it("shows AI errors with the generated SQL", async () => {
        const ai = {
            enabled: true,
            resolve: vi.fn(async () => { throw new AiError("invalid_sql", "Couldn't generate", { generatedSql: "SELECT bad" }); }),
        };
        const { hook, rowId, setQuery, run } = setup(ai);
        setQuery("q");
        await run();
        expect(hook.result.current.results[rowId()]).toMatchObject({
            error: "Couldn't generate", ai: { generatedSql: "SELECT bad", failed: true },
        });
    });

    it("repairs once when AI SQL fails at execution", async () => {
        const executeQuery = vi.fn()
            .mockRejectedValueOnce(new Error("Conversion Error"))
            .mockResolvedValueOnce({ data: [{ n: 2 }], queryId: 2 });
        const fixed = { ...aiResult, sqlToRun: "SELECT 2", generatedSql: "SELECT 2" };
        const ai = { enabled: true, resolve: vi.fn(async () => aiResult), repair: vi.fn(async () => fixed) };
        const { hook, rowId, setQuery, run } = setup(ai, executeQuery);
        setQuery("q");
        await run();
        expect(ai.repair.mock.calls[0][1]).toMatchObject({ failedSql: aiResult.sqlToRun, error: "Conversion Error" });
        expect(executeQuery.mock.calls[1][1]).toBe("SELECT 2");
        expect(hook.result.current.results[rowId()]).toMatchObject({ data: [{ n: 2 }], ai: { generatedSql: "SELECT 2" } });
    });

    it("offers 'treat as a question' when unclear input fails as SQL", async () => {
        const executeQuery = vi.fn(async () => { throw new Error("Binder Error"); });
        const ai = { enabled: true, resolve: vi.fn(async (_u, a) => ({ source: "user", sqlToRun: a.text, unclear: true })) };
        const { hook, rowId, setQuery, run } = setup(ai, executeQuery);
        setQuery("select all failed payments");
        await run();
        expect(hook.result.current.results[rowId()]).toMatchObject({ error: "Binder Error", canTreatAsQuestion: true });

        await run({ forceQuestion: true });
        expect(ai.resolve.mock.calls[1][1].forceQuestion).toBe(true);
    });

    it("cancelling a running AI query doesn't repair it, and cancels the generated SQL", async () => {
        const ai = { enabled: true, resolve: vi.fn(async () => aiResult), repair: vi.fn() };
        let rejectRun;
        const executeQuery = vi.fn((_u, _s, _p, _j, id) => new Promise((_, reject) => { rejectRun = reject; void id; }));
        const cancelQuery = vi.fn(async () => { rejectRun(new Error("Query was cancelled")); return { success: true, status: 200 }; });
        const hook = renderHook(() => useQueryManagement(executeQuery, cancelQuery, true, connection, ai));
        act(() => hook.result.current.updateRow(hook.result.current.rows[0].id, "query", "top metrics"));
        let pending;
        act(() => { pending = hook.result.current.handleRunQuery(hook.result.current.rows[0]); });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        await act(async () => { await hook.result.current.handleCancelQuery(hook.result.current.rows[0]); await pending; });

        expect(cancelQuery.mock.calls[0][1]).toBe("SELECT 1\nLIMIT 1000"); // the SQL running, not the question
        expect(ai.repair).not.toHaveBeenCalled();
        expect(executeQuery).toHaveBeenCalledTimes(1);
        expect(hook.result.current.results[hook.result.current.rows[0].id]).toMatchObject({ error: "Cancelled.", loading: false });
    });

    it("Cancel during a repair shows Cancelled., not the old SQL error", async () => {
        const ai = {
            enabled: true,
            resolve: vi.fn(async () => aiResult),
            repair: vi.fn((_url, { signal }) => new Promise((_, reject) => {
                signal.addEventListener("abort", () => reject(new AiError("aborted", "Cancelled.")));
            })),
        };
        const executeQuery = vi.fn(async () => { throw new Error("Binder Error: bad column"); });
        const { hook, rowId, setQuery } = setup(ai, executeQuery);
        setQuery("q");
        let pending;
        act(() => { pending = hook.result.current.handleRunQuery(hook.result.current.rows[0]); });
        await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
        expect(ai.repair).toHaveBeenCalled();
        await act(async () => { await hook.result.current.handleCancelQuery(hook.result.current.rows[0]); await pending; });
        expect(hook.result.current.results[rowId()]).toMatchObject({ error: "Cancelled." });
        expect(hook.result.current.results[rowId()].ai?.failed).toBeFalsy();
    });

    it("logout (resetRows) stops AI requests still generating SQL for rows", async () => {
        let seenSignal;
        const ai = {
            enabled: true,
            resolve: vi.fn((_url, { signal }) => new Promise((_, reject) => {
                seenSignal = signal;
                signal.addEventListener("abort", () => reject(new AiError("aborted", "Cancelled.")));
            })),
        };
        const { hook, setQuery } = setup(ai);
        setQuery("slow question");
        act(() => { hook.result.current.handleRunQuery(hook.result.current.rows[0]); });
        await act(async () => { await Promise.resolve(); });
        act(() => hook.result.current.resetRows());
        expect(seenSignal.aborted).toBe(true);
    });

    it("a slow search repair doesn't overwrite a newer search", async () => {
        let releaseRepair;
        const ai = {
            enabled: true,
            resolve: vi.fn(async (_u, { text }) => ({ ...aiResult, sqlToRun: `SQL ${text}`, generatedSql: `SQL ${text}` })),
            repair: vi.fn(() => new Promise((resolve) => { releaseRepair = () => resolve({ ...aiResult, sqlToRun: "SQL A fixed", generatedSql: "SQL A fixed" }); })),
        };
        const executeQuery = vi.fn(async (_u, sql) => {
            if (sql === "SQL A") throw new Error("Binder Error");
            return { data: [{ from: sql }] };
        });
        const { hook } = setup(ai, executeQuery);
        let searchA;
        act(() => { searchA = hook.result.current.runSearchQuery("A"); });
        await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
        expect(ai.repair).toHaveBeenCalled();
        await act(() => hook.result.current.runSearchQuery("B"));
        expect(hook.result.current.searchData).toEqual([{ from: "SQL B" }]);
        await act(async () => { releaseRepair(); await searchA; });
        expect(hook.result.current.searchData).toEqual([{ from: "SQL B" }]);
        expect(hook.result.current.searchAi.generatedSql).toBe("SQL B");
    });

    it("Cancel aborts SQL generation", async () => {
        let seenSignal;
        const ai = {
            enabled: true,
            resolve: vi.fn((_url, { signal }) => new Promise((_, reject) => {
                seenSignal = signal;
                signal.addEventListener("abort", () => reject(new AiError("aborted", "Cancelled.")));
            })),
        };
        const { hook, executeQuery, rowId, setQuery } = setup(ai);
        setQuery("slow question");
        let pending;
        act(() => { pending = hook.result.current.handleRunQuery(hook.result.current.rows[0]); });
        await act(async () => { await Promise.resolve(); });
        await act(() => hook.result.current.handleCancelQuery(hook.result.current.rows[0]));
        await act(() => pending);
        expect(seenSignal.aborted).toBe(true);
        expect(executeQuery).not.toHaveBeenCalled();
        expect(hook.result.current.results[rowId()].error).toBe("Cancelled.");
    });
});

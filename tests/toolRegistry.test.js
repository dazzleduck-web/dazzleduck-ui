import { describe, expect, it, vi } from "vitest";
import { runTool, MAX_BULK_QUERIES, MAX_ROWS_PER_QUERY } from "../src/components/ai/tools/toolRegistry.js";

const buildNamedQuery = (name, group = "default") => ({
  name,
  query_group: group,
  preferred_display: "table",
});

describe("toolRegistry bulk named-query execution", () => {
  it("rejects bulk execution when the query count exceeds the configured limit", async () => {
    const fetchNamedQueries = vi.fn(async () => (
      Array.from({ length: MAX_BULK_QUERIES + 1 }, (_, index) => buildNamedQuery(`query_${index + 1}`))
    ));
    const executeNamedQuery = vi.fn();

    await expect(runTool("executeAllNamedQueries", { confirmed: true }, {
      serverUrl: "http://localhost:8081",
      fetchNamedQueries,
      executeNamedQuery,
    })).rejects.toThrow(`Bulk execution exceeds limit of ${MAX_BULK_QUERIES} queries`);

    expect(executeNamedQuery).not.toHaveBeenCalled();
  });

  it("truncates stored rows for large per-query result sets", async () => {
    const fetchNamedQueries = vi.fn(async () => [buildNamedQuery("large_query")]);
    const executeNamedQuery = vi.fn(async () => (
      Array.from({ length: MAX_ROWS_PER_QUERY + 57 }, (_, index) => ({ id: index + 1 }))
    ));

    const result = await runTool("executeAllNamedQueries", { confirmed: true }, {
      serverUrl: "http://localhost:8081",
      fetchNamedQueries,
      executeNamedQuery,
    });

    expect(result.total).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      queryName: "large_query",
      success: true,
      totalRowCount: MAX_ROWS_PER_QUERY + 57,
      truncated: true,
    });
    expect(result.results[0].data).toHaveLength(MAX_ROWS_PER_QUERY);
    expect(result.rows[0]).toMatchObject({
      queryName: "large_query",
      rowCount: MAX_ROWS_PER_QUERY + 57,
      success: true,
    });
  });

  it("records mixed success and failure results", async () => {
    const fetchNamedQueries = vi.fn(async () => ([
      buildNamedQuery("first_query"),
      buildNamedQuery("second_query"),
      buildNamedQuery("third_query"),
    ]));
    const executeNamedQuery = vi.fn(async (_serverUrl, queryName) => {
      if (queryName === "second_query") {
        throw new Error("Second query failed");
      }

      return queryName === "first_query"
        ? [{ id: 1 }, { id: 2 }]
        : [{ id: 3 }];
    });

    const result = await runTool("executeAllNamedQueries", { confirmed: true }, {
      serverUrl: "http://localhost:8081",
      fetchNamedQueries,
      executeNamedQuery,
    });

    expect(result.total).toBe(3);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.errors).toEqual([
      { queryName: "second_query", error: "Second query failed" },
    ]);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toMatchObject({
      queryName: "first_query",
      success: true,
      totalRowCount: 2,
      truncated: false,
    });
    expect(result.results[1]).toMatchObject({
      queryName: "second_query",
      success: false,
      totalRowCount: 0,
      truncated: false,
      error: "Second query failed",
    });
    expect(result.results[2]).toMatchObject({
      queryName: "third_query",
      success: true,
      totalRowCount: 1,
      truncated: false,
    });
  });
});

import { describe, it, expect } from "vitest";
import { detectInput } from "../../src/ai/inputDetector";
import { checkGeneratedSql, collectRefs, generatorSize, MAX_GENERATED_ROWS } from "../../src/ai/sqlGate";
import { cleanServerError, looksLikeSql } from "../../src/ai/sqlParse";
import { makeRunMeta, selectAst, fileFn, baseTable, parserError, notSelectError } from "./fakes";

describe("detectInput", () => {
    it("treats a syntax error as a natural-language question", async () => {
        const runMeta = makeRunMeta({ parse: () => parserError() });
        expect((await detectInput(runMeta, "errors per service in the last hour")).kind).toBe("nl");
    });

    it("treats non-SELECT statements as SQL", async () => {
        const runMeta = makeRunMeta({ parse: () => notSelectError() });
        expect((await detectInput(runMeta, "DESCRIBE logs")).kind).toBe("sql");
    });

    it("treats SQL-shaped text that parses as SQL with a single server call (no EXPLAIN)", async () => {
        const runMeta = makeRunMeta();
        expect((await detectInput(runMeta, "SELECT * FROM range(3);")).kind).toBe("sql");
        expect(runMeta.calls.some((c) => c.startsWith("EXPLAIN"))).toBe(false);
        expect(runMeta.calls).toHaveLength(1);
    });

    it("treats prose-like text that parses and binds as SQL", async () => {
        const runMeta = makeRunMeta();
        expect((await detectInput(runMeta, "select 42")).kind).toBe("sql");
        expect(runMeta.calls.some((c) => c === "EXPLAIN select 42")).toBe(true);
    });

    it("marks prose that happens to parse but not bind as unclear", async () => {
        const runMeta = makeRunMeta({ explain: () => 'Binder Error: Referenced column "failed" not found' });
        const r = await detectInput(runMeta, "select all failed payments");
        expect(r.kind).toBe("unclear");
        expect(r.bindError).toContain("failed");
    });

    it("keeps SQL-shaped input with a bind error as SQL (user's own mistake)", async () => {
        const runMeta = makeRunMeta({ explain: () => "Binder Error: column nope not found" });
        expect((await detectInput(runMeta, "SELECT nope, count(*) FROM t")).kind).toBe("sql");
    });

    it("falls back to a heuristic when the server refuses the parse call", async () => {
        const runMeta = async () => { throw new Error("Unauthorized"); };
        expect((await detectInput(runMeta, "SELECT * FROM t")).kind).toBe("sql");
        expect((await detectInput(runMeta, "top services by errors")).kind).toBe("nl");
    });

    it("returns empty for blank input", async () => {
        expect((await detectInput(makeRunMeta(), "  ; ")).kind).toBe("empty");
    });
});

describe("checkGeneratedSql", () => {
    const schema = {
        tables: [{ db: "memory", schema: "main", table: "logs" }],
        sourceSignatures: new Set(["read_parquet|data/a.parquet", "read_parquet|data/b.parquet"]),
    };
    const check = (runMeta, sql) => checkGeneratedSql({ runMeta, sql, schema, defaultLimit: 1000 });

    it("accepts a known file source and appends a LIMIT", async () => {
        const runMeta = makeRunMeta({ parse: () => selectAst({ from: fileFn("read_parquet", "data/a.parquet") }) });
        const r = await check(runMeta, "SELECT * FROM read_parquet('data/a.parquet');");
        expect(r).toEqual({ ok: true, sql: "SELECT * FROM read_parquet('data/a.parquet')\nLIMIT 1000" });
    });

    it("keeps an existing LIMIT", async () => {
        const runMeta = makeRunMeta({ parse: () => selectAst({ from: baseTable("logs"), limit: true }) });
        expect((await check(runMeta, "SELECT * FROM logs LIMIT 5")).sql).toBe("SELECT * FROM logs LIMIT 5");
    });

    it("rejects unknown file sources and system table functions", async () => {
        let runMeta = makeRunMeta({ parse: () => selectAst({ from: fileFn("read_csv", "/etc/passwd") }) });
        expect((await check(runMeta, "x")).error).toMatch(/not allowed/);
        runMeta = makeRunMeta({ parse: () => selectAst({ from: fileFn("duckdb_secrets", null) }) });
        expect((await check(runMeta, "x")).ok).toBe(false);
    });

    it("allows generators like range()", async () => {
        const runMeta = makeRunMeta({ parse: () => selectAst({ from: fileFn("range", null) }) });
        expect((await check(runMeta, "SELECT * FROM range(3)")).ok).toBe(true);
    });

    const listFn = (name, paths) => ({
        type: "TABLE_FUNCTION",
        function: { class: "FUNCTION", function_name: name, children: [{
            class: "FUNCTION", function_name: "list_value",
            children: paths.map((p) => (p === null ? { class: "COLUMN_REF" } : { class: "CONSTANT", value: { value: p } })),
        }] },
    });

    it("checks every file of a list argument, not just the first", async () => {
        const smuggle = makeRunMeta({ parse: () => selectAst({ from: listFn("read_parquet", ["data/a.parquet", "/secret/b.parquet"]) }) });
        const r = await check(smuggle, "SELECT * FROM read_parquet(['data/a.parquet','/secret/b.parquet'])");
        expect(r.ok).toBe(false);
        expect(r.error).toContain("/secret/b.parquet");

        const known = makeRunMeta({ parse: () => selectAst({ from: listFn("read_parquet", ["data/a.parquet", "data/b.parquet"]) }) });
        expect((await check(known, "SELECT * FROM read_parquet(['data/a.parquet','data/b.parquet'])")).ok).toBe(true);

        const expr = makeRunMeta({ parse: () => selectAst({ from: listFn("read_parquet", ["data/a.parquet", null]) }) });
        expect((await check(expr, "x")).ok).toBe(false); // a non-literal path can't be checked
    });

    it("matches qualified table names on schema and catalog", async () => {
        const ref = (catalog, schema, table) => ({ type: "BASE_TABLE", catalog_name: catalog, schema_name: schema, table_name: table });
        const ok = async (from) => (await check(makeRunMeta({ parse: () => selectAst({ from }) }), "x")).ok;
        expect(await ok(ref("", "", "logs"))).toBe(true);
        expect(await ok(ref("", "main", "logs"))).toBe(true);
        expect(await ok(ref("memory", "main", "logs"))).toBe(true);
        expect(await ok(ref("", "private", "logs"))).toBe(false);   // same name, other schema
        expect(await ok(ref("other_db", "main", "logs"))).toBe(false); // same name, other catalog
        expect(await ok(ref("", "private", "c"))).toBe(false);     // a qualified name is never a CTE
    });

    it("rejects unknown tables but allows CTE names", async () => {
        let runMeta = makeRunMeta({ parse: () => selectAst({ from: baseTable("secrets") }) });
        expect((await check(runMeta, "x")).error).toMatch(/Unknown table/);
        runMeta = makeRunMeta({ parse: () => selectAst({ from: baseTable("c"), ctes: ["c"] }) });
        expect((await check(runMeta, "x")).ok).toBe(true);
    });

    it("rejects non-SELECT, multiple statements, syntax errors and bind errors", async () => {
        expect((await check(makeRunMeta({ parse: () => notSelectError() }), "DROP TABLE logs")).error)
            .toMatch(/read-only SELECT/);
        expect((await check(makeRunMeta({ parse: () => selectAst({ statements: 2 }) }), "x")).error)
            .toMatch(/one SQL statement/);
        expect((await check(makeRunMeta({ parse: () => parserError("boom") }), "x")).error)
            .toMatch(/syntax error: boom/);
        const bind = makeRunMeta({
            parse: () => selectAst({ from: baseTable("logs") }),
            explain: () => 'Binder Error: Referenced column "lvl" not found',
        });
        expect((await check(bind, "SELECT lvl FROM logs")).error).toBe('Binder Error: Referenced column "lvl" not found');
    });

    it("finds table functions nested in subqueries", () => {
        const nested = selectAst({ from: { type: "SUBQUERY", subquery: selectAst({ from: fileFn("read_csv", "x.csv") }).statements[0] } });
        expect(collectRefs(nested.statements[0]).tableFunctions).toMatchObject([{ name: "read_csv", paths: ["x.csv"] }]);
    });

    const num = (value) => ({ class: "CONSTANT", value: { value } });
    const op = (name, ...children) => ({ class: "FUNCTION", function_name: name, children });
    const gen = (name, ...args) => ({ type: "TABLE_FUNCTION", function: { class: "FUNCTION", function_name: name, children: args } });

    it("sizes range/generate_series calls with literal bounds", () => {
        expect(generatorSize("range", [num(5)])).toBe(5);
        expect(generatorSize("range", [num(2), num(10), num(3)])).toBe(3);
        expect(generatorSize("generate_series", [num(1), num(5)])).toBe(5);
        expect(generatorSize("range", [op("*", num(10), num(1000))])).toBe(10000);
        expect(generatorSize("range", [num("1e12")])).toBe(1e12);
        expect(generatorSize("range", [num(1), num(5), num(0)])).toBe(Infinity);
        expect(generatorSize("range", [{ class: "FUNCTION", function_name: "now", children: [] }])).toBeNull();
    });

    it("blocks generated data that is too large, alone or combined", async () => {
        const big = makeRunMeta({ parse: () => selectAst({ from: gen("range", num(MAX_GENERATED_ROWS + 1)) }) });
        expect((await check(big, "SELECT * FROM range(1000001)")).error).toMatch(/too large/);

        const cross = makeRunMeta({ parse: () => selectAst({ from: { type: "JOIN", left: gen("range", num(2000)), right: gen("range", num(2000)) } }) });
        expect((await check(cross, "SELECT * FROM range(2000), range(2000)")).error).toMatch(/too large/);

        const small = makeRunMeta({ parse: () => selectAst({ from: gen("range", num(5)) }) });
        expect((await check(small, "SELECT * FROM range(5)")).ok).toBe(true);
    });
});

describe("sqlParse helpers", () => {
    it("cleans the server error wrapper", () => {
        expect(cleanServerError("Invalid Input Error: x\nError: Binder Error: bad\nLINE 1")).toBe("Binder Error: bad\nLINE 1");
        expect(cleanServerError("plain")).toBe("plain");
    });

    it("recognises SQL-shaped text", () => {
        expect(looksLikeSql("SELECT * FROM t")).toBe(true);
        expect(looksLikeSql("select all failed payments")).toBe(false);
        expect(looksLikeSql("show me the errors")).toBe(false);
    });
});

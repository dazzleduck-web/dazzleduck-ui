import { describe, it, expect } from "vitest";
import { createAiPipeline } from "../../src/ai/aiQueryPipeline";
import { createSchemaContext } from "../../src/ai/schemaContext";
import { createStubProvider } from "../../src/ai/providers/stubProvider";
import { serializeProvider } from "../../src/ai/providers/serializeProvider";
import { buildUserPrompt, buildSystemPrompt, normalizeAnswer } from "../../src/ai/prompts";
import { makeRunMeta, selectAst, fileFn, parserError } from "./fakes";

const FILE = "read_parquet('data/a.parquet')";
const COLUMNS = [{ name: "service", type: "VARCHAR" }, { name: "level", type: "VARCHAR" }];

// Parses: questions → parser error; anything mentioning the file → SELECT over it
// "select all failed payments" parses (SELECT ALL failed AS payments) but won't bind
const parse = (sql) => {
    if (/read_parquet/i.test(sql)) return selectAst({ from: fileFn("read_parquet", "data/a.parquet") });
    if (sql === "select all failed payments" || /^SELECT 2 \* 2/.test(sql)) return selectAst();
    return parserError();
};

const setup = ({ answers, explain, describe = { [FILE]: COLUMNS } } = {}) => {
    const runMeta = makeRunMeta({ parse, explain, describe });
    const provider = createStubProvider(answers);
    const pipeline = createAiPipeline({
        provider, runMeta, schemaContext: createSchemaContext({ runMeta }), defaultLimit: 100,
        now: () => new Date(2026, 10, 18, 14, 5),
    });
    return { runMeta, provider, pipeline };
};

const sqlAnswer = (sql, display = "bar") => ({ kind: "nl", sql, display, explanation: "Errors per service" });

describe("createAiPipeline.resolve", () => {
    it("passes real SQL through without calling the AI", async () => {
        const { pipeline, provider } = setup();
        const r = await pipeline.resolve({ text: `SELECT * FROM ${FILE}` });
        expect(r).toEqual({ source: "user", sqlToRun: `SELECT * FROM ${FILE}` });
        expect(provider.calls).toHaveLength(0);
    });

    it("generates, checks and limits SQL for a question", async () => {
        const gen = `SELECT service, count(*) FROM ${FILE} GROUP BY 1`;
        const { pipeline, provider } = setup({ answers: [sqlAnswer(gen)] });
        const phases = [];
        const r = await pipeline.resolve({
            text: "errors per service", rowTexts: [`SELECT * FROM ${FILE}`], onPhase: (p) => phases.push(p),
        });
        expect(r).toMatchObject({ source: "ai", display: "bar", sqlToRun: `${gen}\nLIMIT 100`, meta: { attempts: 1 } });
        expect(phases).toEqual(["generating"]);
        // Only names/types are sent: the schema with the file source, never any data
        expect(provider.calls[0].system).toContain(`${FILE}  -- columns: service VARCHAR, level VARCHAR`);
        expect(provider.calls[0].user).toContain("errors per service");
    });

    it("feeds a failed check back to the AI and succeeds on the next try", async () => {
        const bad = `SELECT lvl FROM ${FILE}`;
        const good = `SELECT level FROM ${FILE}`;
        const { pipeline, provider } = setup({
            answers: [sqlAnswer(bad, "table"), sqlAnswer(good, "table")],
            explain: (sql) => (sql.includes("lvl") ? 'Binder Error: column "lvl" not found' : true),
        });
        const r = await pipeline.resolve({ text: "levels", rowTexts: [FILE] });
        expect(r.sqlToRun).toBe(`${good}\nLIMIT 100`);
        expect(r.meta.attempts).toBe(2);
        expect(provider.calls[1].user).toContain('Binder Error: column "lvl" not found');
        expect(provider.calls[1].user).toContain(bad);
    });

    it("gives up after 3 tries with the last SQL attached", async () => {
        const bad = `SELECT lvl FROM ${FILE}`;
        const { pipeline } = setup({
            answers: [sqlAnswer(bad), sqlAnswer(bad), sqlAnswer(bad)],
            explain: () => "Binder Error: nope",
        });
        await expect(pipeline.resolve({ text: "levels", rowTexts: [FILE] }))
            .rejects.toMatchObject({ code: "invalid_sql", generatedSql: bad });
    });

    it("returns a message for off-topic input", async () => {
        const { pipeline } = setup({ answers: [{ kind: "message", sql: "", display: "table", explanation: "Hi! Ask me about your data." }] });
        expect(await pipeline.resolve({ text: "hi", rowTexts: [FILE] }))
            .toEqual({ source: "message", message: "Hi! Ask me about your data." });
    });

    it("lets the AI decide unclear input and runs the user's own text when it is SQL", async () => {
        const text = "select all failed payments";
        const { pipeline, provider } = setup({
            answers: [{ kind: "sql", sql: "", display: "table", explanation: "" }],
            explain: () => 'Binder Error: Referenced column "failed" not found',
        });
        expect(await pipeline.resolve({ text, rowTexts: [FILE] })).toEqual({ source: "user", sqlToRun: text, unclear: true });
        expect(provider.calls[0].user).toContain('fails to bind: Binder Error: Referenced column "failed" not found');
    });

    it("reuses the row's last SQL for the same question and schema", async () => {
        const { pipeline, provider } = setup({ answers: [sqlAnswer(`SELECT * FROM ${FILE}`)] });
        const first = await pipeline.resolve({ text: "q", rowTexts: [FILE] });
        const reuse = { question: "q", sql: first.generatedSql, display: "table", explanation: "", meta: first.meta };
        const r = await pipeline.resolve({ text: "q", reuse, rowTexts: [FILE] });
        expect(r).toMatchObject({ source: "ai", sqlToRun: first.generatedSql, meta: { reused: true } });
        expect(provider.calls).toHaveLength(1);
    });

    it("asks the AI again when the schema changed since the last run", async () => {
        const { pipeline, provider } = setup({ answers: [sqlAnswer(`SELECT * FROM ${FILE}`)] });
        const reuse = { question: "q", sql: "SELECT 1", display: "table", explanation: "", meta: { schemaKey: "old schema" } };
        const r = await pipeline.resolve({ text: "q", reuse, rowTexts: [FILE] });
        expect(r.meta.reused).toBeUndefined();
        expect(provider.calls).toHaveLength(1);
    });

    it("explains when AI is not configured", async () => {
        const runMeta = makeRunMeta({ parse });
        const noProvider = createAiPipeline({ provider: null, runMeta, schemaContext: createSchemaContext({ runMeta }) });
        await expect(noProvider.resolve({ text: "errors" })).rejects.toMatchObject({ code: "not_configured" });
    });

    it("still answers data-free questions when no table or file is known", async () => {
        const { pipeline, provider } = setup({
            describe: {},
            answers: [{ kind: "nl", sql: "SELECT 2 * 2 AS result", display: "table", explanation: "2 times 2" }],
        });
        const r = await pipeline.resolve({ text: "show me 2 * 2 as table" });
        expect(r).toMatchObject({ source: "ai", display: "table", sqlToRun: "SELECT 2 * 2 AS result\nLIMIT 100" });
        expect(provider.calls[0].system).toContain("(no tables or file sources found)");
    });

    it("repair() makes one extra attempt with the execution error", async () => {
        const fixed = `SELECT service FROM ${FILE}`;
        const { pipeline, provider } = setup({ answers: [sqlAnswer(fixed, "table")] });
        const r = await pipeline.repair({ text: "services", rowTexts: [FILE], failedSql: "SELECT x", error: "Conversion Error" });
        expect(r.sqlToRun).toBe(`${fixed}\nLIMIT 100`);
        expect(provider.calls[0].user).toContain("Conversion Error");
    });
});

describe("schemaContext", () => {
    it("gives one signature per file when a source lists several files", async () => {
        const LIST = "read_parquet(['data/a.parquet', 'data/b.parquet'])";
        const ctx = createSchemaContext({ runMeta: makeRunMeta({ describe: { [LIST]: COLUMNS } }) });
        const s = await ctx.getSchema({ texts: [`SELECT * FROM ${LIST}`] });
        expect([...s.sourceSignatures]).toEqual(["read_parquet|data/a.parquet", "read_parquet|data/b.parquet"]);
    });

    it("does not cache a failed file lookup, and refresh() reloads everything", async () => {
        const describe = {};
        const runMeta = makeRunMeta({ describe });
        const ctx = createSchemaContext({ runMeta });
        expect((await ctx.getSchema({ texts: [FILE] })).text).not.toContain(FILE);   // file not there yet
        describe[FILE] = COLUMNS;
        expect((await ctx.getSchema({ texts: [FILE] })).text).toContain(FILE);       // seen on the next question

        const catalogCalls = () => runMeta.calls.filter((c) => c.includes("duckdb_columns")).length;
        expect(catalogCalls()).toBe(1);
        ctx.refresh();
        await ctx.getSchema({ texts: [FILE] });
        expect(catalogCalls()).toBe(2);
    });

    it("lists catalog tables and described file sources, cached", async () => {
        const runMeta = makeRunMeta({
            catalog: [
                { database_name: "memory", schema_name: "main", table_name: "logs", column_name: "ts", data_type: "TIMESTAMP" },
                { database_name: "lake", schema_name: "s", table_name: "t", column_name: "id", data_type: "INTEGER" },
            ],
            describe: { [FILE]: COLUMNS },
        });
        const ctx = createSchemaContext({ runMeta });
        const s = await ctx.getSchema({ texts: [`SELECT * FROM ${FILE}`, "read_csv('missing.csv')"] });
        expect(s.text).toContain("- logs(ts TIMESTAMP)");
        expect(s.text).toContain("- lake.s.t(id INTEGER)");
        expect(s.text).toContain(FILE);
        expect(s.text).not.toContain("missing.csv");
        expect(s.tables).toEqual([{ db: "memory", schema: "main", table: "logs" }, { db: "lake", schema: "s", table: "t" }]);
        expect([...s.sourceSignatures]).toEqual(["read_parquet|data/a.parquet"]);

        const before = runMeta.calls.length;
        await ctx.getSchema({ texts: [FILE] });
        expect(runMeta.calls.length).toBe(before); // catalog + DESCRIBE cached
    });
});

describe("prompts", () => {
    it("builds the user prompt with history, unclear note and feedback", () => {
        const p = buildUserPrompt({
            text: "now only payments",
            history: [{ question: "errors per service", sql: "SELECT 1" }],
            detection: { kind: "unclear", bindError: "Binder Error" },
            feedback: { sql: "SELECT bad", error: "boom" },
        });
        expect(p).toContain("- Q: errors per service\n  SQL: SELECT 1");
        expect(p).toContain("fails to bind: Binder Error");
        expect(p).toContain("Failed SQL:\nSELECT bad\nError:\nboom");
    });

    it("puts the schema and time in the system prompt", () => {
        const s = buildSystemPrompt({ schemaText: "Tables:\n- logs(ts TIMESTAMP)", now: new Date(2026, 10, 18, 14, 5) });
        expect(s).toContain("Current time: 2026-11-18 14:05");
        expect(s).toContain("- logs(ts TIMESTAMP)");
    });

    it("normalises odd answers", () => {
        expect(normalizeAnswer({ kind: "weird", sql: "```sql\nSELECT 1\n```", display: "donut" }))
            .toEqual({ kind: "nl", sql: "SELECT 1", display: "table", explanation: "" });
        expect(normalizeAnswer(null).kind).toBe("nl");
    });
});

describe("serializeProvider", () => {
    it("a call cancelled while queued never reaches the provider", async () => {
        let release;
        const calls = [];
        const inner = { model: "m", generate: (req) => { calls.push(req.id); return req.id === 1 ? new Promise((r) => { release = () => r({ json: {} }); }) : Promise.resolve({ json: {} }); } };
        const p = serializeProvider(inner);
        const first = p.generate({ id: 1 });
        const controller = new AbortController();
        const second = p.generate({ id: 2, signal: controller.signal });
        controller.abort();
        await new Promise((r) => setTimeout(r, 0)); // let the first call start
        release();
        await first;
        await expect(second).rejects.toMatchObject({ code: "aborted" });
        expect(calls).toEqual([1]);
    });

    it("runs generate calls one at a time", async () => {
        let active = 0;
        let maxActive = 0;
        const slow = {
            model: "m",
            generate: async () => {
                active++; maxActive = Math.max(maxActive, active);
                await new Promise((r) => setTimeout(r, 10));
                active--;
                return { json: {}, ms: 10 };
            },
        };
        const p = serializeProvider(slow);
        await Promise.all([p.generate({}), p.generate({}), p.generate({})]);
        expect(maxActive).toBe(1);
    });
});

/**
 * Live end-to-end check against a real DazzleDuck server and the real Gemini API.
 * Skipped unless LIVE_AI=1 and LIVE_FILE are set (it spends free-tier quota):
 *
 *   LIVE_AI=1 GEMINI_API_KEY=... LIVE_FILE=path/to/metrics.arrow npx vitest run tests/ai/live.e2e.test.js
 *
 * LIVE_FILE: an Arrow file the server can read, with metric-style columns
 * (name VARCHAR, type VARCHAR, value DOUBLE, …), e.g. a metrics export.
 * Optional: DD_URL (default http://localhost:8081), DD_USER / DD_PASSWORD (default admin),
 * GEMINI_MODEL (default gemini-3.1-flash-lite).
 */
/* global process */
import { describe, it, expect, beforeAll } from "vitest";
import { tableFromIPC, compressionRegistry, CompressionType } from "apache-arrow";
import * as fzstd from "fzstd";
import { createGeminiProvider } from "../../src/ai/providers/geminiProvider";
import { createSchemaContext } from "../../src/ai/schemaContext";
import { createAiPipeline } from "../../src/ai/aiQueryPipeline";
import { checkGeneratedSql } from "../../src/ai/sqlGate";
import { fitDisplay } from "../../src/ai/displayFit";

const LIVE = process.env.LIVE_AI === "1" && Boolean(process.env.LIVE_FILE);
const DD = process.env.DD_URL || "http://localhost:8081";
const FILE = process.env.LIVE_FILE;
const SOURCE = `read_arrow('${FILE}')`;

let token;
let lastRequest = null; // the exact prompt sent to Gemini, for inspection
let aiCalls = 0;
const runMeta = async (sql) => {
    const res = await fetch(`${DD}/v1/query`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: token },
        body: JSON.stringify({ query: sql }),
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!res.ok) throw new Error(new TextDecoder().decode(buf));
    const table = tableFromIPC(buf);
    const columns = table.schema.fields.map((f) => ({ name: f.name, type: String(f.type) }));
    return { rows: table.toArray().map((r) => r.toJSON()), columns };
};

describe.skipIf(!LIVE)("AI pipeline — live server + Gemini", () => {
    let pipeline;

    beforeAll(async () => {
        compressionRegistry.set(CompressionType.ZSTD, { decode: (d) => new Uint8Array(fzstd.decompress(new Uint8Array(d))) });
        const login = await fetch(`${DD}/v1/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: process.env.DD_USER || "admin", password: process.env.DD_PASSWORD || "admin", claims: {} }),
        }).then((r) => r.json());
        token = `${login.tokenType} ${login.accessToken}`;
        const gemini = createGeminiProvider({
            apiKey: process.env.GEMINI_API_KEY,
            model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
        });
        pipeline = createAiPipeline({
            provider: { ...gemini, generate: (req) => { lastRequest = req; aiCalls++; return gemini.generate(req); } },
            runMeta,
            schemaContext: createSchemaContext({ runMeta }),
            defaultLimit: 1000,
        });
    });

    it("passes typed SQL through untouched", async () => {
        const text = `SELECT count(*) AS n FROM ${SOURCE}`;
        expect(await pipeline.resolve({ text })).toEqual({ source: "user", sqlToRun: text });
    }, 60000);

    it("turns a question into checked SQL that runs", async () => {
        const r = await pipeline.resolve({
            text: "average value per metric type",
            rowTexts: [`SELECT * FROM ${SOURCE}`],
        });
        console.log("[live] generated:", r.generatedSql, "| display:", r.display, "|", r.meta);
        expect(r.source).toBe("ai");
        expect(r.generatedSql).toContain(SOURCE);
        const { rows } = await runMeta(r.sqlToRun);
        console.log("[live] rows:", JSON.stringify(rows.slice(0, 5)));
        expect(rows.length).toBeGreaterThan(0);
    }, 120000);

    it("shows the exact context sent to Gemini", async () => {
        await pipeline.resolve({
            text: "now only the timer type",
            history: [{ question: "average value per metric type", sql: `SELECT type, AVG(value) FROM ${SOURCE} GROUP BY type` }],
            rowTexts: [`SELECT * FROM ${SOURCE}`],
        });
        console.log("[live] ===== SYSTEM PROMPT =====\n" + lastRequest.system);
        console.log("[live] ===== USER PROMPT =====\n" + lastRequest.user);
        expect(lastRequest.system).toContain(SOURCE);
    }, 60000);

    it("answers data-free questions: 2 * 2 as a table", async () => {
        const r = await pipeline.resolve({ text: "show me 2 * 2 as table" });
        console.log("[live] 2*2:", r.generatedSql, "| display:", r.display);
        expect(r).toMatchObject({ source: "ai", display: "table" });
        const { rows } = await runMeta(r.sqlToRun);
        console.log("[live] 2*2 rows:", JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
        expect(Object.values(rows[0]).map(Number)).toContain(4);
    }, 60000);

    it("generates fake data: 4 random emails as a table", async () => {
        const r = await pipeline.resolve({ text: "generate sql which selects 4 random fake emails and show it as table" });
        console.log("[live] emails:", r.generatedSql, "| display:", r.display);
        expect(r).toMatchObject({ source: "ai", display: "table" });
        const { rows } = await runMeta(r.sqlToRun);
        console.log("[live] email rows:", JSON.stringify(rows));
        expect(rows).toHaveLength(4);
    }, 60000);

    it("answers a greeting with a message", async () => {
        const r = await pipeline.resolve({ text: "hi there", rowTexts: [`SELECT * FROM ${SOURCE}`] });
        console.log("[live] message:", r);
        expect(r.source).toBe("message");
    }, 60000);

    it("size cap works with the real server parser (no AI call)", async () => {
        const schema = { tables: [], sourceSignatures: new Set() };
        const check = (sql) => checkGeneratedSql({ runMeta, sql, schema, defaultLimit: 1000 });
        const cases = {
            "SELECT * FROM range(1000000000000)": false,
            "SELECT * FROM range(1e12)": false,
            "SELECT * FROM range(10 * 1000 * 1000)": false,
            "SELECT * FROM range(2000) a, range(2000) b": false,
            "SELECT * FROM generate_series(1, 2000000)": false,
            "SELECT * FROM (SELECT * FROM range(5000000)) t": false,
            "SELECT * FROM range(5)": true,
            "SELECT * FROM range(2, 10, 3)": true,
            "SELECT * FROM generate_series(TIMESTAMP '2026-01-01', TIMESTAMP '2026-01-02', INTERVAL 1 HOUR)": true,
        };
        for (const [sql, ok] of Object.entries(cases)) {
            const r = await check(sql);
            console.log(`[live] gate ${r.ok ? "ALLOW" : "BLOCK"}: ${sql}${r.ok ? "" : "  -> " + r.error}`);
            expect(r.ok, sql).toBe(ok);
        }
    }, 60000);

    it("reuses SQL for the same question and schema without calling the AI", async () => {
        const args = { text: "how many metrics are there", rowTexts: [`SELECT * FROM ${SOURCE}`] };
        const first = await pipeline.resolve(args);
        expect(first.source).toBe("ai");
        const before = aiCalls;
        const again = await pipeline.resolve({ ...args, reuse: { question: args.text, sql: first.generatedSql, display: first.display, explanation: first.explanation, meta: first.meta } });
        console.log("[live] reuse:", again.meta);
        expect(again.meta.reused).toBe(true);
        expect(aiCalls).toBe(before);
    }, 120000);

    it("keeps a pie chart the real result can be drawn as", async () => {
        const r = await pipeline.resolve({ text: "number of metrics per type as a pie chart", rowTexts: [`SELECT * FROM ${SOURCE}`] });
        const { rows } = await runMeta(r.sqlToRun);
        console.log("[live] pie:", r.generatedSql, "| AI display:", r.display, "| fitted:", fitDisplay(r.display, rows), "|", JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
        expect(fitDisplay(r.display, rows)).toBe("pie");
        expect(fitDisplay("pie", [...Array(30)].map((_, i) => ({ k: String(i), v: i })))).toBe("table");
    }, 120000);
});

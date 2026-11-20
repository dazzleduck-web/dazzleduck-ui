import { describe, it, expect, vi, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { createOpenAiProvider } from "../../src/ai/providers/openaiProvider";
import { createClaudeProvider } from "../../src/ai/providers/claudeProvider";
import { toGeminiSchema } from "../../src/ai/providers/geminiProvider";
import { createLazyProvider, PROVIDERS } from "../../src/ai/providers/registry";
import { redactSecret } from "../../src/ai/errors";
import { RESPONSE_SCHEMA } from "../../src/ai/prompts";

const KEY = "sk-test-SECRET-123456";
const request = { system: "sys", user: "q", responseSchema: RESPONSE_SCHEMA };
const response = (status, body) => ({ ok: status < 300, status, statusText: "", json: async () => body });
const chat = (content) => ({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { total_tokens: 5 } });

describe("OpenAI adapter", () => {
    it("calls /chat/completions with a Bearer key and a strict JSON schema", async () => {
        const fetchImpl = vi.fn(async () => response(200, chat('{"kind":"nl","sql":"SELECT 1"}')));
        const p = createOpenAiProvider({ apiKey: KEY, model: "m1", fetchImpl, sleep: async () => {} });
        const r = await p.generate(request);
        expect(r.json).toEqual({ kind: "nl", sql: "SELECT 1" });

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("https://api.openai.com/v1/chat/completions");
        expect(url).not.toContain(KEY);
        expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
        expect(init.referrerPolicy).toBe("no-referrer");
        const body = JSON.parse(init.body);
        expect(body.model).toBe("m1");
        expect(body.messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "q" }]);
        expect(body.response_format).toEqual({
            type: "json_schema", json_schema: { name: "generate_query", schema: RESPONSE_SCHEMA, strict: true },
        });
    });

    it("compatible mode uses the base URL and JSON mode, and tolerates fenced JSON", async () => {
        const fetchImpl = vi.fn(async () => response(200, chat('```json\n{"kind":"message"}\n```')));
        const p = createOpenAiProvider({ apiKey: KEY, model: "llama", baseUrl: "http://localhost:11434/v1/", compatible: true, fetchImpl });
        expect((await p.generate(request)).json).toEqual({ kind: "message" });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("http://localhost:11434/v1/chat/completions");
        expect(JSON.parse(init.body).response_format).toEqual({ type: "json_object" });
    });

    it("turns a refusal into a message and redacts the key from errors", async () => {
        const refusal = { choices: [{ message: { content: null, refusal: "no" } }] };
        const p1 = createOpenAiProvider({ apiKey: KEY, model: "m", fetchImpl: async () => response(200, refusal) });
        expect((await p1.generate(request)).json.kind).toBe("message");

        const echo = vi.fn(async () => response(401, { error: { message: `Incorrect API key provided: ${KEY}` } }));
        const err = await createOpenAiProvider({ apiKey: KEY, model: "m", fetchImpl: echo }).generate(request).catch((e) => e);
        expect(err.code).toBe("config");
        expect(err.message).not.toContain(KEY);
        expect(err.message).toContain("••••");
        expect(echo).toHaveBeenCalledTimes(1);
    });

    it("retries 5xx and reports quota after repeated 429s", async () => {
        const flaky = vi.fn()
            .mockResolvedValueOnce(response(503, {}))
            .mockResolvedValueOnce(response(200, chat('{"kind":"nl"}')));
        await expect(createOpenAiProvider({ apiKey: KEY, model: "m", fetchImpl: flaky, sleep: async () => {} }).generate(request))
            .resolves.toMatchObject({ json: { kind: "nl" } });
        const limited = vi.fn(async () => response(429, { error: { message: "Rate limit" } }));
        await expect(createOpenAiProvider({ apiKey: KEY, model: "m", fetchImpl: limited, sleep: async () => {} }).generate(request))
            .rejects.toMatchObject({ code: "quota" });
    });

    it("reports a browser-blocked call (CORS) as unavailable", async () => {
        const blocked = async () => { throw new TypeError("Failed to fetch"); };
        const err = await createOpenAiProvider({ apiKey: KEY, model: "m", fetchImpl: blocked, sleep: async () => {} })
            .generate(request).catch((e) => e);
        expect(err.code).toBe("unavailable");
        expect(err.message).toMatch(/may not allow calls from a browser/);
    });
});

describe("Claude adapter", () => {
    const fakeClient = (impl) => ({ messages: { create: vi.fn(impl) } });

    it("requests structured JSON at low effort with no sampling parameters", async () => {
        const client = fakeClient(async () => ({
            stop_reason: "end_turn",
            content: [{ type: "text", text: '{"kind":"nl","sql":"SELECT 1","display":"table","explanation":"x"}' }],
            usage: {},
        }));
        const controller = new AbortController();
        const r = await createClaudeProvider({ apiKey: KEY, model: "claude-haiku-5-5", client })
            .generate({ ...request, signal: controller.signal });
        expect(r.json.sql).toBe("SELECT 1");

        const [params, options] = client.messages.create.mock.calls[0];
        expect(params).toEqual({
            model: "claude-haiku-5-5",
            max_tokens: 1024,
            system: "sys",
            messages: [{ role: "user", content: "q" }],
            output_config: { effort: "low", format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
        });
        expect(options.signal).toBe(controller.signal);
    });

    it("turns a refusal into a message", async () => {
        const client = fakeClient(async () => ({ stop_reason: "refusal", content: [], usage: {} }));
        const r = await createClaudeProvider({ apiKey: KEY, model: "m", client }).generate(request);
        expect(r.json.kind).toBe("message");
    });

    it("maps SDK errors to our codes and redacts the key", async () => {
        const fail = (err) => createClaudeProvider({ apiKey: KEY, model: "m", client: fakeClient(async () => { throw err; }) })
            .generate(request).catch((e) => e);

        const auth = await fail(new Anthropic.AuthenticationError(401, { error: { message: `invalid x-api-key ${KEY}` } }, "auth", new Headers()));
        expect(auth.code).toBe("config");
        expect(auth.message).not.toContain(KEY);
        expect((await fail(new Anthropic.RateLimitError(429, { error: { message: "slow" } }, "rl", new Headers()))).code).toBe("quota");
        expect((await fail(new Anthropic.InternalServerError(529, { error: { message: "overloaded" } }, "o", new Headers()))).code).toBe("unavailable");
        expect((await fail(new Anthropic.APIUserAbortError())).code).toBe("aborted");
        expect((await fail(new Anthropic.APIConnectionTimeoutError())).message).toMatch(/timed out/);
        expect((await fail(new Anthropic.APIConnectionError({ message: "x" }))).code).toBe("unavailable");
    });
});

describe("Gemini schema conversion", () => {
    it("upper-cases types and drops additionalProperties", () => {
        expect(toGeminiSchema(RESPONSE_SCHEMA)).toEqual({
            type: "OBJECT",
            properties: {
                kind: { type: "STRING", enum: ["nl", "sql", "message"] },
                sql: { type: "STRING" },
                display: { type: "STRING", enum: ["table", "line", "bar", "pie"] },
                explanation: { type: "STRING" },
            },
            required: ["kind", "sql", "display", "explanation"],
        });
    });
});

describe("provider registry", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("has the four providers with the agreed defaults", () => {
        expect(Object.keys(PROVIDERS)).toEqual(["gemini", "claude", "openai", "openai-compatible"]);
        expect(PROVIDERS.gemini.defaultModel).toBe("gemini-3.1-flash-lite");
        expect(PROVIDERS.claude.defaultModel).toBe("claude-haiku-5-5");
        expect(PROVIDERS.openai.defaultModel).toBe("gpt-6-luna");
        for (const id of ["gemini", "claude", "openai"]) {
            expect(PROVIDERS[id].models.map((m) => m.id)).toContain(PROVIDERS[id].defaultModel);
        }
        expect(PROVIDERS["openai-compatible"].models).toBeUndefined();
        expect(PROVIDERS["openai-compatible"].needsBaseUrl).toBe(true);
    });

    it("loads the adapter on the first call and keeps the key inside it", async () => {
        const fetchMock = vi.fn(async () => response(200, { candidates: [{ content: { parts: [{ text: '{"kind":"message"}' }] } }] }));
        vi.stubGlobal("fetch", fetchMock);
        const p = createLazyProvider({ provider: "gemini", apiKey: KEY, model: "gemini-3.1-flash-lite", baseUrl: "" });
        expect(p).toMatchObject({ model: "gemini-3.1-flash-lite" });
        expect(JSON.stringify(p)).not.toContain(KEY);
        expect(fetchMock).not.toHaveBeenCalled();
        await p.generate(request);
        expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe(KEY);
    });
});

describe("redactSecret", () => {
    it("replaces every occurrence and ignores trivially short secrets", () => {
        expect(redactSecret(`a ${KEY} b ${KEY}`, KEY)).toBe("a •••• b ••••");
        expect(redactSecret("abc", "ab")).toBe("abc");
        expect(redactSecret(undefined, KEY)).toBe("");
    });
});

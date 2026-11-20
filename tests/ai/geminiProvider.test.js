import { describe, it, expect, vi } from "vitest";
import { createGeminiProvider } from "../../src/ai/providers/geminiProvider";
import { retryAfterMs, defaultSleep } from "../../src/ai/providers/http";

const okBody = (obj) => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 10 },
});

const response = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
});

const make = (fetchImpl) => createGeminiProvider({
    apiKey: "secret-key", model: "gemini-3.1-flash-lite", fetchImpl, sleep: async () => {},
});

const request = { system: "sys", user: "q", responseSchema: { type: "OBJECT" } };

describe("geminiProvider", () => {
    it("sends the key in a header and parses the JSON answer", async () => {
        const fetchImpl = vi.fn(async () => response(200, okBody({ kind: "nl", sql: "SELECT 1" })));
        const r = await make(fetchImpl).generate(request);
        expect(r.json).toEqual({ kind: "nl", sql: "SELECT 1" });

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
        expect(url).not.toContain("secret-key");
        expect(init.headers["x-goog-api-key"]).toBe("secret-key");
        const body = JSON.parse(init.body);
        expect(body.generationConfig).toMatchObject({
            responseMimeType: "application/json",
            responseSchema: { type: "OBJECT" },
            thinkingConfig: { thinkingLevel: "minimal" },
        });
        expect(body.system_instruction.parts[0].text).toBe("sys");
    });

    it("skips thought parts", async () => {
        const body = { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"kind":"message"}' }] } }] };
        const r = await make(async () => response(200, body)).generate(request);
        expect(r.json).toEqual({ kind: "message" });
    });

    it("retries 503 and succeeds", async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(response(503, { error: { message: "high demand" } }))
            .mockResolvedValueOnce(response(200, okBody({ kind: "nl" })));
        await expect(make(fetchImpl).generate(request)).resolves.toMatchObject({ json: { kind: "nl" } });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("reports quota after repeated 429s", async () => {
        const fetchImpl = vi.fn(async () => response(429, { error: { message: "Resource exhausted" } }));
        await expect(make(fetchImpl).generate(request)).rejects.toMatchObject({ code: "quota" });
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it("retries once with thinking level low when a model has no minimal level, then keeps it", async () => {
        const levels = [];
        const fetchImpl = vi.fn(async (_url, init) => {
            const level = JSON.parse(init.body).generationConfig.thinkingConfig.thinkingLevel;
            levels.push(level);
            return level === "minimal"
                ? response(400, { error: { message: "Thinking level MINIMAL is not supported for this model." } })
                : response(200, okBody({ kind: "nl" }));
        });
        const provider = make(fetchImpl);
        await expect(provider.generate(request)).resolves.toMatchObject({ json: { kind: "nl" } });
        await provider.generate(request);
        expect(levels).toEqual(["minimal", "low", "low"]);
    });

    it("the default sleep removes its abort listener when it finishes", async () => {
        const controller = new AbortController();
        const add = vi.spyOn(controller.signal, "addEventListener");
        const remove = vi.spyOn(controller.signal, "removeEventListener");
        await defaultSleep(1, controller.signal);
        expect(add).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    });

    it("waits as long as the provider's Retry-After says (capped)", async () => {
        const waits = [];
        const busy = { ...response(503, {}), headers: { get: (h) => (h === "retry-after" ? "2" : null) } };
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(busy)
            .mockResolvedValueOnce(response(200, okBody({ kind: "nl" })));
        const provider = createGeminiProvider({ apiKey: "k-123456", model: "m", fetchImpl, sleep: async (ms) => { waits.push(ms); } });
        await provider.generate(request);
        expect(waits).toEqual([2000]);
        expect(retryAfterMs({ headers: { get: () => "999" } })).toBe(10000);
        expect(retryAfterMs({ headers: { get: () => null } })).toBeNull();
    });

    it("gives up after two timeouts instead of waiting for every retry", async () => {
        const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
        }));
        const provider = createGeminiProvider({ apiKey: "k-123456", model: "m", fetchImpl, timeoutMs: 5, sleep: async () => {} });
        await expect(provider.generate(request)).rejects.toMatchObject({ code: "unavailable" });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("does not retry a configuration error and never echoes the key", async () => {
        const fetchImpl = vi.fn(async () => response(400, { error: { message: "API key not valid" } }));
        const err = await make(fetchImpl).generate(request).catch((e) => e);
        expect(err.code).toBe("config");
        expect(err.message).not.toContain("secret-key");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("maps network failures to unavailable and honours abort", async () => {
        await expect(make(async () => { throw new TypeError("fetch failed"); }).generate(request))
            .rejects.toMatchObject({ code: "unavailable" });

        const controller = new AbortController();
        controller.abort();
        await expect(make(vi.fn()).generate({ ...request, signal: controller.signal }))
            .rejects.toMatchObject({ code: "aborted" });
    });

    it("rejects non-JSON or empty answers", async () => {
        const notJson = { candidates: [{ content: { parts: [{ text: "SELECT 1" }] } }] };
        await expect(make(async () => response(200, notJson)).generate(request)).rejects.toMatchObject({ code: "bad_response" });
        await expect(make(async () => response(200, { candidates: [{ finishReason: "SAFETY" }] })).generate(request))
            .rejects.toThrow(/SAFETY/);
    });
});

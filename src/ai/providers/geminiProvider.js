/**
 * Google Gemini adapter: plain fetch, no SDK.
 *
 * - key in the x-goog-api-key header (never in the URL)
 * - JSON answer enforced with responseMimeType + responseSchema
 * - minimal thinking level for low latency (~1.5 s measured); models that don't
 *   offer "minimal" (e.g. gemini-3.8-flash) are retried once with "low", and that
 *   level is remembered for the rest of the session
 */
import { AiError } from "../errors";
import { postJsonWithRetry, parseJsonAnswer } from "./http";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Gemini's responseSchema uses OpenAPI-style upper-case types and no additionalProperties. */
export function toGeminiSchema(schema) {
    if (Array.isArray(schema)) return schema.map(toGeminiSchema);
    if (!schema || typeof schema !== "object") return schema;
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
        if (k === "additionalProperties") continue;
        if (k === "type" && typeof v === "string") out.type = v.toUpperCase();
        else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, toGeminiSchema(s)]));
        else out[k] = toGeminiSchema(v);
    }
    return out;
}

function extractText(data) {
    const candidate = data?.candidates?.[0];
    const text = (candidate?.content?.parts || [])
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
    if (!text) {
        const reason = candidate?.finishReason || data?.promptFeedback?.blockReason || "empty answer";
        throw new AiError("bad_response", `Gemini returned no answer (${reason}).`);
    }
    return text;
}

export function createGeminiProvider({ apiKey, model, fetchImpl, timeoutMs, maxRetries, sleep }) {
    const url = `${BASE_URL}/${encodeURIComponent(model)}:generateContent`;
    let thinkingLevel = "minimal";

    async function generate({ system, user, responseSchema, signal }) {
        const started = Date.now();
        const send = () => postJsonWithRetry({
            label: "Gemini", url, secret: apiKey, signal, fetchImpl, timeoutMs, maxRetries, sleep,
            headers: { "x-goog-api-key": apiKey },
            body: {
                system_instruction: { parts: [{ text: system }] },
                contents: [{ role: "user", parts: [{ text: user }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024,
                    thinkingConfig: { thinkingLevel },
                    responseMimeType: "application/json",
                    responseSchema: toGeminiSchema(responseSchema),
                },
            },
        });
        let data;
        try {
            data = await send();
        } catch (err) {
            if (thinkingLevel !== "minimal" || err?.code !== "config" || !/thinking level/i.test(err.message)) throw err;
            thinkingLevel = "low";
            data = await send();
        }
        return { json: parseJsonAnswer(extractText(data), "Gemini"), usage: data.usageMetadata || null, ms: Date.now() - started };
    }

    return { name: "gemini", model, generate };
}

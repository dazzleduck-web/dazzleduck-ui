/**
 * OpenAI and OpenAI-compatible adapter (Chat Completions over plain fetch).
 *
 * - key in the Authorization: Bearer header
 * - OpenAI: strict JSON-schema answer (response_format json_schema)
 * - compatible services (Groq, OpenRouter, Ollama, …): JSON mode (json_object),
 *   which is more widely supported; the system prompt describes the shape
 */
import { AiError } from "../errors";
import { postJsonWithRetry, parseJsonAnswer } from "./http";
import { REFUSAL_ANSWER } from "../prompts";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export function createOpenAiProvider({
    apiKey, model, baseUrl = OPENAI_BASE_URL, compatible = false,
    fetchImpl, timeoutMs, maxRetries, sleep,
}) {
    const label = compatible ? "the OpenAI-compatible service" : "OpenAI";
    const url = `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;

    async function generate({ system, user, responseSchema, signal }) {
        const started = Date.now();
        const body = {
            model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            response_format: compatible
                ? { type: "json_object" }
                : { type: "json_schema", json_schema: { name: "generate_query", schema: responseSchema, strict: true } },
            ...(compatible ? { max_tokens: 1024 } : { max_completion_tokens: 1024 }),
        };

        const data = await postJsonWithRetry({
            label: compatible ? "OpenAI-compatible service" : "OpenAI",
            url, secret: apiKey, signal, fetchImpl, timeoutMs, maxRetries, sleep,
            headers: { Authorization: `Bearer ${apiKey}` },
            body,
        });

        const message = data?.choices?.[0]?.message;
        if (message?.refusal) {
            return { json: { ...REFUSAL_ANSWER }, usage: data.usage || null, ms: Date.now() - started };
        }
        if (!message?.content) {
            throw new AiError("bad_response", `${label} returned no answer (${data?.choices?.[0]?.finish_reason || "empty"}).`);
        }
        return { json: parseJsonAnswer(message.content, label), usage: data.usage || null, ms: Date.now() - started };
    }

    return { name: compatible ? "openai-compatible" : "openai", model, generate };
}

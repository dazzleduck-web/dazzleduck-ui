/**
 * Anthropic Claude adapter, using the official @anthropic-ai/sdk.
 * This module (and the SDK) is only loaded when Claude is the selected provider.
 *
 * - browser use is enabled explicitly (bring-your-own-key: the user's own key)
 * - JSON answer enforced with structured outputs (output_config.format json_schema)
 * - low effort for speed; no sampling parameters (rejected on current models)
 * - a `refusal` stop reason becomes a message, nothing runs
 */
import Anthropic from "@anthropic-ai/sdk";
import { AiError, redactSecret } from "../errors";
import { parseJsonAnswer, aiErrorForStatus } from "./http";
import { REFUSAL_ANSWER } from "../prompts";

function mapError(err, apiKey) {
    if (err instanceof Anthropic.APIUserAbortError) return new AiError("aborted", "Cancelled.");
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
        return new AiError("unavailable", "Claude timed out. Try again, or enter SQL.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
        return new AiError("unavailable", "Could not reach Claude. Check the network, or enter SQL.");
    }
    if (err instanceof Anthropic.APIError) {
        const detail = redactSecret(err.error?.error?.message || err.message, apiKey);
        return aiErrorForStatus("Claude", err.status, detail);
    }
    return new AiError("unavailable", redactSecret(err?.message || "Claude request failed.", apiKey));
}

export function createClaudeProvider({ apiKey, model, client: injectedClient, timeoutMs = 15000, maxRetries = 3 }) {
    const client = injectedClient || new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        timeout: timeoutMs,
        maxRetries,
    });

    async function generate({ system, user, responseSchema, signal }) {
        const started = Date.now();
        let response;
        try {
            response = await client.messages.create({
                model,
                max_tokens: 1024,
                system,
                messages: [{ role: "user", content: user }],
                output_config: {
                    effort: "low",
                    format: { type: "json_schema", schema: responseSchema },
                },
            }, { signal });
        } catch (err) {
            throw mapError(err, apiKey);
        }

        if (response.stop_reason === "refusal") {
            return { json: { ...REFUSAL_ANSWER }, usage: response.usage || null, ms: Date.now() - started };
        }
        const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
        return { json: parseJsonAnswer(text, "Claude"), usage: response.usage || null, ms: Date.now() - started };
    }

    return { name: "claude", model, generate };
}

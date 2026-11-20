/**
 * Error raised by the AI query assistant.
 *
 * `code` tells the UI what happened:
 *  - not_configured  AI off (no key) or incomplete settings
 *  - config          provider rejected the key/model (HTTP 400/401/403/404)
 *  - quota           provider quota or rate limit (HTTP 429 after retries)
 *  - unavailable     provider down / overloaded / network error / timeout / blocked by CORS
 *  - aborted         user cancelled
 *  - bad_response    provider answered with something we can't use
 *  - invalid_sql     generated SQL kept failing the checks
 */
export class AiError extends Error {
    constructor(code, message, extra = {}) {
        super(message);
        this.name = "AiError";
        this.code = code;
        Object.assign(this, extra);
    }
}

export const isAbortError = (err) =>
    err?.name === "AbortError" || err?.code === "aborted";

/**
 * Remove a secret from any text before it is shown or stored (security layer 1).
 * Provider error messages normally never contain the key; this is a safety net.
 */
export function redactSecret(text, secret) {
    const s = String(text ?? "");
    if (!secret || secret.length < 6) return s;
    return s.split(secret).join("••••");
}

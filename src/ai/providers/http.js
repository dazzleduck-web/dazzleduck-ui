/**
 * Shared fetch-with-retry for the fetch-based provider adapters (Gemini, OpenAI,
 * OpenAI-compatible): per-attempt timeout, caller abort, retries on 429/5xx/network
 * with jittered backoff (or the server's Retry-After), and errors mapped to AiError
 * codes with the key redacted. Busy providers (429/5xx) get up to 3 retries; timeouts
 * only one, so a hung provider doesn't keep the user waiting for a minute.
 */
import { AiError, redactSecret } from "../errors";

export const defaultSleep = (ms, signal) =>
    new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(t);
            reject(new AiError("aborted", "Cancelled."));
        };
        const t = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort); // don't leave a listener per retry
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });

const backoffMs = (attempt) => 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400);
const MAX_RETRY_AFTER_MS = 10000;
const MAX_TIMEOUTS = 2;

/** Retry-After header (seconds or HTTP date) in ms, capped; null when absent. */
export function retryAfterMs(res, now = Date.now()) {
    const value = res?.headers?.get?.("retry-after");
    if (!value) return null;
    const secs = Number(value);
    const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(value) - now;
    return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : null;
}

async function readErrorMessage(res) {
    try {
        const body = await res.json();
        const e = body?.error;
        return (typeof e === "string" ? e : e?.message) || body?.message || res.statusText || `HTTP ${res.status}`;
    } catch {
        return res.statusText || `HTTP ${res.status}`;
    }
}

/** The AiError for a provider's HTTP error status (same codes and wording for every provider). */
export function aiErrorForStatus(label, status, detail) {
    if (status === 429) {
        return new AiError("quota", `AI quota or rate limit reached for your ${label} key. Try again later, or enter SQL.`, { detail });
    }
    if (status >= 500) {
        return new AiError("unavailable", `${label} is busy or unavailable. Try again in a moment, or enter SQL.`, { detail });
    }
    return new AiError("config", `AI configuration error (${label}, HTTP ${status}): ${detail}`, { detail });
}

/**
 * POST JSON and return the parsed JSON response.
 * @param {object} p
 * @param {string} p.label        provider name for messages, e.g. "Gemini"
 * @param {string} p.url
 * @param {object} p.headers      including the auth header
 * @param {object} p.body
 * @param {string} p.secret       the API key, redacted from any error text
 */
export async function postJsonWithRetry({
    label, url, headers, body, secret, signal,
    fetchImpl = (...args) => fetch(...args),
    timeoutMs = 15000, maxRetries = 3, sleep = defaultSleep,
}) {
    const payload = JSON.stringify(body);
    let lastError = new AiError("unavailable", `${label} is unavailable.`);
    let waitMs = null;
    let timeouts = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) throw new AiError("aborted", "Cancelled.");
        if (attempt > 0) await sleep(waitMs ?? backoffMs(attempt), signal);
        waitMs = null;

        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let res;
        try {
            res = await fetchImpl(url, {
                method: "POST",
                headers: { "content-type": "application/json", ...headers },
                body: payload,
                signal: controller.signal,
                referrerPolicy: "no-referrer",
            });
        } catch {
            if (signal?.aborted) throw new AiError("aborted", "Cancelled.");
            const timedOut = controller.signal.aborted;
            lastError = new AiError("unavailable", timedOut
                ? `${label} timed out. Try again, or enter SQL.`
                : `Could not reach ${label}. Check the network, or the provider may not allow calls from a browser.`);
            if (timedOut && ++timeouts >= MAX_TIMEOUTS) break;
            continue;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        }

        if (res.ok) return res.json();

        const detail = redactSecret(await readErrorMessage(res), secret);
        waitMs = retryAfterMs(res);
        const error = aiErrorForStatus(label, res.status, detail);
        if (error.code === "config") throw error;
        lastError = error; // 429 / 5xx: retry
    }
    throw lastError;
}

/** Parse a JSON answer, tolerating ```json fences some models add. */
export function parseJsonAnswer(text, label) {
    const cleaned = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (!cleaned) throw new AiError("bad_response", `${label} returned an empty answer.`);
    try {
        return JSON.parse(cleaned);
    } catch {
        throw new AiError("bad_response", `${label} did not return valid JSON.`);
    }
}

/**
 * The user's AI settings (bring-your-own-key).
 *
 * Stored ONLY in this tab's sessionStorage: survives a reload, gone when the tab
 * closes, never in localStorage, cookies, session files or requests to the
 * DazzleDuck server. A new tab starts without a key.
 */
import { PROVIDERS, DEFAULT_PROVIDER } from "./providers/registry";

export const STORAGE_KEY = "dazzleduck-ui.ai";

export const DEFAULT_SETTINGS = Object.freeze({
    provider: DEFAULT_PROVIDER,
    model: PROVIDERS[DEFAULT_PROVIDER].defaultModel,
    baseUrl: "",
    apiKey: "",
});

const sessionStore = () => {
    try {
        return typeof window !== "undefined" ? window.sessionStorage : null;
    } catch {
        return null; // storage blocked
    }
};

const sanitize = (raw) => {
    const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
    if (!PROVIDERS[s.provider]) return { ...DEFAULT_SETTINGS };
    return {
        provider: s.provider,
        model: String(s.model ?? ""),
        baseUrl: String(s.baseUrl ?? ""),
        apiKey: String(s.apiKey ?? ""),
    };
};

export function loadAiSettings(storage = sessionStore()) {
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        return raw ? sanitize(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveAiSettings(settings, storage = sessionStore()) {
    try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(sanitize(settings)));
    } catch {
        /* storage full or blocked: settings still work for this page view */
    }
}

/** Apply a change; switching provider swaps in that provider's default model and drops the base URL. */
export function applySettingsChange(prev, patch) {
    const next = { ...prev, ...patch };
    if (patch.provider && patch.provider !== prev.provider) {
        if (patch.model === undefined) next.model = PROVIDERS[patch.provider]?.defaultModel ?? "";
        if (!PROVIDERS[patch.provider]?.needsBaseUrl) next.baseUrl = "";
    }
    return sanitize(next);
}

const isLocalHost = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

/** null when valid; otherwise the reason. HTTPS required except for localhost. */
export function validateBaseUrl(url) {
    const value = String(url ?? "").trim();
    if (!value) return "Enter the service's base URL, e.g. https://api.example.com/v1";
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return "Enter a full URL, e.g. https://api.example.com/v1";
    }
    if (parsed.protocol === "https:") return null;
    if (parsed.protocol === "http:" && isLocalHost(parsed.hostname)) return null;
    return "Use an https:// address (plain http is only allowed for localhost).";
}

/** Reason the settings can't be used yet, or null when AI can run. */
export function settingsProblem(settings) {
    if (!settings.apiKey.trim()) return "no_key";
    if (!settings.model.trim()) return "Enter a model ID.";
    if (PROVIDERS[settings.provider]?.needsBaseUrl) return validateBaseUrl(settings.baseUrl);
    return null;
}

/** True when the app itself is served over plain http from a non-local host (security layer 3). */
export function isInsecurePage(loc = typeof window !== "undefined" ? window.location : null) {
    if (!loc) return false;
    return loc.protocol === "http:" && !isLocalHost(loc.hostname);
}

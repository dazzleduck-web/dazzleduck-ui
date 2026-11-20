/**
 * Build-time AI configuration. Holds NO key: users enter their own key in
 * Connection Settings (see aiSettings.js).
 *
 * Values are passed in from the app entry (src/main.jsx), the only place that
 * reads import.meta.env.
 */
export const DEFAULT_LIMIT = 1000;

export function normalizeAiConfig(raw = {}) {
    // The AI section is available unless explicitly switched off (VITE_AI_ENABLED=false).
    const flag = String(raw.enabled ?? "").trim().toLowerCase();
    const limit = parseInt(raw.defaultLimit, 10);
    return {
        available: flag !== "false",
        defaultLimit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
    };
}

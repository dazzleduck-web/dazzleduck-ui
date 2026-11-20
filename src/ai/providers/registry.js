/**
 * Supported AI providers. Each adapter is loaded on demand (dynamic import), so
 * users without a key load no AI code, and the Claude SDK is only fetched when
 * Claude is selected.
 *
 * `models` fills the Model dropdown (an "Other…" choice allows any ID).
 * Gemini: checked live on 2026-11-20 with a free key (only the Flash-Lite models
 * answered reliably; 2.5 models are closed to new keys, Pro is not in the free tier).
 * Claude: current Claude model IDs. OpenAI: from OpenAI's model docs, not yet checked
 * live. OpenAI-compatible has no list: model IDs depend on the service.
 */
export const PROVIDERS = {
    gemini: {
        id: "gemini",
        label: "Google Gemini",
        defaultModel: "gemini-3.1-flash-lite",
        models: [
            { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (fast, free tier)" },
            { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
            { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (latest)" },
        ],
        keyPlaceholder: "Google AI Studio API key",
        load: () => import("./geminiProvider").then((m) => m.createGeminiProvider),
    },
    claude: {
        id: "claude",
        label: "Anthropic Claude",
        defaultModel: "claude-haiku-5-5",
        models: [
            { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fast, low cost)" },
            { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
            { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
        ],
        keyPlaceholder: "Claude Console API key",
        load: () => import("./claudeProvider").then((m) => m.createClaudeProvider),
    },
    openai: {
        id: "openai",
        label: "OpenAI",
        defaultModel: "gpt-6-luna",
        models: [
            { id: "gpt-6-luna", label: "GPT-6 Luna (fast, low cost)" },
            { id: "gpt-6.1-terra", label: "GPT-6.1 Terra" },
            { id: "gpt-6.2-sol", label: "GPT-6.2 Sol" },
        ],
        keyPlaceholder: "OpenAI API key",
        load: () => import("./openaiProvider").then((m) => (opts) => m.createOpenAiProvider(opts)),
    },
    "openai-compatible": {
        id: "openai-compatible",
        label: "OpenAI-compatible",
        defaultModel: "",
        modelPlaceholder: "Model ID offered by the service",
        keyPlaceholder: "API key for the service",
        needsBaseUrl: true,
        load: () => import("./openaiProvider").then((m) => (opts) => m.createOpenAiProvider({ ...opts, compatible: true })),
    },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);
export const DEFAULT_PROVIDER = "gemini";

/**
 * A provider object whose adapter is loaded on the first generate() call.
 * The API key stays inside this closure; nothing else in the app reads it.
 */
export function createLazyProvider({ provider, apiKey, model, baseUrl }) {
    const def = PROVIDERS[provider];
    if (!def) throw new Error(`Unknown AI provider: ${provider}`);
    let instance = null;
    return {
        model,
        async generate(request) {
            if (!instance) {
                const create = await def.load();
                instance = create({ apiKey, model, ...(def.needsBaseUrl ? { baseUrl } : {}) });
            }
            return instance.generate(request);
        },
    };
}

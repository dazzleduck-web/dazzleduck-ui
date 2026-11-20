/** "gemini-3.1-flash-lite · 1.4 s · 2 tries" for an AI run (see aiInfoOf in useQueryManagement). */
export const aiDetails = (ai) => [
    ai?.model,
    ai?.reused ? "reused from last run" : ai?.ms != null ? `${(ai.ms / 1000).toFixed(1)} s` : null,
    ai?.attempts > 1 ? `${ai.attempts} tries` : null,
].filter(Boolean).join(" · ");

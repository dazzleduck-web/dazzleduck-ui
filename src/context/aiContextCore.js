import { createContext, useContext } from "react";

/**
 * Kept separate from AiContext.jsx so components (and the npm library build)
 * can call useAi() without pulling in the provider adapters or settings code.
 * Without an <AiProvider>, AI is simply unavailable.
 */
export const AiContext = createContext(null);

const noop = () => {};

export const DISABLED_AI = Object.freeze({
    available: false,     // the AI section is shown at all
    enabled: false,       // a usable key + model are set
    model: null,
    settings: null,       // { provider, model, baseUrl, hasKey } — never the key itself
    problem: null,
    updateSettings: noop,
    setApiKey: noop,
    resolve: null,
    repair: null,
});

export const useAi = () => useContext(AiContext) || DISABLED_AI;

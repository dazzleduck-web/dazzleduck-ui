import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiContext } from "./aiContextCore";
import { useQueryDashboard } from "./QueryDashboardContext";
import { normalizeAiConfig } from "../ai/config";
import { loadAiSettings, saveAiSettings, applySettingsChange, settingsProblem } from "../ai/aiSettings";
import { createLazyProvider } from "../ai/providers/registry";
import { serializeProvider } from "../ai/providers/serializeProvider";
import { createSchemaContext } from "../ai/schemaContext";
import { createAiPipeline } from "../ai/aiQueryPipeline";

/**
 * Provides the AI query assistant (bring-your-own-key).
 *
 * - `config` (from src/main.jsx): { enabled, defaultLimit }. Holds no key.
 * - The user's provider, model, base URL and key live in this tab's sessionStorage.
 * - The key is passed only into the provider adapter. The context value exposes
 *   `settings.hasKey`, never the key itself.
 *
 * Must be rendered inside <QueryDashboardProvider>.
 */
export default function AiProvider({ config, provider: providerOverride, storage, children }) {
    const { executeMetaQuery, connectionInfo } = useQueryDashboard();
    const cfg = useMemo(() => normalizeAiConfig(config), [config]);

    const [settings, setSettings] = useState(() => loadAiSettings(storage));

    const change = useCallback((patch) => {
        setSettings((prev) => {
            const next = applySettingsChange(prev, patch);
            saveAiSettings(next, storage);
            return next;
        });
    }, [storage]);

    const updateSettings = useCallback(({ provider, model, baseUrl }) => {
        const patch = {};
        if (provider !== undefined) patch.provider = provider;
        if (model !== undefined) patch.model = model;
        if (baseUrl !== undefined) patch.baseUrl = baseUrl;
        change(patch);
    }, [change]);
    const setApiKey = useCallback((apiKey) => change({ apiKey: String(apiKey ?? "").trim() }), [change]);
    const clearKey = useCallback(() => change({ apiKey: "" }), [change]);

    const problem = providerOverride ? null : settingsProblem(settings);

    const provider = useMemo(() => {
        if (!cfg.available) return null;
        if (providerOverride) return serializeProvider(providerOverride);
        if (problem) return null;
        return serializeProvider(createLazyProvider(settings));
    }, [cfg.available, providerOverride, problem, settings]);

    // Schema cache lives for one connection; drop it on login/logout/server change.
    const schemaRef = useRef(null);
    const connectionKey = connectionInfo
        ? `${connectionInfo.serverUrl}|${connectionInfo.username}|${connectionInfo.loginTime}`
        : "";
    useEffect(() => {
        schemaRef.current = null;
    }, [connectionKey]);

    // The key never outlives the DazzleDuck session: clear it whenever a connection
    // ends — the Logout button, or an automatic logout when the token is missing or expired.
    const wasConnected = useRef(Boolean(connectionInfo));
    useEffect(() => {
        if (wasConnected.current && !connectionInfo) clearKey();
        wasConnected.current = Boolean(connectionInfo);
    }, [connectionInfo, clearKey]);

    const value = useMemo(() => {
        const pipelineFor = (serverUrl) => {
            const runMeta = (sql) => executeMetaQuery(serverUrl, sql);
            if (!schemaRef.current || schemaRef.current.serverUrl !== serverUrl) {
                schemaRef.current = { serverUrl, context: createSchemaContext({ runMeta }) };
            }
            return createAiPipeline({
                provider,
                runMeta,
                schemaContext: schemaRef.current.context,
                defaultLimit: cfg.defaultLimit,
            });
        };
        const enabled = Boolean(provider);
        return {
            available: cfg.available,
            enabled,
            model: provider?.model ?? (settings.model || null),
            settings: {
                provider: settings.provider,
                model: settings.model,
                baseUrl: settings.baseUrl,
                hasKey: settings.apiKey.length > 0,
            },
            problem: problem === "no_key" ? null : problem,
            updateSettings,
            setApiKey,
            resolve: enabled ? (serverUrl, args) => pipelineFor(serverUrl).resolve(args) : null,
            repair: enabled ? (serverUrl, args) => pipelineFor(serverUrl).repair(args) : null,
        };
    }, [cfg, provider, settings, problem, updateSettings, setApiKey, executeMetaQuery]);

    return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}

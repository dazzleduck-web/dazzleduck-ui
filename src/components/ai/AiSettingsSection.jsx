import React, { useEffect, useState } from "react";
import { HiOutlineChevronDown, HiOutlineChevronUp, HiOutlineSparkles } from "react-icons/hi";
import { FaRegEye, FaEyeSlash } from "react-icons/fa";
import { useAi } from "../../context/aiContextCore";
import { PROVIDERS, PROVIDER_IDS } from "../../ai/providers/registry";
import { isInsecurePage, validateBaseUrl } from "../../ai/aiSettings";

/**
 * "AI Assistant (optional)" block in Connection Settings: provider, the user's own
 * API key, model and (for OpenAI-compatible) base URL.
 *
 * Part of the connection: set it before Connect; it is locked while connected
 * (log out to change it; logout also clears the key).
 * Lives OUTSIDE the connection <form> so password managers don't capture the key
 * with the DazzleDuck login. The key typed here goes straight into the AI context;
 * it is never read back.
 */
const OTHER_MODEL = "__other__";

const AiSettingsSection = ({ isConnected = false }) => {
    const ai = useAi();
    const [open, setOpen] = useState(false);
    const [keyDraft, setKeyDraft] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [insecureAck, setInsecureAck] = useState(false);
    const [customModel, setCustomModel] = useState(false);

    // Key cleared elsewhere (e.g. on logout): drop what's still typed in the field.
    const hasKeyNow = Boolean(ai.settings?.hasKey);
    useEffect(() => {
        if (!hasKeyNow) {
            setKeyDraft("");
            setShowKey(false);
        }
    }, [hasKeyNow]);

    if (!ai.available) return null;

    const { provider, model, baseUrl, hasKey } = ai.settings;
    const def = PROVIDERS[provider];
    const insecure = isInsecurePage();
    const locked = isConnected;
    const keyLocked = locked || (insecure && !insecureAck);
    const baseUrlError = def.needsBaseUrl && baseUrl ? validateBaseUrl(baseUrl) : null;
    const models = def.models || [];
    // "Other…" is shown when chosen, or when the saved model isn't in the list
    const showCustomModel = models.length > 0 && (customModel || !models.some((m) => m.id === model));

    const onModelSelect = (value) => {
        if (value === OTHER_MODEL) {
            setCustomModel(true);
            ai.updateSettings({ model: "" });
        } else {
            setCustomModel(false);
            ai.updateSettings({ model: value });
        }
    };

    const status = ai.enabled ? "AI on" : hasKey ? "Incomplete" : "AI off";
    const statusTitle = ai.enabled ? `${def.label} · ${ai.model}` : undefined;

    const onKeyChange = (value) => {
        setKeyDraft(value);
        ai.setApiKey(value);
    };

    const inputClass = "w-full border border-gray-400 rounded-lg py-1 px-2 text-sm disabled:bg-gray-100 disabled:text-gray-500";

    return (
        <section className="mt-4 border-t border-gray-300 pt-3" aria-label="AI Assistant settings">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 cursor-pointer"
                aria-expanded={open}
                aria-controls="ai-settings-body"
            >
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <HiOutlineSparkles className="text-amber-600" /> AI Assistant (optional)
                </span>
                <span className="flex items-center gap-2">
                    <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${ai.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                        data-testid="ai-status"
                        title={statusTitle}
                    >
                        {status}
                    </span>
                    {open ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                </span>
            </button>

            {open && (
                <div id="ai-settings-body" className="mt-2 space-y-2">
                    {insecure && !locked && (
                        <label className="flex items-center gap-2 text-xs text-red-700" role="alert">
                            <input
                                id="ai-insecure-ack"
                                type="checkbox"
                                checked={insecureAck}
                                onChange={(e) => setInsecureAck(e.target.checked)}
                            />
                            Page is not HTTPS: a key could be read on the network. Enter anyway
                        </label>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label htmlFor="ai-provider" className="block text-xs font-medium text-gray-700 mb-0.5">Provider</label>
                            <select
                                id="ai-provider"
                                value={provider}
                                onChange={(e) => {
                                    setCustomModel(false);
                                    ai.updateSettings({ provider: e.target.value });
                                }}
                                disabled={locked}
                                className={`${inputClass} bg-white`}
                            >
                                {PROVIDER_IDS.map((id) => (
                                    <option key={id} value={id}>{PROVIDERS[id].label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="ai-model" className="block text-xs font-medium text-gray-700 mb-0.5">Model</label>
                            {models.length > 0 ? (
                                <select
                                    id="ai-model"
                                    value={showCustomModel ? OTHER_MODEL : model}
                                    onChange={(e) => onModelSelect(e.target.value)}
                                    disabled={locked}
                                    className={`${inputClass} bg-white`}
                                >
                                    {models.map((m) => (
                                        <option key={m.id} value={m.id} title={m.id}>{m.label}</option>
                                    ))}
                                    <option value={OTHER_MODEL}>Other…</option>
                                </select>
                            ) : (
                                <input
                                    id="ai-model"
                                    type="text"
                                    value={model}
                                    onChange={(e) => ai.updateSettings({ model: e.target.value })}
                                    placeholder={def.modelPlaceholder}
                                    disabled={locked}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className={`${inputClass} font-mono`}
                                />
                            )}
                        </div>
                    </div>

                    {showCustomModel && (
                        <input
                            id="ai-model-custom"
                            aria-label="Model ID"
                            type="text"
                            value={model}
                            onChange={(e) => ai.updateSettings({ model: e.target.value })}
                            placeholder="Model ID"
                            disabled={locked}
                            autoComplete="off"
                            spellCheck={false}
                            className={`${inputClass} font-mono`}
                        />
                    )}

                    <div>
                        <label htmlFor="ai-api-key" className="block text-xs font-medium text-gray-700 mb-0.5">API key</label>
                        <div className="relative">
                            <input
                                id="ai-api-key"
                                name="ai-api-key"
                                type={showKey ? "text" : "password"}
                                value={keyDraft}
                                onChange={(e) => onKeyChange(e.target.value)}
                                placeholder={def.keyPlaceholder}
                                disabled={keyLocked}
                                autoComplete="off"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                title={`Kept only in memory: cleared on logout or reload. Only questions and table/column names are sent to ${def.label}, never query results.`}
                                className={`${inputClass} pr-8 font-mono`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey((v) => !v)}
                                disabled={!keyDraft || locked}
                                className="absolute top-1.5 right-2 text-gray-500 hover:text-gray-700 disabled:opacity-40"
                                aria-label={showKey ? "Hide key" : "Show key"}
                            >
                                {showKey ? <FaEyeSlash /> : <FaRegEye />}
                            </button>
                        </div>
                    </div>

                    {def.needsBaseUrl && (
                        <div>
                            <label htmlFor="ai-base-url" className="block text-xs font-medium text-gray-700 mb-0.5">Base URL</label>
                            <input
                                id="ai-base-url"
                                type="url"
                                value={baseUrl}
                                onChange={(e) => ai.updateSettings({ baseUrl: e.target.value })}
                                placeholder="https://api.example.com/v1"
                                disabled={locked}
                                autoComplete="off"
                                spellCheck={false}
                                className={`${inputClass} font-mono`}
                            />
                            {baseUrlError && <p className="text-xs text-red-600 mt-0.5">{baseUrlError}</p>}
                        </div>
                    )}

                    {ai.problem && hasKey && !baseUrlError && (
                        <p className="text-xs text-red-600">{ai.problem}</p>
                    )}

                    {locked && (
                        <p className="text-xs text-gray-500" data-testid="ai-locked">Log out to change AI settings.</p>
                    )}
                </div>
            )}
        </section>
    );
};

export default AiSettingsSection;

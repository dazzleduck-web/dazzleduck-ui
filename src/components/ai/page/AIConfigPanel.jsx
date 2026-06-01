import React, { useState, useEffect, useRef } from "react";
import { useAIConfig } from "../hooks/useAIConfig";
import { AiOutlineKey, AiOutlineCheckCircle, AiOutlineCloseCircle, AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { HiX } from "react-icons/hi";
import { MdTipsAndUpdates } from "react-icons/md";

const AIConfigPanel = () => {
  const {
    config,
    setAIConfig,
    clearConfig,
    updateModel,
    availableModels,
    defaultModel,
    isValidating,
    validationError,
    hasValidConfig,
  } = useAIConfig();

  const [localApiKey, setLocalApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [rememberMe, setRememberMe] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [touched, setTouched] = useState(false);

  const tipRef = useRef(null);

  // Initialize with current config if available
  useEffect(() => {
    if (config.geminiApiKey) {
      setLocalApiKey(config.geminiApiKey);
    }
    if (config.geminiModel) {
      setSelectedModel(config.geminiModel);
    }
    if (config.rememberMe !== undefined) {
      setRememberMe(config.rememberMe);
    }
  }, [config]);

  const handleSave = async () => {
    setTouched(true);
    await setAIConfig(localApiKey, selectedModel, rememberMe);
  };

  const handleClear = () => {
    clearConfig();
    setLocalApiKey("");
    setSelectedModel(defaultModel);
    setRememberMe(false);
    setTouched(false);
  };

  const handleModelChange = async (newModel) => {
    setSelectedModel(newModel);
    if (hasValidConfig) {
      await updateModel(newModel);
    }
  };

  const hasUnsavedChanges = localApiKey !== config.geminiApiKey ||
    selectedModel !== config.geminiModel ||
    rememberMe !== config.rememberMe;

  return (
    <div className="relative">
      {/* Main Configuration Panel - Compact and Professional */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        {/* Header - Compact */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AiOutlineKey className="text-blue-600 text-lg" />
            <div>
              <h3 className="text-sm font-semibold text-slate-800">AI Configuration</h3>
              {hasValidConfig && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <AiOutlineCheckCircle className="text-xs" />
                  Ready
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tip Icon */}
            <div className="relative">
              <button
                ref={tipRef}
                onClick={() => setShowTip(!showTip)}
                className="p-2 rounded-full hover:bg-blue-100 transition ease-in-out duration-300 cursor-pointer"
                title="Show configuration tips"
              >
                {showTip ? (
                  <HiX className="text-lg text-yellow-500" />
                ) : (
                  <MdTipsAndUpdates className="text-lg text-yellow-500" />
                )}
              </button>

              {/* Tip Popup */}
              {showTip && (
                <div className="absolute right-0 w-sm md:w-md top-full mt-2 bg-gray-800 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-50 whitespace-normal">
                  <p className="mb-1">
                    <strong className="text-yellow-400">Your API Key:</strong> Stored locally in browser, never sent to our servers.
                  </p>
                  <p className="mb-1">
                    <strong className="text-yellow-400">Free Models:</strong> gemini-3.5-flash, gemini-3.1-flash-lite, gemini-2.5-flash.
                  </p>
                  <p className="mb-1">
                    <strong className="text-yellow-400">Capabilities:</strong> Flash models support function calling for SQL and live charts.
                  </p>
                  <p>
                    <strong className="text-yellow-400">Pro Tip:</strong> Use 3.5-Flash for the balance of speed and complex SQL generation.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact Form Layout - Side by Side */}
        <div className="p-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
            {/* Left Side - API Key (Wider) */}
            <div className="flex-[2]">
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  placeholder="Enter Gemini API key..."
                  className="w-full px-3 py-2 pr-20 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isValidating}
                />
                {/* Action Buttons - Inline */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isValidating}
                    title={showApiKey ? "Hide" : "Show"}
                  >
                    {showApiKey ? (
                      <AiOutlineEyeInvisible className="text-sm" />
                    ) : (
                      <AiOutlineEye className="text-sm" />
                    )}
                  </button>

                  {!hasValidConfig ? (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!localApiKey.trim() || isValidating}
                      className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      title="Validate API key"
                    >
                      {isValidating ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "Validate"
                      )}
                    </button>
                  ) : (
                    <>
                      {hasUnsavedChanges && (
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={isValidating}
                          className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          title="Update configuration"
                        >
                          {isValidating ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            "Update"
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClear}
                        disabled={isValidating}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Clear configuration"
                      >
                        <HiX className="text-sm" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* API Key Link and Remember Me - Same Row */}
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs text-slate-500">
                  Get key from{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>

                {/* Remember Me Checkbox - Aligned with Link */}
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3 h-3 text-blue-600 border-slate-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isValidating}
                  />
                  Remember me
                </label>
              </div>
            </div>

            {/* Right Side - Model Selection (Narrower) */}
            <div className="flex-1">
              {/* Model Selection - Compact */}
              <div>
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isValidating}
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} {model.tier === "free" ? "(Free)" : "(Paid)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Validation Error - Full Width */}
          {validationError && touched && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AiOutlineCloseCircle className="text-red-600 text-sm flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-red-800">Configuration Error</p>
                  <p className="text-xs text-red-700 mt-0.5">{validationError}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIConfigPanel;

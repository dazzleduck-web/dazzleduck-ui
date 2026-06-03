import React, { createContext, useState, useEffect, useCallback, useRef } from "react";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "../components/ai/config/aiModels";
import { validateApiKey } from "../services/geminiValidation";

const AIConfigContext = createContext();
const STORAGE_KEY = "dazzleduck_ai_config";

const readStoredConfig = () => {
  // Try localStorage first (remember me), then fall back to sessionStorage.
  let storedConfig = localStorage.getItem(STORAGE_KEY);
  let sourceStorage = localStorage;

  if (!storedConfig) {
    storedConfig = sessionStorage.getItem(STORAGE_KEY);
    sourceStorage = sessionStorage;
  }

  if (!storedConfig) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(storedConfig);
  } catch (error) {
    // Corrupted data: remove it and prevent repeated errors on reload
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    console.warn("Corrupted AI config detected and removed:", error);
    return null;
  }

  if (!parsed.geminiModel) {
    return null;
  }

  return {
    geminiApiKey: sourceStorage === localStorage ? parsed.geminiApiKey : null,
    geminiModel: parsed.geminiModel,
    rememberMe: parsed.rememberMe || false,
    isValid: false,
    lastValidated: parsed.lastValidated || null,
  };
};

export const AIConfigProvider = ({ children }) => {
  const [config, setConfig] = useState({
    geminiApiKey: null,
    geminiModel: DEFAULT_MODEL_ID,
    rememberMe: false,
    isValid: false,
    lastValidated: null,
  });

  const [validationError, setValidationError] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const validationRequestIdRef = useRef(0);

  const startValidationRequest = useCallback(() => {
    validationRequestIdRef.current += 1;
    return validationRequestIdRef.current;
  }, []);

  const isLatestValidationRequest = useCallback((requestId) => (
    requestId === validationRequestIdRef.current
  ), []);

  // Load configuration from storage on mount
  useEffect(() => {
    try {
      const storedConfig = readStoredConfig();
      if (storedConfig) {
        setConfig(storedConfig);
      }
    } catch (error) {
      console.error("Failed to load AI config:", error);
    }
  }, []);

  // Save configuration to storage
  const saveConfig = useCallback((newConfig) => {
    const storage = newConfig.rememberMe ? localStorage : sessionStorage;
    const configToStore = {
      geminiApiKey: newConfig.geminiApiKey,
      geminiModel: newConfig.geminiModel,
      rememberMe: newConfig.rememberMe,
      lastValidated: newConfig.lastValidated,
    };

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(configToStore));

      // Clear from the other storage
      const otherStorage = newConfig.rememberMe ? sessionStorage : localStorage;
      otherStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to save AI config:", error);
    }
  }, []);

  // Clear configuration
  const clearConfig = useCallback(() => {
    validationRequestIdRef.current += 1;
    setConfig({
      geminiApiKey: null,
      geminiModel: DEFAULT_MODEL_ID,
      rememberMe: false,
      isValid: false,
      lastValidated: null,
    });
    setIsValidating(false);
    setValidationError(null);

    // Clear from both storage locations
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  // Set and validate new configuration
  const setAIConfig = useCallback(async (apiKey, model, rememberMe) => {
    const trimmedKey = apiKey?.trim() || null;
    const selectedModel = model || DEFAULT_MODEL_ID;
    const requestId = startValidationRequest();

    // If no API key provided, just clear config
    if (!trimmedKey) {
      clearConfig();
      return;
    }

    // Validate the API key
    setIsValidating(true);
    setValidationError(null);
    try {
      const { isValid, validationError } = await validateApiKey(trimmedKey, selectedModel);
      if (!isLatestValidationRequest(requestId)) {
        return;
      }

      setValidationError(validationError);

      const newConfig = {
        geminiApiKey: trimmedKey,
        geminiModel: selectedModel,
        rememberMe,
        isValid,
        lastValidated: isValid ? new Date().toISOString() : null,
      };

      setConfig(newConfig);

      if (isValid) {
        saveConfig(newConfig);
      }
    } finally {
      if (isLatestValidationRequest(requestId)) {
        setIsValidating(false);
      }
    }
  }, [saveConfig, clearConfig, startValidationRequest, isLatestValidationRequest]);

  // Update just the model (reusing existing API key)
  const updateModel = useCallback(async (newModel) => {
    if (!config.geminiApiKey) {
      setValidationError("Cannot update model: No API key configured");
      return;
    }

    // Re-validate with new model
    const requestId = startValidationRequest();
    setIsValidating(true);
    setValidationError(null);
    try {
      const { isValid, validationError } = await validateApiKey(config.geminiApiKey, newModel);
      if (!isLatestValidationRequest(requestId)) {
        return;
      }

      setValidationError(validationError);

      const newConfig = {
        ...config,
        geminiModel: newModel,
        isValid,
        lastValidated: isValid ? new Date().toISOString() : config.lastValidated,
      };

      setConfig(newConfig);

      if (isValid) {
        saveConfig(newConfig);
      }
    } finally {
      if (isLatestValidationRequest(requestId)) {
        setIsValidating(false);
      }
    }
  }, [config, saveConfig, startValidationRequest, isLatestValidationRequest]);

  // Re-validate existing API key
  const revalidateConfig = useCallback(async () => {
    if (!config.geminiApiKey) {
      setValidationError("No API key to validate");
      return false;
    }

    const requestId = startValidationRequest();
    setIsValidating(true);
    setValidationError(null);
    try {
      const { isValid, validationError } = await validateApiKey(config.geminiApiKey, config.geminiModel);
      if (!isLatestValidationRequest(requestId)) {
        return false;
      }

      setValidationError(validationError);

      const newConfig = {
        ...config,
        isValid,
        lastValidated: isValid ? new Date().toISOString() : null,
      };

      setConfig(newConfig);

      if (isValid) {
        saveConfig(newConfig);
      }

      return isValid;
    } finally {
      if (isLatestValidationRequest(requestId)) {
        setIsValidating(false);
      }
    }
  }, [config, saveConfig, startValidationRequest, isLatestValidationRequest]);

  const value = {
    // Current config state
    config,

    // Computed values
    hasValidConfig: config.isValid && config.geminiApiKey,
    needsConfig: !config.geminiApiKey || !config.isValid,

    // Validation state
    isValidating,
    validationError,

    // Available models
    availableModels: AVAILABLE_MODELS,
    defaultModel: DEFAULT_MODEL_ID,

    // Actions
    setAIConfig,
    clearConfig,
    updateModel,
    revalidateConfig,
  };

  return (
    <AIConfigContext.Provider value={value}>
      {children}
    </AIConfigContext.Provider>
  );
};

export { AIConfigContext };
export default AIConfigContext;

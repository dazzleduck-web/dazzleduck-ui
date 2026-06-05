/**
 * useAIConfig Hook
 * Simple hook for easy access to AI configuration in components
 * This is just a convenience wrapper around AIConfigContext
 */

import { useAIConfig as useAIConfigContext } from "../../../context/useAIConfig";

/**
 * Hook for accessing AI configuration
 * Provides convenient access to AI config state and actions
 */
export const useAIConfig = () => {
  const configContext = useAIConfigContext();

  // Return the most commonly used properties and actions
  return {
    // Full config object for components that need it
    config: configContext.config,

    // Current config state
    apiKey: configContext.config.geminiApiKey,
    model: configContext.config.geminiModel,
    rememberMe: configContext.config.rememberMe,
    isValid: configContext.config.isValid,
    lastValidated: configContext.config.lastValidated,

    // Computed values
    hasValidConfig: configContext.hasValidConfig,
    needsConfig: configContext.needsConfig,
    isConfigured: configContext.hasValidConfig,

    // Validation state
    isValidating: configContext.isValidating,
    validationError: configContext.validationError,

    // Available models
    availableModels: configContext.availableModels,
    defaultModel: configContext.defaultModel,

    // Actions
    setConfig: configContext.setAIConfig,
    clearConfig: configContext.clearConfig,
    updateModel: configContext.updateModel,
    revalidateConfig: configContext.revalidateConfig,

    // Action aliases (for convenience)
    setAIConfig: configContext.setAIConfig,

    // Raw context (if needed)
    rawContext: configContext,
  };
};

export default useAIConfig;

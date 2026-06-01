import { useContext } from "react";
import { AIConfigContext } from "./AIConfigContext";

/**
 * Hook for accessing AI configuration
 * Provides convenient access to AI config state and actions
 */
export const useAIConfig = () => {
  const context = useContext(AIConfigContext);
  if (!context) {
    throw new Error("useAIConfig must be used within AIConfigProvider");
  }
  return context;
};

export default useAIConfig;
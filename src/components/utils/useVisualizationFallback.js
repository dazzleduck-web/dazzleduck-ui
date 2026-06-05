import { useCallback, useEffect, useState } from "react";

export const SUPPORTED_VISUALIZATION_TYPES = ["table", "line", "bar", "pie"];

const normalizeDisplayType = (value) => String(value || "table").toLowerCase();

export const getVisualizationFallbackReason = (
  displayType,
  data,
  {
    emptyDataReason = "No data available",
    invalidDataReason = "Invalid data structure",
    incompatibleDataReason = "Data structure not compatible with this visualization",
  } = {}
) => {
  const normalizedDisplayType = normalizeDisplayType(displayType);

  if (!SUPPORTED_VISUALIZATION_TYPES.includes(normalizedDisplayType)) {
    return `"${normalizedDisplayType}" is not a supported display type`;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return emptyDataReason;
  }

  if (!data[0]) {
    return invalidDataReason;
  }

  if (normalizedDisplayType === "pie" && Object.keys(data[0]).length < 2) {
    return "Pie chart requires at least 2 columns";
  }

  return incompatibleDataReason;
};

const shouldFallbackVisualization = (displayType, data) => {
  const normalizedDisplayType = normalizeDisplayType(displayType);

  if (normalizedDisplayType === "table") {
    return false;
  }

  if (!SUPPORTED_VISUALIZATION_TYPES.includes(normalizedDisplayType)) {
    return true;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return true;
  }

  if (!data[0]) {
    return true;
  }

  return false;
};

export function useVisualizationFallback({
  displayType,
  data,
  onDisplayChange,
  fallbackDelayMs = 2000,
}) {
  const [fallbackToTable, setFallbackToTable] = useState(false);

  const handleDisplayChange = useCallback(
    (nextDisplayType) => {
      setFallbackToTable(false);
      onDisplayChange?.(nextDisplayType);
    },
    [onDisplayChange]
  );

  useEffect(() => {
    const normalizedDisplayType = normalizeDisplayType(displayType);

    if (normalizedDisplayType !== "table" && shouldFallbackVisualization(normalizedDisplayType, data)) {
      setFallbackToTable(true);

      if (onDisplayChange) {
        const timeout = setTimeout(() => {
          onDisplayChange("table");
          setFallbackToTable(false);
        }, fallbackDelayMs);

        return () => clearTimeout(timeout);
      }

      return undefined;
    }

    setFallbackToTable(false);
    return undefined;
  }, [
    data,
    displayType,
    fallbackDelayMs,
    onDisplayChange,
  ]);

  return {
    fallbackToTable,
    handleDisplayChange,
  };
}

export default {
  SUPPORTED_VISUALIZATION_TYPES,
  getVisualizationFallbackReason,
  useVisualizationFallback,
};

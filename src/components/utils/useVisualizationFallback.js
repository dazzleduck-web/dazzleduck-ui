import { useCallback, useEffect, useRef, useState } from "react";

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

  if (normalizedDisplayType === "pie" && Object.keys(data[0]).length < 2) {
    return true;
  }

  return false;
};

export function useVisualizationFallback({
  displayType,
  data,
  onDisplayChange,
  showPopup,
  fallbackDelayMs = 2000,
  emptyDataReason = "No data available",
  invalidDataReason = "Invalid data structure",
  incompatibleDataReason = "Data structure not compatible with this visualization",
}) {
  const [fallbackToTable, setFallbackToTable] = useState(false);
  const popupSentRef = useRef("");

  const handleDisplayChange = useCallback(
    (nextDisplayType) => {
      setFallbackToTable(false);
      popupSentRef.current = "";
      onDisplayChange?.(nextDisplayType);
    },
    [onDisplayChange]
  );

  useEffect(() => {
    const normalizedDisplayType = normalizeDisplayType(displayType);

    if (normalizedDisplayType !== "table" && shouldFallbackVisualization(normalizedDisplayType, data)) {
      setFallbackToTable(true);

      const popupKey = `${normalizedDisplayType}:${data?.length || 0}`;
      if (typeof showPopup === "function" && popupSentRef.current !== popupKey) {
        popupSentRef.current = popupKey;
        const reason = getVisualizationFallbackReason(normalizedDisplayType, data, {
          emptyDataReason,
          invalidDataReason,
          incompatibleDataReason,
        });
        showPopup(`Visualization not supported: ${reason}. Showing table view instead.`, "warning");
      }

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
    popupSentRef.current = "";
    return undefined;
  }, [
    data,
    displayType,
    emptyDataReason,
    fallbackDelayMs,
    incompatibleDataReason,
    invalidDataReason,
    onDisplayChange,
    showPopup,
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

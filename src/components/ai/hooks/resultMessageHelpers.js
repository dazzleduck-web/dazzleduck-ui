import { createQueryResultMessage } from "../util/chatMessageUtils";

const isListTool = (toolName) =>
  toolName === "listDatabases" ||
  toolName === "listTables" ||
  toolName === "listNamedQueries";

export const extractResultRows = (toolName, toolResult, fallbackRows = []) => {
  if (Array.isArray(toolResult?.rows)) {
    return toolResult.rows;
  }

  if (Array.isArray(toolResult?.columns)) {
    return toolResult.columns;
  }

  if (toolName === "listDatabases" && Array.isArray(toolResult?.databases)) {
    return toolResult.databases;
  }

  if (toolName === "listNamedQueries" && Array.isArray(toolResult?.namedQueries)) {
    return toolResult.namedQueries;
  }

  return Array.isArray(fallbackRows) ? fallbackRows : [];
};

export const createBulkNamedQueryResultMetadata = (toolResult, queryGroup = "") => {
  const normalizedQueryGroup = toolResult?.queryGroup || queryGroup || null;

  return {
    preferredDisplay: "table",
    queryGroup: normalizedQueryGroup,
    bulkResultsData: {
      results: Array.isArray(toolResult?.results) ? toolResult.results : [],
      errors: Array.isArray(toolResult?.errors) ? toolResult.errors : [],
      total: Number.isFinite(toolResult?.total) ? toolResult.total : 0,
      queryGroup: normalizedQueryGroup,
    },
  };
};

export const createBulkNamedQuerySuccessMessage = ({
  totalCount = 0,
  successCount = 0,
  failureCount = 0,
  queryGroup = "",
}) => {
  const scopeText = queryGroup ? ` in group "${queryGroup}"` : "";

  return `Executed ${totalCount} named quer${totalCount === 1 ? "y" : "ies"}${scopeText}. ${successCount} succeeded${failureCount > 0 ? `, ${failureCount} failed` : ""}.`;
};

export const getResultMetadata = (toolName, toolResult, fallbackMetadata = null) => {
  if (isListTool(toolName)) {
    return { preferredDisplay: "table" };
  }

  if (toolName === "executeAllNamedQueries") {
    return createBulkNamedQueryResultMetadata(toolResult);
  }

  if (toolResult?.namedQuery) {
    return {
      queryName: toolResult.queryName,
      preferredDisplay: toolResult.namedQuery.preferred_display || "table",
    };
  }

  return fallbackMetadata;
};

export const getExecutionResultTitle = (toolName, queryName = "") => (
  toolName === "executeNamedQuery"
    ? (queryName || "Named Query Results")
    : toolName === "executeAllNamedQueries"
      ? "All Named Query Results"
      : "Query Results"
);

export const createExecutionResultMessage = ({
  toolName,
  rows,
  metadata,
  queryName = "",
  content = "",
  bulkResultsData = null,
}) => {
  const normalizedRows = Array.isArray(rows) ? rows.filter((row) => row != null) : [];

  if (normalizedRows.length === 0) {
    return null;
  }

  return createQueryResultMessage({
    content,
    result: {
      rows: normalizedRows,
      metadata,
      title: getExecutionResultTitle(toolName, queryName),
      bulkResultsData,
    },
  });
};

export const buildBulkNamedQueryExecutionResult = (toolResult, queryGroup = "") => {
  const rows = extractResultRows("executeAllNamedQueries", toolResult);
  const successCount = Number.isFinite(toolResult?.successCount)
    ? toolResult.successCount
    : rows.filter((row) => row?.success).length;
  const failureCount = Number.isFinite(toolResult?.failureCount)
    ? toolResult.failureCount
    : Array.isArray(toolResult?.errors)
      ? toolResult.errors.length
      : 0;
  const totalCount = Number.isFinite(toolResult?.total)
    ? toolResult.total
    : rows.length;
  const metadata = createBulkNamedQueryResultMetadata(toolResult, queryGroup);
  const successMessage = createBulkNamedQuerySuccessMessage({
    totalCount,
    successCount,
    failureCount,
    queryGroup: metadata.queryGroup || queryGroup || "",
  });
  const resultMessage = createExecutionResultMessage({
    toolName: "executeAllNamedQueries",
    rows,
    metadata,
    content: successMessage,
    bulkResultsData: metadata.bulkResultsData,
  });

  return {
    rows,
    metadata,
    successMessage,
    resultMessage,
    successCount,
    failureCount,
    totalCount,
  };
};

/**
 * Tool Registry for AI Agent
 * Tool registry for the browser-based AI assistant
 */

import { validateReadOnlyQuery, normalizeReadOnlyQuery } from "./queryValidator";
import { QUERY_EXECUTION_TIMEOUT_MS } from "../config/aiConstants";

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

export const MAX_BULK_QUERIES = 20;

/**
 * Tool definitions that Gemini can call
 */
export const toolDefinitions = [
  {
    name: "listDatabases",
    description: "List all databases available on the connected server.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "listTables",
    description: "List all tables available in the connected database or in a specific database.",
    parameters: {
      type: "object",
      properties: {
        databaseName: {
          type: "string",
          description: "Optional database name to list tables from.",
        },
      },
    },
  },
  {
    name: "listNamedQueries",
    description: "List all named queries available on the connected DazzleDuck server.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getNamedQuery",
    description: "Fetch a single named query definition by name.",
    parameters: {
      type: "object",
      properties: {
        queryName: {
          type: "string",
          description: "The named query identifier",
        },
      },
      required: ["queryName"],
    },
  },
  {
    name: "executeNamedQuery",
    description: "Execute a named query with optional parameters. Execution requires confirmation.",
    parameters: {
      type: "object",
      properties: {
        queryName: {
          type: "string",
          description: "The named query identifier",
        },
        parameters: {
          type: "object",
          description: "Parameters passed to the named query",
        },
      },
      required: ["queryName"],
    },
  },
  {
    name: "executeAllNamedQueries",
    description: "Execute all named queries, optionally limited to a specific query group. Execution requires confirmation.",
    parameters: {
      type: "object",
      properties: {
        queryGroup: {
          type: "string",
          description: "Optional query group to restrict execution to.",
        },
      },
    },
  },
  {
    name: "describeTable",
    description: "Describe the schema of a single table.",
    parameters: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The table name to describe",
        },
        databaseName: {
          type: "string",
          description: "Optional database name to qualify the table.",
        },
      },
      required: ["tableName"],
    },
  },
  {
    name: "executeQuery",
    description: "Generate or execute a read-only SQL query. Execution requires user confirmation.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Read-only SQL query to run",
        },
        explanation: {
          type: "string",
          description: "Short explanation of what the query does",
        },
      },
      required: ["query"],
    },
  },
];

/**
 * Build preview object for confirmation flow
 */
function buildPreview(query, explanation = "") {
  return {
    requiresConfirmation: true,
    query,
    explanation,
    message: "I prepared a read-only SQL query for review.",
  };
}

/**
 * Quote identifier for SQL safety
 */
function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function normalizeDatabaseName(databaseName) {
  return String(databaseName || "")
    .trim()
    .replace(/^["'`]|["'`]$/g, "");
}

function normalizeQueryGroup(queryGroup) {
  return String(queryGroup || "")
    .trim()
    .replace(/^["'`]|["'`]$/g, "");
}

/**
 * Format qualified table name (schema.table)
 */
function formatQualifiedTableName(tableName) {
  return String(tableName)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(quoteIdentifier)
    .join(".");
}

/**
 * Format text table for display
 */
function formatTextTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "No results";
  }

  const columns = Object.keys(rows[0]);
  const maxWidths = columns.map(col => Math.max(col.length, ...rows.map(row => String(row[col] || "").length)));

  const headerRow = columns.map((col, i) => col.padEnd(maxWidths[i])).join(" | ");
  const separatorRow = maxWidths.map(width => "-".repeat(width)).join("-+-");

  const dataRows = rows.map(row =>
    columns.map((col, i) => String(row[col] || "").padEnd(maxWidths[i])).join(" | ")
  );

  return [headerRow, separatorRow, ...dataRows].join("\n");
}

/**
 * Summarize table list results
 */
function summarizeTables(rows, databaseName = "") {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    // Handle different table listing formats
    const tableName = row.table_name || row.Tables || row.table || row.name ||
      (row && typeof row === "object" ? row[Object.keys(row)[0]] : String(row));
    const tableType = row.table_type || row.type || "BASE TABLE";

    return {
      database_name: row.database_name || row.table_schema || row.schema_name || databaseName || "",
      name: tableName,
      table_name: tableName,
      type: tableType,
    };
  });
}

async function fetchDatabaseNames(executeQuery, serverUrl, jwtToken) {
  if (!executeQuery) {
    throw new Error("executeQuery function not available in context");
  }

  const query = "SHOW DATABASES";
  const { data: rows } = await executeQuery(serverUrl, query, 0, jwtToken);

  return {
    rows: Array.isArray(rows) ? rows : [],
    queryUsed: query,
  };
}

async function fetchTablesForDatabase(executeQuery, serverUrl, jwtToken, databaseName) {
  const normalizedDatabaseName = normalizeDatabaseName(databaseName);
  if (!normalizedDatabaseName) {
    throw new Error("databaseName is required");
  }

  const queries = [
    `SHOW TABLES FROM ${quoteIdentifier(normalizedDatabaseName)}`,
  ];

  let lastError = null;

  for (const query of queries) {
    try {
      const { data: rows } = await executeQuery(serverUrl, query, 0, jwtToken);
      return {
        rows: Array.isArray(rows) ? rows : [],
        queryUsed: query,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Failed to list tables for database '${normalizedDatabaseName}'`);
}

async function executeAllNamedQueries(fetchNamedQueries, executeNamedQuery, serverUrl, queryGroup = "") {
  if (!fetchNamedQueries) {
    throw new Error("fetchNamedQueries function not available in context");
  }
  if (!executeNamedQuery) {
    throw new Error("executeNamedQuery function not available in context");
  }

  const allNamedQueries = await fetchNamedQueries(serverUrl, 0, 1000);
  const normalizedGroup = normalizeQueryGroup(queryGroup);
  const selectedQueries = normalizedGroup
    ? allNamedQueries.filter((query) => (query.query_group || query.group || "default") === normalizedGroup)
    : allNamedQueries;

  if (!selectedQueries.length) {
    throw new Error(
      normalizedGroup
        ? `No named queries were found in group '${normalizedGroup}'`
        : "No named queries were found"
    );
  }

  if (selectedQueries.length > MAX_BULK_QUERIES) {
    throw new Error(`Bulk execution exceeds limit of ${MAX_BULK_QUERIES} queries`);
  }

  const summaryRows = [];
  const detailedResults = [];
  const errors = [];

  for (const query of selectedQueries) {
    try {
      // Wrap execution in Promise.race with timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Query execution timed out after ${QUERY_EXECUTION_TIMEOUT_MS / 1000}s`)), QUERY_EXECUTION_TIMEOUT_MS)
      );

      const executionResult = await Promise.race([
        executeNamedQuery(serverUrl, query.name, {}),
        timeoutPromise,
      ]);

      const rows = Array.isArray(executionResult)
        ? executionResult
        : Array.isArray(executionResult?.data)
          ? executionResult.data
          : Array.isArray(executionResult?.rows)
            ? executionResult.rows
            : [];
      const detailedRow = {
        queryName: query.name,
        query_group: query.query_group || query.group || "default",
        preferredDisplay: query.preferred_display || "table",
        success: true,
        data: rows,
        rowCount: rows.length,
      };

      detailedResults.push(detailedRow);
      summaryRows.push({
        queryName: detailedRow.queryName,
        query_group: detailedRow.query_group,
        preferredDisplay: detailedRow.preferredDisplay,
        success: detailedRow.success,
        rowCount: detailedRow.rowCount,
      });
    } catch (error) {
      const isTimeout = error?.message?.includes("timed out");
      const errorMessage = error?.message || `Failed to execute ${query.name}`;
      if (isDev && isTimeout) {
        console.warn(`[AI] Query timeout for ${query.name}: ${errorMessage}`);
      }

      const detailedRow = {
        queryName: query.name,
        query_group: query.query_group || query.group || "default",
        preferredDisplay: query.preferred_display || "table",
        success: false,
        data: [],
        totalRowCount: 0,
        truncated: false,
        rowCount: 0,
        error: errorMessage,
        timedOut: isTimeout,
      };

      detailedResults.push(detailedRow);
      summaryRows.push({
        queryName: detailedRow.queryName,
        query_group: detailedRow.query_group,
        preferredDisplay: detailedRow.preferredDisplay,
        success: detailedRow.success,
        rowCount: detailedRow.rowCount,
        error: detailedRow.error,
      });
      errors.push({
        queryName: query.name,
        error: errorMessage,
        timedOut: isTimeout,
      });
    }
  }

  return {
    queryGroup: normalizedGroup || null,
    rows: summaryRows,
    results: detailedResults,
    errors,
    total: selectedQueries.length,
    successCount: detailedResults.filter((item) => item.success).length,
    failureCount: errors.length,
    rowCount: summaryRows.length,
    textTable: formatTextTable(summaryRows),
    bulk: true,
  };
}

/**
 * Summarize column results from DESCRIBE
 */
function summarizeColumns(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const columnName = row.field || row.column_name || row.name || row.Column;
    const columnType = row.type || row.data_type || row.Type;
    const isNullable = row.null || row.is_nullable || row.Null === "YES" || row.nullable;

    return {
      name: columnName,
      type: columnType,
      nullable: isNullable,
    };
  });
}

/**
 * Run a tool with the given arguments
 * This is the main tool execution function
 */
export async function runTool(name, args = {}, context = {}) {
  const { serverUrl, jwtToken, executeQuery, fetchNamedQueries, getNamedQuery, executeNamedQuery } = context;

  switch (name) {
    case "listDatabases": {
      const { rows, queryUsed } = await fetchDatabaseNames(executeQuery, serverUrl, jwtToken);

      return {
        databases: rows.map((row) => ({
          database_name:
            row.database_name ||
            row.datname ||
            row.name ||
            (row && typeof row === "object" ? row[Object.keys(row)[0]] : String(row)),
        })),
        count: rows.length,
        queryUsed,
      };
    }

    case "listTables": {
      if (!executeQuery) {
        throw new Error("executeQuery function not available in context");
      }

      const databaseName = normalizeDatabaseName(args.databaseName);

      if (databaseName) {
        const { rows, queryUsed } = await fetchTablesForDatabase(executeQuery, serverUrl, jwtToken, databaseName);
        const tables = summarizeTables(rows, databaseName);

        if (tables.length === 0) {
          const databases = await fetchDatabaseNames(executeQuery, serverUrl, jwtToken);
          const databaseList = databases.rows
            .map((row) => row.database_name || row.name || String(row))
            .filter(Boolean);

          return {
            rows: [],
            tables: [],
            databases: databases.rows,
            databaseName,
            queryUsed,
            count: 0,
            message: databaseList.length > 0
              ? `No tables were found in database '${databaseName}'. Available databases: ${databaseList.join(", ")}.`
              : `No tables were found in database '${databaseName}'.`,
          };
        }

        return {
          rows: tables,
          tables,
          databaseName,
          queryUsed,
          count: tables.length,
        };
      }

      const { data: rows } = await executeQuery(serverUrl, "SHOW TABLES", 0, jwtToken);
      const tables = summarizeTables(rows);

      if (tables.length > 0) {
        return {
          rows: tables,
          tables,
          count: tables.length,
          queryUsed: "SHOW TABLES",
        };
      }

      const databases = await fetchDatabaseNames(executeQuery, serverUrl, jwtToken);
      const databaseList = databases.rows
        .map((row) => row.database_name || row.name || String(row))
        .filter(Boolean);

      return {
        rows: [],
        tables: [],
        databases: databases.rows,
        count: 0,
        queryUsed: "SHOW TABLES",
        message: databaseList.length > 0
          ? `No tables were found in the current database. Available databases: ${databaseList.join(", ")}. Which database should I inspect?`
          : "No tables were found in the current database.",
        needsDatabaseSelection: true,
      };
    }

    case "listNamedQueries": {
      if (!fetchNamedQueries) {
        throw new Error("fetchNamedQueries function not available in context");
      }

      const namedQueries = await fetchNamedQueries(serverUrl, 0, 1000);

      return {
        namedQueries: namedQueries.map((query) => ({
          id: query.id,
          name: query.name,
          description: query.description || "",
          query_group: query.query_group || query.group || "default",
          preferred_display: query.preferred_display || "table",
        })),
        count: namedQueries.length,
      };
    }

    case "getNamedQuery": {
      if (!getNamedQuery) {
        throw new Error("getNamedQuery function not available in context");
      }

      const queryName = args.queryName?.trim();
      if (!queryName) {
        throw new Error("queryName is required");
      }

      const namedQuery = await getNamedQuery(serverUrl, queryName);
      return { namedQuery };
    }

    case "describeTable": {
      if (!executeQuery) {
        throw new Error("executeQuery function not available in context");
      }

      const tableName = args.tableName?.trim();
      if (!tableName) {
        throw new Error("tableName is required");
      }

      const databaseName = normalizeDatabaseName(args.databaseName);

      // Always split into parts and quote each segment individually to prevent injection
      const parts = tableName.includes(".")
        ? tableName.split(".").map((p) => p.trim()).filter(Boolean)
        : databaseName
          ? [databaseName, tableName]
          : [tableName];

      // Quote each part and join with "."
      const quotedQualifiedName = parts.map(quoteIdentifier).join(".");
      const query = `DESCRIBE TABLE ${quotedQualifiedName}`;
      const { data: rows } = await executeQuery(serverUrl, query, 0, jwtToken);

      return {
        tableName: parts.join("."),
        columns: summarizeColumns(rows),
        count: rows.length,
      };
    }

    case "executeQuery": {
      const normalizedQuery = normalizeReadOnlyQuery(args.query);
      const explanation = args.explanation || "";

      if (!args.confirmed) {
        return buildPreview(normalizedQuery, explanation);
      }

      if (!executeQuery) {
        throw new Error("executeQuery function not available in context");
      }

      const { data: rows } = await executeQuery(serverUrl, normalizedQuery, 0, jwtToken);

      return {
        confirmed: true,
        query: normalizedQuery,
        explanation,
        rows,
        rowCount: rows.length,
        textTable: formatTextTable(rows),
      };
    }

    case "executeNamedQuery": {
      if (!executeNamedQuery) {
        throw new Error("executeNamedQuery function not available in context");
      }

      const queryName = args.queryName?.trim();
      if (!queryName) {
        throw new Error("queryName is required");
      }

      const parameters = args.parameters || {};

      if (!args.confirmed) {
        return {
          requiresConfirmation: true,
          queryName,
          parameters,
          query: `-- Execute named query: ${queryName}`,
          explanation: "Named query execution requires confirmation.",
          message: "I prepared a named query for review.",
        };
      }

      // Fetch named query metadata to get preferred_display
      let namedQueryMetadata = null;
      if (getNamedQuery) {
        try {
          namedQueryMetadata = await getNamedQuery(serverUrl, queryName);
        } catch (error) {
          // Only log in development - metadata fetch is not critical for functionality
          if (isDev) {
            console.warn(`Failed to fetch named query metadata for ${queryName}:`, error);
          }
        }
      }

      // Wrap execution in Promise.race with timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Query execution timed out after ${QUERY_EXECUTION_TIMEOUT_MS / 1000}s`)), QUERY_EXECUTION_TIMEOUT_MS)
      );

      const executionResult = await Promise.race([
        executeNamedQuery(serverUrl, queryName, parameters),
        timeoutPromise,
      ]);

      const rows = Array.isArray(executionResult)
        ? executionResult
        : Array.isArray(executionResult?.data)
          ? executionResult.data
          : [];

      return {
        confirmed: true,
        queryName,
        parameters,
        rows,
        rowCount: rows.length,
        textTable: formatTextTable(rows),
        namedQuery: namedQueryMetadata, // Include metadata for preferred_display
      };
    }

    case "executeAllNamedQueries": {
      const queryGroup = normalizeQueryGroup(args.queryGroup);

      if (!args.confirmed) {
        return {
          requiresConfirmation: true,
          queryGroup: queryGroup || null,
          query: queryGroup
            ? `-- Execute all named queries in group: ${queryGroup}`
            : "-- Execute all named queries",
          explanation: queryGroup
            ? `This will execute every named query in the '${queryGroup}' group.`
            : "This will execute every named query that is available on the server.",
          message: queryGroup
            ? `I prepared all named queries in group '${queryGroup}' for review.`
            : "I prepared all named queries for review.",
        };
      }

      const executionResult = await executeAllNamedQueries(
        fetchNamedQueries,
        executeNamedQuery,
        serverUrl,
        queryGroup
      );

      return {
        confirmed: true,
        queryGroup: executionResult.queryGroup,
        rows: executionResult.rows,
        results: executionResult.results,
        errors: executionResult.errors,
        total: executionResult.total,
        successCount: executionResult.successCount,
        failureCount: executionResult.failureCount,
        rowCount: executionResult.rowCount,
        textTable: executionResult.textTable,
        bulk: true,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  toolDefinitions,
  runTool,
};

/**
 * Tool Registry for AI Agent
 * Tool registry for the browser-based AI assistant
 */

import { validateReadOnlyQuery, normalizeReadOnlyQuery } from "./queryValidator";

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

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
    description: "List all tables available in the connected database.",
    parameters: {
      type: "object",
      properties: {},
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
    name: "describeTable",
    description: "Describe the schema of a single table.",
    parameters: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The table name to describe",
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
function summarizeTables(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    // Handle different table listing formats
    const tableName = row.table_name || row.Tables || row.table || row.name ||
      (row && typeof row === "object" ? row[Object.keys(row)[0]] : String(row));
    const tableType = row.table_type || row.type || "BASE TABLE";

    return {
      name: tableName,
      type: tableType,
    };
  });
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
      const candidates = [
        "SELECT datname AS database_name FROM pg_database WHERE datistemplate = false ORDER BY datname",
        "SHOW DATABASES",
      ];

      for (const query of candidates) {
        try {
          if (!executeQuery) {
            throw new Error("executeQuery function not available in context");
          }

          const { data: rows } = await executeQuery(serverUrl, query, 0, jwtToken);

          return {
            databases: rows.map((row) => ({
              database_name:
                row.database_name ||
                row.datname ||
                row.name ||
                (row && typeof row === "object" ? row[Object.keys(row)[0]] : String(row)),
            })),
            count: rows.length,
            queryUsed: query,
          };
        } catch (error) {
          if (query === candidates[candidates.length - 1]) {
            throw error;
          }
        }
      }

      return { databases: [], count: 0 };
    }

    case "listTables": {
      if (!executeQuery) {
        throw new Error("executeQuery function not available in context");
      }

      const { data: rows } = await executeQuery(serverUrl, "SHOW TABLES", 0, jwtToken);

      return {
        rows: summarizeTables(rows),
        count: rows.length,
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

      const query = `DESCRIBE TABLE ${formatQualifiedTableName(tableName)}`;
      const { data: rows } = await executeQuery(serverUrl, query, 0, jwtToken);

      return {
        tableName,
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

      validateReadOnlyQuery(normalizedQuery);

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

      const executionResult = await executeNamedQuery(serverUrl, queryName, parameters);
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

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  toolDefinitions,
  runTool,
};

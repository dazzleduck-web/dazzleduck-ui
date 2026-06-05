/**
 * Query Validator for AI Agent
 * Read-only SQL validation for the browser-based AI assistant
 * Ensures only safe, read-only queries are executed
 */

const BLOCKED_SQL_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "COPY",
  "LOAD DATA",
  "CALL",
];

const ALLOWED_PREFIXES = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH"];

/**
 * Strip trailing semicolon from query
 */
function stripTrailingSemicolon(query) {
  return query.replace(/;\s*$/, "").trim();
}

/**
 * Validate that a query is read-only and safe
 * @throws {Error} If query contains unsafe operations
 * @returns {string} The normalized safe query
 */
export function validateReadOnlyQuery(query) {
  if (!query || typeof query !== "string") {
    throw new Error("Query is empty or invalid");
  }

  const normalized = stripTrailingSemicolon(query);
  const upperQuery = normalized.toUpperCase();

  // Check for multiple statements
  if (normalized.includes(";")) {
    throw new Error("Multiple SQL statements are not allowed");
  }

  // Check for blocked keywords
  for (const keyword of BLOCKED_SQL_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(upperQuery)) {
      throw new Error(`Write operations are not allowed. Found: ${keyword}`);
    }
  }

  // Check for allowed prefix
  const hasAllowedPrefix = ALLOWED_PREFIXES.some((prefix) => upperQuery.startsWith(prefix));
  if (!hasAllowedPrefix) {
    throw new Error("Query must be a read-only operation (SELECT, SHOW, DESCRIBE, etc.)");
  }

  return normalized;
}

/**
 * Normalize query (validate read-only safety)
 * @returns {string} The normalized validated query
 */
export function normalizeReadOnlyQuery(query) {
  return validateReadOnlyQuery(query);
}

export default {
  validateReadOnlyQuery,
  normalizeReadOnlyQuery,
  BLOCKED_SQL_KEYWORDS,
  ALLOWED_PREFIXES,
};

/**
 * Decide whether the text in a query box is SQL or a natural-language question,
 * using the server's own SQL parser (nothing is executed).
 *
 *   parse error (syntax)            → "nl"       (generate SQL)
 *   valid but not a SELECT          → "sql"      (DESCRIBE, SHOW, … run as typed)
 *   parses and looks like SQL       → "sql"      (run as typed; a bind error is the user's own to see)
 *   parses, prose-like, binds       → "sql"
 *   parses, prose-like, bind fails  → "unclear"  (e.g. "select all failed payments": the AI decides)
 * EXPLAIN is only needed for prose-like text, so typed SQL costs one server call.
 */
import { cleanSql } from "./sqlText";
import { parseSql, isNotSelectError, explainSql, looksLikeSql } from "./sqlParse";

export async function detectInput(runMeta, text) {
    const sql = cleanSql(text);
    if (!sql) return { kind: "empty" };

    let parsed;
    try {
        parsed = await parseSql(runMeta, sql);
    } catch {
        // The server refused the parse call (e.g. restricted mode): fall back to a heuristic.
        return { kind: looksLikeSql(sql) ? "sql" : "nl" };
    }

    if (!parsed.ok) {
        if (isNotSelectError(parsed)) return { kind: "sql" };
        return { kind: "nl" };
    }

    if (looksLikeSql(sql)) return { kind: "sql" };
    const explained = await explainSql(runMeta, sql);
    return explained.ok ? { kind: "sql" } : { kind: "unclear", bindError: explained.message };
}

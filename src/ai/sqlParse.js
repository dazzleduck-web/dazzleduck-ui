/**
 * SQL parsing and dry-run helpers backed by the DazzleDuck server's own DuckDB.
 *
 * `runMeta(sql)` executes a query on the server and resolves to { rows, columns }
 * (see executeMetaQuery in QueryDashboardContext).
 */
import { quoteSqlString } from "./sqlText";

/**
 * Parse SQL with DuckDB's json_serialize_sql. Nothing is executed.
 * @returns {{ok: true, ast: object} | {ok: false, errorType: string, message: string}}
 */
export async function parseSql(runMeta, sql) {
    const { rows } = await runMeta(`SELECT json_serialize_sql(${quoteSqlString(sql)}) AS ast`);
    const raw = rows?.[0]?.ast;
    let ast;
    try {
        ast = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return { ok: false, errorType: "unknown", message: "Could not read the parser output." };
    }
    if (!ast || ast.error) {
        return {
            ok: false,
            errorType: ast?.error_type || "unknown",
            message: ast?.error_message || "Could not parse the SQL.",
        };
    }
    return { ok: true, ast };
}

/** json_serialize_sql only serializes SELECT statements; anything else fails with this error. */
export const isNotSelectError = (parsed) =>
    !parsed.ok &&
    (parsed.errorType === "not implemented" || /only select statements/i.test(parsed.message || ""));

/** EXPLAIN the SQL: parses and binds (tables/columns must exist) without running it. */
export async function explainSql(runMeta, sql) {
    try {
        await runMeta(`EXPLAIN ${sql}`);
        return { ok: true };
    } catch (err) {
        return { ok: false, message: cleanServerError(err?.message) };
    }
}

/** Strip the generic DazzleDuck wrapper line so the real DuckDB error is shown. */
export function cleanServerError(message) {
    const text = String(message ?? "").trim();
    const lines = text.split("\n");
    const idx = lines.findIndex((l) => /^\s*Error:\s*/.test(l));
    return (idx >= 0 ? lines.slice(idx).join("\n").replace(/^\s*Error:\s*/, "") : text).trim();
}

const SQL_START = /^\s*\(*\s*(select|with|from|values|describe|summarize|show|pivot|unpivot|explain|table|pragma|create|insert|update|delete|drop|alter|copy|attach|detach|install|load|set|reset|call|export|import|use)\b/i;
const SQL_STRUCTURE = /[*,=()'"<>;]|\n/;

/** Cheap heuristic: starts like SQL and contains SQL punctuation. */
export const looksLikeSql = (text) => SQL_START.test(text) && SQL_STRUCTURE.test(text);

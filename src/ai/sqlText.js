/**
 * Small text helpers for SQL handling. Pure functions, no I/O.
 */

/** Quote a value as a SQL string literal. */
export const quoteSqlString = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Trim whitespace and trailing semicolons. */
export const cleanSql = (sql) => String(sql ?? "").trim().replace(/[;\s]+$/, "");

/** Table functions that read data files. */
export const FILE_FUNCTIONS = [
    "read_parquet", "parquet_scan",
    "read_csv", "read_csv_auto",
    "read_json", "read_json_auto", "read_ndjson", "read_ndjson_auto",
    "read_arrow", "read_ipc",
    "delta_scan", "iceberg_scan",
    "read_xlsx",
];

const FILE_FN_PATTERN = new RegExp(`\\b(${FILE_FUNCTIONS.join("|")})\\s*\\(`, "gi");

/**
 * Find file-reading table function calls in a text, e.g.
 * `read_parquet('data/*.parquet', hive_partitioning=true)`.
 * Returns the full call text (balanced parentheses, quotes respected), unique.
 */
export function extractSourceCalls(text) {
    const src = String(text ?? "");
    const found = new Set();
    let m;
    FILE_FN_PATTERN.lastIndex = 0;
    while ((m = FILE_FN_PATTERN.exec(src)) !== null) {
        const start = m.index;
        let i = m.index + m[0].length; // just after "("
        let depth = 1;
        let quote = null;
        while (i < src.length && depth > 0) {
            const ch = src[i];
            if (quote) {
                if (ch === quote) {
                    if (src[i + 1] === quote) i++; // escaped quote
                    else quote = null;
                }
            } else if (ch === "'" || ch === '"') {
                quote = ch;
            } else if (ch === "(") {
                depth++;
            } else if (ch === ")") {
                depth--;
            }
            i++;
        }
        if (depth === 0) found.add(src.slice(start, i).trim());
    }
    return [...found];
}

/**
 * All string literals of a call's first argument, single or list:
 * read_parquet('a.parquet') → [a.parquet]; read_parquet(['a', 'b'], x=1) → [a, b].
 * Returns null when the first argument is not made of string literals only.
 */
export function stringArgs(call) {
    const open = call.indexOf("(");
    if (open < 0) return null;
    let s = call.slice(open + 1).trimStart();
    const isList = s.startsWith("[");
    if (isList) s = s.slice(1);
    const out = [];
    for (;;) {
        s = s.trimStart();
        if (!s.startsWith("'")) return null;
        let value = "";
        let i = 1;
        for (; i < s.length; i++) {
            if (s[i] === "'") {
                if (s[i + 1] === "'") { value += "'"; i++; continue; }
                break;
            }
            value += s[i];
        }
        if (i >= s.length) return null;
        out.push(value);
        s = s.slice(i + 1).trimStart();
        if (!isList) return out;
        if (s.startsWith(",")) { s = s.slice(1); continue; }
        return s.startsWith("]") ? out : null;
    }
}

/** Identity of one file of a file source, used to match parsed SQL against known sources. */
export const sourceSignature = (fn, path) => `${String(fn).toLowerCase()}|${path ?? ""}`;

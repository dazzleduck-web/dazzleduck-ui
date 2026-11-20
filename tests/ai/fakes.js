/**
 * Test doubles for the AI modules: a fake `runMeta` that imitates the
 * DazzleDuck server's json_serialize_sql / EXPLAIN / DESCRIBE / catalog answers.
 */

/** Minimal json_serialize_sql output for one SELECT statement. */
export function selectAst({ from = null, limit = false, ctes = [], statements = 1 } = {}) {
    const stmt = {
        node: {
            type: "SELECT_NODE",
            modifiers: limit ? [{ type: "LIMIT_MODIFIER" }] : [],
            cte_map: { map: ctes.map((key) => ({ key, value: {} })) },
            select_list: [],
            from_table: from,
        },
    };
    return { error: false, statements: Array.from({ length: statements }, () => stmt) };
}

export const fileFn = (name, path) => ({
    type: "TABLE_FUNCTION",
    function: { class: "FUNCTION", function_name: name, children: [{ class: "CONSTANT", value: { value: path } }] },
});

export const baseTable = (table) => ({ type: "BASE_TABLE", catalog_name: "", schema_name: "", table_name: table });

export const parserError = (msg = "syntax error at or near \"errors\"") =>
    ({ error: true, error_type: "parser", error_message: msg });

export const notSelectError = () =>
    ({ error: true, error_type: "not implemented", error_message: "Only SELECT statements can be serialized to json!" });

const PARSE_RE = /^SELECT json_serialize_sql\('([\s\S]*)'\) AS ast$/;

/**
 * @param {object} o
 * @param {(sql: string) => object} [o.parse]    sql -> json_serialize_sql output
 * @param {(sql: string) => true|string} [o.explain]  true = binds, string = error text
 * @param {Record<string, {name: string, type: string}[]>} [o.describe]  file call -> columns
 * @param {object[]} [o.catalog]  duckdb_columns rows
 */
export function makeRunMeta({ parse = () => selectAst(), explain = () => true, describe = {}, catalog = [] } = {}) {
    const calls = [];
    const runMeta = async (sql) => {
        calls.push(sql);
        const m = sql.match(PARSE_RE);
        if (m) {
            const inner = m[1].replace(/''/g, "'");
            return { rows: [{ ast: JSON.stringify(parse(inner)) }], columns: [{ name: "ast", type: "Utf8" }] };
        }
        if (sql.startsWith("EXPLAIN ")) {
            const r = explain(sql.slice(8));
            if (r === true) return { rows: [{ explain_key: "physical_plan", explain_value: "..." }], columns: [] };
            throw new Error(`Invalid Input Error: Attempting to execute an unsuccessful or closed pending query result\nError: ${r}`);
        }
        if (sql.startsWith("DESCRIBE SELECT * FROM ")) {
            const call = sql.slice("DESCRIBE SELECT * FROM ".length);
            if (!describe[call]) throw new Error("IO Error: No files found");
            return { rows: describe[call].map((c) => ({ column_name: c.name, column_type: c.type })), columns: [] };
        }
        if (sql.includes("FROM duckdb_columns()")) return { rows: catalog, columns: [] };
        throw new Error(`fake runMeta: unexpected SQL: ${sql}`);
    };
    runMeta.calls = calls;
    return runMeta;
}

/**
 * Builds the schema the AI is allowed to use: table/column NAMES and TYPES only,
 * never any values.
 *
 * Two kinds of sources:
 *  - catalog tables/views (duckdb_columns(), falling back to information_schema,
 *    then to `SELECT * FROM <claim table> LIMIT 0` for restricted users)
 *  - file sources such as read_parquet('…') found in the query rows' text,
 *    described with `DESCRIBE SELECT * FROM <call>`
 *
 * Everything is cached in memory for the life of the context (one connection).
 * A failed lookup is not cached, and refresh() reloads the catalog (used after a
 * generated query fails, so tables created since the first question are seen).
 * Described files stay cached: a file that wasn't found is retried anyway.
 */
import { extractSourceCalls, stringArgs, sourceSignature } from "./sqlText";

const qualify = (db, schema, table) => {
    const q = (s) => (/^[a-z_][a-z0-9_]*$/i.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`);
    if (db && db !== "memory") return `${q(db)}.${q(schema)}.${q(table)}`;
    if (schema && schema !== "main") return `${q(schema)}.${q(table)}`;
    return q(table);
};

const formatColumns = (columns, maxColumns) => {
    const shown = columns.slice(0, maxColumns).map((c) => `${c.name} ${c.type}`.trim());
    const more = columns.length > maxColumns ? `, … (${columns.length - maxColumns} more)` : "";
    return shown.join(", ") + more;
};

export function createSchemaContext({ runMeta, maxSources = 20, maxColumns = 150 }) {
    let catalogPromise = null;
    const fileCache = new Map(); // call text -> Promise<{columns} | null>

    async function loadCatalog(claims) {
        const group = (rows, db, sch, tbl, col, typ) => {
            const map = new Map();
            rows.forEach((r) => {
                const key = `${r[db] ?? ""}.${r[sch] ?? ""}.${r[tbl]}`;
                if (!map.has(key)) map.set(key, { db: r[db] ?? "", schema: r[sch] ?? "", table: r[tbl], columns: [] });
                map.get(key).columns.push({ name: r[col], type: r[typ] });
            });
            return [...map.values()];
        };

        try {
            const { rows } = await runMeta(
                "SELECT database_name, schema_name, table_name, column_name, data_type FROM duckdb_columns() " +
                "WHERE NOT internal ORDER BY database_name, schema_name, table_name, column_index"
            );
            return group(rows, "database_name", "schema_name", "table_name", "column_name", "data_type");
        } catch { /* try next source */ }

        try {
            const { rows } = await runMeta(
                "SELECT table_catalog, table_schema, table_name, column_name, data_type FROM information_schema.columns " +
                "WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY ALL"
            );
            return group(rows, "table_catalog", "table_schema", "table_name", "column_name", "data_type");
        } catch { /* try next source */ }

        const claimTables = String(claims?.table ?? "").split(",").map((t) => t.trim()).filter(Boolean);
        if (!claimTables.length) throw new Error("catalog unavailable");
        const tables = [];
        for (const table of claimTables.slice(0, maxSources)) {
            try {
                const { columns } = await runMeta(`SELECT * FROM ${table} LIMIT 0`);
                // "db.schema.table" → parts, so the safety check can compare qualified names
                const parts = table.split(".").map((p) => p.trim().replace(/^"|"$/g, ""));
                const name = parts.pop();
                tables.push({ db: parts.length > 1 ? parts[0] : "", schema: parts.at(-1) ?? "", table: name, columns });
            } catch { /* skip */ }
        }
        return tables;
    }

    function describeFile(call) {
        if (!fileCache.has(call)) {
            fileCache.set(call, runMeta(`DESCRIBE SELECT * FROM ${call}`)
                .then(({ rows }) => ({ columns: rows.map((r) => ({ name: r.column_name, type: r.column_type })) }))
                .catch(() => {
                    fileCache.delete(call); // don't remember a failure: the file may appear later
                    return null;
                }));
        }
        return fileCache.get(call);
    }

    /**
     * @param {{texts?: string[], claims?: object}} p  texts: SQL/question texts to look for file sources in
     * @returns {Promise<{text: string, tables: {db: string, schema: string, table: string}[], sourceSignatures: Set<string>}>}
     */
    async function getSchema({ texts = [], claims } = {}) {
        if (!catalogPromise) {
            catalogPromise = loadCatalog(claims).catch(() => {
                catalogPromise = null; // try again on the next question
                return [];
            });
        }
        const calls = [...new Set(texts.flatMap((t) => extractSourceCalls(t)))].slice(0, maxSources);
        const [tables, files] = await Promise.all([
            catalogPromise,
            Promise.all(calls.map(async (call) => ({ call, info: await describeFile(call) }))),
        ]);

        const fileSources = files.filter((f) => f.info && f.info.columns.length > 0);
        // One signature per file of each source (a source may list several files)
        const sourceSignatures = new Set(fileSources.flatMap(({ call }) => {
            const fn = call.slice(0, call.indexOf("(")).trim();
            return (stringArgs(call) || []).map((path) => sourceSignature(fn, path));
        }));

        const lines = [];
        if (tables.length) {
            lines.push("Tables:");
            tables.slice(0, maxSources).forEach((t) =>
                lines.push(`- ${qualify(t.db, t.schema, t.table)}(${formatColumns(t.columns, maxColumns)})`));
        }
        if (fileSources.length) {
            lines.push("File sources (use the call exactly as written, in FROM):");
            fileSources.forEach(({ call, info }) =>
                lines.push(`- ${call}  -- columns: ${formatColumns(info.columns, maxColumns)}`));
        }

        return {
            text: lines.join("\n"),
            tables: tables.map(({ db, schema, table }) => ({ db, schema, table })),
            sourceSignatures,
        };
    }

    function refresh() {
        catalogPromise = null;
    }

    return { getSchema, refresh };
}

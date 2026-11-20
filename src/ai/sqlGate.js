/**
 * Safety check for AI-generated SQL, run before it executes.
 *
 * The DazzleDuck server's default access mode accepts any statement, and the
 * user does not review generated SQL before it runs, so we check it here using
 * the server's own parser:
 *   1. parses, exactly one statement, a SELECT (non-SELECTs fail serialization)
 *   2. table functions only for known file sources (plus range/generate_series/unnest);
 *      range/generate_series with literal bounds are capped in size (MAX_GENERATED_ROWS)
 *   3. base tables only from the schema (or CTE names)
 *   4. EXPLAIN binds (no execution)
 *   5. a LIMIT is appended when the top-level query has none
 */
import { cleanSql, sourceSignature } from "./sqlText";
import { parseSql, isNotSelectError, explainSql } from "./sqlParse";

const SAFE_TABLE_FUNCTIONS = new Set(["range", "generate_series", "unnest"]);
const GENERATORS = new Set(["range", "generate_series"]);
/** Largest number of rows one generator, or all generators of a query together, may produce. */
export const MAX_GENERATED_ROWS = 1_000_000;

const ARITHMETIC = {
    "+": (a, b) => (b === undefined ? a : a + b),
    "-": (a, b) => (b === undefined ? -a : a - b),
    "*": (a, b) => a * b,
    "/": (a, b) => a / b,
    "//": (a, b) => Math.trunc(a / b),
    "^": (a, b) => a ** b,
    "**": (a, b) => a ** b,
};

/** Value of a numeric literal expression (e.g. 1000, 1e6, 10*1000), or null when it isn't one. */
const constNumber = (node) => {
    if (!node || typeof node !== "object") return null;
    if (node.class === "CONSTANT") {
        const v = node.value?.value;
        if (typeof v === "number") return v;
        if (typeof v === "string" && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v.trim())) return Number(v);
        if (v && typeof v === "object" && ("upper" in v || "lower" in v)) return Infinity; // HUGEINT
        return null;
    }
    if (node.class === "CAST") return constNumber(node.child);
    if (node.class === "FUNCTION" && ARITHMETIC[node.function_name]) {
        const args = (node.children || []).map(constNumber);
        if (!args.length || args.length > 2 || args.some((a) => a === null)) return null;
        return ARITHMETIC[node.function_name](...args);
    }
    return null;
};

/** Rows a range()/generate_series() call produces, or null when its bounds are not plain numbers. */
export function generatorSize(name, args) {
    const nums = args.map(constNumber);
    if (!nums.length || nums.some((n) => n === null || Number.isNaN(n))) return null;
    const [start, stop, step = 1] = nums.length === 1 ? [0, nums[0]] : nums;
    if (step === 0) return Infinity;
    const span = (stop - start) / step;
    // range() stops before `stop`; generate_series() includes it
    const count = name === "generate_series" ? Math.floor(span) + 1 : Math.ceil(span);
    return Math.max(0, count);
}

const constString = (node) =>
    node?.class === "CONSTANT" && typeof node.value?.value === "string" ? node.value.value : null;

/** Every path of a file argument: 'a' → [a]; ['a', 'b'] → [a, b]; null if any part isn't a literal. */
const constStrings = (node) => {
    if (!node || typeof node !== "object") return null;
    const one = constString(node);
    if (one !== null) return [one];
    if (node.class === "FUNCTION" && node.function_name === "list_value") {
        const all = (node.children || []).map(constString);
        return all.length && all.every((p) => p !== null) ? all : null;
    }
    return null;
};

/** A table reference matches a known table on name, and on schema/catalog when it gives them. */
const knownTable = (ref, tables) => {
    const lc = (s) => String(s || "").toLowerCase();
    return tables.some((t) => lc(t.table) === lc(ref.table) &&
        (!ref.schema || lc(ref.schema) === lc(t.schema) || (!t.schema && lc(ref.schema) === "main")) &&
        (!ref.catalog || lc(ref.catalog) === lc(t.db) || (!t.db && lc(ref.catalog) === "memory")));
};

function walk(node, visit) {
    if (Array.isArray(node)) {
        node.forEach((n) => walk(n, visit));
    } else if (node && typeof node === "object") {
        visit(node);
        Object.values(node).forEach((v) => walk(v, visit));
    }
}

/** Collect table functions, base tables and CTE names referenced anywhere in a statement AST. */
export function collectRefs(statement) {
    const tableFunctions = [];
    const tables = [];
    const cteNames = new Set();
    walk(statement, (n) => {
        if (n.type === "TABLE_FUNCTION" && n.function) {
            tableFunctions.push({
                name: String(n.function.function_name || ""),
                paths: constStrings(n.function.children?.[0]),
                args: n.function.children || [],
            });
        } else if (n.type === "BASE_TABLE" && n.table_name) {
            tables.push({ catalog: n.catalog_name || "", schema: n.schema_name || "", table: n.table_name });
        }
        if (Array.isArray(n.cte_map?.map)) {
            n.cte_map.map.forEach((e) => e?.key && cteNames.add(String(e.key).toLowerCase()));
        }
    });
    return { tableFunctions, tables, cteNames };
}

export const hasTopLevelLimit = (statement) =>
    (statement?.node?.modifiers || []).some((m) => /LIMIT/.test(m?.type || ""));

const fail = (error) => ({ ok: false, error });

/**
 * @param {object} p
 * @param {(sql: string) => Promise<{rows: object[]}>} p.runMeta
 * @param {string} p.sql            generated SQL
 * @param {{tables: {db: string, schema: string, table: string}[], sourceSignatures: Set<string>}} p.schema
 * @param {number} p.defaultLimit
 * @returns {Promise<{ok: true, sql: string} | {ok: false, error: string}>}
 */
export async function checkGeneratedSql({ runMeta, sql, schema, defaultLimit }) {
    const clean = cleanSql(sql);
    if (!clean) return fail("The AI returned an empty query.");

    const parsed = await parseSql(runMeta, clean);
    if (!parsed.ok) {
        return fail(isNotSelectError(parsed)
            ? "Only a read-only SELECT query is allowed."
            : `SQL syntax error: ${parsed.message}`);
    }

    const statements = parsed.ast.statements || [];
    if (statements.length !== 1) return fail("Exactly one SQL statement is allowed.");

    const { tableFunctions, tables, cteNames } = collectRefs(statements[0]);

    let generatedRows = 1;
    for (const tf of tableFunctions) {
        const name = tf.name.toLowerCase();
        if (GENERATORS.has(name)) {
            const size = generatorSize(name, tf.args);
            if (size !== null) generatedRows *= Math.max(size, 1);
            if (size !== null && generatedRows > MAX_GENERATED_ROWS) {
                return fail(`Generated data is too large (over ${MAX_GENERATED_ROWS.toLocaleString("en-US")} rows). ` +
                    "Use smaller range()/generate_series() bounds.");
            }
        }
        if (SAFE_TABLE_FUNCTIONS.has(name)) continue;
        // Every file it reads must be a known file of that function (a list can't smuggle in others)
        const unknown = !tf.paths ? "" : tf.paths.find((p) => !schema.sourceSignatures.has(sourceSignature(name, p)));
        if (!tf.paths || unknown !== undefined) {
            const shown = tf.paths ? `'${unknown}'` : "";
            return fail(`Table function ${tf.name}(${shown}) is not allowed. ` +
                "Use only the file sources listed in the schema, copied exactly.");
        }
    }

    const knownTables = schema.tables || [];
    for (const t of tables) {
        const isCte = !t.schema && !t.catalog && cteNames.has(t.table.toLowerCase());
        if (isCte || knownTable(t, knownTables)) continue;
        const shown = [t.catalog, t.schema, t.table].filter(Boolean).join(".");
        return fail(`Unknown table "${shown}". Use only the tables listed in the schema.`);
    }

    const explained = await explainSql(runMeta, clean);
    if (!explained.ok) return fail(explained.message);

    return {
        ok: true,
        sql: hasTopLevelLimit(statements[0]) ? clean : `${clean}\nLIMIT ${defaultLimit}`,
    };
}

/**
 * Prompt assembly and the fixed JSON answer format for SQL generation.
 * Only the question, schema names/types and earlier question/SQL turns are
 * sent; never any query results.
 */

export const DISPLAYS = ["table", "line", "bar", "pie"];
export const KINDS = ["nl", "sql", "message"];

/**
 * The answer format, as standard JSON Schema (strict-mode compatible: every
 * property required, no additional properties). Each adapter passes it to its
 * provider's structured-output feature (Gemini converts it to its own dialect).
 */
export const RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        kind: { type: "string", enum: KINDS },
        sql: { type: "string" },
        display: { type: "string", enum: DISPLAYS },
        explanation: { type: "string" },
    },
    required: ["kind", "sql", "display", "explanation"],
    additionalProperties: false,
};

const RULES = `You turn a user's input into ONE DuckDB SQL query for a data analytics UI.

Answer only with the JSON object of the response schema:
- kind: "nl" when the input is a natural-language request and you wrote SQL for it.
        "sql" only when the input is itself SQL the user meant to run as written (you will be told when the input parses as SQL).
        "message" when the input is not a data request (greeting, thanks, "what can you do") or cannot be answered from the schema. Leave sql empty and put a short, friendly reply or the reason in explanation.
- sql: the query. Empty when kind is "sql" or "message".
- display: one of table | line | bar | pie.
- explanation: one short sentence saying what the query returns.

SQL rules:
1. Exactly one read-only SELECT (WITH ... SELECT is fine). Never INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, COPY, ATTACH, SET, PRAGMA or INSTALL.
2. Use only the tables and file sources listed in the schema. Copy a file source call exactly as written (same function, path and options) into FROM. Never invent tables, files or columns.
3. DuckDB dialect: now(), current_date, INTERVAL 1 HOUR, date_trunc('day', ts), ILIKE for case-insensitive matching, double-quote identifiers that need it.
4. Row listings get a LIMIT of at most 1000.
5. No semicolons, no comments.
6. Requests that need no stored data are fine without any table: arithmetic, literal values, or generated rows using range(n), generate_series, random(), uuid(), string functions, etc.
7. If the request needs data that is not in the schema, answer kind "message" and say which data is missing (for example: "Run a query that reads your logs file in any row first").

Display and column order (the UI charts the first columns):
- If the user asks for a specific display ("as a table", "as a pie chart", "line chart"…), use it.
- line: a trend over time. Column 1 = time or date (x axis), column 2 = a numeric measure, optional column 3 = a series label. ORDER BY column 1.
- bar: compare categories. Column 1 = category, column 2 = a numeric measure, optional column 3 = a series label.
- pie: share of a whole with at most 10 categories. Column 1 = label, column 2 = numeric value.
- table: row listings, many columns, a single value, or anything else.

Examples (an imaginary schema with the file source read_parquet('/data/events.parquet') and columns ts TIMESTAMP, level VARCHAR, service VARCHAR, ms DOUBLE; always use the real schema below instead):
- "errors per service" → {"kind":"nl","sql":"SELECT service, count(*) AS errors FROM read_parquet('/data/events.parquet') WHERE level ILIKE 'error' GROUP BY service ORDER BY errors DESC","display":"bar","explanation":"Number of error events per service."}
- "average ms per hour today as a line chart" → {"kind":"nl","sql":"SELECT date_trunc('hour', ts) AS hour, avg(ms) AS avg_ms FROM read_parquet('/data/events.parquet') WHERE ts >= current_date GROUP BY hour ORDER BY hour","display":"line","explanation":"Average duration per hour since midnight."}
- "5 random numbers" → {"kind":"nl","sql":"SELECT random() AS value FROM range(5)","display":"table","explanation":"Five random numbers."}
- "thanks!" → {"kind":"message","sql":"","display":"table","explanation":"You're welcome! Ask me about your data any time."}`;

const formatNow = (now) => {
    const pad = (n) => String(Math.abs(Math.trunc(n))).padStart(2, "0");
    const off = -now.getTimezoneOffset();
    const tz = `${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`;
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())} (UTC${tz})`;
};

export function buildSystemPrompt({ schemaText, now = new Date() }) {
    return `${RULES}

Current time: ${formatNow(now)}

# Schema
${schemaText || "(no tables or file sources found)"}`;
}

/**
 * @param {object} p
 * @param {string} p.text            the user's input (variables already substituted)
 * @param {{question: string, sql: string}[]} [p.history]  earlier turns of this row
 * @param {{kind: string, bindError?: string}} [p.detection]
 * @param {{sql: string, error: string}} [p.feedback]       previous invalid attempt
 */
export function buildUserPrompt({ text, history = [], detection, feedback }) {
    const parts = [];
    if (history.length) {
        parts.push("Earlier turns in this query row (use them only to resolve references like \"that\" or \"same but…\"; answer only the new input):");
        history.forEach((h) => parts.push(`- Q: ${h.question}\n  SQL: ${h.sql}`));
        parts.push("");
    }
    parts.push(`Input:\n${text}`);
    if (detection?.kind === "unclear") {
        parts.push(`\nNote: this input parses as SQL but fails to bind: ${detection.bindError}\n` +
            "If the user meant to write SQL, answer kind \"sql\". If it is a natural-language request, answer kind \"nl\" with new SQL.");
    } else {
        parts.push("\nNote: the input is a natural-language request (not SQL). Answer kind \"nl\" or \"message\".");
    }
    if (feedback) {
        parts.push(`\nYour previous SQL was invalid and must be corrected.\nFailed SQL:\n${feedback.sql}\nError:\n${feedback.error}\n` +
            "Return corrected SQL with kind \"nl\".");
    }
    return parts.join("\n");
}

/** What every provider returns when the model declines a request (nothing runs). */
export const REFUSAL_ANSWER = Object.freeze({ kind: "message", sql: "", display: "table", explanation: "The AI declined this request." });

/** Normalise the model's JSON answer into a safe shape. */
export function normalizeAnswer(json) {
    const obj = json && typeof json === "object" ? json : {};
    const kind = KINDS.includes(obj.kind) ? obj.kind : "nl";
    const display = DISPLAYS.includes(obj.display) ? obj.display : "table";
    const sql = String(obj.sql ?? "")
        .replace(/^\s*```(?:sql)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
    const explanation = String(obj.explanation ?? "").trim();
    return { kind, sql, display, explanation };
}

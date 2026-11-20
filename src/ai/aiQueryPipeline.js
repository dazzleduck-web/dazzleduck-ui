/**
 * The AI query flow for one Run:
 *
 *   reuse?  → same question and same schema as this row's last AI run: reuse its SQL (no AI call)
 *   detect  → SQL or question (server parser, see inputDetector)
 *   SQL     → run the user's own text, untouched
 *   question→ build schema context → AI writes SQL → safety check (sqlGate)
 *             → on failure feed the error back and retry (max `maxAttempts` AI calls)
 *
 * resolve() returns one of:
 *   { source: "user",    sqlToRun, unclear? }
 *   { source: "ai",      sqlToRun, generatedSql, display, explanation, meta }
 *   { source: "message", message }
 * and throws AiError for anything the user should see as an error.
 */
import { AiError } from "./errors";
import { detectInput } from "./inputDetector";
import { checkGeneratedSql } from "./sqlGate";
import { buildSystemPrompt, buildUserPrompt, normalizeAnswer, RESPONSE_SCHEMA } from "./prompts";
import { DEFAULT_LIMIT } from "./config";

/** Short fingerprint of the schema text, kept with a run to know if its SQL can be reused. */
const schemaKeyOf = (text) => {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return `${text.length}:${h.toString(36)}`;
};

export function createAiPipeline({
    provider,
    runMeta,
    schemaContext,
    defaultLimit = DEFAULT_LIMIT,
    maxAttempts = 3,
    now = () => new Date(),
}) {
    // An empty schema is fine: questions like "2 * 2" or "4 fake emails" need no data.
    // If a question needs data that isn't known, the model answers kind "message" and says so.
    const loadSchema = ({ text, rowTexts, claims }) =>
        schemaContext.getSchema({ texts: [text, ...rowTexts], claims });

    async function generateChecked({ text, history, detection, schema, feedback, attempts, signal }) {
        const system = buildSystemPrompt({ schemaText: schema.text, now: now() });
        let lastSql = feedback?.sql ?? null;
        let lastError = feedback?.error ?? null;
        let totalMs = 0;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            const user = buildUserPrompt({
                text, history, detection,
                feedback: lastError ? { sql: lastSql, error: lastError } : null,
            });
            const { json, ms } = await provider.generate({ system, user, responseSchema: RESPONSE_SCHEMA, signal });
            totalMs += ms || 0;
            const answer = normalizeAnswer(json);

            if (answer.kind === "sql" && detection?.kind === "unclear") {
                return { source: "user", sqlToRun: text, unclear: true };
            }
            if (answer.kind === "message" || !answer.sql) {
                return {
                    source: "message",
                    message: answer.explanation || "I couldn't turn that into a query. Try rephrasing, or enter SQL.",
                };
            }

            const gate = await checkGeneratedSql({ runMeta, sql: answer.sql, schema, defaultLimit });
            if (gate.ok) {
                return {
                    source: "ai",
                    sqlToRun: gate.sql,
                    generatedSql: gate.sql,
                    display: answer.display,
                    explanation: answer.explanation,
                    meta: { model: provider.model, ms: totalMs, attempts: attempt, schemaKey: schemaKeyOf(schema.text) },
                };
            }
            lastSql = answer.sql;
            lastError = gate.error;
        }

        throw new AiError("invalid_sql",
            `Couldn't generate a valid read-only query after ${attempts} tries. Last error: ${lastError}`,
            { generatedSql: lastSql });
    }

    /**
     * @param {object} p
     * @param {string} p.text             input with {variables} substituted
     * @param {{question: string, sql: string}[]} [p.history]
     * @param {object} [p.reuse]          { question, sql, display, explanation, meta } of the row's last AI run
     * @param {string[]} [p.rowTexts]     other rows' texts (to find file sources)
     * @param {object} [p.claims]
     * @param {boolean} [p.forceQuestion] skip detection, treat the text as a question
     * @param {AbortSignal} [p.signal]
     * @param {(phase: string) => void} [p.onPhase]
     */
    async function resolve({ text, history = [], reuse, rowTexts = [], claims, forceQuestion = false, signal, onPhase }) {
        // The schema is needed for reuse and for questions; load it while detection runs (it's cached)
        const schemaP = loadSchema({ text, rowTexts, claims });
        if (!forceQuestion && reuse?.sql && reuse.question === text &&
            schemaKeyOf((await schemaP).text) === reuse.meta?.schemaKey) {
            return {
                source: "ai",
                sqlToRun: reuse.sql,
                generatedSql: reuse.sql,
                display: reuse.display,
                explanation: reuse.explanation,
                meta: { ...(reuse.meta || {}), reused: true },
            };
        }

        const detection = forceQuestion ? { kind: "nl" } : await detectInput(runMeta, text);
        if (detection.kind === "sql" || detection.kind === "empty") return { source: "user", sqlToRun: text };

        if (!provider) {
            throw new AiError("not_configured",
                "This looks like a question, but the AI assistant is not configured. " +
                "Enter SQL, or add an AI key in Connection Settings.");
        }
        if (signal?.aborted) throw new AiError("aborted", "Cancelled.");

        onPhase?.("generating");
        return generateChecked({ text, history, detection, schema: await schemaP, attempts: maxAttempts, signal });
    }

    /** One more AI attempt after generated SQL failed at execution time. */
    async function repair({ text, history = [], rowTexts = [], claims, failedSql, error, signal, onPhase }) {
        if (!provider) throw new AiError("not_configured", "The AI assistant is not configured.");
        onPhase?.("generating");
        schemaContext.refresh?.(); // the failure may come from a stale schema
        const schema = await loadSchema({ text, rowTexts, claims });
        return generateChecked({
            text, history, detection: { kind: "nl" }, schema,
            feedback: { sql: failedSql, error }, attempts: 1, signal,
        });
    }

    return { resolve, repair };
}

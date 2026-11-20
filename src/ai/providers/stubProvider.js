/**
 * Deterministic provider for tests: returns queued answers (or calls a function)
 * instead of calling a real AI service. Records every request it receives.
 */
import { AiError } from "../errors";

export function createStubProvider(answers = []) {
    const queue = Array.isArray(answers) ? [...answers] : null;
    const calls = [];

    async function generate(request) {
        calls.push(request);
        if (request.signal?.aborted) throw new AiError("aborted", "Cancelled.");
        const next = queue ? queue.shift() : answers(request);
        if (next instanceof Error) throw next;
        return {
            json: next ?? { kind: "message", sql: "", display: "table", explanation: "No stub answer." },
            usage: null,
            ms: 1,
        };
    }

    return { name: "stub", model: "stub-model", generate, calls };
}

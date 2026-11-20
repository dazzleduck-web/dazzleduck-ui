import { AiError } from "../errors";

/**
 * Wrap a provider so its calls run one at a time. "Run All" then generates
 * question rows sequentially, which is friendlier to free-tier rate limits.
 */
export function serializeProvider(provider) {
    let chain = Promise.resolve();
    return {
        ...provider,
        generate(request) {
            const run = chain.then(() => {
                // cancelled while waiting in the queue: don't call the provider at all
                if (request?.signal?.aborted) throw new AiError("aborted", "Cancelled.");
                return provider.generate(request);
            });
            chain = run.catch(() => {});
            return run;
        },
    };
}

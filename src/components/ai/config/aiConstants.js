/**
 * Centralized AI conversation management constants
 * These constants define how messages are handled across persistence, compaction, and UI
 */

/**
 * Persistence: Maximum messages to store in session/local storage
 * When saving chat state, only the last PERSISTENCE_MAX_MESSAGES are kept
 */
export const PERSISTENCE_MAX_MESSAGES = 100;

/**
 * Compaction: Threshold that triggers the compaction check
 * When messages.length > this threshold, the compaction effect runs
 * This is an early warning to prevent messages from growing too large
 */
export const COMPACTION_TRIGGER_THRESHOLD = 80;

/**
 * Compaction: Maximum messages before actual compaction occurs
 * When messages.length > this, compactMessages reduces the conversation
 * to: [welcomeMessage, ...lastN messages where N=COMPACTION_KEEP_COUNT]
 */
export const COMPACTION_MAX_MESSAGES = 100;

/**
 * Compaction: Number of recent messages to preserve after compaction
 * After compaction, the result is: [welcomeMessage, ...last 30 messages]
 * This keeps recent context while reducing total message count
 */
export const COMPACTION_KEEP_COUNT = 30;

/**
 * Tool Execution: Maximum number of turns in multi-turn tool execution loop
 * When Gemini calls tools iteratively, this limits how many back-and-forth turns can happen
 * Higher values allow more complex workflows but increase API costs and latency
 */
export const MAX_TOOL_TURNS = 10;

/**
 * Per-Query Timeout: Maximum time (ms) to wait for a single named query to execute
 * If a query exceeds this time, it's treated as timed out and the bulk operation continues
 * 30 seconds is reasonable for most queries; very long-running queries should be identified
 */
export const QUERY_EXECUTION_TIMEOUT_MS = 30000;

/**
 * Relationship diagram:
 *
 * Message flow:
 * 0 -------- TRIGGER_THRESHOLD(80) ---- MAX_MESSAGES(100) ----
 *            ↑                           ↑
 *            |                           |
 *        Effect runs,          Compaction actually executes
 *        but no action         Result: [1st message + last 30 messages]
 *        (under MAX)           Total: 31 messages
 *
 * When saving to storage:
 * Keeps last PERSISTENCE_MAX_MESSAGES (100) messages
 */

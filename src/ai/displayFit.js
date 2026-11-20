/**
 * The AI picks a display before the query runs. Check that the actual result
 * can be drawn that way (DisplayCharts uses the first columns), and fall back
 * to a table when it can't.
 */
const MAX_PIE_ROWS = 20;
const MAX_BAR_ROWS = 100;

const isNumeric = (v) =>
    typeof v === "number" || typeof v === "bigint" ||
    (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)));

const numericColumn = (data, key) =>
    key !== undefined && data.some((r) => r[key] != null) &&
    data.every((r) => r[key] == null || isNumeric(r[key]));

/**
 * @param {string} display  "table" | "line" | "bar" | "pie"
 * @param {object[]} data   result rows
 * @returns {string} the display to use
 */
export function fitDisplay(display, data) {
    if (!display || display === "table") return "table";
    if (!Array.isArray(data) || data.length === 0) return "table";
    const keys = Object.keys(data[0] || {});
    if (keys.length < 2) return "table";
    const [k1, k2, k3] = keys;

    if (display === "pie") {
        if (data.length > MAX_PIE_ROWS) return "table";
        return numericColumn(data, k1) || numericColumn(data, k2) ? "pie" : "table";
    }
    if (!numericColumn(data, k2) && !numericColumn(data, k3)) return "table";
    if (display === "line") return data.length >= 2 ? "line" : "table";
    if (display === "bar") return data.length <= MAX_BAR_ROWS ? "bar" : "table";
    return "table";
}

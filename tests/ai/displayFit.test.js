import { describe, it, expect } from "vitest";
import { fitDisplay } from "../../src/ai/displayFit";

const rows = (n, make) => Array.from({ length: n }, (_, i) => make(i));

describe("fitDisplay", () => {
    it("keeps a chart the result can be drawn as", () => {
        expect(fitDisplay("pie", rows(3, (i) => ({ type: `t${i}`, n: i + 1 })))).toBe("pie");
        expect(fitDisplay("bar", rows(5, (i) => ({ type: `t${i}`, n: BigInt(i) })))).toBe("bar");
        expect(fitDisplay("line", rows(4, (i) => ({ ts: `2026-01-0${i + 1}`, v: String(i) })))).toBe("line");
    });

    it("falls back to a table when the result doesn't fit", () => {
        expect(fitDisplay("pie", rows(50, (i) => ({ type: `t${i}`, n: i })))).toBe("table");   // too many slices
        expect(fitDisplay("bar", rows(3, (i) => ({ a: `x${i}`, b: `y${i}` })))).toBe("table");  // nothing numeric
        expect(fitDisplay("line", [{ ts: "2026-01-01", v: 1 }])).toBe("table");                // one point
        expect(fitDisplay("bar", [{ only: 1 }])).toBe("table");                                // one column
        expect(fitDisplay("pie", [])).toBe("table");
        expect(fitDisplay(undefined, [{ a: 1, b: 2 }])).toBe("table");
    });
});

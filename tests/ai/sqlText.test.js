import { describe, it, expect } from "vitest";
import { stringArgs } from "../../src/ai/sqlText";

describe("stringArgs", () => {
    it("returns every literal of the first argument, single or list", () => {
        expect(stringArgs("read_parquet('a.parquet')")).toEqual(["a.parquet"]);
        expect(stringArgs("read_parquet(['a.parquet', 'it''s.parquet'], hive_partitioning=true)")).toEqual(["a.parquet", "it's.parquet"]);
        expect(stringArgs("read_csv('x.csv', header=true)")).toEqual(["x.csv"]);
        expect(stringArgs("read_parquet(getenv('P'))")).toBeNull();
        expect(stringArgs("read_parquet(['a', b])")).toBeNull();
    });
});
import { cleanSql, quoteSqlString, extractSourceCalls, sourceSignature } from "../../src/ai/sqlText";

describe("sqlText", () => {
    it("quotes strings and cleans trailing semicolons", () => {
        expect(quoteSqlString("it's")).toBe("'it''s'");
        expect(cleanSql("  SELECT 1 ;; \n")).toBe("SELECT 1");
    });

    it("extracts file source calls with nested parens and quoted text", () => {
        const sql = `SELECT * FROM read_parquet('data/(x)/*.parquet', hive_partitioning=true) a
                     JOIN READ_CSV('it''s.csv', columns={'a': 'INT'}) b ON true`;
        expect(extractSourceCalls(sql)).toEqual([
            "read_parquet('data/(x)/*.parquet', hive_partitioning=true)",
            "READ_CSV('it''s.csv', columns={'a': 'INT'})",
        ]);
        expect(extractSourceCalls("errors per service")).toEqual([]);
    });

    it("builds a case-insensitive source signature", () => {
        expect(sourceSignature("READ_PARQUET", "a")).toBe("read_parquet|a");
    });
});

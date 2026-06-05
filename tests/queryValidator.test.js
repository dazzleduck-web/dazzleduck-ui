import { describe, expect, it } from "vitest";
import { normalizeReadOnlyQuery, validateReadOnlyQuery } from "../src/components/ai/tools/queryValidator.js";

describe("queryValidator", () => {
  describe("normalizeReadOnlyQuery", () => {
    it("normalizes read-only SELECT queries without adding LIMIT", () => {
      expect(normalizeReadOnlyQuery("SELECT * FROM users")).toBe("SELECT * FROM users");
    });

    it("preserves an existing LIMIT clause", () => {
      expect(normalizeReadOnlyQuery("SELECT name FROM users LIMIT 50")).toBe("SELECT name FROM users LIMIT 50");
    });
  });

  describe("validateReadOnlyQuery", () => {
    it("allows a safe SELECT query", () => {
      expect(validateReadOnlyQuery("SELECT * FROM users")).toBe("SELECT * FROM users");
    });

    it("rejects write operations", () => {
      expect(() => validateReadOnlyQuery("DELETE FROM users")).toThrow(/Write operations are not allowed/i);
    });

    it("rejects multiple statements", () => {
      expect(() => validateReadOnlyQuery("SELECT * FROM users; DROP TABLE backup")).toThrow(
        /Multiple SQL statements are not allowed/i
      );
    });

    it("rejects empty input", () => {
      expect(() => validateReadOnlyQuery("")).toThrow(/Query is empty or invalid/i);
    });
  });
});

import { describe, expect, it } from "vitest";
import { normalizeDateForInput, normalizeOption, normalizeText, stableHash, summarizeValue } from "../../src/core/normalize";

describe("normalization", () => {
  it("normalizes labels without erasing meaningful symbols", () => {
    expect(normalizeText("  LinkedIn_URL (Required)* ")).toBe("linkedin url");
    expect(normalizeText("C++ / C# experience")).toBe("c++ c# experience");
  });

  it("normalizes safe option aliases", () => {
    expect(normalizeOption("USA")).toBe("united states");
    expect(normalizeOption("Yes")).toBe("true");
    expect(normalizeOption("No")).toBe("false");
  });

  it("preserves date precision", () => {
    expect(normalizeDateForInput("2024-05", "month")).toBe("2024-05");
    expect(normalizeDateForInput("2024-05", "date")).toBeUndefined();
    expect(normalizeDateForInput("2024-05-02", "date")).toBe("2024-05-02");
  });

  it("has stable hashes and redacts email summaries", () => {
    expect(stableHash("field")).toBe(stableHash("field"));
    expect(summarizeValue("ada@example.test")).toBe("ad•••@example.test");
  });
});

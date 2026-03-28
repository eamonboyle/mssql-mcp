import { describe, expect, it } from "vitest";
import {
  buildInlineDataAttachment,
  createToolResult,
} from "../mcpResults.js";

describe("buildInlineDataAttachment", () => {
  it("returns JSON for arrays", () => {
    const s = buildInlineDataAttachment([{ a: 1 }]);
    expect(s).toContain("\n\n");
    expect(s).toContain('"a": 1');
  });

  it("returns JSON for plain objects", () => {
    const s = buildInlineDataAttachment({ summary: "x", indexes: [] });
    expect(s).toContain('"summary": "x"');
  });

  it("skips strings (e.g. normalized tool payloads that surface XML as data)", () => {
    expect(buildInlineDataAttachment("<ShowPlanXML />")).toBe("");
  });

  it("truncates long arrays with a note", () => {
    const arr = Array.from({ length: 600 }, (_, i) => ({ n: i }));
    const s = buildInlineDataAttachment(arr);
    expect(s).toContain("500 of 600");
  });
});

describe("createToolResult", () => {
  it("appends array data to the text block on success", () => {
    const result = createToolResult({
      version: 1,
      success: true,
      message: "Found 2 relationship row(s).",
      data: [
        { parentTableName: "A", referencedTableName: "B" },
        { parentTableName: "B", referencedTableName: "C" },
      ],
    });
    expect(result.content[0]?.type).toBe("text");
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("Found 2 relationship row(s).");
      expect(result.content[0].text).toContain("parentTableName");
    }
  });

  it("does not append data on failure", () => {
    const result = createToolResult({
      version: 1,
      success: false,
      message: "Failed.",
      error: { code: "X" },
      data: [{ should: "not appear" }],
    });
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).not.toContain("should");
    }
  });
});

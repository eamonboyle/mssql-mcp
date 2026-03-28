import { describe, expect, it } from "vitest";
import {
  buildInlineDataAttachment,
  createToolResult,
  toToolStructuredContent,
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

  it("skips strings", () => {
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
    expect(result.structuredContent).toMatchObject({
      version: 1,
      success: true,
      message: "Found 2 relationship row(s).",
    });
    expect(Array.isArray(result.structuredContent?.data)).toBe(true);
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
    expect(result.structuredContent?.success).toBe(false);
    expect(result.structuredContent?.error).toEqual({ code: "X" });
  });
});

describe("toToolStructuredContent", () => {
  it("stringifies bigint fields for JSON compatibility", () => {
    const structured = toToolStructuredContent({
      version: 1,
      success: true,
      message: "ok",
      data: [{ n: 99n }],
    });
    expect(structured.data).toEqual([{ n: "99" }]);
  });
});

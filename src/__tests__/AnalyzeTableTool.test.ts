import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../schema.js", () => ({
  analyzeTable: vi.fn(),
}));

import { analyzeTable } from "../schema.js";
import {
  AnalyzeTableTool,
  formatAnalyzeTableText,
} from "../tools/AnalyzeTableTool.js";

const analyzeTableMock = vi.mocked(analyzeTable);

describe("formatAnalyzeTableText", () => {
  it("renders summary and indexes", () => {
    const text = formatAnalyzeTableText({
      summary: {
        schemaName: "dbo",
        tableName: "Productions",
        rowCount: 1200n,
        reservedMB: 1.5,
        usedMB: 1.25,
      },
      indexes: [
        { name: "PK_Prod", type: "CLUSTERED", isUnique: true, isPrimaryKey: 1 },
        { name: "IX_Title", type: "NONCLUSTERED", isUnique: false, isPrimaryKey: false },
      ],
    });

    expect(text).toContain("Table: dbo.Productions");
    expect(text).toContain("Estimated rows: 1200");
    expect(text).toContain("Reserved: 1.5 MB");
    expect(text).toContain("Used: 1.25 MB");
    expect(text).toContain("PK_Prod: CLUSTERED");
    expect(text).toContain("primary key");
    expect(text).toContain("IX_Title: NONCLUSTERED");
  });

  it("handles empty index list", () => {
    expect(
      formatAnalyzeTableText({
        summary: {
          schemaName: "s",
          tableName: "t",
          rowCount: 0,
          reservedMB: 0,
          usedMB: 0,
        },
        indexes: [],
      })
    ).toContain("(none)");
  });
});

describe("AnalyzeTableTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("includes formatted stats in message on success", async () => {
    analyzeTableMock.mockResolvedValue({
      summary: {
        schemaName: "dbo",
        tableName: "Productions",
        rowCount: 99,
        reservedMB: 2,
        usedMB: 1,
      },
      indexes: [],
    });

    const tool = new AnalyzeTableTool();
    const result = await tool.run({ tableName: "Productions" });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Analyzed Productions successfully.");
    expect(result.message).toContain("Table: dbo.Productions");
    expect(result.message).toContain("Estimated rows: 99");
    expect((result as { data?: unknown }).data).toBeDefined();
  });

  it("reports missing table without detail block", async () => {
    analyzeTableMock.mockResolvedValue({
      summary: null,
      indexes: [],
    });

    const tool = new AnalyzeTableTool();
    const result = await tool.run({ tableName: "Nope" });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/No table named/);
    expect(result.message).not.toContain("Estimated rows:");
  });
});

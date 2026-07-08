import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../schema.js", () => ({
  getDatabaseSchemaSummary: vi.fn(),
}));

import { getDatabaseSchemaSummary } from "../schema.js";
import { SummarizeSchemaTool } from "../tools/SummarizeSchemaTool.js";

const getDatabaseSchemaSummaryMock = vi.mocked(getDatabaseSchemaSummary);

describe("SummarizeSchemaTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns object and schema counts on success", async () => {
    getDatabaseSchemaSummaryMock.mockResolvedValue({
      objectCounts: [
        { objectType: "table", objectCount: 12 },
        { objectType: "view", objectCount: 3 },
      ],
      schemaCounts: [
        { schemaName: "dbo", objectCount: 10 },
        { schemaName: "sales", objectCount: 5 },
      ],
    });

    const tool = new SummarizeSchemaTool();
    const result = await tool.run({});

    expect(result.success).toBe(true);
    expect(result.message).toContain("table: 12");
    expect(result.message).toContain("view: 3");
    expect(result.message).toContain("dbo: 10");
    expect((result as { data?: unknown }).data).toBeDefined();
  });

  it("reports an empty database clearly", async () => {
    getDatabaseSchemaSummaryMock.mockResolvedValue({
      objectCounts: [],
      schemaCounts: [],
    });

    const tool = new SummarizeSchemaTool();
    const result = await tool.run({});

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/No user objects were found/);
  });

  it("returns failure when schema helper throws", async () => {
    getDatabaseSchemaSummaryMock.mockRejectedValue(new Error("connection failed"));

    const tool = new SummarizeSchemaTool();
    const result = await tool.run({ databaseName: "AppDb" });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed to summarize schema");
  });
});

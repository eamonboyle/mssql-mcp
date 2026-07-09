import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../schema.js", () => ({
  listLargestTables: vi.fn(),
}));

import { listLargestTables } from "../schema.js";
import {
  formatLargestTablesText,
  ListLargestTablesTool,
} from "../tools/ListLargestTablesTool.js";

const listLargestTablesMock = vi.mocked(listLargestTables);

describe("ListLargestTablesTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("formats ranked storage results", () => {
    expect(
      formatLargestTablesText([
        {
          schemaName: "dbo",
          tableName: "AuditLog",
          rowCount: 12500,
          reservedMB: 42.5,
          usedMB: 39.25,
        },
      ])
    ).toContain(
      "1. dbo.AuditLog — 42.5 MB reserved (39.25 MB used), 12,500 row(s)"
    );
  });

  it("returns a clear empty-state message", () => {
    expect(formatLargestTablesText([])).toBe("No user tables were found.");
  });

  it("passes filters and the default limit to the schema helper", async () => {
    listLargestTablesMock.mockResolvedValue([
      {
        schemaName: "sales",
        tableName: "Orders",
        rowCount: 4,
        reservedMB: 1,
        usedMB: 1,
      },
    ]);

    const tool = new ListLargestTablesTool();
    const result = await tool.run({
      schemaName: "sales",
      databaseName: "AppDB",
    });

    expect(listLargestTablesMock).toHaveBeenCalledWith(100, "AppDB", "sales");
    expect(result.success).toBe(true);
    expect(result.message).toContain("sales.Orders");
  });

  it("reports database errors without throwing", async () => {
    listLargestTablesMock.mockRejectedValue(new Error("permission denied"));

    const result = await new ListLargestTablesTool().run({ limit: 5 });

    expect(result.success).toBe(false);
    expect(result.message).toContain("permission denied");
  });
});

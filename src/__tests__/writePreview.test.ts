import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMockState = vi.hoisted(() => ({
  error: undefined as string | undefined,
  inputCalls: [] as Array<{ name: string; value: unknown }>,
  queryCalls: [] as string[],
  queryResults: [] as Array<{ recordsets?: unknown[][] }>,
}));

vi.mock("../db.js", () => ({
  getSqlRequest: vi.fn(async () => {
    if (dbMockState.error) {
      return {
        request: null as never,
        error: dbMockState.error,
      };
    }

    return {
      request: {
        input(name: string, value: unknown) {
          dbMockState.inputCalls.push({ name, value });
        },
        async query(query: string) {
          dbMockState.queryCalls.push(query);
          return (
            dbMockState.queryResults.shift() ?? {
              recordsets: [[{ id: 1 }], [{ affectedRowCount: 3 }]],
            }
          );
        },
      },
    };
  }),
}));

import { previewFilteredRows } from "../writePreview.js";

describe("previewFilteredRows", () => {
  beforeEach(() => {
    dbMockState.error = undefined;
    dbMockState.inputCalls.length = 0;
    dbMockState.queryCalls.length = 0;
    dbMockState.queryResults.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds paired select and count queries with preview parameter names", async () => {
    const result = await previewFilteredRows({
      tableName: "Users",
      schemaName: "dbo",
      filters: [{ column: "status", operator: "=", value: "active" }],
      limit: 25,
    });

    expect(result.rows).toEqual([{ id: 1 }]);
    expect(result.affectedRowCount).toBe(3);
    expect(result.query).toBe(
      "SELECT TOP (@previewLimit) * FROM [dbo].[Users] WHERE [status] = @preview_filter_0"
    );
    expect(result.countQuery).toBe(
      "SELECT COUNT(*) AS affectedRowCount FROM [dbo].[Users] WHERE [status] = @preview_filter_0"
    );
    expect(dbMockState.queryCalls[0]).toContain(result.query);
    expect(dbMockState.queryCalls[0]).toContain(result.countQuery);
    expect(dbMockState.inputCalls).toEqual([
      { name: "preview_filter_0", value: "active" },
      { name: "previewLimit", value: 25 },
    ]);
  });

  it("throws when the database request cannot be created", async () => {
    dbMockState.error = "Invalid database";

    await expect(
      previewFilteredRows({
        tableName: "Users",
        filters: [{ column: "id", operator: "=", value: 1 }],
        limit: 5,
      })
    ).rejects.toThrow("Invalid database");
  });
});

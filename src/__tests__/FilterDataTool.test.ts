import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMockState = vi.hoisted(() => ({
  error: undefined as string | undefined,
  inputCalls: [] as Array<{ name: string; value: unknown }>,
  queryCalls: [] as string[],
  queryResults: [] as Array<{ rowsAffected?: number[]; recordset?: unknown[] }>,
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
              rowsAffected: [1],
              recordset: [{ id: 1 }],
            }
          );
        },
      },
    };
  }),
}));

import { FilterDataTool } from "../tools/FilterDataTool.js";

describe("FilterDataTool", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbMockState.error = undefined;
    dbMockState.inputCalls.length = 0;
    dbMockState.queryCalls.length = 0;
    dbMockState.queryResults.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parameterizes filters and uses TOP when offset is zero", async () => {
    const tool = new FilterDataTool();

    const result = await tool.run({
      tableName: "Users",
      schemaName: "auth",
      filters: [{ column: "status", operator: "=", value: "active" }],
      columns: ["id", "display name"],
      orderBy: [{ column: "id", direction: "DESC" }],
      limit: 10,
    });

    expect(result).toMatchObject({
      success: true,
      recordCount: 1,
      limit: 10,
      offset: 0,
    });
    expect(dbMockState.queryCalls[0]).toBe(
      "SELECT TOP (@filter_limit) [id], [display name] FROM [auth].[Users] WHERE [status] = @filter_data_0 ORDER BY [id] DESC"
    );
    expect(dbMockState.inputCalls).toEqual([
      { name: "filter_data_0", value: "active" },
      { name: "filter_limit", value: 10 },
    ]);
  });

  it("uses OFFSET/FETCH when offset is greater than zero", async () => {
    const tool = new FilterDataTool();

    const result = await tool.run({
      tableName: "Users",
      filters: [{ column: "id", operator: ">", value: 0 }],
      orderBy: [{ column: "id" }],
      limit: 5,
      offset: 20,
    });

    expect(result).toMatchObject({ success: true, offset: 20, limit: 5 });
    expect(dbMockState.queryCalls[0]).toBe(
      "SELECT * FROM [Users] WHERE [id] > @filter_data_0 ORDER BY [id] ASC OFFSET @filter_offset ROWS FETCH NEXT @filter_limit ROWS ONLY"
    );
    expect(dbMockState.inputCalls).toEqual([
      { name: "filter_data_0", value: 0 },
      { name: "filter_offset", value: 20 },
      { name: "filter_limit", value: 5 },
    ]);
  });

  it("requires orderBy when offset is greater than zero", async () => {
    const tool = new FilterDataTool();

    const result = await tool.run({
      tableName: "Users",
      filters: [{ column: "id", operator: "=", value: 1 }],
      offset: 5,
    });

    expect(result.success).toBe(false);
    expect(String(result.message)).toContain("orderBy");
    expect(dbMockState.queryCalls).toHaveLength(0);
  });

  it("rejects empty filters", async () => {
    const tool = new FilterDataTool();

    const result = await tool.run({
      tableName: "Users",
      filters: [],
    });

    expect(result.success).toBe(false);
    expect(String(result.message)).toContain("At least one filter");
  });
});

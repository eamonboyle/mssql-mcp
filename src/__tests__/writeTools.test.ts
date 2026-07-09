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
              recordset: [],
            }
          );
        },
      },
    };
  }),
}));

import { CreateIndexTool } from "../tools/CreateIndexTool.js";
import { CreateTableTool } from "../tools/CreateTableTool.js";
import { DeleteDataTool } from "../tools/DeleteDataTool.js";
import { DropTableTool } from "../tools/DropTableTool.js";
import { InsertDataTool } from "../tools/InsertDataTool.js";
import { UpdateDataTool } from "../tools/UpdateDataTool.js";

describe("write tools", () => {
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

  it("parameterizes delete filters instead of interpolating raw SQL", async () => {
    const tool = new DeleteDataTool();

    const result = await tool.run({
      tableName: "Order Details",
      schemaName: "sales-data",
      filters: [{ column: "Order ID", operator: "=", value: 42 }],
    });

    expect(result).toMatchObject({ success: true, rowsAffected: 1 });
    expect(dbMockState.queryCalls[0]).toBe(
      "SET ROWCOUNT @mcp_rowcap;\nDELETE FROM [sales-data].[Order Details] WHERE [Order ID] = @delete_filter_0\nSET ROWCOUNT 0;"
    );
    expect(dbMockState.inputCalls).toEqual([
      { name: "delete_filter_0", value: 42 },
      { name: "mcp_rowcap", value: 100 },
    ]);
  });

  it("parameterizes update filters and quotes updated columns", async () => {
    const tool = new UpdateDataTool();

    const result = await tool.run({
      tableName: "Users",
      updates: { "display name": "Ada" },
      filters: [{ column: "id", operator: "IN", values: [1, 2] }],
    });

    expect(result).toMatchObject({ success: true, rowsAffected: 1 });
    expect(dbMockState.queryCalls[0]).toBe(
      "SET ROWCOUNT @mcp_rowcap;\nUPDATE [Users] SET [display name] = @update_0 WHERE [id] IN (@update_filter_0_0, @update_filter_0_1)\nSET ROWCOUNT 0;"
    );
    expect(dbMockState.inputCalls).toEqual([
      { name: "update_0", value: "Ada" },
      { name: "update_filter_0_0", value: 1 },
      { name: "update_filter_0_1", value: 2 },
      { name: "mcp_rowcap", value: 100 },
    ]);
  });

  it("qualifies update target with schema when provided", async () => {
    const tool = new UpdateDataTool();

    const result = await tool.run({
      tableName: "Users",
      schemaName: "auth",
      updates: { status: "active" },
      filters: [{ column: "id", operator: "=", value: 1 }],
    });

    expect(result).toMatchObject({ success: true, rowsAffected: 1 });
    expect(dbMockState.queryCalls[0]).toBe(
      "SET ROWCOUNT @mcp_rowcap;\nUPDATE [auth].[Users] SET [status] = @update_0 WHERE [id] = @update_filter_0\nSET ROWCOUNT 0;"
    );
    expect(dbMockState.inputCalls.map((i) => i.name)).toContain("mcp_rowcap");
  });

  it("quotes identifiers for inserts", async () => {
    const tool = new InsertDataTool();

    const result = await tool.run({
      tableName: "Order Details",
      data: {
        "Customer Name": "Ada",
        "Order ID": 10,
      },
    });

    expect(result).toMatchObject({ success: true, recordsInserted: 1 });
    expect(dbMockState.queryCalls[0]).toBe(
      "INSERT INTO [Order Details] ([Customer Name], [Order ID]) VALUES (@value0, @value1)"
    );
  });

  it("qualifies insert target with schema when provided", async () => {
    const tool = new InsertDataTool();

    const result = await tool.run({
      tableName: "Users",
      schemaName: "auth",
      data: { name: "Ada" },
    });

    expect(result).toMatchObject({ success: true, recordsInserted: 1 });
    expect(dbMockState.queryCalls[0]).toBe(
      "INSERT INTO [auth].[Users] ([name]) VALUES (@value0)"
    );
    expect(String(result.message)).toContain("[auth].[Users]");
  });

  it("qualifies drop_table target with schema when provided", async () => {
    const tool = new DropTableTool();

    const result = await tool.run({
      tableName: "Temp Orders",
      schemaName: "sales-data",
    });

    expect(result).toMatchObject({ success: true });
    expect(dbMockState.queryCalls[0]).toBe(
      "DROP TABLE [sales-data].[Temp Orders]"
    );
    expect(String(result.message)).toContain("[sales-data].[Temp Orders]");
  });

  it("quotes identifiers for created indexes", async () => {
    const tool = new CreateIndexTool();

    const result = await tool.run({
      schemaName: "sales-data",
      tableName: "Order Details",
      indexName: "IX Order Lookup",
      columns: ["Order ID", "Line Number"],
    });

    expect(result).toMatchObject({ success: true });
    expect(dbMockState.queryCalls[0]).toBe(
      "CREATE NONCLUSTERED INDEX [IX Order Lookup] ON [sales-data].[Order Details] ([Order ID], [Line Number])"
    );
  });

  it("rejects unsafe free-form column type fragments", async () => {
    const tool = new CreateTableTool();

    const result = await tool.run({
      tableName: "Users",
      columns: [
        {
          name: "id",
          type: "INT); DROP TABLE users; --",
        },
      ],
    });

    expect(result).toMatchObject({ success: false });
    expect(String(result.message)).toContain("Unsupported SQL type declaration");
    expect(dbMockState.queryCalls).toHaveLength(0);
  });
});

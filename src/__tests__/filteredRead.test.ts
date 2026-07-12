import { describe, expect, it } from "vitest";
import { buildFilteredReadQuery } from "../filteredRead.js";

describe("buildFilteredReadQuery", () => {
  it("builds TOP query with parameterized filters", () => {
    const inputs: Array<{ name: string; value: unknown }> = [];
    const request = {
      input(name: string, value: unknown) {
        inputs.push({ name, value });
      },
    };

    const { query } = buildFilteredReadQuery(request, {
      tableName: "Users",
      schemaName: "dbo",
      filters: [{ column: "id", operator: "=", value: 1 }],
      columns: ["id", "name"],
      orderBy: [{ column: "id", direction: "DESC" }],
      limit: 25,
      filterParamPrefix: "filtered_read",
    });

    expect(query).toBe(
      "SELECT TOP (@filter_limit) [id], [name] FROM [dbo].[Users] WHERE [id] = @filtered_read_0 ORDER BY [id] DESC"
    );
    expect(inputs).toEqual([
      { name: "filtered_read_0", value: 1 },
      { name: "filter_limit", value: 25 },
    ]);
  });

  it("builds OFFSET/FETCH query when offset is set", () => {
    const inputs: Array<{ name: string; value: unknown }> = [];
    const request = {
      input(name: string, value: unknown) {
        inputs.push({ name, value });
      },
    };

    const { query, tableRef, whereClause } = buildFilteredReadQuery(request, {
      tableName: "Orders",
      filters: [{ column: "status", operator: "=", value: "open" }],
      orderBy: [{ column: "id" }],
      limit: 10,
      offset: 5,
      filterParamPrefix: "preview_filter",
      limitParameterName: "previewLimit",
    });

    expect(tableRef).toBe("[Orders]");
    expect(whereClause).toBe("[status] = @preview_filter_0");
    expect(query).toBe(
      "SELECT * FROM [Orders] WHERE [status] = @preview_filter_0 ORDER BY [id] ASC OFFSET @filter_offset ROWS FETCH NEXT @previewLimit ROWS ONLY"
    );
    expect(inputs).toEqual([
      { name: "preview_filter_0", value: "open" },
      { name: "filter_offset", value: 5 },
      { name: "previewLimit", value: 10 },
    ]);
  });
});

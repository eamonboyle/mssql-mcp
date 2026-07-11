import { beforeEach, describe, expect, it, vi } from "vitest";

const schemaMockState = vi.hoisted(() => ({
  getSqlRequestCalls: 0,
  inputCalls: [] as Array<{ name: string; type: unknown; value: unknown }>,
  queryCalls: [] as string[],
  queryResults: [] as Array<{
    recordset?: unknown[];
    recordsets?: unknown[][];
  }>,
}));

vi.mock("mssql", () => ({
  default: {
    NVarChar: "NVarChar",
    Int: "Int",
  },
}));

vi.mock("../db.js", () => ({
  getSqlRequest: vi.fn(async () => {
    schemaMockState.getSqlRequestCalls += 1;
    return {
      request: {
        input(name: string, type: unknown, value: unknown) {
          schemaMockState.inputCalls.push({ name, type, value });
        },
        async query(query: string) {
          schemaMockState.queryCalls.push(query);
          return (
            schemaMockState.queryResults.shift() ?? {
              recordset: [],
              recordsets: [],
            }
          );
        },
      },
    };
  }),
}));

import {
  analyzeTable,
  describeDatabaseObject,
  listForeignKeys,
  listLargestTables,
} from "../schema.js";

describe("describeDatabaseObject", () => {
  beforeEach(() => {
    schemaMockState.getSqlRequestCalls = 0;
    schemaMockState.inputCalls.length = 0;
    schemaMockState.queryCalls.length = 0;
    schemaMockState.queryResults.length = 0;
  });

  it("throws an ambiguity error when multiple schema matches exist", async () => {
    schemaMockState.queryResults.push({
      recordset: [
        {
          objectId: 1,
          name: "Users",
          schemaName: "dbo",
          typeCode: "U",
          typeDescription: "USER_TABLE",
          createdAt: new Date(),
          modifiedAt: new Date(),
          definition: null,
        },
        {
          objectId: 2,
          name: "Users",
          schemaName: "audit",
          typeCode: "V",
          typeDescription: "VIEW",
          createdAt: new Date(),
          modifiedAt: new Date(),
          definition: null,
        },
      ],
    });

    await expect(describeDatabaseObject("Users", "AppDb")).rejects.toThrow(
      "Specify schemaName or objectTypes to disambiguate"
    );
    expect(schemaMockState.getSqlRequestCalls).toBe(1);
  });

  it("reuses a single request flow and batches detail queries", async () => {
    schemaMockState.queryResults.push(
      {
        recordset: [
          {
            objectId: 7,
            name: "Users",
            schemaName: "dbo",
            typeCode: "U",
            typeDescription: "USER_TABLE",
            createdAt: new Date("2024-01-01"),
            modifiedAt: new Date("2024-01-02"),
            definition: null,
          },
        ],
      },
      {
        recordsets: [
          [
            {
              name: "id",
              dataType: "int",
              maxLength: 4,
              precision: 10,
              scale: 0,
              isNullable: false,
              isIdentity: true,
              defaultValue: null,
            },
          ],
          [
            {
              name: "PK_Users",
              type: "CLUSTERED",
              isUnique: true,
              columnName: "id",
              keyOrdinal: 1,
            },
          ],
        ],
      }
    );

    const result = await describeDatabaseObject("Users", "AppDb", "dbo");

    expect(result).toMatchObject({
      name: "Users",
      schemaName: "dbo",
      objectType: "table",
      columns: [
        {
          name: "id",
          dataType: "int",
        },
      ],
      indexes: [
        {
          name: "PK_Users",
          columns: ["id"],
        },
      ],
    });
    expect(schemaMockState.getSqlRequestCalls).toBe(1);
    expect(schemaMockState.queryCalls).toHaveLength(2);
  });
});

describe("listLargestTables", () => {
  beforeEach(() => {
    schemaMockState.getSqlRequestCalls = 0;
    schemaMockState.inputCalls.length = 0;
    schemaMockState.queryCalls.length = 0;
    schemaMockState.queryResults.length = 0;
  });

  it("escapes the rowCount alias because ROWCOUNT is a SQL keyword", async () => {
    schemaMockState.queryResults.push({ recordset: [] });

    await listLargestTables(5, "AppDB", "dbo");

    expect(schemaMockState.queryCalls[0]).toContain("AS [rowCount]");
  });
});

describe("analyzeTable", () => {
  beforeEach(() => {
    schemaMockState.getSqlRequestCalls = 0;
    schemaMockState.inputCalls.length = 0;
    schemaMockState.queryCalls.length = 0;
    schemaMockState.queryResults.length = 0;
  });

  it("escapes the rowCount alias because ROWCOUNT is a SQL keyword", async () => {
    schemaMockState.queryResults.push({ recordsets: [[], []] });

    await analyzeTable("Orders", "AppDB", "dbo");

    expect(schemaMockState.queryCalls[0]).toContain("AS [rowCount]");
  });
});

describe("listForeignKeys", () => {
  beforeEach(() => {
    schemaMockState.getSqlRequestCalls = 0;
    schemaMockState.inputCalls.length = 0;
    schemaMockState.queryCalls.length = 0;
    schemaMockState.queryResults.length = 0;
  });

  it("filters by parent or referenced schema when schemaName is set", async () => {
    schemaMockState.queryResults.push({ recordset: [] });
    await listForeignKeys("AppDb", "sales");
    expect(schemaMockState.queryCalls[0]).toContain(
      "(ps.name = @schemaName OR rs.name = @schemaName)"
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const explainMockState = vi.hoisted(() => ({
  beginCalls: 0,
  rollbackCalls: 0,
  closeCalls: 0,
  statements: [] as string[],
  failOnQuery: false,
}));

vi.mock("mssql", () => {
  class MockTransaction {
    constructor(_pool: unknown) {}

    async begin() {
      explainMockState.beginCalls += 1;
    }

    async rollback() {
      explainMockState.rollbackCalls += 1;
    }
  }

  class MockRequest {
    constructor(_transaction: unknown) {}

    async query(statement: string) {
      explainMockState.statements.push(statement);
      if (statement === "SET SHOWPLAN_XML ON") {
        return { recordsets: [] };
      }

      if (statement === "SET SHOWPLAN_XML OFF") {
        return { recordsets: [] };
      }

      if (explainMockState.failOnQuery) {
        throw new Error("query failed");
      }

      return {
        recordsets: [[{ planXml: "<ShowPlanXML />" }]],
      };
    }
  }

  return {
    default: {
      Transaction: MockTransaction,
      Request: MockRequest,
    },
  };
});

vi.mock("../db.js", () => ({
  getDedicatedSqlPool: vi.fn(async () => ({
    pool: {
      async close() {
        explainMockState.closeCalls += 1;
      },
    },
  })),
}));

import { ExplainQueryTool } from "../tools/ExplainQueryTool.js";

describe("ExplainQueryTool", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    explainMockState.beginCalls = 0;
    explainMockState.rollbackCalls = 0;
    explainMockState.closeCalls = 0;
    explainMockState.statements.length = 0;
    explainMockState.failOnQuery = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a dedicated connection and always disables SHOWPLAN_XML", async () => {
    const tool = new ExplainQueryTool();

    const result = await tool.run({
      query: "SELECT * FROM movies",
    });

    expect(result).toMatchObject({
      success: true,
      planXml: "<ShowPlanXML />",
    });
    expect(explainMockState.statements).toEqual([
      "SET SHOWPLAN_XML ON",
      "SELECT * FROM movies",
      "SET SHOWPLAN_XML OFF",
    ]);
    expect(explainMockState.beginCalls).toBe(1);
    expect(explainMockState.rollbackCalls).toBe(1);
    expect(explainMockState.closeCalls).toBe(1);
  });

  it("cleans up SHOWPLAN state after failures", async () => {
    explainMockState.failOnQuery = true;
    const tool = new ExplainQueryTool();

    const result = await tool.run({
      query: "SELECT * FROM movies",
    });

    expect(result).toMatchObject({ success: false });
    expect(explainMockState.statements).toEqual([
      "SET SHOWPLAN_XML ON",
      "SELECT * FROM movies",
      "SET SHOWPLAN_XML OFF",
    ]);
    expect(explainMockState.rollbackCalls).toBe(1);
    expect(explainMockState.closeCalls).toBe(1);
  });
});

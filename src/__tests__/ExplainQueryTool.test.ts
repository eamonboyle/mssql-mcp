import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const explainMockState = vi.hoisted(() => ({
  closeCalls: 0,
  statements: [] as string[],
  failOnQuery: false,
}));

const mockRequestModule = vi.hoisted(() => {
  class MockRequest {
    async query(statement: string) {
      return this.run(statement);
    }

    async batch(statement: string) {
      return this.run(statement);
    }

    async run(statement: string) {
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

  function mockPool() {
    return {
      request() {
        return new MockRequest();
      },
      async close() {
        explainMockState.closeCalls += 1;
      },
    };
  }

  return { MockRequest, mockPool };
});

vi.mock("mssql", () => ({
  default: {
    Request: mockRequestModule.MockRequest,
  },
}));

vi.mock("../db.js", () => ({
  getDedicatedSqlPool: vi.fn(async () => ({
    pool: mockRequestModule.mockPool(),
  })),
}));

import { ExplainQueryTool } from "../tools/ExplainQueryTool.js";

describe("ExplainQueryTool", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    explainMockState.closeCalls = 0;
    explainMockState.statements.length = 0;
    explainMockState.failOnQuery = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a dedicated pool and always disables SHOWPLAN_XML", async () => {
    const tool = new ExplainQueryTool();

    const result = await tool.run({
      query: "SELECT * FROM movies",
    });

    expect(result).toMatchObject({
      success: true,
      planXml: "<ShowPlanXML />",
      recordsets: undefined,
    });
    expect(explainMockState.statements).toEqual([
      "SET SHOWPLAN_XML ON",
      "SELECT * FROM movies",
      "SET SHOWPLAN_XML OFF",
    ]);
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
    expect(explainMockState.closeCalls).toBe(1);
  });
});

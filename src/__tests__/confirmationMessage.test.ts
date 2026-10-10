import { describe, expect, it } from "vitest";
import { describeConfirmation } from "../confirmationMessage.js";

describe("describeConfirmation", () => {
  it("names the target and filters for delete_data", () => {
    expect(
      describeConfirmation(
        "delete_data",
        {
          tableName: "Customers",
          schemaName: "dbo",
          filters: [
            { column: "Id", operator: "=", value: 5 },
            { column: "Status", operator: "IN", values: ["a", "b"] },
            { column: "Email", operator: "IS NULL" },
          ],
        },
        "AppDB"
      )
    ).toBe(
      "Confirm delete_data: delete from AppDB.dbo.Customers where Id = 5 AND Status IN ('a', 'b') AND Email IS NULL. Review the preview and impact before accepting."
    );
  });

  it("lists updated columns and prefers an explicit database", () => {
    expect(
      describeConfirmation(
        "update_data",
        {
          databaseName: "ReportingDB",
          tableName: "Customers",
          updates: { City: "Leeds" },
          filters: [{ column: "Id", operator: "=", value: 3077 }],
        },
        "AppDB"
      )
    ).toContain("update ReportingDB.Customers: set City where Id = 3077");
  });

  it("counts inserted rows", () => {
    expect(
      describeConfirmation("insert_data", { tableName: "T", data: [{}, {}] }, "AppDB")
    ).toContain("insert 2 rows into AppDB.T");
    expect(
      describeConfirmation("insert_data", { tableName: "T", data: {} }, "AppDB")
    ).toContain("insert 1 row into AppDB.T");
  });

  it("describes DDL operations", () => {
    expect(
      describeConfirmation(
        "create_index",
        { tableName: "T", indexName: "IX_T", columns: ["A", "B"] },
        null
      )
    ).toContain("create index IX_T on T (A, B)");
    expect(describeConfirmation("drop_table", { tableName: "T" }, "AppDB")).toContain(
      "drop table AppDB.T"
    );
  });

  it("truncates long values", () => {
    const message = describeConfirmation(
      "delete_data",
      { tableName: "T", filters: [{ column: "C", operator: "=", value: "x".repeat(100) }] },
      null
    );
    expect(message).toContain("…");
    expect(message.length).toBeLessThan(160);
  });
});

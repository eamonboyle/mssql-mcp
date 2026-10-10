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

  it("previews updated values and prefers an explicit database", () => {
    expect(
      describeConfirmation(
        "update_data",
        {
          databaseName: "ReportingDB",
          tableName: "Customers",
          updates: { City: "Leeds", Active: true },
          filters: [{ column: "Id", operator: "=", value: 3077 }],
        },
        "AppDB"
      )
    ).toContain(
      "update ReportingDB.Customers: set City = 'Leeds', Active = true where Id = 3077"
    );
  });

  it("counts inserted rows and previews the values being written", () => {
    expect(
      describeConfirmation(
        "insert_data",
        { tableName: "T", data: [{}, {}] },
        "AppDB"
      )
    ).toContain("insert 2 rows into AppDB.T");
    expect(
      describeConfirmation("insert_data", { tableName: "T", data: {} }, "AppDB")
    ).toContain("insert 1 row into AppDB.T");
    expect(
      describeConfirmation(
        "insert_data",
        {
          tableName: "Customers",
          schemaName: "dbo",
          data: { Name: "Ada", Email: "ada@example.com", City: null },
        },
        "AppDB"
      )
    ).toBe(
      "Confirm insert_data: insert 1 row into AppDB.dbo.Customers: Name = 'Ada', Email = 'ada@example.com', City = null. Review the preview and impact before accepting."
    );
  });

  it("bounds insert previews to the first row and the first columns", () => {
    const manyColumns = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [`C${index}`, index])
    );
    const message = describeConfirmation(
      "insert_data",
      { tableName: "T", data: [manyColumns, { C0: 9 }, { C0: 8 }] },
      "AppDB"
    );
    expect(message).toContain(
      "insert 3 rows into AppDB.T. First row: C0 = 0, C1 = 1, C2 = 2, C3 = 3, C4 = 4 (+1 more)"
    );
    expect(message).not.toContain("C5");
    expect(message).not.toContain("C0 = 9");
  });

  it("bounds long update values", () => {
    const message = describeConfirmation(
      "update_data",
      {
        tableName: "T",
        updates: { Note: "n".repeat(80), City: "York" },
        filters: [{ column: "Id", operator: "=", value: 1 }],
      },
      null
    );
    expect(message).toContain("City = 'York'");
    expect(message).toContain("where Id = 1");
    expect(message).toContain("…");
    expect(message).not.toContain("n".repeat(50));
  });

  it("describes DDL operations", () => {
    expect(
      describeConfirmation(
        "create_index",
        { tableName: "T", indexName: "IX_T", columns: ["A", "B"] },
        null
      )
    ).toContain("create index IX_T on T (A, B)");
    expect(
      describeConfirmation("drop_table", { tableName: "T" }, "AppDB")
    ).toContain("drop table AppDB.T");
  });

  it("truncates long values", () => {
    const message = describeConfirmation(
      "delete_data",
      {
        tableName: "T",
        filters: [{ column: "C", operator: "=", value: "x".repeat(100) }],
      },
      null
    );
    expect(message).toContain("…");
    expect(message.length).toBeLessThan(160);
  });
});

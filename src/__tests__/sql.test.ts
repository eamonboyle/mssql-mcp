import { describe, expect, it } from "vitest";
import {
  buildQualifiedName,
  getFriendlyObjectType,
  getObjectTypeCodes,
  quoteIdentifier,
} from "../sql.js";

describe("sql helpers", () => {
  it("quotes safe identifiers", () => {
    expect(quoteIdentifier("Users")).toBe("[Users]");
    expect(buildQualifiedName("Users", "dbo")).toBe("[dbo].[Users]");
    expect(quoteIdentifier("Order Details")).toBe("[Order Details]");
    expect(quoteIdentifier("Users]Archive")).toBe("[Users]]Archive]");
  });

  it("rejects empty or control-character identifiers", () => {
    expect(() => quoteIdentifier("")).toThrow("Invalid identifier.");
    expect(() => buildQualifiedName("", "dbo")).toThrow("Invalid object name.");
    expect(() => buildQualifiedName("Users", "dbo\u0000")).toThrow(
      "Invalid schema name."
    );
    expect(() => quoteIdentifier("Users\u0000Archive")).toThrow(
      "Invalid identifier."
    );
  });

  it("maps friendly object types", () => {
    expect(getFriendlyObjectType("U")).toBe("table");
    expect(getFriendlyObjectType("V")).toBe("view");
    expect(getFriendlyObjectType("P")).toBe("procedure");
    expect(getFriendlyObjectType("FN")).toBe("function");
    expect(getFriendlyObjectType("TR")).toBe("trigger");
  });

  it("resolves object type filters", () => {
    expect(getObjectTypeCodes(["table", "view"])).toEqual(["U", "V"]);
    expect(getObjectTypeCodes(["function"])).toEqual([
      "FN",
      "IF",
      "TF",
      "FS",
      "FT",
    ]);
    expect(() => getObjectTypeCodes(["queue"])).toThrow(
      "Unsupported object type 'queue'. Expected one of: table, view, procedure, function, trigger."
    );
  });
});

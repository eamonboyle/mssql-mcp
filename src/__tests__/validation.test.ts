import { describe, it, expect } from "vitest";
import { validateReadQuery } from "../validation.js";

describe("validateReadQuery", () => {
  it("accepts simple SELECT query", () => {
    expect(validateReadQuery("SELECT * FROM movies")).toEqual({
      isValid: true,
    });
    expect(
      validateReadQuery("SELECT id, name FROM users WHERE id = 1")
    ).toEqual({
      isValid: true,
    });
  });

  it("rejects empty or non-string input", () => {
    expect(validateReadQuery("")).toEqual({
      isValid: false,
      error: "Query must be a non-empty string",
    });
    expect(validateReadQuery("   ")).toEqual({
      isValid: false,
      error: "Query cannot be empty after removing comments",
    });
    expect(validateReadQuery(null as unknown as string)).toEqual({
      isValid: false,
      error: "Query must be a non-empty string",
    });
  });

  it("rejects query that does not start with SELECT", () => {
    expect(validateReadQuery("DELETE FROM users")).toEqual({
      isValid: false,
      error: "Query must start with SELECT (or WITH for a CTE)",
    });
    expect(validateReadQuery("  UPDATE users SET x = 1")).toEqual({
      isValid: false,
      error: "Query must start with SELECT (or WITH for a CTE)",
    });
  });

  it("rejects dangerous keywords", () => {
    expect(validateReadQuery("SELECT * FROM users; DELETE FROM logs")).toEqual({
      isValid: false,
      error: expect.stringContaining("Dangerous keyword"),
    });
    expect(validateReadQuery("SELECT * INTO backup FROM users")).toEqual({
      isValid: false,
      error: expect.stringContaining("Dangerous keyword"),
    });
    expect(validateReadQuery("SELECT * FROM users; DROP TABLE users")).toEqual({
      isValid: false,
      error: expect.stringContaining("Dangerous keyword"),
    });
  });

  it("rejects SELECT INTO pattern", () => {
    const result = validateReadQuery("SELECT * INTO newtable FROM users");
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects multiple statements", () => {
    const result = validateReadQuery("SELECT 1; SELECT 2");
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("allows character functions (dynamic SQL is blocked separately)", () => {
    expect(validateReadQuery("SELECT CHAR(65) FROM users")).toEqual({
      isValid: true,
    });
    expect(validateReadQuery("SELECT ASCII('A') FROM users")).toEqual({
      isValid: true,
    });
  });

  it("rejects query exceeding length limit", () => {
    const longQuery = "SELECT * FROM users WHERE " + "x = 1 AND ".repeat(2000);
    expect(longQuery.length).toBeGreaterThan(10000);
    expect(validateReadQuery(longQuery)).toEqual({
      isValid: false,
      error: "Query is too long. Maximum allowed length is 10,000 characters.",
    });
  });

  it("rejects stored procedure patterns", () => {
    expect(validateReadQuery("SELECT * FROM sp_help")).toEqual({
      isValid: false,
      error:
        "Potentially malicious SQL pattern detected. Only simple SELECT queries are allowed.",
    });
    expect(validateReadQuery("SELECT * FROM xp_cmdshell")).toEqual({
      isValid: false,
      error:
        "Potentially malicious SQL pattern detected. Only simple SELECT queries are allowed.",
    });
  });

  it("rejects WAITFOR delay/time patterns", () => {
    const result = validateReadQuery("SELECT 1; WAITFOR DELAY '0:0:5'");
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects query that is only comments", () => {
    expect(validateReadQuery("-- comment only")).toEqual({
      isValid: false,
      error: "Query cannot be empty after removing comments",
    });
    expect(validateReadQuery("/* block comment */")).toEqual({
      isValid: false,
      error: "Query cannot be empty after removing comments",
    });
  });

  it("accepts SELECT with WHERE and JOIN", () => {
    expect(
      validateReadQuery(
        "SELECT u.id, u.name FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1"
      )
    ).toEqual({ isValid: true });
  });

  it.each([
    ["CTE", "WITH x AS (SELECT 1 AS a) SELECT * FROM x"],
    [
      "CTE with leading semicolon",
      ";WITH x AS (SELECT 1 AS a) SELECT * FROM x",
    ],
    ["CAST to VARCHAR", "SELECT CAST(Id AS VARCHAR(20)) FROM dbo.Users"],
    [
      "CAST to NVARCHAR(MAX)",
      "SELECT CONVERT(NVARCHAR(MAX), Notes) FROM dbo.Users",
    ],
    ["user_name column", "SELECT user_name, db_name FROM dbo.Accounts"],
    ["resp_code column", "SELECT resp_code FROM dbo.Logs"],
    [
      "keyword inside a string",
      "SELECT * FROM dbo.Orders WHERE Status = 'Update pending'",
    ],
    [
      "escaped quote",
      "SELECT * FROM dbo.Users WHERE Name = 'O''Brien; DROP TABLE x'",
    ],
    [
      "keyword as bracketed identifier",
      "SELECT [Update], [Set] FROM dbo.Audit",
    ],
    ["REPLACE function", "SELECT REPLACE(Name, 'a', 'b') FROM dbo.Users"],
    [
      "OFFSET/FETCH",
      "SELECT * FROM dbo.Users ORDER BY Id OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY",
    ],
    ["trailing semicolon", "SELECT 1;"],
    ["keyword in comment", "SELECT 1 -- delete later\nFROM dbo.Users"],
    [
      "nested block comment",
      "SELECT 1 /* outer /* inner drop */ still comment */ FROM dbo.Users",
    ],
  ])("accepts %s", (_label, query) => {
    expect(validateReadQuery(query)).toEqual({ isValid: true });
  });

  it.each([
    ["CTE feeding a DELETE", "WITH x AS (SELECT 1 AS a) DELETE FROM dbo.Users"],
    ["second statement after a string", "SELECT 'a'; DROP TABLE dbo.Users"],
    ["EXEC after literal", "SELECT 'x' EXEC('DROP TABLE dbo.Users')"],
    ["server variable", "SELECT @@VERSION"],
    ["login disclosure", "SELECT SUSER_SNAME()"],
    ["system procedure", "SELECT * FROM sp_who"],
    ["unterminated literal", "SELECT 'abc FROM dbo.Users"],
    ["unterminated comment", "SELECT 1 /* never closed"],
  ])("rejects %s", (_label, query) => {
    expect(validateReadQuery(query).isValid).toBe(false);
  });

  // SQL Server splits a number from following letters and runs consecutive
  // statements without semicolons, so these must be caught token-by-token.
  it.each([
    [
      "COMMIT glued to a number",
      "SELECT 1COMMIT SELECT 1DELETE FROM dbo.Customers",
    ],
    ["DELETE glued to a decimal", "SELECT .5DELETE FROM t"],
    ["keyword glued to a hex literal", "SELECT 0x00INSERT INTO t VALUES (1)"],
    ["keyword glued to a money literal", "SELECT $5DELETE FROM t"],
    ["keyword glued to an exponent", "SELECT 1e5DELETE FROM t"],
    [
      "second SELECT without a semicolon",
      "SELECT 1 AS a SELECT name FROM sys.sql_logins",
    ],
    [
      "CTE followed by a second statement",
      "WITH c AS (SELECT 1 AS a) SELECT * FROM c SELECT 2",
    ],
    ["trigger DDL", "SELECT 1 DISABLE TRIGGER ALL ON dbo.t"],
    ["WHILE loop", "SELECT 1 WHILE 1=1 SELECT 1"],
    ["RAISERROR", "SELECT 1 RAISERROR('x', 16, 1)"],
    ["UPDATETEXT", "SELECT 1 UPDATETEXT t.c NULL 0 NULL 'x'"],
    ["SETUSER", "SELECT 1 SETUSER 'dbo'"],
    ["comment ended by a bare CR", "SELECT 1 --x\rCOMMIT"],
    ["END CONVERSATION", "SELECT 1 END CONVERSATION 'x'"],
    ["unbalanced parentheses", "SELECT 1) SELECT (2"],
  ])("rejects %s", (_label, query) => {
    expect(validateReadQuery(query).isValid).toBe(false);
  });

  it.each([
    ["UNION ALL", "SELECT 1 AS a UNION ALL SELECT 2"],
    ["EXCEPT and INTERSECT", "SELECT 1 EXCEPT SELECT 2 INTERSECT SELECT 3"],
    [
      "subqueries",
      "SELECT (SELECT MAX(Id) FROM dbo.Orders) AS m, * FROM dbo.Customers WHERE Id IN (SELECT CustomerId FROM dbo.Orders)",
    ],
    [
      "multiple CTEs",
      "WITH a AS (SELECT 1 AS x), b AS (SELECT x FROM a) SELECT * FROM b",
    ],
    [
      "CASE expression",
      "SELECT CASE WHEN Id > 1 THEN 'a' ELSE 'b' END AS c FROM dbo.Users",
    ],
    ["numbers and money", "SELECT 1.5e3 AS a, $10.25 AS b, 0xFF AS c, .5 AS d"],
    ["unicode string", "SELECT N'Grüße' AS greeting"],
    ["table hint", "SELECT * FROM dbo.Users WITH (NOLOCK)"],
  ])("accepts %s", (_label, query) => {
    expect(validateReadQuery(query)).toEqual({ isValid: true });
  });
});

import { describe, it, expect } from "vitest";
import { validateReadQuery } from "../validation.js";

describe("validateReadQuery", () => {
  it("accepts simple SELECT query", () => {
    expect(validateReadQuery("SELECT * FROM movies")).toEqual({ isValid: true });
    expect(validateReadQuery("SELECT id, name FROM users WHERE id = 1")).toEqual({
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
    expect(validateReadQuery(null as any)).toEqual({
      isValid: false,
      error: "Query must be a non-empty string",
    });
  });

  it("rejects query that does not start with SELECT", () => {
    expect(validateReadQuery("DELETE FROM users")).toEqual({
      isValid: false,
      error: "Query must start with SELECT for security reasons",
    });
    expect(validateReadQuery("  UPDATE users SET x = 1")).toEqual({
      isValid: false,
      error: "Query must start with SELECT for security reasons",
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

  it("rejects character conversion functions", () => {
    expect(validateReadQuery("SELECT CHAR(65) FROM users")).toEqual({
      isValid: false,
      error:
        "Character conversion functions are not allowed as they may be used for obfuscation.",
    });
    expect(validateReadQuery("SELECT NCHAR(65) FROM users")).toEqual({
      isValid: false,
      error:
        "Character conversion functions are not allowed as they may be used for obfuscation.",
    });
    expect(validateReadQuery("SELECT ASCII('A') FROM users")).toEqual({
      isValid: false,
      error:
        "Character conversion functions are not allowed as they may be used for obfuscation.",
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
      error: "Potentially malicious SQL pattern detected. Only simple SELECT queries are allowed.",
    });
    expect(validateReadQuery("SELECT * FROM xp_cmdshell")).toEqual({
      isValid: false,
      error: "Potentially malicious SQL pattern detected. Only simple SELECT queries are allowed.",
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
});

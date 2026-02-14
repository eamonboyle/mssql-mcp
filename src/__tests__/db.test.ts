import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock mssql to avoid loading native deps and transitive issues in test env
vi.mock("mssql", () => ({}));

import {
  getAllowedDatabases,
  resolveDatabaseName,
} from "../db.js";

describe("getAllowedDatabases", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns DATABASE_NAME when DATABASES is not set", () => {
    delete process.env.DATABASES;
    process.env.DATABASE_NAME = "MyDb";
    expect(getAllowedDatabases()).toEqual(["MyDb"]);
  });

  it("returns empty array when neither DATABASES nor DATABASE_NAME is set", () => {
    delete process.env.DATABASES;
    delete process.env.DATABASE_NAME;
    expect(getAllowedDatabases()).toEqual([]);
  });

  it("returns empty array when DATABASE_NAME is empty string", () => {
    delete process.env.DATABASES;
    process.env.DATABASE_NAME = "";
    expect(getAllowedDatabases()).toEqual([]);
  });

  it("returns DATABASES split by comma when set", () => {
    process.env.DATABASES = "ProdDB,StagingDB,AnalyticsDB";
    expect(getAllowedDatabases()).toEqual(["ProdDB", "StagingDB", "AnalyticsDB"]);
  });

  it("trims whitespace from DATABASES entries", () => {
    process.env.DATABASES = "  ProdDB , StagingDB , AnalyticsDB  ";
    expect(getAllowedDatabases()).toEqual(["ProdDB", "StagingDB", "AnalyticsDB"]);
  });

  it("filters out empty entries from DATABASES", () => {
    process.env.DATABASES = "ProdDB,,StagingDB,";
    expect(getAllowedDatabases()).toEqual(["ProdDB", "StagingDB"]);
  });

  it("prefers DATABASES over DATABASE_NAME when both set", () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    process.env.DATABASE_NAME = "OtherDb";
    expect(getAllowedDatabases()).toEqual(["ProdDB", "StagingDB"]);
  });
});

describe("resolveDatabaseName", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns param when valid and in allowed list", () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    expect(resolveDatabaseName("ProdDB")).toBe("ProdDB");
    expect(resolveDatabaseName("StagingDB")).toBe("StagingDB");
  });

  it("returns DATABASE_NAME when param omitted and DATABASES not set", () => {
    process.env.DATABASE_NAME = "DefaultDb";
    delete process.env.DATABASES;
    expect(resolveDatabaseName()).toBe("DefaultDb");
  });

  it("returns param when param provided and in allowed list (DATABASE_NAME fallback)", () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    process.env.DATABASE_NAME = "ProdDB";
    expect(resolveDatabaseName("StagingDB")).toBe("StagingDB");
  });

  it("returns null when param not in allowed list", () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    expect(resolveDatabaseName("OtherDb")).toBeNull();
  });

  it("returns null when param is empty and DATABASE_NAME not set", () => {
    delete process.env.DATABASE_NAME;
    delete process.env.DATABASES;
    expect(resolveDatabaseName()).toBeNull();
    expect(resolveDatabaseName("")).toBeNull();
  });

  it("returns resolved name when no DATABASES set (only DATABASE_NAME allowed)", () => {
    delete process.env.DATABASES;
    process.env.DATABASE_NAME = "MyDb";
    expect(resolveDatabaseName()).toBe("MyDb");
    expect(resolveDatabaseName("MyDb")).toBe("MyDb");
    // When DATABASES is not set, getAllowedDatabases returns [DATABASE_NAME], so only MyDb is allowed
    expect(resolveDatabaseName("AnyDb")).toBeNull();
  });

  it("trims whitespace from param", () => {
    process.env.DATABASES = "ProdDB";
    expect(resolveDatabaseName("  ProdDB  ")).toBe("ProdDB");
  });
});

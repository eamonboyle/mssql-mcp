import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mssqlMockState = vi.hoisted(() => ({
  poolConfigs: [] as Array<Record<string, unknown> & { database?: string }>,
  requestObject: { kind: "mock-request" },
  connectCalls: vi.fn(),
  closeCalls: vi.fn(),
  requestCalls: vi.fn(),
}));

// Mock mssql to avoid loading native deps and transitive issues in test env
vi.mock("mssql", () => {
  class MockConnectionPool {
    connected = false;

    constructor(private readonly config: { database?: string }) {
      mssqlMockState.poolConfigs.push(config);
    }

    async connect() {
      this.connected = true;
      mssqlMockState.connectCalls(this.config);
      return this;
    }

    async close() {
      this.connected = false;
      mssqlMockState.closeCalls(this.config);
    }

    request() {
      mssqlMockState.requestCalls(this.config);
      return mssqlMockState.requestObject;
    }
  }

  return {
    default: {
      ConnectionPool: MockConnectionPool,
    },
  };
});

import {
  parseEnvironmentConfig,
  parseSqlConnectionConfig,
} from "../config.js";
import {
  buildSqlConfig,
  configureDatabase,
  configureSqlConnection,
  getAllowedDatabases,
  getSqlRequest,
  resolveDatabaseName,
} from "../db.js";

function setRequiredEnvironment() {
  Object.assign(process.env, {
    SERVER_NAME: "localhost",
    DATABASE_NAME: "AppDB",
    DATABASES: "AppDB,ReportingDB",
    DB_USER: "sa",
    DB_PASSWORD: "test-password",
    TRUST_SERVER_CERTIFICATE: "true",
    READONLY: "false",
    ENABLE_DDL: "false",
  });
}

describe("getAllowedDatabases", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    setRequiredEnvironment();
    configureSqlConnection(parseSqlConnectionConfig(process.env));
    mssqlMockState.poolConfigs.length = 0;
    mssqlMockState.connectCalls.mockClear();
    mssqlMockState.closeCalls.mockClear();
    mssqlMockState.requestCalls.mockClear();
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
    expect(getAllowedDatabases()).toEqual([
      "ProdDB",
      "StagingDB",
      "AnalyticsDB",
    ]);
  });

  it("trims whitespace from DATABASES entries", () => {
    process.env.DATABASES = "  ProdDB , StagingDB , AnalyticsDB  ";
    expect(getAllowedDatabases()).toEqual([
      "ProdDB",
      "StagingDB",
      "AnalyticsDB",
    ]);
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
    setRequiredEnvironment();
    mssqlMockState.poolConfigs.length = 0;
    mssqlMockState.connectCalls.mockClear();
    mssqlMockState.closeCalls.mockClear();
    mssqlMockState.requestCalls.mockClear();
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

  it("returns DATABASE_NAME when it is in DATABASES", () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    process.env.DATABASE_NAME = "StagingDB";
    expect(resolveDatabaseName()).toBe("StagingDB");
  });

  it("returns the first DATABASES entry when DATABASE_NAME is omitted", () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    delete process.env.DATABASE_NAME;
    expect(resolveDatabaseName()).toBe("ProdDB");
  });

  it("returns param when param provided and in allowed list", () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    process.env.DATABASE_NAME = "ProdDB";
    expect(resolveDatabaseName("StagingDB")).toBe("StagingDB");
  });

  it("falls back to the first DATABASES entry when DATABASE_NAME is not included in DATABASES", () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    process.env.DATABASE_NAME = "OtherDb";
    expect(resolveDatabaseName()).toBe("ProdDB");
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
    expect(resolveDatabaseName("AnyDb")).toBeNull();
  });

  it("trims whitespace from param", () => {
    process.env.DATABASES = "ProdDB";
    expect(resolveDatabaseName("  ProdDB  ")).toBe("ProdDB");
  });

  it("returns null when neither DATABASE_NAME nor DATABASES is configured", () => {
    delete process.env.DATABASE_NAME;
    delete process.env.DATABASES;
    expect(resolveDatabaseName()).toBeNull();
  });
});

describe("getSqlRequest", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    setRequiredEnvironment();
    mssqlMockState.poolConfigs.length = 0;
    mssqlMockState.connectCalls.mockClear();
    mssqlMockState.closeCalls.mockClear();
    mssqlMockState.requestCalls.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns a helpful error when no database access is configured", async () => {
    delete process.env.DATABASE_NAME;
    delete process.env.DATABASES;

    const result = await getSqlRequest();

    expect(result.error).toBe(
      "Invalid or disallowed database. Set DATABASE_NAME or DATABASES to configure database access. Use the databaseName parameter to target a specific configured database."
    );
  });

  it("returns allowed databases in the error when a disallowed database is requested", async () => {
    process.env.DATABASES = "ProdDB,StagingDB";

    const result = await getSqlRequest("OtherDb");

    expect(result.error).toBe(
      "Invalid or disallowed database. Allowed: ProdDB, StagingDB. Use the databaseName parameter to target a specific configured database."
    );
  });

  it("returns a request using the configured default database", async () => {
    process.env.DATABASES = "ProdDBDefault,StagingDB";
    process.env.DATABASE_NAME = "ProdDBDefault";

    const result = await getSqlRequest();

    expect(result.error).toBeUndefined();
    expect(result.request).toBe(mssqlMockState.requestObject);
    expect(mssqlMockState.poolConfigs).toContainEqual(
      expect.objectContaining({ database: "ProdDBDefault" })
    );
    expect(mssqlMockState.connectCalls).toHaveBeenCalledWith(
      expect.objectContaining({ database: "ProdDBDefault" })
    );
    expect(mssqlMockState.requestCalls).toHaveBeenCalledWith(
      expect.objectContaining({ database: "ProdDBDefault" })
    );
  });

  it("reuses the startup-validated SQL connection configuration", async () => {
    configureSqlConnection(parseSqlConnectionConfig(process.env));
    process.env.SERVER_NAME = "changed-after-startup";

    const result = await getSqlRequest("AppDB");

    expect(result.error).toBeUndefined();
    expect(mssqlMockState.poolConfigs).toContainEqual(
      expect.objectContaining({ server: "localhost", database: "AppDB" })
    );
  });

  it("falls back to the first allowed database when DATABASE_NAME is disallowed", async () => {
    process.env.DATABASES = "ProdDB,StagingDB";
    process.env.DATABASE_NAME = "OtherDb";

    const result = await getSqlRequest();

    expect(result.error).toBeUndefined();
    expect(result.request).toBe(mssqlMockState.requestObject);
    expect(mssqlMockState.poolConfigs).toContainEqual(
      expect.objectContaining({ database: "ProdDB" })
    );
    expect(mssqlMockState.connectCalls).toHaveBeenCalledWith(
      expect.objectContaining({ database: "ProdDB" })
    );
    expect(mssqlMockState.requestCalls).toHaveBeenCalledWith(
      expect.objectContaining({ database: "ProdDB" })
    );
  });
});

describe("buildSqlConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    setRequiredEnvironment();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("builds a host-only connection without an explicit port", () => {
    delete process.env.SERVER_PORT;

    const config = buildSqlConfig(
      "AppDB",
      parseSqlConnectionConfig(process.env)
    );

    expect(config.server).toBe("localhost");
    expect(config).not.toHaveProperty("port");
  });

  it.each([
    ["1434", 1434],
    ["1433", 1433],
  ])("passes SERVER_PORT=%s separately as port %i", (value, expected) => {
    process.env.SERVER_PORT = value;

    const config = buildSqlConfig(
      "AppDB",
      parseSqlConnectionConfig(process.env)
    );

    expect(config.server).toBe("localhost");
    expect(config.port).toBe(expected);
  });

  it("does not split or otherwise transform SERVER_NAME", () => {
    process.env.SERVER_NAME = "localhost,1434";
    delete process.env.SERVER_PORT;

    const config = buildSqlConfig(
      "AppDB",
      parseSqlConnectionConfig(process.env)
    );

    expect(config.server).toBe("localhost,1434");
    expect(config).not.toHaveProperty("port");
  });

  it("preserves authentication, timeouts, and connection options", () => {
    Object.assign(process.env, {
      DB_USER: "database-user",
      DB_PASSWORD: "database-password",
      TRUST_SERVER_CERTIFICATE: "false",
      CONNECTION_TIMEOUT: "45",
      QUERY_TIMEOUT_MS: "60000",
    });

    const config = buildSqlConfig(
      "ReportingDB",
      parseSqlConnectionConfig(process.env)
    );

    expect(config).toMatchObject({
      server: "localhost",
      database: "ReportingDB",
      user: "database-user",
      password: "database-password",
      requestTimeout: 60000,
      connectionTimeout: 45000,
      options: {
        encrypt: false,
        trustServerCertificate: false,
        enableArithAbort: true,
        useUTC: false,
      },
    });
  });

  it("enables encrypted driver connections when ENCRYPT=true", () => {
    Object.assign(process.env, {
      ENCRYPT: "true",
      TRUST_SERVER_CERTIFICATE: "true",
    });

    const config = buildSqlConfig(
      "AppDB",
      parseSqlConnectionConfig(process.env)
    );

    expect(config.options).toMatchObject({
      encrypt: true,
      trustServerCertificate: true,
    });
  });
});

describe("database configuration snapshot", () => {
  it("keeps database defaults and allowlisting stable after startup", () => {
    configureDatabase(
      parseEnvironmentConfig({
        SERVER_NAME: "localhost",
        DATABASE_NAME: "AppDB",
        DATABASES: "AppDB,ReportingDB",
        DB_USER: "sa",
        DB_PASSWORD: "test-password",
      })
    );
    process.env.DATABASE_NAME = "ChangedDb";
    process.env.DATABASES = "ChangedDb";

    expect(getAllowedDatabases()).toEqual(["AppDB", "ReportingDB"]);
    expect(resolveDatabaseName()).toBe("AppDB");
    expect(resolveDatabaseName("ChangedDb")).toBeNull();
  });
});

describe("buildSqlConfig authentication", () => {
  const authKeys = [
    "SQL_AUTH_TYPE",
    "DB_USER",
    "DB_PASSWORD",
    "DB_DOMAIN",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "AZURE_TENANT_ID",
    "AZURE_ACCESS_TOKEN",
    "ENCRYPT",
  ];

  function connectionConfig(env: Record<string, string>) {
    const base = { SERVER_NAME: "sql.example.net" };
    return buildSqlConfig("AppDB", parseSqlConnectionConfig({ ...base, ...env }));
  }

  beforeEach(() => {
    for (const key of authKeys) delete process.env[key];
  });

  it("uses SQL login by default", () => {
    const config = connectionConfig({ DB_USER: "sa", DB_PASSWORD: "pw" });
    expect(config).toMatchObject({ user: "sa", password: "pw" });
    expect(config).not.toHaveProperty("authentication");
    expect(config.options?.encrypt).toBe(false);
  });

  it("passes the domain for NTLM", () => {
    const config = connectionConfig({
      SQL_AUTH_TYPE: "ntlm",
      DB_USER: "svc",
      DB_PASSWORD: "pw",
      DB_DOMAIN: "CORP",
    });
    expect(config).toMatchObject({ user: "svc", password: "pw", domain: "CORP" });
  });

  it("maps azure-default to DefaultAzureCredential and enables TLS", () => {
    const config = connectionConfig({
      SQL_AUTH_TYPE: "azure-default",
      AZURE_CLIENT_ID: "managed-identity-id",
    });
    expect(config.authentication).toEqual({
      type: "azure-active-directory-default",
      options: { clientId: "managed-identity-id" },
    });
    expect(config).not.toHaveProperty("user");
    expect(config.options?.encrypt).toBe(true);
  });

  it("maps a service principal", () => {
    const config = connectionConfig({
      SQL_AUTH_TYPE: "azure-service-principal",
      AZURE_CLIENT_ID: "app",
      AZURE_CLIENT_SECRET: "secret",
      AZURE_TENANT_ID: "tenant",
    });
    expect(config.authentication).toEqual({
      type: "azure-active-directory-service-principal-secret",
      options: { clientId: "app", clientSecret: "secret", tenantId: "tenant" },
    });
  });

  it("maps an access token and honors an explicit ENCRYPT=false", () => {
    const config = connectionConfig({
      SQL_AUTH_TYPE: "azure-access-token",
      AZURE_ACCESS_TOKEN: "token",
      ENCRYPT: "false",
    });
    expect(config.authentication).toEqual({
      type: "azure-active-directory-access-token",
      options: { token: "token" },
    });
    expect(config.options?.encrypt).toBe(false);
  });

  it.each([
    [{ SQL_AUTH_TYPE: "ntlm", DB_USER: "u", DB_PASSWORD: "p" }, "DB_DOMAIN"],
    [{ SQL_AUTH_TYPE: "azure-service-principal", AZURE_CLIENT_ID: "a" }, "AZURE_CLIENT_SECRET"],
    [{ SQL_AUTH_TYPE: "azure-access-token" }, "AZURE_ACCESS_TOKEN"],
    [{ SQL_AUTH_TYPE: "kerberos" }, "SQL_AUTH_TYPE"],
  ])("rejects incomplete auth config %o", (env, missing) => {
    expect(() => connectionConfig(env)).toThrow(missing);
  });

  it("does not require DB_USER for Entra ID auth", () => {
    expect(() => connectionConfig({ SQL_AUTH_TYPE: "azure-default" })).not.toThrow();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  clampRowLimit,
  configureRuntimeEnvironment,
  getDefaultSearchLimit,
  getMcpEndpointUrl,
  getMaxRows,
  getMaxWriteRows,
  parseEnvironmentConfig,
} from "../config.js";

const originalEnv = process.env;
const requiredEnvironment = {
  SERVER_NAME: "localhost",
  DATABASE_NAME: "AppDB",
  DATABASES: "AppDB,ReportingDB",
  DB_USER: "sa",
  DB_PASSWORD: "test-password",
  TRUST_SERVER_CERTIFICATE: "true",
  READONLY: "false",
  ENABLE_DDL: "false",
};

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("config helpers", () => {
  it("uses defaults when env vars are absent", () => {
    delete process.env.MAX_ROWS;

    expect(getMaxRows()).toBe(10000);
    expect(getDefaultSearchLimit()).toBe(100);
  });

  it("reads env-based limits", () => {
    process.env.MAX_ROWS = "250";

    expect(getMaxRows()).toBe(250);
    expect(getDefaultSearchLimit()).toBe(100);
  });

  it("clamps row limits to the configured maximum", () => {
    process.env.MAX_ROWS = "50";

    expect(clampRowLimit(200)).toBe(50);
    expect(clampRowLimit("5")).toBe(5);
    expect(clampRowLimit(undefined)).toBe(50);
  });

  it("reads the default write limit", () => {
    delete process.env.MAX_WRITE_ROWS;

    expect(getMaxWriteRows()).toBe(100);
  });

  it("applies documented defaults when optional variables are absent", () => {
    const config = parseEnvironmentConfig({
      DATABASE_NAME: "AppDB",
      DB_USER: "sa",
      DB_PASSWORD: "test-password",
    });

    expect(config).toMatchObject({
      databaseName: "AppDB",
      databases: ["AppDB"],
      serverName: "localhost",
      encrypt: false,
      trustServerCertificate: true,
      readOnly: false,
      enableDdl: false,
      connectionTimeoutSeconds: 30,
      queryTimeoutMs: 30000,
      maxRows: 10000,
      maxWriteRows: 100,
      requireWritePreview: true,
      mcpTransport: "stdio",
      mcpHttpHost: "127.0.0.1",
      mcpHttpPort: 3333,
    });
    expect(config.serverPort).toBeUndefined();
    expect(config.mcpBaseUrl).toBeUndefined();
  });

  it("parses required booleans as true and false", () => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      TRUST_SERVER_CERTIFICATE: "false",
      READONLY: "true",
      ENABLE_DDL: "false",
    });

    expect(config.trustServerCertificate).toBe(false);
    expect(config.readOnly).toBe(true);
    expect(config.enableDdl).toBe(false);
  });

  it.each(["DB_USER", "DB_PASSWORD"])(
    "rejects a missing required %s value",
    (name) => {
    const environment = { ...requiredEnvironment };
    delete environment[name as keyof typeof environment];

    expect(() => parseEnvironmentConfig(environment)).toThrow(name);
    }
  );

  it.each(["DB_USER", "DB_PASSWORD"])(
    "rejects a blank required %s value",
    (name) => {
    expect(() =>
      parseEnvironmentConfig({
        ...requiredEnvironment,
        [name]: "   ",
      })
    ).toThrow(name);
    }
  );

  it("uses DATABASES when DATABASE_NAME is absent", () => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      DATABASE_NAME: undefined,
    });

    expect(config.databaseName).toBe("AppDB");
    expect(config.databases).toEqual(["AppDB", "ReportingDB"]);
  });

  it("uses DATABASE_NAME as the allowlist when DATABASES is absent", () => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      DATABASES: undefined,
    });

    expect(config.databaseName).toBe("AppDB");
    expect(config.databases).toEqual(["AppDB"]);
  });

  it("rejects configuration when neither database variable is present", () => {
    expect(() =>
      parseEnvironmentConfig({
        ...requiredEnvironment,
        DATABASE_NAME: undefined,
        DATABASES: undefined,
      })
    ).toThrow("At least one of DATABASE_NAME or DATABASES is required");
  });

  it("treats blank optional values as omitted", () => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      SERVER_NAME: "   ",
      SERVER_PORT: " ",
      ENCRYPT: "",
      TRUST_SERVER_CERTIFICATE: " ",
      READONLY: "",
      ENABLE_DDL: " ",
      CONNECTION_TIMEOUT: "",
      QUERY_TIMEOUT_MS: " ",
      MAX_ROWS: "",
      MAX_WRITE_ROWS: " ",
      REQUIRE_WRITE_PREVIEW: "",
      MCP_TRANSPORT: " ",
      MCP_HTTP_PORT: "",
    });

    expect(config).toMatchObject({
      serverName: "localhost",
      serverPort: undefined,
      encrypt: false,
      trustServerCertificate: true,
      readOnly: false,
      enableDdl: false,
      connectionTimeoutSeconds: 30,
      queryTimeoutMs: 30000,
      maxRows: 10000,
      maxWriteRows: 100,
      requireWritePreview: true,
      mcpTransport: "stdio",
      mcpHttpPort: 3333,
    });
  });

  it.each(["TRUST_SERVER_CERTIFICATE", "READONLY", "ENABLE_DDL"])(
    "rejects an invalid boolean for %s",
    (name) => {
      expect(() =>
        parseEnvironmentConfig({
          ...requiredEnvironment,
          [name]: "yes",
        })
      ).toThrow(`${name} must be either "true" or "false".`);
    }
  );

  it("parses optional values when supplied", () => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      ENCRYPT: "true",
      CONNECTION_TIMEOUT: "45",
      QUERY_TIMEOUT_MS: "45000",
      MAX_ROWS: "500",
      MAX_WRITE_ROWS: "25",
      REQUIRE_WRITE_PREVIEW: "false",
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "0.0.0.0",
      MCP_HTTP_PORT: "4444",
      MCP_BASE_URL: "https://example.test/services/mssql/",
    });

    expect(config).toMatchObject({
      encrypt: true,
      connectionTimeoutSeconds: 45,
      queryTimeoutMs: 45000,
      maxRows: 500,
      maxWriteRows: 25,
      requireWritePreview: false,
      mcpTransport: "http",
      mcpHttpHost: "0.0.0.0",
      mcpHttpPort: 4444,
      mcpBaseUrl: "https://example.test/services/mssql",
    });
  });

  it.each(["yes", "1", "on"])(
    "rejects invalid ENCRYPT value %j",
    (value) => {
      expect(() =>
        parseEnvironmentConfig({
          ...requiredEnvironment,
          ENCRYPT: value,
        })
      ).toThrow('ENCRYPT must be either "true" or "false".');
    }
  );
});

describe("MCP_BASE_URL", () => {
  it("normalizes a valid external base and derives its MCP endpoint", () => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      MCP_BASE_URL: "https://proxy.example.test/services/mssql///",
    });

    expect(config.mcpBaseUrl).toBe("https://proxy.example.test/services/mssql");
    expect(getMcpEndpointUrl(config)).toBe(
      "https://proxy.example.test/services/mssql/mcp"
    );
  });

  it("derives the local endpoint when no external base is configured", () => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      MCP_HTTP_HOST: "0.0.0.0",
      MCP_HTTP_PORT: "4444",
    });

    expect(getMcpEndpointUrl(config)).toBe("http://0.0.0.0:4444/mcp");
  });

  it.each([
    "example.test",
    "/relative",
    "ftp://example.test",
    "https://user:password@example.test",
    "https://example.test?query=yes",
    "https://example.test/#section",
  ])("rejects invalid external base %j", (value) => {
    expect(() =>
      parseEnvironmentConfig({
        ...requiredEnvironment,
        MCP_BASE_URL: value,
      })
    ).toThrow("MCP_BASE_URL must be a valid absolute HTTP or HTTPS URL.");
  });

});

describe("SERVER_PORT", () => {
  it("is omitted when absent", () => {
    const config = parseEnvironmentConfig({ ...requiredEnvironment });
    expect(config.serverPort).toBeUndefined();
  });

  it.each([
    ["1434", 1434],
    ["1433", 1433],
  ])("parses %s as the integer %i", (value, expected) => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      SERVER_PORT: value,
    });

    expect(config.serverPort).toBe(expected);
  });

  it.each(["abc", "1434abc", "14.34", "0", "-1", "65536"])(
    "rejects invalid value %j with a clear error",
    (value) => {
      expect(() =>
        parseEnvironmentConfig({
          ...requiredEnvironment,
          SERVER_PORT: value,
        })
      ).toThrow("SERVER_PORT must be a valid TCP port between 1 and 65535.");
    }
  );
});

describe("runtime configuration snapshot", () => {
  it("keeps row limits stable when process.env changes after startup", () => {
    const environment = parseEnvironmentConfig({
      ...requiredEnvironment,
      MAX_ROWS: "25",
      MAX_WRITE_ROWS: "10",
    });
    configureRuntimeEnvironment(environment);

    process.env.MAX_ROWS = "999";
    process.env.MAX_WRITE_ROWS = "999";

    expect(getMaxRows()).toBe(25);
    expect(getMaxWriteRows()).toBe(10);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  clampRowLimit,
  getDefaultSearchLimit,
  getMcpHttpHost,
  getMcpHttpPort,
  getMcpTransport,
  getMaxRows,
  getMaxWriteRows,
  getQueryTimeoutMs,
  getServerPort,
  isDdlEnabled,
  isWritePreviewRequired,
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
    delete process.env.QUERY_TIMEOUT_MS;

    expect(getMaxRows()).toBe(10000);
    expect(getQueryTimeoutMs()).toBe(30000);
    expect(getDefaultSearchLimit()).toBe(100);
  });

  it("reads env-based limits", () => {
    process.env.MAX_ROWS = "250";
    process.env.QUERY_TIMEOUT_MS = "45000";

    expect(getMaxRows()).toBe(250);
    expect(getQueryTimeoutMs()).toBe(45000);
    expect(getDefaultSearchLimit()).toBe(100);
  });

  it("clamps row limits to the configured maximum", () => {
    process.env.MAX_ROWS = "50";

    expect(clampRowLimit(200)).toBe(50);
    expect(clampRowLimit("5")).toBe(5);
    expect(clampRowLimit(undefined)).toBe(50);
  });

  it("reads transport and safety defaults", () => {
    delete process.env.MCP_TRANSPORT;
    delete process.env.MCP_HTTP_HOST;
    delete process.env.MCP_HTTP_PORT;
    delete process.env.MAX_WRITE_ROWS;
    delete process.env.REQUIRE_WRITE_PREVIEW;
    process.env.ENABLE_DDL = "false";

    expect(getMcpTransport()).toBe("stdio");
    expect(getMcpHttpHost()).toBe("127.0.0.1");
    expect(getMcpHttpPort()).toBe(3333);
    expect(isDdlEnabled()).toBe(false);
    expect(getMaxWriteRows()).toBe(100);
    expect(isWritePreviewRequired()).toBe(true);
  });

  it("enables DDL when ENABLE_DDL=true", () => {
    process.env.ENABLE_DDL = "true";
    expect(isDdlEnabled()).toBe(true);
  });

  it("applies documented defaults when optional variables are absent", () => {
    const config = parseEnvironmentConfig({ ...requiredEnvironment });

    expect(config).toMatchObject({
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

  it.each([
    "SERVER_NAME",
    "DATABASE_NAME",
    "DATABASES",
    "DB_USER",
    "DB_PASSWORD",
    "TRUST_SERVER_CERTIFICATE",
    "READONLY",
    "ENABLE_DDL",
  ])("rejects a missing required %s value", (name) => {
    const environment = { ...requiredEnvironment };
    delete environment[name as keyof typeof environment];

    expect(() => parseEnvironmentConfig(environment)).toThrow(name);
  });

  it.each([
    "SERVER_NAME",
    "DATABASE_NAME",
    "DATABASES",
    "DB_USER",
    "DB_PASSWORD",
    "TRUST_SERVER_CERTIFICATE",
    "READONLY",
    "ENABLE_DDL",
  ])("rejects a blank required %s value", (name) => {
    expect(() =>
      parseEnvironmentConfig({
        ...requiredEnvironment,
        [name]: "   ",
      })
    ).toThrow(name);
  });

  it.each(["TRUST_SERVER_CERTIFICATE", "READONLY", "ENABLE_DDL"])(
    "rejects an invalid boolean for %s",
    (name) => {
      expect(() =>
        parseEnvironmentConfig({
          ...requiredEnvironment,
          [name]: "yes",
        })
      ).toThrow(`${name} is required and must be either "true" or "false".`);
    }
  );

  it("parses optional values when supplied", () => {
    const config = parseEnvironmentConfig({
      ...requiredEnvironment,
      CONNECTION_TIMEOUT: "45",
      QUERY_TIMEOUT_MS: "45000",
      MAX_ROWS: "500",
      MAX_WRITE_ROWS: "25",
      REQUIRE_WRITE_PREVIEW: "false",
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "0.0.0.0",
      MCP_HTTP_PORT: "4444",
      MCP_BASE_URL: "https://example.test/mcp",
    });

    expect(config).toMatchObject({
      connectionTimeoutSeconds: 45,
      queryTimeoutMs: 45000,
      maxRows: 500,
      maxWriteRows: 25,
      requireWritePreview: false,
      mcpTransport: "http",
      mcpHttpHost: "0.0.0.0",
      mcpHttpPort: 4444,
      mcpBaseUrl: "https://example.test/mcp",
    });
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

  it.each(["abc", "1434abc", "14.34", "0", "-1", "65536", "   "])(
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

  it("uses the same validation in the direct getter", () => {
    delete process.env.SERVER_PORT;
    expect(getServerPort()).toBeUndefined();

    process.env.SERVER_PORT = "1434";
    expect(getServerPort()).toBe(1434);

    process.env.SERVER_PORT = "1434abc";
    expect(() => getServerPort()).toThrow("SERVER_PORT");
  });
});

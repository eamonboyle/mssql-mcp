import { describe, expect, it, vi } from "vitest";

const resourceRegistryMockState = vi.hoisted(() => ({
  listDatabaseTables: vi.fn(async () => [
    { schemaName: "dbo", tableName: "Users" },
  ]),
  listDatabaseObjects: vi.fn(async () => []),
}));

vi.mock("../schema.js", () => ({
  describeDatabaseObject: vi.fn(),
  describeTableSchema: vi.fn(),
  listDatabaseObjects: resourceRegistryMockState.listDatabaseObjects,
  listDatabaseTables: resourceRegistryMockState.listDatabaseTables,
}));

import { registerResources } from "../resourceRegistry.js";
import { ServerState } from "../serverState.js";

describe("resourceRegistry", () => {
  it("caches database listing reads for a short TTL", async () => {
    const handlers = new Map<string, (uri: URL) => Promise<unknown>>();
    const state = new ServerState();
    const server = {
      registerResource(
        name: string,
        _resource: unknown,
        _meta: unknown,
        handler: (uri: URL) => Promise<unknown>
      ) {
        handlers.set(name, handler);
      },
    };

    registerResources(server as never, {
      serverName: "mssql-mcp-server",
      serverVersion: "1.3.1",
      isReadOnly: false,
      allowedDatabases: ["AppDb"],
      toolNames: [],
      maxRows: 100,
      queryTimeoutMs: 30000,
      transport: "http",
      publicEndpoint: "https://mcp.example.test/mssql/mcp",
      encrypt: true,
      trustServerCertificate: false,
      enableDdl: false,
      requireWritePreview: true,
      state,
    });

    const readTables = handlers.get("AppDb_tables");
    expect(readTables).toBeDefined();

    await readTables?.(new URL("mssql://database/AppDb/tables"));
    await readTables?.(new URL("mssql://database/AppDb/tables"));

    expect(resourceRegistryMockState.listDatabaseTables).toHaveBeenCalledTimes(
      1
    );
    expect(
      resourceRegistryMockState.listDatabaseObjects
    ).not.toHaveBeenCalled();
  });

  it("registers query-plan resources", async () => {
    const handlers = new Map<string, (uri: URL) => Promise<unknown>>();
    const state = new ServerState();
    state.storeQueryPlan("AppDb", "SELECT 1", "<ShowPlanXML />");

    const server = {
      registerResource(
        name: string,
        _resource: unknown,
        _meta: unknown,
        handler: (uri: URL) => Promise<unknown>
      ) {
        handlers.set(name, handler);
      },
    };

    registerResources(server as never, {
      serverName: "mssql-mcp-server",
      serverVersion: "1.3.1",
      isReadOnly: false,
      allowedDatabases: ["AppDb"],
      toolNames: [],
      maxRows: 100,
      queryTimeoutMs: 30000,
      transport: "stdio",
      encrypt: false,
      trustServerCertificate: true,
      enableDdl: false,
      requireWritePreview: true,
      state,
    });

    const queryPlanHandler = handlers.get("query_plan_resource");
    expect(queryPlanHandler).toBeDefined();

    const result = (await queryPlanHandler?.(
      new URL(`mssql://query-plan/${state.listQueryPlans()[0].id}`)
    )) as { contents: Array<{ text: string }> };

    expect(result.contents[0].text).toContain("ShowPlanXML");
  });

  it("exposes redacted transport and connection metadata", async () => {
    const handlers = new Map<string, (uri: URL) => Promise<unknown>>();
    const state = new ServerState();
    const server = {
      registerResource(
        name: string,
        _resource: unknown,
        _meta: unknown,
        handler: (uri: URL) => Promise<unknown>
      ) {
        handlers.set(name, handler);
      },
    };

    registerResources(server as never, {
      serverName: "mssql-mcp-server",
      serverVersion: "1.6.0",
      isReadOnly: false,
      allowedDatabases: ["AppDb"],
      toolNames: ["list_databases"],
      maxRows: 100,
      queryTimeoutMs: 30000,
      transport: "http",
      publicEndpoint: "https://mcp.example.test/services/mssql/mcp",
      encrypt: true,
      trustServerCertificate: false,
      enableDdl: true,
      requireWritePreview: true,
      state,
    });

    const configHandler = handlers.get("server_config");
    const result = (await configHandler?.(
      new URL("mssql://config/server")
    )) as { contents: Array<{ text: string }> };
    const payload = JSON.parse(result.contents[0].text);

    expect(payload.server).toMatchObject({
      transport: "http",
      publicEndpoint: "https://mcp.example.test/services/mssql/mcp",
      encrypt: true,
      trustServerCertificate: false,
      enableDdl: true,
      requireWritePreview: true,
    });
    expect(payload.server).not.toHaveProperty("dbUser");
    expect(payload.server).not.toHaveProperty("dbPassword");
  });
});

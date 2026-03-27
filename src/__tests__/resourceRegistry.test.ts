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

describe("resourceRegistry", () => {
  it("caches database listing reads for a short TTL", async () => {
    const handlers = new Map<string, (uri: URL) => Promise<unknown>>();
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
      serverVersion: "1.2.0",
      isReadOnly: false,
      allowedDatabases: ["AppDb"],
      toolNames: [],
      maxRows: 100,
      queryTimeoutMs: 30000,
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
});

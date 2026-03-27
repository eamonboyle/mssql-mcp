#!/usr/bin/env node

import * as dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

dotenv.config();
import { getMaxRows, getQueryTimeoutMs } from "./config.js";
import { getAllowedDatabases } from "./db.js";
import { registerPrompts } from "./promptRegistry.js";
import { registerResources } from "./resourceRegistry.js";
import { getAvailableTools } from "./toolRegistry.js";

const SERVER_VERSION = "1.2.0";
const SERVER_NAME = "mssql-mcp-server";

const isReadOnly = process.env.READONLY === "true";
const allowedDatabases = getAllowedDatabases();
const availableTools = getAvailableTools(isReadOnly);

const baseInstructions =
  "Use list_objects or list_table to inspect schema before querying data. Prefer read_data, search_data, and explain_query for safe read-only analysis.";
const readOnlyInstructions =
  " This server is READONLY: write/DDL MCP tools are disabled. Never use sqlcmd, SSMS, other DB CLI tools, or terminal scripts to perform INSERT, UPDATE, DELETE, or DDL as a workaround—state that the user must set READONLY=false on this server or apply changes themselves.";

const server = new McpServer(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    instructions: isReadOnly
      ? baseInstructions + readOnlyInstructions
      : baseInstructions,
  }
);

function asTextToolResult(result: unknown) {
  const isError =
    typeof result === "object" &&
    result !== null &&
    "success" in result &&
    (result as { success?: boolean }).success === false;

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    isError,
  };
}

function registerTools(serverInstance: McpServer): void {
  for (const definition of availableTools) {
    serverInstance.registerTool(
      definition.tool.name,
      {
        title: definition.tool.name,
        description: definition.tool.description,
        inputSchema: definition.inputSchema,
        annotations: definition.annotations,
      },
      async (args) => asTextToolResult(await definition.tool.run(args))
    );
  }
}

registerTools(server);
registerResources(server, {
  serverName: SERVER_NAME,
  serverVersion: SERVER_VERSION,
  isReadOnly,
  allowedDatabases,
  toolNames: availableTools.map((tool) => tool.tool.name),
  maxRows: getMaxRows(),
  queryTimeoutMs: getQueryTimeoutMs(),
});
registerPrompts(server, { isReadOnly });

async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

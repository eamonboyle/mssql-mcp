// External imports
import * as dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { log as fileLog, getLogPath } from "./logger.js";

dotenv.config();

// Internal imports
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const updateDataTool = new UpdateDataTool();
const insertDataTool = new InsertDataTool();
const readDataTool = new ReadDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const listTableTool = new ListTableTool();
const dropTableTool = new DropTableTool();
const describeTableTool = new DescribeTableTool();

const QUERY_RESULTS_URI = "ui://mssql/query-results.html";
const TABLE_EXPLORER_URI = "ui://mssql/table-explorer.html";
const SCHEMA_VIEWER_URI = "ui://mssql/schema-viewer.html";

const mcpServer = new McpServer(
  {
    name: "mssql-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Read READONLY env variable
const isReadOnly = process.env.READONLY === "true";

// Set USE_MCP_APPS=false to use standard tools (avoids "v3Schema" parse errors in some Cursor versions)
const useMcpApps = process.env.USE_MCP_APPS !== "false";

// Debug logging (set DEBUG=true to trace tool responses)
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";
function debugLog(tool: string, message: string, data?: unknown) {
  if (DEBUG) {
    const payload = data !== undefined ? ` ${JSON.stringify(data).slice(0, 300)}...` : "";
    const msg = `${tool}: ${message}${payload}`;
    console.error(`[MSSQL-MCP DEBUG] ${msg}`);
    fileLog("DEBUG", msg);
  }
}

/** Recursively convert values to JSON-serializable form (handles Date, Buffer, BigInt, Decimal, etc.) */
function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toJSON === "function") return obj.toJSON();
    if (typeof (obj as { valueOf?: () => unknown }).valueOf === "function") {
      const prim = (obj as { valueOf: () => unknown }).valueOf();
      if (typeof prim === "number" || typeof prim === "string") return prim;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      try {
        out[k] = toJsonSafe(v);
      } catch {
        out[k] = String(v);
      }
    }
    return out;
  }
  return String(value);
}

const readDataHandler = async (args: unknown) => {
  fileLog("INFO", "read_data called", { hasArgs: !!args });
  const result = await readDataTool.run(args);
  const payload = toJsonSafe(result);
  const text = JSON.stringify(payload, null, 2);
  fileLog("INFO", "read_data result", { success: (result as { success?: boolean }).success, textLength: text.length });
  if (DEBUG) {
    debugLog("read_data", "result keys", Object.keys(result as object));
    debugLog("read_data", "text length", text.length);
    debugLog("read_data", "text preview", text.slice(0, 200));
  }
  return { content: [{ type: "text" as const, text }] };
};

if (useMcpApps) {
  registerAppTool(mcpServer, "read_data", {
    description: readDataTool.description,
    inputSchema: readDataTool.inputSchema,
    _meta: { ui: { resourceUri: QUERY_RESULTS_URI } },
  }, readDataHandler);
} else {
  mcpServer.registerTool("read_data", {
    description: readDataTool.description,
    inputSchema: readDataTool.inputSchema,
  }, readDataHandler);
}

// Register the query results UI resource
registerAppResource(
  mcpServer,
  "Query Results",
  QUERY_RESULTS_URI,
  { description: "Interactive query results table" },
  async () => {
    const htmlPath = join(__dirname, "ui", "query-results.html");
    const html = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: QUERY_RESULTS_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
        },
      ],
    };
  }
);

const listTableHandler = async (args: unknown) => {
  fileLog("INFO", "list_table called", { hasArgs: !!args });
  const result = await listTableTool.run(args);
  const payload = toJsonSafe(result);
  const text = JSON.stringify(payload, null, 2);
  debugLog("list_table", "returning", { contentLength: text.length });
  return { content: [{ type: "text" as const, text }] };
};

if (useMcpApps) {
  registerAppTool(mcpServer, "list_table", {
    description: listTableTool.description,
    inputSchema: listTableTool.inputSchema,
    _meta: { ui: { resourceUri: TABLE_EXPLORER_URI } },
  }, listTableHandler);
} else {
  mcpServer.registerTool("list_table", {
    description: listTableTool.description,
    inputSchema: listTableTool.inputSchema,
  }, listTableHandler);
}

// Register the table explorer UI resource
registerAppResource(
  mcpServer,
  "Table Explorer",
  TABLE_EXPLORER_URI,
  { description: "Browse and explore database tables" },
  async () => {
    const htmlPath = join(__dirname, "ui", "table-explorer.html");
    const html = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: TABLE_EXPLORER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
        },
      ],
    };
  }
);

const describeTableHandler = async (args: unknown) => {
  fileLog("INFO", "describe_table called", { hasArgs: !!args });
  if (!args || typeof (args as { tableName?: string }).tableName !== "string") {
    return {
      content: [{ type: "text" as const, text: `Missing or invalid 'tableName' argument for describe_table tool.` }],
      isError: true,
    };
  }
  const result = await describeTableTool.run(args as { tableName: string; databaseName?: string });
  const payload = toJsonSafe(result);
  const text = JSON.stringify(payload, null, 2);
  debugLog("describe_table", "returning", { contentLength: text.length });
  return { content: [{ type: "text" as const, text }] };
};

if (useMcpApps) {
  registerAppTool(mcpServer, "describe_table", {
    description: describeTableTool.description,
    inputSchema: describeTableTool.inputSchema,
    _meta: { ui: { resourceUri: SCHEMA_VIEWER_URI } },
  }, describeTableHandler);
} else {
  mcpServer.registerTool("describe_table", {
    description: describeTableTool.description,
    inputSchema: describeTableTool.inputSchema,
  }, describeTableHandler);
}

// Register the schema viewer UI resource
registerAppResource(
  mcpServer,
  "Schema Viewer",
  SCHEMA_VIEWER_URI,
  { description: "View table schema and column types" },
  async () => {
    const htmlPath = join(__dirname, "ui", "schema-viewer.html");
    const html = await readFile(htmlPath, "utf-8");
    return {
      contents: [
        {
          uri: SCHEMA_VIEWER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
        },
      ],
    };
  }
);

// Register other tools (without UI)
if (!isReadOnly) {
  mcpServer.registerTool(
    "insert_data",
    {
      description: insertDataTool.description,
      inputSchema: insertDataTool.inputSchema,
    },
    async (args) => {
      const result = await insertDataTool.run(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  mcpServer.registerTool(
    "update_data",
    {
      description: updateDataTool.description,
      inputSchema: updateDataTool.inputSchema,
    },
    async (args) => {
      const result = await updateDataTool.run(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  mcpServer.registerTool(
    "create_table",
    {
      description: createTableTool.description,
      inputSchema: createTableTool.inputSchema,
    },
    async (args) => {
      const result = await createTableTool.run(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  mcpServer.registerTool(
    "create_index",
    {
      description: createIndexTool.description,
      inputSchema: createIndexTool.inputSchema,
    },
    async (args) => {
      const result = await createIndexTool.run(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  mcpServer.registerTool(
    "drop_table",
    {
      description: dropTableTool.description,
      inputSchema: dropTableTool.inputSchema,
    },
    async (args) => {
      const result = await dropTableTool.run(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

// Server startup
async function runServer() {
  try {
    fileLog("INFO", "Server starting", {
      debug: DEBUG,
      useMcpApps,
      readOnly: isReadOnly,
      logPath: getLogPath(),
    });
    if (DEBUG) {
      console.error("[MSSQL-MCP] Debug logging enabled (DEBUG=true). Logs:", getLogPath());
    }
    if (!useMcpApps) {
      console.error("[MSSQL-MCP] MCP Apps disabled (USE_MCP_APPS=false) - using standard tools to avoid parse errors");
    }
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  fileLog("ERROR", "Fatal error running server", { error: String(error) });
  console.error("Fatal error running server:", error);
  process.exit(1);
});

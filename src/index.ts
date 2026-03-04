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

// Register read_data with MCP App UI
registerAppTool(
  mcpServer,
  "read_data",
  {
    description: readDataTool.description,
    inputSchema: readDataTool.inputSchema,
    _meta: {
      ui: { resourceUri: QUERY_RESULTS_URI },
    },
  },
  async (args) => {
    const result = await readDataTool.run(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

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

// Register list_table with MCP App UI
registerAppTool(
  mcpServer,
  "list_table",
  {
    description: listTableTool.description,
    inputSchema: listTableTool.inputSchema,
    _meta: {
      ui: { resourceUri: TABLE_EXPLORER_URI },
    },
  },
  async (args) => {
    const result = await listTableTool.run(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

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

// Register describe_table with MCP App UI
registerAppTool(
  mcpServer,
  "describe_table",
  {
    description: describeTableTool.description,
    inputSchema: describeTableTool.inputSchema,
    _meta: {
      ui: { resourceUri: SCHEMA_VIEWER_URI },
    },
  },
  async (args) => {
    if (!args || typeof (args as { tableName?: string }).tableName !== "string") {
      return {
        content: [
          {
            type: "text",
            text: `Missing or invalid 'tableName' argument for describe_table tool.`,
          },
        ],
        isError: true,
      };
    }
    const result = await describeTableTool.run(
      args as { tableName: string; databaseName?: string }
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

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
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { DeleteDataTool } from "./tools/DeleteDataTool.js";
import { DescribeObjectTool } from "./tools/DescribeObjectTool.js";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { ExplainQueryTool } from "./tools/ExplainQueryTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ListObjectsTool } from "./tools/ListObjectsTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { SearchDataTool } from "./tools/SearchDataTool.js";
import { UpdateDataTool } from "./tools/UpdateDataTool.js";

export interface RunnableTool {
  name: string;
  description?: string;
  run(params: unknown): Promise<unknown>;
}

export interface ToolDefinition {
  tool: RunnableTool;
  inputSchema: z.ZodType;
  annotations: ToolAnnotations;
  readOnly: boolean;
}

const recordSchema = z.record(z.string(), z.unknown());

const listTableTool = new ListTableTool();
const describeTableTool = new DescribeTableTool();
const listObjectsTool = new ListObjectsTool();
const describeObjectTool = new DescribeObjectTool();
const readDataTool = new ReadDataTool();
const searchDataTool = new SearchDataTool();
const explainQueryTool = new ExplainQueryTool();
const insertDataTool = new InsertDataTool();
const updateDataTool = new UpdateDataTool();
const deleteDataTool = new DeleteDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const dropTableTool = new DropTableTool();

export const toolDefinitions: ToolDefinition[] = [
  {
    tool: listTableTool,
    readOnly: true,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z
      .object({
        parameters: z
          .array(z.string().describe("Schema name to filter by"))
          .optional()
          .describe("Schemas to filter by (optional)"),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: describeTableTool,
    readOnly: true,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        tableName: z.string().describe("Name of the table to describe"),
        schemaName: z
          .string()
          .optional()
          .describe(
            "Schema containing the table (optional). Omit to search across schemas."
          ),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: listObjectsTool,
    readOnly: true,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z
      .object({
        objectTypes: z
          .array(
            z.enum(["table", "view", "procedure", "function", "trigger"])
          )
          .optional()
          .describe(
            "Optional object types to include. Omit to list tables, views, procedures, functions, and triggers."
          ),
        schemaName: z
          .string()
          .optional()
          .describe("Schema to filter by (optional)."),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: describeObjectTool,
    readOnly: true,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        objectName: z.string().describe("Object name to describe."),
        objectTypes: z
          .array(
            z.enum(["table", "view", "procedure", "function", "trigger"])
          )
          .optional()
          .describe(
            "Optional object types to narrow the lookup. Omit to search across supported object types."
          ),
        schemaName: z
          .string()
          .optional()
          .describe("Schema containing the object (optional)."),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: readDataTool,
    readOnly: true,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "SQL SELECT query to execute (must start with SELECT and cannot contain destructive operations). Example: SELECT * FROM movies WHERE genre = 'comedy'"
          ),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to query (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: searchDataTool,
    readOnly: true,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        tableName: z.string().describe("Name of the table to search"),
        schemaName: z
          .string()
          .optional()
          .describe(
            "Schema containing the table (optional). Omit to use the default schema resolution."
          ),
        columns: z
          .array(z.string())
          .describe(
            "Columns to search with LIKE. Example: ['name', 'email', 'city']"
          ),
        searchTerm: z
          .string()
          .describe("Search term to match against the selected columns."),
        limit: z
          .number()
          .optional()
          .describe(
            "Maximum number of rows to return (optional). Clamped to MAX_ROWS."
          ),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: explainQueryTool,
    readOnly: true,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        query: z
          .string()
          .describe(
            "SQL SELECT query to analyze. The query must pass the same safety checks as read_data."
          ),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: insertDataTool,
    readOnly: false,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        tableName: z
          .string()
          .describe("Name of the table to insert data into"),
        data: z
          .union([recordSchema, z.array(recordSchema)])
          .describe(
            "Single row object or array of row objects to insert. All rows in an array must share the same columns."
          ),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: updateDataTool,
    readOnly: false,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        tableName: z.string().describe("Name of the table to update"),
        updates: recordSchema.describe(
          "Key-value pairs of columns to update. Example: { status: 'active' }"
        ),
        whereClause: z
          .string()
          .describe(
            "WHERE clause to identify which records to update. Example: status = 'pending'"
          ),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: deleteDataTool,
    readOnly: false,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        tableName: z
          .string()
          .describe("Name of the table to delete rows from."),
        schemaName: z
          .string()
          .optional()
          .describe("Schema containing the table (optional)."),
        whereClause: z
          .string()
          .describe(
            "WHERE clause used to target rows for deletion. Example: status = 'inactive'"
          ),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: createTableTool,
    readOnly: false,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        tableName: z.string().describe("Name of the table to create"),
        columns: z
          .array(
            z
              .object({
                name: z.string().describe("Column name"),
                type: z
                  .string()
                  .describe(
                    "SQL type and constraints (e.g., 'INT PRIMARY KEY', 'NVARCHAR(255) NOT NULL')"
                  ),
              })
              .passthrough()
          )
          .describe(
            "Array of column definitions (e.g., [{ name: 'id', type: 'INT PRIMARY KEY' }])"
          ),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: createIndexTool,
    readOnly: false,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        schemaName: z
          .string()
          .optional()
          .describe("Name of the schema containing the table"),
        tableName: z.string().describe("Name of the table to create index on"),
        indexName: z.string().describe("Name for the new index"),
        columns: z
          .array(z.string())
          .describe("Array of column names to include in the index"),
        isUnique: z
          .boolean()
          .optional()
          .describe("Whether the index should enforce uniqueness"),
        isClustered: z
          .boolean()
          .optional()
          .describe("Whether the index should be clustered"),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
  {
    tool: dropTableTool,
    readOnly: false,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        tableName: z.string().describe("Name of the table to drop"),
        databaseName: z
          .string()
          .optional()
          .describe(
            "Name of the database to use (optional). Omit to use the default configured database."
          ),
      })
      .passthrough(),
  },
];

export function getAvailableTools(isReadOnly: boolean): ToolDefinition[] {
  return isReadOnly
    ? toolDefinitions.filter((definition) => definition.readOnly)
    : toolDefinitions;
}

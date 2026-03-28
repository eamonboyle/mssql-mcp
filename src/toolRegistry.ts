import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { toolResultOutputSchema } from "./mcpResults.js";
import { AnalyzeTableTool } from "./tools/AnalyzeTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { DeleteDataTool } from "./tools/DeleteDataTool.js";
import { DescribeRelationshipsTool } from "./tools/DescribeRelationshipsTool.js";
import { DescribeObjectTool } from "./tools/DescribeObjectTool.js";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { ExplainQueryTool } from "./tools/ExplainQueryTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ListDatabasesTool } from "./tools/ListDatabasesTool.js";
import { ListForeignKeysTool } from "./tools/ListForeignKeysTool.js";
import { ListObjectsTool } from "./tools/ListObjectsTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { PreviewDeleteTool } from "./tools/PreviewDeleteTool.js";
import { PreviewUpdateTool } from "./tools/PreviewUpdateTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { SearchDataTool } from "./tools/SearchDataTool.js";
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { SQL_FILTER_OPERATORS } from "./writeSafety.js";
import { getAllowedDatabases } from "./db.js";
import { listDatabaseObjects, listDatabaseTables } from "./schema.js";

export interface RunnableTool {
  name: string;
  description?: string;
  run(params: unknown): Promise<unknown>;
}

export interface ToolDefinition {
  tool: RunnableTool;
  inputSchema: z.ZodType;
  outputSchema: z.ZodRawShape;
  annotations: ToolAnnotations;
  readOnly: boolean;
  requiresConfirmation?: boolean;
  requiresDdl?: boolean;
  writePreviewTool?: string;
}

const recordSchema = z.record(z.string(), z.unknown());
const filterSchema = z
  .object({
    column: z.string().describe("Column name to filter on."),
    operator: z
      .enum(SQL_FILTER_OPERATORS)
      .describe("Comparison operator for this filter."),
    value: z
      .unknown()
      .optional()
      .describe("Single comparison value. Required for most operators."),
    values: z
      .array(z.unknown())
      .optional()
      .describe("Multiple comparison values. Required for IN filters."),
  })
  .strict()
  .superRefine((filter, ctx) => {
    if (filter.operator === "IN") {
      if (!Array.isArray(filter.values) || filter.values.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["values"],
          message: "IN filters require a non-empty values array.",
        });
      }
      return;
    }

    if (filter.operator === "IS NULL" || filter.operator === "IS NOT NULL") {
      return;
    }

    if (!("value" in filter)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `${filter.operator} filters require a value.`,
      });
    }
  });

const listTableTool = new ListTableTool();
const describeTableTool = new DescribeTableTool();
const listObjectsTool = new ListObjectsTool();
const describeObjectTool = new DescribeObjectTool();
const listDatabasesTool = new ListDatabasesTool();
const listForeignKeysTool = new ListForeignKeysTool();
const describeRelationshipsTool = new DescribeRelationshipsTool();
const analyzeTableTool = new AnalyzeTableTool();
const readDataTool = new ReadDataTool();
const searchDataTool = new SearchDataTool();
const explainQueryTool = new ExplainQueryTool();
const previewUpdateTool = new PreviewUpdateTool();
const previewDeleteTool = new PreviewDeleteTool();
const insertDataTool = new InsertDataTool();
const updateDataTool = new UpdateDataTool();
const deleteDataTool = new DeleteDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const dropTableTool = new DropTableTool();

const databaseNameSchema = completable(
  z
    .string()
    .describe(
      "Name of the database to use (optional). Omit to use the default configured database."
    ),
  async (value) =>
    getAllowedDatabases().filter((database) =>
      database.toLowerCase().startsWith(String(value ?? "").toLowerCase())
    )
);

const schemaNameSchema = completable(
  z.string().describe("Schema name."),
  async (value, context) => {
    const databaseName = context?.arguments?.databaseName;
    const tables = await listDatabaseTables(databaseName);
    const schemas = [...new Set(tables.map((table) => table.schemaName))];
    return schemas.filter((schema) =>
      schema.toLowerCase().startsWith(String(value ?? "").toLowerCase())
    );
  }
);

const tableNameSchema = completable(
  z.string().describe("Table name."),
  async (value, context) => {
    const databaseName = context?.arguments?.databaseName;
    const schemaName = context?.arguments?.schemaName;
    const tables = await listDatabaseTables(databaseName, schemaName);
    return tables
      .map((table) => table.tableName)
      .filter((table) =>
        table.toLowerCase().startsWith(String(value ?? "").toLowerCase())
      );
  }
);

const objectNameSchema = completable(
  z.string().describe("Object name."),
  async (value, context) => {
    const databaseName = context?.arguments?.databaseName;
    const schemaName = context?.arguments?.schemaName;
    const objects = await listDatabaseObjects(databaseName, undefined, schemaName);
    return objects
      .map((object) => object.name)
      .filter((name) =>
        name.toLowerCase().startsWith(String(value ?? "").toLowerCase())
      );
  }
);

export const toolDefinitions: ToolDefinition[] = [
  {
    tool: listDatabasesTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({}).strict(),
  },
  {
    tool: listTableTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
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
        databaseName: databaseNameSchema.optional(),
      })
      .passthrough(),
  },
  {
    tool: describeTableTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema.describe("Name of the table to describe"),
        schemaName: schemaNameSchema
          .optional()
          .describe(
            "Schema containing the table (optional). Omit to search across schemas."
          ),
        databaseName: databaseNameSchema.optional(),
      })
      .passthrough(),
  },
  {
    tool: listObjectsTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
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
        schemaName: schemaNameSchema
          .optional()
          .describe("Schema to filter by (optional)."),
        databaseName: databaseNameSchema.optional(),
      })
      .passthrough(),
  },
  {
    tool: describeObjectTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        objectName: objectNameSchema.describe("Object name to describe."),
        objectTypes: z
          .array(
            z.enum(["table", "view", "procedure", "function", "trigger"])
          )
          .optional()
          .describe(
            "Optional object types to narrow the lookup. Omit to search across supported object types."
          ),
        schemaName: schemaNameSchema
          .optional()
          .describe("Schema containing the object (optional)."),
        databaseName: databaseNameSchema.optional(),
      })
      .passthrough(),
  },
  {
    tool: listForeignKeysTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z
      .object({
        schemaName: schemaNameSchema
          .optional()
          .describe("Schema to filter by (optional)."),
        databaseName: databaseNameSchema.optional(),
      })
      .strict(),
  },
  {
    tool: describeRelationshipsTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema,
        schemaName: schemaNameSchema.optional(),
        databaseName: databaseNameSchema.optional(),
      })
      .strict(),
  },
  {
    tool: analyzeTableTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema,
        schemaName: schemaNameSchema.optional(),
        databaseName: databaseNameSchema.optional(),
      })
      .strict(),
  },
  {
    tool: readDataTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
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
        databaseName: databaseNameSchema.optional(),
      })
      .passthrough(),
  },
  {
    tool: searchDataTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema.describe("Name of the table to search"),
        schemaName: schemaNameSchema
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
        databaseName: databaseNameSchema.optional(),
      })
      .passthrough(),
  },
  {
    tool: explainQueryTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
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
        databaseName: databaseNameSchema.optional(),
      })
      .passthrough(),
  },
  {
    tool: previewUpdateTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema,
        schemaName: schemaNameSchema.optional(),
        updates: recordSchema.describe(
          "Key-value pairs of columns to update. Example: { status: 'active' }"
        ),
        filters: z.array(filterSchema),
        previewLimit: z.number().optional(),
        databaseName: databaseNameSchema.optional(),
      })
      .strict(),
  },
  {
    tool: previewDeleteTool,
    readOnly: true,
    outputSchema: toolResultOutputSchema,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema,
        schemaName: schemaNameSchema.optional(),
        filters: z.array(filterSchema),
        previewLimit: z.number().optional(),
        databaseName: databaseNameSchema.optional(),
      })
      .strict(),
  },
  {
    tool: insertDataTool,
    readOnly: false,
    outputSchema: toolResultOutputSchema,
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
        databaseName: databaseNameSchema.optional(),
        confirmed: z
          .boolean()
          .optional()
          .describe("Set to true after reviewing the planned write."),
      })
      .strict(),
    requiresConfirmation: true,
  },
  {
    tool: updateDataTool,
    readOnly: false,
    outputSchema: toolResultOutputSchema,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema.describe("Name of the table to update"),
        schemaName: schemaNameSchema
          .optional()
          .describe("Schema containing the table (optional)."),
        updates: recordSchema.describe(
          "Key-value pairs of columns to update. Example: { status: 'active' }"
        ),
        filters: z
          .array(filterSchema)
          .describe(
            "Structured filters combined with AND to identify which rows to update."
          ),
        databaseName: databaseNameSchema.optional(),
        confirmed: z
          .boolean()
          .optional()
          .describe("Set to true after reviewing preview_update."),
      })
      .strict(),
    requiresConfirmation: true,
    writePreviewTool: "preview_update",
  },
  {
    tool: deleteDataTool,
    readOnly: false,
    outputSchema: toolResultOutputSchema,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema.describe("Name of the table to delete rows from."),
        schemaName: schemaNameSchema
          .optional()
          .describe("Schema containing the table (optional)."),
        filters: z
          .array(filterSchema)
          .describe(
            "Structured filters combined with AND to target rows for deletion."
          ),
        databaseName: databaseNameSchema.optional(),
        confirmed: z
          .boolean()
          .optional()
          .describe("Set to true after reviewing preview_delete."),
      })
      .strict(),
    requiresConfirmation: true,
    writePreviewTool: "preview_delete",
  },
  {
    tool: createTableTool,
    readOnly: false,
    outputSchema: toolResultOutputSchema,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        schemaName: z
          .string()
          .optional()
          .describe("Name of the schema for the new table (optional)."),
        tableName: tableNameSchema.describe("Name of the table to create"),
        columns: z
          .array(
            z
              .object({
                name: z.string().describe("Column name"),
                type: z
                  .string()
                  .describe(
                    "SQL type declaration only (e.g., 'INT', 'NVARCHAR(255)', 'DECIMAL(10, 2)')."
                  ),
                nullable: z
                  .boolean()
                  .optional()
                  .describe("Whether the column allows NULL values."),
                isPrimaryKey: z
                  .boolean()
                  .optional()
                  .describe("Whether the column is part of the primary key."),
                isUnique: z
                  .boolean()
                  .optional()
                  .describe("Whether the column has a UNIQUE constraint."),
                isIdentity: z
                  .boolean()
                  .optional()
                  .describe("Whether the column is an identity column."),
                identitySeed: z
                  .number()
                  .int()
                  .nonnegative()
                  .optional()
                  .describe("Identity seed value when isIdentity is true."),
                identityIncrement: z
                  .number()
                  .int()
                  .nonnegative()
                  .optional()
                  .describe("Identity increment value when isIdentity is true."),
              })
              .strict()
          )
          .describe(
            "Array of validated column definitions."
          ),
        databaseName: databaseNameSchema.optional(),
        confirmed: z
          .boolean()
          .optional()
          .describe("Set to true after reviewing the planned DDL change."),
      })
      .strict(),
    requiresConfirmation: true,
    requiresDdl: true,
  },
  {
    tool: createIndexTool,
    readOnly: false,
    outputSchema: toolResultOutputSchema,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        schemaName: z
          .string()
          .optional()
          .describe("Name of the schema containing the table"),
        tableName: tableNameSchema.describe("Name of the table to create index on"),
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
        databaseName: databaseNameSchema.optional(),
        confirmed: z
          .boolean()
          .optional()
          .describe("Set to true after reviewing the planned DDL change."),
      })
      .strict(),
    requiresConfirmation: true,
    requiresDdl: true,
  },
  {
    tool: dropTableTool,
    readOnly: false,
    outputSchema: toolResultOutputSchema,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: z
      .object({
        tableName: tableNameSchema.describe("Name of the table to drop"),
        databaseName: databaseNameSchema.optional(),
        confirmed: z
          .boolean()
          .optional()
          .describe("Set to true after reviewing the planned DDL change."),
      })
      .strict(),
    requiresConfirmation: true,
    requiresDdl: true,
  },
];

export function getAvailableTools(isReadOnly: boolean): ToolDefinition[] {
  return isReadOnly
    ? toolDefinitions.filter((definition) => definition.readOnly)
    : toolDefinitions;
}

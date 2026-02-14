import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getSqlRequest } from "../db.js";

export class CreateIndexTool implements Tool {
  [key: string]: any;
  name = "create_index";
  description =
    "Creates an index on a specified column or columns in an MSSQL Database table";
  inputSchema = {
    type: "object",
    properties: {
      schemaName: {
        type: "string",
        description: "Name of the schema containing the table",
      },
      tableName: {
        type: "string",
        description: "Name of the table to create index on",
      },
      indexName: { type: "string", description: "Name for the new index" },
      columns: {
        type: "array",
        items: { type: "string" },
        description: "Array of column names to include in the index",
      },
      isUnique: {
        type: "boolean",
        description:
          "Whether the index should enforce uniqueness (default: false)",
        default: false,
      },
      isClustered: {
        type: "boolean",
        description: "Whether the index should be clustered (default: false)",
        default: false,
      },
      databaseName: {
        type: "string",
        description:
          "Name of the database to use (optional). Omit to use the default database.",
      },
    },
    required: ["tableName", "indexName", "columns"],
  } as any;

  async run(params: any) {
    try {
      const {
        schemaName,
        tableName,
        indexName,
        columns,
        databaseName,
        isUnique = false,
        isClustered = false,
      } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      let indexType = isClustered ? "CLUSTERED" : "NONCLUSTERED";
      if (isUnique) {
        indexType = `UNIQUE ${indexType}`;
      }
      const columnNames = columns.join(", ");
      const tableRef = schemaName ? `${schemaName}.${tableName}` : tableName;
      const query = `CREATE ${indexType} INDEX ${indexName} ON ${tableRef} (${columnNames})`;
      await request.query(query);

      return {
        success: true,
        message: `Index [${indexName}] created successfully on table [${tableRef}]`,
        details: {
          schemaName: schemaName || undefined,
          tableName,
          indexName,
          columnNames,
          isUnique,
          isClustered,
        },
      };
    } catch (error) {
      console.error("Error creating index:", error);
      return {
        success: false,
        message: `Failed to create index: ${error}`,
      };
    }
  }
}

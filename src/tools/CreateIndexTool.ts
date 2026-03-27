import { getSqlRequest } from "../db.js";
import { buildQualifiedName, quoteIdentifier } from "../sql.js";

interface CreateIndexParams {
  schemaName?: string;
  tableName: string;
  indexName: string;
  columns: string[];
  isUnique?: boolean;
  isClustered?: boolean;
  databaseName?: string;
}

export class CreateIndexTool {
  name = "create_index";
  description =
    "Creates an index on a specified column or columns in an MSSQL Database table";

  async run(params: CreateIndexParams) {
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
      if (!Array.isArray(columns) || columns.length === 0) {
        throw new Error("At least one column is required to create an index.");
      }

      const columnNames = columns.map((columnName) => quoteIdentifier(columnName)).join(", ");
      const tableRef = buildQualifiedName(tableName, schemaName);
      const query = `CREATE ${indexType} INDEX ${quoteIdentifier(indexName)} ON ${tableRef} (${columnNames})`;
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

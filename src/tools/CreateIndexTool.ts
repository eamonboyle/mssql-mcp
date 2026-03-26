import { getSqlRequest } from "../db.js";

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

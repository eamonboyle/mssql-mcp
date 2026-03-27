import { getSqlRequest } from "../db.js";
import { buildQualifiedName } from "../sql.js";
import { buildParameterizedWhereClause, type SqlFilter } from "../writeSafety.js";

interface DeleteDataParams {
  tableName: string;
  schemaName?: string;
  filters: SqlFilter[];
  databaseName?: string;
}

export class DeleteDataTool {
  name = "delete_data";
  description =
    "Deletes rows from an MSSQL table using required structured filters.";

  async run(params: DeleteDataParams) {
    let query: string | undefined;

    try {
      const { tableName, schemaName, filters, databaseName } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      const whereClause = buildParameterizedWhereClause(
        filters,
        (name, value) => request.input(name, value),
        "delete_filter"
      );

      query = `DELETE FROM ${buildQualifiedName(tableName, schemaName)} WHERE ${whereClause}`;
      const result = await request.query(query);

      return {
        success: true,
        message: `Delete completed successfully. ${result.rowsAffected[0]} row(s) affected`,
        rowsAffected: result.rowsAffected[0],
      };
    } catch (error) {
      console.error("Error deleting data:", error);
      return {
        success: false,
        message: `Failed to delete data${query ? ` with '${query}'` : ""}: ${error}`,
      };
    }
  }
}

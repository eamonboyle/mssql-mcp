import { getSqlRequest } from "../db.js";
import { buildQualifiedName } from "../sql.js";

interface DeleteDataParams {
  tableName: string;
  schemaName?: string;
  whereClause: string;
  databaseName?: string;
}

export class DeleteDataTool {
  name = "delete_data";
  description =
    "Deletes rows from an MSSQL table using a required WHERE clause.";

  async run(params: DeleteDataParams) {
    let query: string | undefined;

    try {
      const { tableName, schemaName, whereClause, databaseName } = params;

      if (typeof whereClause !== "string" || whereClause.trim() === "") {
        throw new Error("WHERE clause is required for security reasons");
      }

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

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

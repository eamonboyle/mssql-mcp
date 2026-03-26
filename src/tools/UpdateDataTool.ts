import { getSqlRequest } from "../db.js";

interface UpdateDataParams {
  tableName: string;
  updates: Record<string, unknown>;
  whereClause: string;
  databaseName?: string;
}

export class UpdateDataTool {
  name = "update_data";
  description =
    "Updates data in an MSSQL Database table using a WHERE clause. The WHERE clause must be provided for security.";

  async run(params: UpdateDataParams) {
    let query: string | undefined;
    try {
      const { tableName, updates, whereClause, databaseName } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      // Basic validation: ensure whereClause is not empty
      if (!whereClause || whereClause.trim() === "") {
        throw new Error("WHERE clause is required for security reasons");
      }

      // Build SET clause with parameterized queries for security
      const setClause = Object.keys(updates)
        .map((key, index) => {
          const paramName = `update_${index}`;
          request.input(paramName, updates[key]);
          return `[${key}] = @${paramName}`;
        })
        .join(", ");

      query = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
      const result = await request.query(query);

      return {
        success: true,
        message: `Update completed successfully. ${result.rowsAffected[0]} row(s) affected`,
        rowsAffected: result.rowsAffected[0],
      };
    } catch (error) {
      console.error("Error updating data:", error);
      return {
        success: false,
        message: `Failed to update data ${query ? ` with '${query}'` : ""}: ${error}`,
      };
    }
  }
}

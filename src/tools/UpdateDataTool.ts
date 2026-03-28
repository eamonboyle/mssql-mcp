import { getSqlRequest } from "../db.js";
import { buildQualifiedName, quoteIdentifier } from "../sql.js";
import { buildParameterizedWhereClause, type SqlFilter } from "../writeSafety.js";

interface UpdateDataParams {
  tableName: string;
  schemaName?: string;
  updates: Record<string, unknown>;
  filters: SqlFilter[];
  databaseName?: string;
}

export class UpdateDataTool {
  name = "update_data";
  description =
    "Updates data in an MSSQL Database table using required structured filters.";

  async run(params: UpdateDataParams) {
    let query: string | undefined;
    try {
      const { tableName, schemaName, updates, filters, databaseName } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      const updateColumns = Object.keys(updates);
      if (updateColumns.length === 0) {
        throw new Error("At least one column update is required.");
      }

      const setClause = updateColumns
        .map((key, index) => {
          const paramName = `update_${index}`;
          request.input(paramName, updates[key]);
          return `${quoteIdentifier(key)} = @${paramName}`;
        })
        .join(", ");

      const whereClause = buildParameterizedWhereClause(
        filters,
        (name, value) => request.input(name, value),
        "update_filter"
      );

      query = `UPDATE ${buildQualifiedName(tableName, schemaName)} SET ${setClause} WHERE ${whereClause}`;
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

import { getSqlRequest } from "../db.js";
import { buildQualifiedName } from "../sql.js";

interface DropTableParams {
  tableName: string;
  schemaName?: string;
  databaseName?: string;
}

export class DropTableTool {
  name = "drop_table";
  description = "Drops a table from the MSSQL Database.";

  async run(params: DropTableParams) {
    try {
      const { tableName, schemaName, databaseName } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      const qualifiedTableName = buildQualifiedName(tableName, schemaName);
      const query = `DROP TABLE ${qualifiedTableName}`;
      await request.query(query);
      return {
        success: true,
        message: `Table '${qualifiedTableName}' dropped successfully.`,
      };
    } catch (error) {
      console.error("Error dropping table:", error);
      return {
        success: false,
        message: `Failed to drop table: ${error}`,
      };
    }
  }
}

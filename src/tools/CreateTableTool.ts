import { getSqlRequest } from "../db.js";
import { buildQualifiedName } from "../sql.js";
import {
  buildCreateColumnDefinition,
  type SqlTypeDeclaration,
} from "../writeSafety.js";

interface CreateTableParams {
  schemaName?: string;
  tableName: string;
  columns: Array<{ name: string } & SqlTypeDeclaration>;
  databaseName?: string;
}

export class CreateTableTool {
  name = "create_table";
  description =
    "Creates a new table in the MSSQL Database with the specified columns.";

  async run(params: CreateTableParams) {
    try {
      const { schemaName, tableName, columns, databaseName } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      if (!Array.isArray(columns) || columns.length === 0) {
        throw new Error("'columns' must be a non-empty array");
      }
      const columnDefs = columns
        .map((col) => buildCreateColumnDefinition(col.name, col))
        .join(", ");
      const query = `CREATE TABLE ${buildQualifiedName(tableName, schemaName)} (${columnDefs})`;
      await request.query(query);
      return {
        success: true,
        message: `Table '${tableName}' created successfully.`,
      };
    } catch (error) {
      console.error("Error creating table:", error);
      return {
        success: false,
        message: `Failed to create table: ${error}`,
      };
    }
  }
}

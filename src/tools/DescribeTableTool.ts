import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getSqlRequest } from "../db.js";

export class DescribeTableTool implements Tool {
  [key: string]: any;
  name = "describe_table";
  description =
    "Describes the schema (columns and types) of a specified MSSQL Database table.";
  inputSchema = {
    type: "object",
    properties: {
      tableName: {
        type: "string",
        description: "Name of the table to describe",
      },
      databaseName: {
        type: "string",
        description:
          "Name of the database to use (optional). Omit to use the default database.",
      },
    },
    required: ["tableName"],
  } as any;

  async run(params: { tableName: string; databaseName?: string }) {
    try {
      const { tableName, databaseName } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }
      const query = `SELECT COLUMN_NAME as name, DATA_TYPE as type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`;
      request.input("tableName", sql.NVarChar, tableName);
      const result = await request.query(query);
      return {
        success: true,
        columns: result.recordset,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to describe table: ${error}`,
      };
    }
  }
}

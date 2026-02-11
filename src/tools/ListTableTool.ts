import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getSqlRequest } from "../db.js";

export class ListTableTool implements Tool {
  [key: string]: any;
  name = "list_table";
  description = "Lists tables in an MSSQL Database, or list tables in specific schemas";
  inputSchema = {
    type: "object",
    properties: {
      parameters: { 
        type: "array", 
        description: "Schemas to filter by (optional)",
        items: {
          type: "string"
        },
        minItems: 0
      },
      databaseName: {
        type: "string",
        description: "Name of the database to use (optional). Omit to use the default database."
      },
    },
    required: [],
  } as any;

  async run(params: any) {
    try {
      const { parameters, databaseName } = params || {};

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }
      const schemaFilter = parameters && parameters.length > 0 ? `AND TABLE_SCHEMA IN (${parameters.map((p: string) => `'${p}'`).join(", ")})` : "";
      const query = `SELECT TABLE_SCHEMA + '.' + TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ${schemaFilter} ORDER BY TABLE_SCHEMA, TABLE_NAME`;
      const result = await request.query(query);
      return {
        success: true,
        message: `List tables executed successfully`,
        items: result.recordset,
      };
    } catch (error) {
      console.error("Error listing tables:", error);
      return {
        success: false,
        message: `Failed to list tables: ${error}`,
      };
    }
  }
}

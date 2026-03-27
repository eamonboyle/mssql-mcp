import { describeTableSchema } from "../schema.js";

interface DescribeTableParams {
  tableName: string;
  schemaName?: string;
  databaseName?: string;
}

export class DescribeTableTool {
  name = "describe_table";
  description =
    "Describes the schema (columns and types) of a specified MSSQL Database table.";

  async run(params: DescribeTableParams) {
    try {
      const { tableName, schemaName, databaseName } = params;
      const columns = await describeTableSchema(tableName, databaseName, schemaName);

      return {
        success: true,
        columns,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to describe table: ${error}`,
      };
    }
  }
}

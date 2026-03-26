import { listDatabaseTables } from "../schema.js";

interface ListTableParams {
  parameters?: string[];
  databaseName?: string;
}

export class ListTableTool {
  name = "list_table";
  description =
    "Lists tables in an MSSQL Database, or list tables in specific schemas";

  async run(params: ListTableParams = {}) {
    try {
      const { parameters, databaseName } = params;
      const schemaNames = Array.isArray(parameters)
        ? parameters.filter((value: unknown) => typeof value === "string")
        : [];

      const tables =
        schemaNames.length > 0
          ? (
              await Promise.all(
                schemaNames.map((schemaName) =>
                  listDatabaseTables(databaseName, schemaName)
                )
              )
            ).flat()
          : await listDatabaseTables(databaseName);

      return {
        success: true,
        message: `List tables executed successfully`,
        items: tables.map((table) => ({
          name: `${table.schemaName}.${table.tableName}`,
        })),
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

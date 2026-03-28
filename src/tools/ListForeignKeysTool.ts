import { listForeignKeys } from "../schema.js";

interface ListForeignKeysParams {
  databaseName?: string;
  schemaName?: string;
}

export class ListForeignKeysTool {
  name = "list_foreign_keys";
  description =
    "Lists foreign key relationships for the selected database or schema.";

  async run(params: ListForeignKeysParams = {}) {
    try {
      const rows = await listForeignKeys(params.databaseName, params.schemaName);
      return {
        success: true,
        message: `Found ${rows.length} foreign key relationship(s).`,
        data: rows,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to list foreign keys: ${error}`,
      };
    }
  }
}

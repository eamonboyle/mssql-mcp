import { listDatabaseObjects } from "../schema.js";

interface ListObjectsParams {
  objectTypes?: string[];
  schemaName?: string;
  databaseName?: string;
}

export class ListObjectsTool {
  name = "list_objects";
  description =
    "Lists schema objects such as tables, views, procedures, functions, and triggers.";

  async run(params: ListObjectsParams) {
    try {
      const { objectTypes, schemaName, databaseName } = params;
      const objects = await listDatabaseObjects(
        databaseName,
        objectTypes,
        schemaName
      );

      return {
        success: true,
        message: `Listed ${objects.length} object(s).`,
        objects,
      };
    } catch (error) {
      console.error("Error listing objects:", error);
      return {
        success: false,
        message: `Failed to list objects: ${error}`,
      };
    }
  }
}

import { describeDatabaseObject } from "../schema.js";

interface DescribeObjectParams {
  objectName: string;
  objectTypes?: string[];
  schemaName?: string;
  databaseName?: string;
}

export class DescribeObjectTool {
  name = "describe_object";
  description =
    "Describes a table, view, procedure, function, or trigger, including columns and definition when available.";

  async run(params: DescribeObjectParams) {
    try {
      const { objectName, objectTypes, schemaName, databaseName } = params;
      const object = await describeDatabaseObject(
        objectName,
        databaseName,
        schemaName,
        objectTypes
      );

      if (!object) {
        return {
          success: false,
          message: `No object named '${objectName}' was found.`,
        };
      }

      return {
        success: true,
        object,
      };
    } catch (error) {
      console.error("Error describing object:", error);
      return {
        success: false,
        message: `Failed to describe object: ${error}`,
      };
    }
  }
}

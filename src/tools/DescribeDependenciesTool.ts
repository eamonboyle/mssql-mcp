import { describeObjectDependencies } from "../schema.js";

interface DescribeDependenciesParams {
  objectName: string;
  schemaName?: string;
  databaseName?: string;
}

export class DescribeDependenciesTool {
  name = "describe_dependencies";
  description =
    "Lists objects that depend on a given database object (views, procedures, functions, triggers, etc.) using SQL Server expression dependency metadata. Useful before dropping or refactoring an object.";

  async run(params: DescribeDependenciesParams) {
    try {
      const { objectName, schemaName, databaseName } = params;
      if (typeof objectName !== "string" || objectName.trim() === "") {
        return {
          success: false,
          message: "The 'objectName' field must be a non-empty string.",
        };
      }

      const rows = await describeObjectDependencies(
        objectName,
        databaseName,
        schemaName
      );

      const qualified = schemaName
        ? `${schemaName}.${objectName}`
        : objectName;

      if (rows.length === 0) {
        return {
          success: true,
          message: `No dependencies found for '${qualified}'. The object may not exist, may have no dependents, or dependency metadata may be incomplete for dynamic SQL.`,
          data: rows,
        };
      }

      return {
        success: true,
        message: `Found ${rows.length} dependent object(s) for '${qualified}'.`,
        data: rows,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to describe dependencies: ${error}`,
      };
    }
  }
}

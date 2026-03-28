import { describeRelationships } from "../schema.js";

interface DescribeRelationshipsParams {
  tableName: string;
  schemaName?: string;
  databaseName?: string;
}

export class DescribeRelationshipsTool {
  name = "describe_relationships";
  description =
    "Describes incoming and outgoing foreign key relationships for a table.";

  async run(params: DescribeRelationshipsParams) {
    try {
      const data = await describeRelationships(
        params.tableName,
        params.databaseName,
        params.schemaName
      );
      return {
        success: true,
        message: `Found ${data.length} relationship row(s) for ${params.tableName}.`,
        data,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to describe relationships: ${error}`,
      };
    }
  }
}

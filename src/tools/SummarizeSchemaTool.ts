import { getDatabaseSchemaSummary } from "../schema.js";

interface SummarizeSchemaParams {
  databaseName?: string;
}

export class SummarizeSchemaTool {
  name = "summarize_schema";
  description =
    "Returns a high-level schema summary for a database: object counts by type and object counts per schema.";

  async run(params: SummarizeSchemaParams = {}) {
    try {
      const data = await getDatabaseSchemaSummary(params.databaseName);
      const objectCounts = Array.isArray(data.objectCounts)
        ? data.objectCounts
        : [];
      const schemaCounts = Array.isArray(data.schemaCounts)
        ? data.schemaCounts
        : [];

      if (objectCounts.length === 0 && schemaCounts.length === 0) {
        return {
          success: true,
          message:
            "No user objects were found in the selected database. The database may be empty or the connected login may lack permission to view sys.objects.",
          data,
        };
      }

      const typeSummary = objectCounts
        .map(
          (row: { objectType?: unknown; objectCount?: unknown }) =>
            `${String(row.objectType ?? "unknown")}: ${String(row.objectCount ?? 0)}`
        )
        .join(", ");
      const schemaSummary = schemaCounts
        .slice(0, 10)
        .map(
          (row: { schemaName?: unknown; objectCount?: unknown }) =>
            `${String(row.schemaName ?? "unknown")}: ${String(row.objectCount ?? 0)}`
        )
        .join(", ");

      return {
        success: true,
        message: `Schema summary: ${typeSummary || "no typed objects"}.${
          schemaSummary ? ` Top schemas: ${schemaSummary}.` : ""
        }`,
        data,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to summarize schema: ${error}`,
      };
    }
  }
}

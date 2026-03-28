import { clampRowLimit } from "../config.js";
import { previewFilteredRows } from "../writePreview.js";
import type { SqlFilter } from "../writeSafety.js";

interface PreviewDeleteParams {
  tableName: string;
  schemaName?: string;
  filters: SqlFilter[];
  previewLimit?: number;
  databaseName?: string;
}

export class PreviewDeleteTool {
  name = "preview_delete";
  description =
    "Previews which rows would be deleted before running delete_data.";

  async run(params: PreviewDeleteParams) {
    try {
      const preview = await previewFilteredRows({
        tableName: params.tableName,
        schemaName: params.schemaName,
        filters: params.filters,
        databaseName: params.databaseName,
        limit: clampRowLimit(params.previewLimit, 25),
      });

      return {
        success: true,
        message: `Previewed ${preview.rows.length} row(s) for delete; ${preview.affectedRowCount} row(s) would be affected.`,
        data: preview,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to preview delete: ${error}`,
      };
    }
  }
}

/**
 * Human-facing release highlights for the `server_about` tool.
 * When you cut a release: bump package.json / CHANGELOG, then update this block
 * so `forVersion` matches `package.json` version.
 */
export const RELEASE_META = {
  forVersion: "1.3.0",
  releaseDate: "2026-03-28",
  latestChanges: [
    "Tools: list_databases, list_foreign_keys, describe_relationships, analyze_table, preview_update, preview_delete",
    "Structured tool results (versioned JSON) and write-preview flow with REQUIRE_WRITE_PREVIEW",
    "DDL gated by ENABLE_DDL; MAX_WRITE_ROWS for preview/write safety",
    "Resources: object_dependencies; ServerState caching for explain/query artifacts",
  ],
} as const;

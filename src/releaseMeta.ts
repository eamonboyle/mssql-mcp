/**
 * Human-facing release highlights for the `server_about` tool.
 * When you cut a release: bump package.json / CHANGELOG, then update this block
 * so `forVersion` matches `package.json` version.
 */
export const RELEASE_META = {
  forVersion: "1.4.1",
  releaseDate: "2026-07-09",
  latestChanges: [
    "Tool: server_about — package version, release date, and latest release highlights",
    "Tools: summarize_schema, describe_dependencies, filter_data (structured filters with ORDER BY / offset)",
    "Optional schemaName on insert_data and drop_table; dependency and schema discovery workflow",
    "Minimum Node.js 20; vitest 4 and dependency security updates",
  ],
} as const;

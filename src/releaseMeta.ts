/**
 * Human-facing release highlights for the `server_about` tool.
 * When you cut a release: bump package.json / CHANGELOG, then update this block
 * so `forVersion` matches `package.json` version.
 */
export const RELEASE_META = {
  forVersion: "1.6.0",
  releaseDate: "2026-07-12",
  latestChanges: [
    "Tool: server_about — package version, release date, and latest release highlights",
    "Tool: list_largest_tables — rank tables by storage and row count for capacity discovery",
    "Strict SQL connection configuration with presets, TLS options, and public MCP endpoint settings",
    "Removed filter_data from the public tool catalog; use read_data for filtered reads",
  ],
} as const;

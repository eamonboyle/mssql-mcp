/**
 * Human-facing release highlights for the `server_about` tool.
 * When you cut a release: bump package.json / CHANGELOG, then update this block
 * so `forVersion` matches `package.json` version.
 */
export const RELEASE_META = {
  forVersion: "1.7.0",
  releaseDate: "2026-07-12",
  latestChanges: [
    "Tool: server_about — package version, release date, and latest release highlights",
    "Runtime server version read from package.json via getPackageVersion()",
    "E2E harness exercises server_about alongside the full tool catalog",
  ],
} as const;

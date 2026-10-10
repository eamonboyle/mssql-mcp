/**
 * Minimum Node.js major version. The SQL Server driver (tedious 20, via
 * mssql 12) uses Node 22 APIs such as Promise.withResolvers; on older
 * versions the server starts but every database call fails.
 */
export const MIN_NODE_MAJOR = 22;

/** Last release that supports Node.js 20. */
export const LAST_NODE_20_RELEASE = "1.6.0";

/**
 * Returns an actionable error message when `version` is too old to run this
 * server, or undefined when it is supported.
 */
export function nodeVersionError(
  version: string = process.versions.node
): string | undefined {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  if (Number.isFinite(major) && major >= MIN_NODE_MAJOR) {
    return undefined;
  }

  return [
    `mssql-mcp requires Node.js ${MIN_NODE_MAJOR} or newer (found v${version}).`,
    `Upgrade Node.js, or pin the last release that supports older versions: npx -y @eamonboyle/mssql-mcp@${LAST_NODE_20_RELEASE}`,
  ].join(" ");
}

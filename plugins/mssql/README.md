# Cursor plugin: MSSQL MCP

This directory is a [Cursor plugin](https://cursor.com/docs/reference/plugins) that wires in the [`@eamonboyle/mssql-mcp`](https://www.npmjs.com/package/@eamonboyle/mssql-mcp) server and adds rules/skills for safer database assistance.

## Install

- **From the repository**: Submit or install the repo via [Cursor marketplace publish](https://cursor.com/marketplace/publish) using the root [`marketplace.json`](../../.cursor-plugin/marketplace.json), or point Cursor at this folder per current plugin install flows.
- **One-click MCP (no plugin)**: The main [README](../../README.md) “Add to Cursor” link still installs only the MCP server via `npx`.

## Configure

Edit [`mcp.json`](mcp.json): set `SERVER_NAME`, `DATABASE_NAME` (or `DATABASES`), `DB_USER`, and `DB_PASSWORD`. Adjust optional env vars (`READONLY`, `ENABLE_DDL`, timeouts, etc.) to match your environment. See the [configuration table](../../README.md#environment-variables) in the main README.

## Local development (contributors)

To run the server from a **local build** instead of npm, override `mcp.json` temporarily:

```json
{
  "mcpServers": {
    "mssql": {
      "command": "node",
      "args": ["/absolute/path/to/mssql-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

Use your real absolute path; do not commit machine-specific paths or secrets.

After `npm run build` at the repo root, `dist/index.js` is the entrypoint.

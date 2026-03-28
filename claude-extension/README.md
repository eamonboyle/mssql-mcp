# Claude Desktop extension (MCP Bundle)

This folder contains the **`manifest.json`** for a [Claude Desktop Extension](https://www.anthropic.com/engineering/desktop-extensions) (`.mcpb`). The compiled MCP server and `node_modules` are **not** committed; they are staged locally before packing.

## User configuration

At install time, Claude collects settings defined under `user_config` in [`manifest.json`](manifest.json). Values are injected into the server process as environment variables (`SERVER_NAME`, `DATABASE_NAME`, `DB_USER`, `DB_PASSWORD`, etc.). Sensitive fields (password) are stored using the host OS secret storage when the desktop app supports it.

## Build a `.mcpb` locally

From the **repository root**:

```bash
npm install
npm run pack:claude
```

This runs `npm run build`, copies `dist/` into `claude-extension/server/`, installs production dependencies into `claude-extension/node_modules`, and invokes `mcpb pack`. The bundle is written in this folder as **`mssql-mcp-<version>.mcpb`** (version is taken from `manifest.json`).

To install: open the generated `.mcpb` in Claude Desktop (e.g. drag into Settings) and complete the configuration form.

## Publishing

Attach the versioned `.mcpb` to a [GitHub Release](https://github.com/eamonboyle/mssql-mcp/releases). The npm package [`@eamonboyle/mssql-mcp`](https://www.npmjs.com/package/@eamonboyle/mssql-mcp) remains the primary runtime for `npx` and Cursor; the bundle is for users who prefer one-click Desktop installation without a separate Node install.

## Git hygiene

Staged paths (`server/`, `node_modules/`, ephemeral `package.json`, generated `.mcpb`) are listed in the root [`.gitignore`](../.gitignore).

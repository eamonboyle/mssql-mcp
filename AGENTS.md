# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single Node.js/TypeScript product: the **MSSQL MCP Server** (`@eamonboyle/mssql-mcp`). It is an MCP (Model Context Protocol) server that exposes tools/resources/prompts for querying and managing a Microsoft SQL Server database. There is no web UI. Standard commands (`build`, `lint`, `test`, `start`, `watch`) live in `package.json` and are documented in `README.md` / `CONTRIBUTING.md`.

### Lint / test / build (no database required)
- `npm run build`, `npm run lint`, `npm test` all pass with **no external services** — the unit tests mock the DB (see `src/__tests__/`). Use these for fast validation.
- The `prepare` script runs `npm run build` automatically on `npm install`, so `dist/` exists after install.

### Running the server end-to-end (needs a SQL Server)
Full runtime requires a reachable Microsoft SQL Server; the repo ships no Docker/compose for it. For local E2E in the cloud VM, provision one with Docker:

```
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Str0ng!Passw0rd" -p 1433:1433 --name mssql-dev -d mcr.microsoft.com/mssql/server:2022-latest
```

Then export connection env vars before `node dist/index.js` (or `npm start`):
`SERVER_NAME`, `DATABASE_NAME`, `DATABASES`, `DB_USER`, `DB_PASSWORD`, and `TRUST_SERVER_CERTIFICATE=true` for the self-signed local cert. See the env var table in `README.md`.

Note: Docker is NOT preinstalled in the cloud VM and is not part of the update script. If you need a live DB, install Docker (see system prompt's Docker-in-Docker steps: `fuse-overlayfs` storage driver + `iptables-legacy`) and start `dockerd` yourself.

### Non-obvious gotchas
- Default transport is **stdio** (launched by an MCP client). For a standalone HTTP server set `MCP_TRANSPORT=http` (binds `MCP_HTTP_HOST:MCP_HTTP_PORT`, default `127.0.0.1:3333`). The HTTP transport is stateless; POST JSON-RPC with header `Accept: application/json, text/event-stream` (responses come back as SSE `event: message`).
- Write tools (`insert_data`, `update_data`, `delete_data`) require confirmation. Non-elicitation clients must pass `confirmed: true` in the tool arguments. `update_data`/`delete_data` additionally need a `previewToken` from `preview_update`/`preview_delete` when `REQUIRE_WRITE_PREVIEW` is true (the default).
- `insert_data` takes `tableName` as a single quoted identifier (no `schemaName` param and no `schema.table` dotted string — a dotted value becomes one bracketed identifier and fails). It relies on the login's default schema (`dbo` for `sa`).
- DDL tools (`create_table`, `create_index`, `drop_table`) are hidden/disabled unless `ENABLE_DDL=true`.
- `src/db.ts` forces `encrypt: false` and effectively `trustServerCertificate: true`, so plain local SQL Server connections work without TLS setup.

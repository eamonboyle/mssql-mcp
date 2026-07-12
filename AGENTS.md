# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single Node.js/TypeScript product: the **MSSQL MCP Server** (`@eamonboyle/mssql-mcp`). It is an MCP (Model Context Protocol) server that exposes tools/resources/prompts for querying and managing a Microsoft SQL Server database. There is no web UI. Standard commands (`build`, `lint`, `test`, `start`, `watch`) live in `package.json` and are documented in `README.md` / `CONTRIBUTING.md`.

### Lint / test / build (no database required)

- `npm run build`, `npm run lint`, `npm test` all pass with **no external services** — the unit tests mock the DB (see `src/__tests__/`). Use these for fast validation.
- The `prepare` script runs `npm run build` automatically on `npm install`, so `dist/` exists after install.

### Full MCP tool E2E (Docker + SQL required)

After the database is up, run **`npm run test:e2e`** to exercise **every registered MCP tool** against `AppDB` / `ReportingDB` and print a per-tool PASS/FAIL report.

```bash
cp .env.example .env   # if needed
npm run db:up          # start Docker MSSQL + seed (skip if already healthy)
npm run test:e2e       # builds, starts HTTP server (ENABLE_DDL=true), runs all tools
```

Scripts: `scripts/e2e-mcp-tools.sh` (orchestrator) and `scripts/e2e-mcp-tools.mjs` (harness). Details: [`docs/dev-database.md`](docs/dev-database.md).

**Cloud agent checklist:**

1. Start Docker if needed (`dockerd`; use `sg docker -c '...'` when the socket requires the `docker` group).
2. `npm run db:up` — if the volume is corrupt, `npm run db:reset`.
3. `npm run test:e2e` — exit code 0 means all tools passed.
4. Server log on failure: `/tmp/mssql-mcp-e2e-server.log`

### Running the server end-to-end (needs a SQL Server)

Use the repo's Docker Compose stack (seeded `AppDB` + `ReportingDB`). Details: [`docs/dev-database.md`](docs/dev-database.md).

```bash
cp .env.example .env   # if you do not already have a .env
npm run db:up          # starts mssql-mcp-dev, waits, applies docker/mssql/init/*.sql
npm start              # loads .env via dotenv (stdio). For HTTP: MCP_TRANSPORT=http npm start
```

Other helpers: `npm run db:seed` (re-apply seed), `npm run db:down` (stop, keep volume), `npm run db:reset` (wipe volume + recreate).

Default connection (matches `.env.example`): `SERVER_NAME=127.0.0.1`, `DATABASE_NAME=AppDB`, `DATABASES=AppDB,ReportingDB`, `DB_USER=sa`, `DB_PASSWORD=Str0ng!Passw0rd`, `TRUST_SERVER_CERTIFICATE=true`, `READONLY=false`, `ENABLE_DDL=false`. `SERVER_PORT` is optional; when unset, the driver uses port `1433`. `ENCRYPT` is optional and defaults to `false`.

**Cloud VM note:** Docker is not preinstalled and is not part of the update script. If `docker` / `dockerd` is missing, install Docker (Docker-in-Docker: `fuse-overlayfs` storage driver + `iptables-legacy`) and start `dockerd` before `npm run db:up`.

### Non-obvious gotchas

- Default transport is **stdio** (launched by an MCP client). For a standalone HTTP server set `MCP_TRANSPORT=http` (binds `MCP_HTTP_HOST:MCP_HTTP_PORT`, default `127.0.0.1:3333`). The HTTP transport is stateless; POST JSON-RPC to `/mcp` with header `Accept: application/json, text/event-stream` (responses come back as SSE `event: message`). `MCP_BASE_URL` is the optional public base advertised in logs and `mssql://config/server`; it does not change the local bind address.
- Write tools (`insert_data`, `update_data`, `delete_data`) require confirmation. Non-elicitation clients must pass `confirmed: true` in the tool arguments. `update_data`/`delete_data` additionally need a `previewToken` from `preview_update`/`preview_delete` when `REQUIRE_WRITE_PREVIEW` is true (the default).
- `insert_data` accepts optional `schemaName` (same as other write tools). Use `tableName` for the table only — not `schema.table` as a dotted string.
- DDL tools (`create_table`, `create_index`, `drop_table`) are not registered in read-only mode. Otherwise they are registered but calls are blocked unless `ENABLE_DDL=true`.
- `ENCRYPT=false` preserves plain local SQL Server connections. For TLS, set `ENCRYPT=true`; `TRUST_SERVER_CERTIFICATE` is passed independently to the driver.

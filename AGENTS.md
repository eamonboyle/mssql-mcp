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
npm run test:e2e       # builds, starts HTTP server (ENABLE_DDL=true), runs all tools, then protocol checks
```

Scripts: `scripts/e2e-mcp-tools.sh` (orchestrator), `scripts/e2e-mcp-tools.mjs` (tool harness), and `scripts/e2e-protocol.mjs` (official MCP client in both protocol eras, port 3334). Details: [`docs/dev-database.md`](docs/dev-database.md).

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

- Default transport is **stdio** (launched by an MCP client). For a standalone HTTP server set `MCP_TRANSPORT=http` (binds `MCP_HTTP_HOST:MCP_HTTP_PORT`, default `127.0.0.1:3333`). The HTTP transport is stateless and serves both the 2026-07-28 protocol and 2025-era clients; POST JSON-RPC to `/mcp` with `Content-Type: application/json` and `Accept: application/json, text/event-stream`. 2025-era responses come back as SSE `event: message`. `Host`/`Origin` headers must be loopback (or in `MCP_HTTP_ALLOWED_HOSTS`); a non-loopback bind needs `MCP_HTTP_AUTH_TOKEN`. `MCP_BASE_URL` is the optional public base advertised in logs and `mssql://config/server`; it does not change the local bind address.
- Write tools (`insert_data`, `update_data`, `delete_data`) require confirmation. Clients with elicitation get a confirmation prompt (via `inputRequired` on 2026-07-28, classic elicitation on 2025-era connections); non-elicitation clients must pass `confirmed: true` in the tool arguments. `update_data`/`delete_data` additionally need a `previewToken` from `preview_update`/`preview_delete` when `REQUIRE_WRITE_PREVIEW` is true (the default).
- `insert_data` accepts optional `schemaName` (same as other write tools). Use `tableName` for the table only — not `schema.table` as a dotted string.
- DDL tools (`create_table`, `create_index`, `drop_table`) are not registered in read-only mode. Otherwise they are registered but calls are blocked unless `ENABLE_DDL=true`.
- MCP SDK is v2 (`@modelcontextprotocol/server`, `/node`); the v1 `@modelcontextprotocol/sdk` package is no longer a dependency. Node 22+ is required (`tedious` 20 uses Node 22 APIs); `src/checkNodeVersion.ts` exits with a clear message on older versions. CI runs Node 22, 24 and 26.
- `vendor/sprintf-js` replaces the unmaintained `sprintf-js` used by `tedious` (GHSA-hp3w-g68c-fv3c) via `overrides` plus a `file:` devDependency (a relative `file:` override resolves against tedious's folder and breaks `npm ci`). Delete both once tedious releases tediousjs/tedious#1814.
- `ENCRYPT=false` preserves plain local SQL Server connections. For TLS, set `ENCRYPT=true`; `TRUST_SERVER_CERTIFICATE` is passed independently to the driver.

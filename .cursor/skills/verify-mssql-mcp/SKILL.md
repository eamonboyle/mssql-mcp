---
name: verify-mssql-mcp
description: >-
  Drive the MSSQL MCP server over Streamable HTTP the way an MCP client does.
  Use when proving a tool, resource, or prompt change against Docker AppDB and
  ReportingDB, reproducing a user-visible MCP failure, or capturing evidence
  that a feature works. Do not use npm test as proof. Those tests mock the
  database.
---

# Verify MSSQL MCP

The product a user touches is the MCP server. Cursor, VS Code, Claude Desktop, and any JSON-RPC client call tools, read resources, and get prompts. There is no web UI. Stdio is the default client transport. Verification drives the same server over Streamable HTTP because that is how this repo already scripts a real client.

Do not drive an MCP process you did not start with `verify-ctl.sh launch`.

Read `features/README.md` before a run. Drive the mapped feature file, not a convenient substitute.

## Launch

From the repo root:

```bash
cp -n .env.example .env
.cursor/skills/verify-mssql-mcp/scripts/verify-ctl.sh launch
```

The script copies `.env.example` to `.env` when `.env` is missing. It starts `mssql-mcp-dev` with `npm run db:up` when that container is absent. It builds `dist/` when `dist/index.js` is missing. It then starts `node dist/index.js` with `MCP_TRANSPORT=http`, `MCP_HTTP_HOST=127.0.0.1`, `MCP_HTTP_PORT=3334`, `ENABLE_DDL=true`, and `READONLY=false`.

Ready means `initialize` against `http://127.0.0.1:3334/mcp` succeeds. The process logs `MCP Streamable HTTP server listening on http://127.0.0.1:3334/mcp` to `/tmp/verify-mssql-mcp/state/server.log`.

Override the bind with `MCP_VERIFY_HTTP_HOST` and `MCP_VERIFY_HTTP_PORT`. Override state and evidence directories with `VERIFY_STATE_DIR` and `VERIFY_EVIDENCE_DIR`. Defaults are `/tmp/verify-mssql-mcp/state` and `/tmp/verify-mssql-mcp/evidence`.

A second HTTP instance can share Docker SQL Server if it uses another port. Writes share `AppDB`. Use unique emails and table names. If port 3334 already has a listener this skill did not start, launch refuses. It does not kill that process.

`npm run test:e2e` is a different launcher. It binds port 3333 and kills whatever already owns that port. Do not run it while a verify instance is up unless you intend to take over 3333.

Teardown is `verify-ctl.sh cleanup`. Docker SQL Server stays running.

## Doctor

```bash
.cursor/skills/verify-mssql-mcp/scripts/verify-ctl.sh doctor
```

Doctor is read-only. It must pass before you drive anything.

It checks that `mssql-mcp-dev` is running, that the pid in `/tmp/verify-mssql-mcp/state/server.pid` is alive, that this pid owns port 3334, that `dist/index.js` exists, that `initialize` works, and that `resources/read` of `mssql://config/server` reports `transport` `http`, `enableDdl` true, and allowed databases `AppDB` and `ReportingDB`. Evidence lands in `VERIFY_EVIDENCE_DIR` as `doctor-initialize.json` and `doctor-config.json`.

If doctor fails, stop. Do not call tools on that instance.

## Drive

Prefer the helpers in this skill. They reuse the same JSON-RPC and SSE parsing as `scripts/e2e-mcp-tools.mjs`.

```bash
node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs \
  --out /tmp/verify-mssql-mcp/evidence/<feature-id>/<step>.json \
  --contains '<observable text>' \
  tools/call <toolName> '<json args>'
```

Every request needs header `Accept: application/json, text/event-stream` and `Content-Type: application/json`. POST to `/mcp`. The body is JSON-RPC. The response is SSE with a `data: ` line. HTTP is stateless. Each POST builds a fresh MCP server. Preview tokens still live in the process, so `preview_update` then `update_data` must hit the same pid.

Stable handles:

- Tool names from `src/toolRegistry.ts`, including `list_table` with no trailing `s`.
- Resource URIs from `src/resourceRegistry.ts`, for example `mssql://config/server` and `mssql://table/AppDB/dbo/Customers`.
- Prompt names from `src/promptRegistry.ts`: `explore_schema`, `draft_safe_select`, `review_write_operation`.
- Seeded tables in `docker/mssql/init/01-seed.sql`. `AppDB.dbo.Customers` includes `ada@example.com`. `ReportingDB.dbo.DailySales` holds daily totals.

Pass `schemaName` and `tableName` as separate arguments. Never put `dbo.Customers` in `tableName`.

Write tools need `confirmed: true`. `update_data` and `delete_data` also need `previewToken` from the matching preview tool while `REQUIRE_WRITE_PREVIEW` stays true.

Unit tests under `src/__tests__/` mock SQL Server. They are not this skill.

## Evidence

Write artifacts under `$VERIFY_EVIDENCE_DIR/<feature-id>/`. Keep the JSON-RPC envelope `mcp-rpc.mjs` prints. That file is the action. Pair it with a second read that shows the resulting state.

Proof standards:

- Call the real MCP tool, resource, or prompt. Do not set database rows through `sqlcmd` and call that a tool proof.
- Capture the request arguments and the `payload` object. `payload.success` must be true for a passing tool, unless the recipe is proving an error code.
- For writes, follow with `read_data` or `search_data` on the same key. A success message without a second read is not enough.
- For DDL, follow `create_table` with `describe_table`, then `drop_table`.
- `npm test` passing is not evidence. `npm run build` passing is not evidence.

Keep artifacts after cleanup. Cleanup deletes the HTTP process and pid files only.

## Cleanup

```bash
.cursor/skills/verify-mssql-mcp/scripts/verify-ctl.sh cleanup
```

It sends SIGTERM to the pid recorded at launch, then SIGKILL if that pid is still alive. It never matches by process name. It never stops `mssql-mcp-dev`. Drop scratch tables in the feature recipe before cleanup.

If launch failed partway, still run cleanup.

## Helpers

`scripts/verify-ctl.sh` is executable.

```bash
.cursor/skills/verify-mssql-mcp/scripts/verify-ctl.sh launch
.cursor/skills/verify-mssql-mcp/scripts/verify-ctl.sh doctor
.cursor/skills/verify-mssql-mcp/scripts/verify-ctl.sh cleanup
```

`scripts/mcp-rpc.mjs` is the client.

```bash
node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs tools/list
node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs tools/call list_databases '{}'
node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs resources/read 'mssql://config/server'
node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs prompts/get explore_schema '{"goal":"see AppDB tables"}'
```

`--out` writes the JSON envelope and prints a one-line status. Omit `--out` to print the full envelope on stdout. `--contains` must appear in that JSON or the process exits 1. `--no-require-success` keeps a failed tool payload from exiting 1, which you need when proving `CONFIRMATION_REQUIRED` or `DDL_DISABLED`.

The full registered-tool sweep remains `npm run test:e2e` after this instance is cleaned up. Use it for all-tools coverage, not for a single mapped feature.

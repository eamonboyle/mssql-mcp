# MSSQL MCP verification map

This directory is the maintained source for verifying user-facing MCP behavior. Read this index before driving the server. Use the matching feature file as the recipe.

## Baseline preconditions

- Docker container `mssql-mcp-dev` is running with seed from `docker/mssql/init/01-seed.sql`.
- `verify-ctl.sh launch` started the HTTP server. Default endpoint is `http://127.0.0.1:3334/mcp`.
- `ENABLE_DDL=true` and `READONLY=false` on that process.
- `verify-ctl.sh doctor` passed.
- Evidence goes to `$VERIFY_EVIDENCE_DIR`, default `/tmp/verify-mssql-mcp/evidence`.
- Never drive an MCP process this run did not start.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Treat tool names, resource URIs, and JSON keys as literal.
- Run JSON-RPC through `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs`.
- Pass `schemaName` and `tableName` separately. `tableName` is never `schema.table`.
- Restore mutated rows and drop scratch tables in the recipe. Do not delete proof JSON during cleanup.

## Proof and skip reporting

- Capture the MCP call and a second read of the resulting state.
- Tool proof includes `payload.success`, `payload.data` or `payload.message`, and the `--out` file.
- Mutation proof includes `read_data` or `search_data` after the write.
- Record the feature id and the tool or resource used in the artifact path.
- Report an unreachable path with the command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with mcp-rpc` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Discover schema](./discover-schema.md) covers databases, tables, objects, relationships, resources, and the explore_schema prompt.
- [Read and search data](./read-and-search.md) covers `read_data`, `search_data`, and switching to ReportingDB.
- [Write with preview](./write-with-preview.md) covers insert, preview tokens, update, delete, and confirmation.
- [Analyze queries](./analyze-queries.md) covers `explain_query`, `analyze_table`, and `list_largest_tables`.
- [DDL](./ddl.md) covers `create_table`, `create_index`, and `drop_table` on a scratch table.

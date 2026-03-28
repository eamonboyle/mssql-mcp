---
name: mssql-mcp
description: Use the MSSQL MCP server for SQL Server discovery, reads, and gated writes. Apply when the user works with Microsoft SQL Server, Azure SQL, schema inspection, or data changes through MCP tools.
---

# MSSQL MCP skill

## When this applies

The workspace or user has the `mssql` MCP server enabled (this plugin’s `mcp.json` runs `npx -y @eamonboyle/mssql-mcp` with env vars for host, database, and credentials).

## Configuration quick reference

- **Connection**: `SERVER_NAME`, `DB_USER`, `DB_PASSWORD`; default DB `DATABASE_NAME` or multi-DB allowlist `DATABASES` (comma-separated).
- **Safety**: `READONLY=true`; `ENABLE_DDL=false` (default) disables DDL tools. `REQUIRE_WRITE_PREVIEW=true` (default) requires preview tokens for updates/deletes when using the preview workflow.

## Tool selection

- **Discovery**: `list_databases`, `list_table`, `list_objects`, `describe_table`, `describe_object`, `describe_relationships`, `list_foreign_keys`, `analyze_table`.
- **Read**: `read_data`, `search_data`, `explain_query`.
- **Writes**: `insert_data`; `update_data` / `delete_data` (require WHERE); use `preview_update` / `preview_delete` first when preview is required.
- **DDL** (only if enabled): `create_table`, `create_index`, `drop_table`.

## Agent behavior

1. Confirm which database to use when `DATABASES` lists more than one.
2. For bulk or destructive changes, summarize impact and use previews when available.
3. Keep credentials out of user-visible summaries and repository files.

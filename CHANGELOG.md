# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Dependency lockfile: `npm audit fix` and semver-safe updates (e.g. `@modelcontextprotocol/sdk` 1.29.0, `zod` 4.4.3, transitive security patches). Upgraded `vitest` to 4.x to clear remaining dev-toolchain advisories (`vite`/`esbuild`). Minimum Node.js raised to **20** (vitest 4 / vite 8 engine requirement); CI matrix now tests Node 20 and 22.

## [1.4.0] - 2026-07-08

### Added

- MCP tools: `summarize_schema` (database object/schema counts), `describe_dependencies` (object dependency impact analysis), and `filter_data` (structured AND filters with optional column projection, `ORDER BY`, `limit`, and `offset`).
- Optional `schemaName` on `insert_data` and `drop_table`, matching other table-targeting write/DDL tools.

### Changed

- Server instructions now recommend `summarize_schema`, `filter_data`, and `describe_dependencies` in the schema-first / safe-analysis workflow.
- README Available Tools table lists the full tool catalog.

## [1.3.1] - 2026-04-16

### Fixed

- `read_data`: log validated-query audit line to **stderr** only so MCP **stdio** transport is not corrupted by non-JSON stdout (fixes clients reporting `Unexpected token 'E', "Executing "...`).

## [1.3.0] - 2026-03-28

### Added

- MCP tools: `list_databases`, `list_foreign_keys`, `describe_relationships`, `analyze_table`, `preview_update`, and `preview_delete`.
- Structured tool results: versioned JSON payloads (`version: 1`) with shared Zod `outputSchema`, normalization helpers, and `toToolStructuredContent` for consistent client parsing.
- Write-preview workflow: `update_data` and `delete_data` integrate with preview tools and server-side result storage; optional enforcement via `REQUIRE_WRITE_PREVIEW` (default `true`). When enabled, successful `preview_update` / `preview_delete` responses include a short-lived `previewToken` that must be replayed on the matching write; tokens are one-time and bound to the same table, filters, and update payload.
- Row cap for matching writes: `MAX_WRITE_ROWS` rejects previews that match too many rows, and update/delete execution uses `SET ROWCOUNT` so affected rows cannot exceed the cap.
- DDL gating: `ENABLE_DDL` (default `false`) must be enabled for `create_table`, `create_index`, and `drop_table`.
- MCP resource template `object_dependencies` for object dependency metadata.
- In-memory `ServerState` for caching explain-plan and read-only query result artifacts across tool calls, with TTL and bounded size to limit memory use.
- Tests covering analyze-table behavior, config parsing, MCP result shapes, resources, and tool registration.

### Fixed

- `update_data` accepts optional `schemaName`, matching `preview_update` / `delete_data` so previews and writes target the same object.
- `list_foreign_keys` with `schemaName` includes keys where either the parent or referencing side is in that schema.
- Tool error payloads: preserve explicit `error.code` when present; classify preview-token and confirmation failures for clients (`PREVIEW_TOKEN_INVALID`, `CONFIRMATION_REQUIRED`, and related codes).

### Changed

- Server instructions emphasize `analyze_table`, `describe_relationships`, and running `preview_update` / `preview_delete` before destructive work.
- Tool outcomes are text- and JSON-oriented; experimental MCP Apps-style HTML output was removed in favor of portable structured content.
- Write and DDL tools use clearer confirmation messaging aligned with previews and DDL policy.
- Schema and resource listing improvements (foreign keys, relationships, dependencies, database summary data).

## [1.2.0] - 2026-03-27

### Added

- MCP tools: `list_objects`, `describe_object`, `search_data`, `explain_query`, and `delete_data`.
- MCP resources for table and object definitions (`table_schema` and `object_definition` templates).
- MCP prompts: `explore_schema`, `draft_safe_select`, and `review_write_operation`.
- Zod-backed tool input schemas, centralized tool registration, and configurable read limits via `MAX_ROWS` and `QUERY_TIMEOUT_MS`.

### Changed

- Server implementation now uses `McpServer` with explicit discovery-oriented instructions (schema-first workflow; stricter read-only guidance when `READONLY=true`).
- `list_table` returns items as `{ name: "schema.table" }` objects instead of raw query rows.
- `describe_table` accepts an optional `schemaName` for qualified tables.
- Raised `@modelcontextprotocol/sdk`, added `zod`, and moved the toolchain to TypeScript 5.x (with matching `typescript-eslint` support).

### Fixed

- `explain_query` reliability for `SET SHOWPLAN_XML` when no transaction is active.

## [1.1.0] - 2026-03-26

### Added

- GitHub Actions workflow and a Vitest test suite for CI.
- Multi-database defaults and allowlisting: configure a default database (`DATABASE_NAME`) and optional allowed list (`DATABASES`) when one server hosts several databases.

### Changed

- Documentation refresh (README, contributing guidelines) and package metadata cleanup.
- More robust database connection handling and database selection for tool calls.

### Fixed

- Database resolution edge cases (with expanded tests) after multi-database configuration work.

## [1.0.0] - Initial Release

### Added

- MCP server for Microsoft SQL Server
- Natural language to SQL query execution
- Tools: `read_data`, `list_table`, `describe_table`, `insert_data`, `update_data`, `create_table`, `create_index`, `drop_table`
- Multi-database support
- Read-only mode for safer environments
- SQL injection safeguards and validation

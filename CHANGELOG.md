# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-03-28

### Added

- MCP tools: `list_databases`, `list_foreign_keys`, `describe_relationships`, `analyze_table`, `preview_update`, and `preview_delete`.
- Structured tool results: versioned JSON payloads (`version: 1`) with shared Zod `outputSchema`, normalization helpers, and `toToolStructuredContent` for consistent client parsing.
- Write-preview workflow: `update_data` and `delete_data` integrate with preview tools and server-side result storage; optional enforcement via `REQUIRE_WRITE_PREVIEW` (default `true`).
- Row cap for matching writes: `MAX_WRITE_ROWS` rejects updates and deletes whose filter matches more rows than allowed.
- DDL gating: `ENABLE_DDL` (default `false`) must be enabled for `create_table`, `create_index`, and `drop_table`.
- MCP resource template `object_dependencies` for object dependency metadata.
- In-memory `ServerState` for caching explain-plan and preview-related payloads across tool calls.
- Tests covering analyze-table behavior, config parsing, MCP result shapes, resources, and tool registration.

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

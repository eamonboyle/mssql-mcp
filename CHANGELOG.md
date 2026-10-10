# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Contains breaking changes (Node.js 22+, HTTP exposure rules); suggested release: 2.0.0.

### Added

- Support for the 2026-07-28 MCP specification via the v2 TypeScript SDK (`@modelcontextprotocol/server` and `@modelcontextprotocol/node`). 2025-era clients, including Cursor over stdio, are still served on the same transports.
- Write confirmations use multi-round-trip `input_required` elicitation on 2026-07-28 connections and classic elicitation on 2025-era connections. Clients without elicitation still use `confirmed: true`. The prompt names the target database and table plus the filters, updated columns, row count, or index columns.
- `SQL_AUTH_TYPE` with `ntlm`, `azure-default` (DefaultAzureCredential / managed identity / `az login`), `azure-service-principal`, and `azure-access-token`, alongside the default SQL login. Entra ID types default `ENCRYPT` to `true` and `TRUST_SERVER_CERTIFICATE` to `false`, so tokens and secrets only travel over a validated TLS connection.
- HTTP security: `Host`/`Origin` validation against DNS rebinding, optional bearer token (`MCP_HTTP_AUTH_TOKEN`), and `MCP_HTTP_ALLOWED_HOSTS`. Only `/mcp` is served. A non-loopback bind without an `https://` `MCP_BASE_URL` logs a plain-HTTP warning.
- MCP Apps query-results grid (`ui://mssql/query-results.html`) for `read_data` and `search_data` in hosts that support MCP Apps.
- Client cancellation now cancels the running SQL request.
- `read_data` accepts CTEs (`WITH ... SELECT`, including `;WITH`).
- `mssql://config/server` reports `sqlAuthType`.
- Protocol E2E suite (`npm run test:e2e:protocol`, also run by `npm run test:e2e`).

### Changed

- **Breaking:** Node.js 22 or newer is required. Node 20 is end-of-life, and the SQL Server driver (`tedious` 20) uses Node 22 APIs. On older versions the server now exits at startup with a message that recommends upgrading or pinning `@eamonboyle/mssql-mcp@1.6.0`, the last release for Node 20.
- **Breaking:** HTTP mode refuses to start on a non-loopback `MCP_HTTP_HOST` unless `MCP_HTTP_AUTH_TOKEN` is set or `MCP_HTTP_ALLOW_UNAUTHENTICATED=true`.
- `read_data` streams results and stops at `MAX_ROWS` instead of buffering the full result, marks partial results as `truncated`, and no longer reports `totalRecords`. Each query runs in a transaction that is always rolled back.
- `read_data` returns SQL Server error messages (for example `Invalid column name`) instead of a generic failure.
- The `read_data` validator ignores string literals, comments, and quoted identifiers, which fixes false rejections of `CAST(... AS VARCHAR(n))`, `REPLACE()`, `CHAR()`, columns such as `user_name` or `resp_code`, and literals such as `'Update pending'`.
- The server version reported to clients is read from `package.json`.
- Dependencies: `mssql` 12, `dotenv` 18 (silenced so stdout stays JSON-RPC), `zod` 4.6, TypeScript 6 (`nodenext` resolution), ESLint 10, Vitest 5. `shx` was removed.
- CI tests Node 22, 24 and 26 with `actions/checkout` and `actions/setup-node` v7. The publish workflow no longer caches dependencies, following the setup-node v7 guidance for OIDC publishing.
- The deprecated `logging` server capability is no longer declared.

### Security

- `read_data` validation now tokenizes queries following T-SQL lexing rules. Previously a keyword glued to a number (`SELECT 1COMMIT ...`), a line comment ended by a bare carriage return, or a second statement without a semicolon could pass validation; the first could commit writes. Confirmed against SQL Server 2022 and covered by unit and E2E tests.
- HTTP mode validates `Host`/`Origin` headers (DNS rebinding) and supports bearer-token authentication.
- `npm audit` is clean. `sprintf-js` (GHSA-hp3w-g68c-fv3c, no patched release), pulled in by `mssql` → `tedious`, is replaced in this repository through `overrides` with a minimal vendored implementation (`vendor/sprintf-js`) that matches sprintf-js 1.1.3 output for the format strings tedious uses and rejects everything else. tedious never passes the vulnerable precision specifiers. Overrides do not apply to installs of the published package, so remove the override once tedious drops the dependency (tediousjs/tedious#1814).

### Fixed

- Stored query results and query plans (`mssql://query-result/...`, `mssql://query-plan/...`) returned by one HTTP request can now be read by later requests.
- Concurrent first requests for a database no longer race to create duplicate connection pools.
- SQL connection pools are closed on `SIGINT`/`SIGTERM` and when a stdio client disconnects.
- Rows beyond `MAX_ROWS` skipped column-name sanitization.
- IPv6 bind hosts (`MCP_HTTP_HOST=::1`) are bracketed in the advertised endpoint URL.

## [1.6.0] - 2026-07-12

### Added

- Optional `SERVER_PORT` support for SQL Server instances on non-default TCP ports. Configurations without it continue to use the driver default port of `1433`.
- Optional `ENCRYPT` configuration for TLS-enabled SQL Server connections. The default remains `false` for backward compatibility.
- Operational `MCP_BASE_URL` support for advertising a normalized public `/mcp` endpoint in HTTP startup output and the redacted `mssql://config/server` resource.
- Server configuration resource metadata for transport, encryption, certificate trust, DDL, and write-preview settings.

### Changed

- Startup uses one validated environment snapshot for transport, database access, safety, limits, resource metadata, and SQL connection pools.
- Omitted or blank `SERVER_NAME` values retain the existing `localhost` default, and blank optional values continue to use their documented defaults.
- Existing database configurations remain supported: set `DATABASE_NAME`, `DATABASES`, or both. When only `DATABASE_NAME` is present it becomes the single allowed database; when only `DATABASES` is present its first entry is the default.
- `READONLY=false`, `ENABLE_DDL=false`, and `TRUST_SERVER_CERTIFICATE=true` remain the defaults when those variables are omitted. Explicit invalid boolean values still fail startup.
- Cursor, VS Code, Claude Desktop, and MCP configuration samples use credential placeholders and keep DDL disabled, with advanced settings documented separately.
- Connection, safety, transport, tool, resource, and development documentation has been audited and simplified.

### Fixed

- `list_largest_tables` now escapes the `rowCount` alias so it does not conflict with the T-SQL `ROWCOUNT` keyword.
- `TRUST_SERVER_CERTIFICATE=false` is now honored instead of being silently overridden to `true`.
- Invalid explicit values for optional settings (`SERVER_PORT`, `ENCRYPT`, timeouts, row limits, `MCP_TRANSPORT`, `MCP_HTTP_PORT`, `MCP_BASE_URL`) now fail with actionable startup errors instead of silently falling back.

## [1.5.0] - 2026-07-09

### Added

- MCP tool: `list_largest_tables`, a read-only capacity-discovery view that ranks user tables by reserved storage and returns used storage and row counts. It supports optional schema filtering and respects `MAX_ROWS`.

### Removed

- `filter_data` from the public MCP tool catalog. The internal structured-filter helper remains in use by write previews, but agents now use `read_data` for all read queries.

## [1.4.1] - 2026-07-09

### Changed

- Dependency lockfile: `npm audit fix` and semver-safe updates (`@modelcontextprotocol/sdk` 1.29.0, `zod` 4.4.3, transitive security patches). Upgraded `vitest` to 4.x to clear remaining dev-toolchain advisories (`vite`/`esbuild`).
- Minimum Node.js raised to **20** (vitest 4 / vite 8 engine requirement); CI matrix now tests Node 20 and 22.

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

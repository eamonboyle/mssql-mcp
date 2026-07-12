# MSSQL MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@eamonboyle/mssql-mcp.svg)](https://www.npmjs.com/package/@eamonboyle/mssql-mcp)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![X: @eamonyo](https://img.shields.io/badge/X-%40eamonyo-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/eamonyo)

[![Add to Cursor](https://img.shields.io/badge/Add_to-Cursor-000000?style=for-the-badge&logo=cursor&logoColor=white)](https://cursor.com/en/install-mcp?name=mssql-local&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBlYW1vbmJveWxlL21zc3FsLW1jcCJdLCJlbnYiOnsiU0VSVkVSX05BTUUiOiJsb2NhbGhvc3QiLCJEQVRBQkFTRV9OQU1FIjoiQXBwREIiLCJEQVRBQkFTRVMiOiJBcHBEQixSZXBvcnRpbmdEQiIsIkRCX1VTRVIiOiJ5b3VyX3VzZXJuYW1lIiwiREJfUEFTU1dPUkQiOiJ5b3VyX3Bhc3N3b3JkIiwiVFJVU1RfU0VSVkVSX0NFUlRJRklDQVRFIjoidHJ1ZSIsIlJFQURPTkxZIjoiZmFsc2UiLCJFTkFCTEVfRERMIjoiZmFsc2UifX0=)
[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://intradeus.github.io/http-protocol-redirector?r=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522mssql-local%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540eamonboyle%252Fmssql-mcp%2522%255D%252C%2522env%2522%253A%257B%2522SERVER_NAME%2522%253A%2522localhost%2522%252C%2522DATABASE_NAME%2522%253A%2522AppDB%2522%252C%2522DATABASES%2522%253A%2522AppDB%252CReportingDB%2522%252C%2522DB_USER%2522%253A%2522your_username%2522%252C%2522DB_PASSWORD%2522%253A%2522your_password%2522%252C%2522TRUST_SERVER_CERTIFICATE%2522%253A%2522true%2522%252C%2522READONLY%2522%253A%2522false%2522%252C%2522ENABLE_DDL%2522%253A%2522false%2522%257D%257D)

> Experimental use only. This server is intended for education and evaluation, not production. Use a dedicated least-privilege SQL login and test all operations.

## Overview

`@eamonboyle/mssql-mcp` exposes Microsoft SQL Server tools, resources, and prompts through the [Model Context Protocol](https://modelcontextprotocol.io/). The MCP client and its language model interpret natural-language requests and choose tools. This package validates requests, executes SQL Server operations, and returns structured results.

Key capabilities:

- Schema, object, relationship, dependency, and storage discovery
- Validated reads, parameterized searches, and estimated execution plans
- Insert, update, and delete tools with confirmation and row limits
- Preview tokens for update and delete operations
- DDL tools with an explicit configuration gate
- Multiple allowed databases on one SQL Server
- Local stdio and stateless Streamable HTTP transports

Supported clients include Cursor, VS Code, Claude Desktop, and other MCP-compatible hosts.

## Quick start

### Prerequisites

- Node.js 20 or newer
- Microsoft SQL Server
- An MCP-compatible client

The recommended installation runs the published package directly:

```bash
npx -y @eamonboyle/mssql-mcp
```

A global installation also exposes the `mssql-mcp` command:

```bash
npm install -g @eamonboyle/mssql-mcp
mssql-mcp
```

The one-click links use the minimal configuration shown below. Replace the sample connection values before use.

The badge payloads are generated from `src/samples/claude_desktop_config.json`. After changing the sample, run `npm run docs:update-install-links`; use `npm run docs:check-install-links` to verify they are current.

## Minimal MCP configuration

The standard presets show connection placeholders and keep DDL disabled:

```json
{
  "mcpServers": {
    "mssql-local": {
      "command": "npx",
      "args": ["-y", "@eamonboyle/mssql-mcp"],
      "env": {
        "SERVER_NAME": "localhost",
        "DATABASE_NAME": "AppDB",
        "DATABASES": "AppDB,ReportingDB",
        "DB_USER": "your_username",
        "DB_PASSWORD": "your_password",
        "TRUST_SERVER_CERTIFICATE": "true",
        "READONLY": "false",
        "ENABLE_DDL": "false"
      }
    }
  }
}
```

Cursor uses `mcpServers` in `~/.cursor/mcp.json` or `.cursor/mcp.json`. Claude Desktop uses the same shape in its configuration file.

Set `ENABLE_DDL=true` only when the assistant specifically needs to create or remove schema objects.

VS Code uses `.vscode/mcp.json` or its user MCP configuration with a top-level `servers` object:

```json
{
  "servers": {
    "mssql-local": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@eamonboyle/mssql-mcp"],
      "env": {
        "SERVER_NAME": "localhost",
        "DATABASE_NAME": "AppDB",
        "DATABASES": "AppDB,ReportingDB",
        "DB_USER": "your_username",
        "DB_PASSWORD": "your_password",
        "TRUST_SERVER_CERTIFICATE": "true",
        "READONLY": "false",
        "ENABLE_DDL": "false"
      }
    }
  }
}
```

See [`src/samples/`](src/samples/) for copyable Claude Desktop and VS Code files. Do not commit configuration files containing real credentials.

## Required configuration

The server validates these variables before starting. Missing or blank values produce an actionable startup error.

| Variable                   | Accepted format        | Purpose                                                               |
| -------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `DB_USER`                  | Nonblank string        | SQL authentication username                                           |
| `DB_PASSWORD`              | Nonblank string        | SQL authentication password                                           |

At least one database variable is required: set `DATABASE_NAME`, `DATABASES`, or both. With only `DATABASE_NAME`, that database is both the default and the allowlist. With only `DATABASES`, the first entry is the default. When both are set, `DATABASE_NAME` is used if it appears in `DATABASES`; otherwise the first allowed database is the runtime default.

### Hostname and port

> Do not include the port in `SERVER_NAME`. Values such as `localhost,1434` are not supported by the Node.js `mssql` driver configuration used by this package. Set `SERVER_NAME` to the hostname and use `SERVER_PORT` separately.

```json
{
  "SERVER_NAME": "localhost",
  "SERVER_PORT": "1434"
}
```

For a Docker port mapping such as:

```yaml
ports:
  - "1434:1433"
```

use the published host port:

```text
SERVER_NAME=localhost
SERVER_PORT=1434
```

The container still listens on `1433`, but the MCP process connects through host port `1434`.

## Advanced configuration

Optional variables do not need empty placeholders. In-code defaults apply when they are absent.

| Variable                | Accepted format               | Default               | Purpose                                                        |
| ----------------------- | ----------------------------- | --------------------- | -------------------------------------------------------------- |
| `SERVER_NAME`           | Hostname                      | `localhost`           | SQL Server hostname only                                      |
| `SERVER_PORT`           | Integer from `1` to `65535`   | Driver default `1433` | SQL Server TCP port; omitted from the driver config when unset |
| `ENCRYPT`               | `"true"` or `"false"`         | `"false"`             | Enable TLS encryption in the `mssql` driver                    |
| `TRUST_SERVER_CERTIFICATE` | `"true"` or `"false"`      | `"true"`              | Trust the SQL Server certificate without validating its chain |
| `READONLY`              | `"true"` or `"false"`         | `"false"`             | Remove write and DDL tools when enabled                        |
| `ENABLE_DDL`            | `"true"` or `"false"`         | `"false"`             | Allow registered DDL tools to execute                          |
| `CONNECTION_TIMEOUT`    | Positive integer seconds      | `30`                  | SQL Server connection timeout                                  |
| `QUERY_TIMEOUT_MS`      | Positive integer milliseconds | `30000`               | SQL request timeout                                            |
| `MAX_ROWS`              | Positive integer              | `10000`               | Maximum rows returned by read tools                            |
| `MAX_WRITE_ROWS`        | Positive integer              | `100`                 | Maximum rows one write operation may affect                    |
| `REQUIRE_WRITE_PREVIEW` | `"true"` or `"false"`         | `"true"`              | Require a matching preview token for updates and deletes       |
| `MCP_TRANSPORT`         | `stdio` or `http`             | `stdio`               | MCP transport mode                                             |
| `MCP_HTTP_HOST`         | Host or IP string             | `127.0.0.1`           | Bind address for HTTP mode                                     |
| `MCP_HTTP_PORT`         | Integer from `1` to `65535`   | `3333`                | Bind port for HTTP mode                                        |
| `MCP_BASE_URL`          | Absolute HTTP or HTTPS URL    | Unset                 | Public HTTP base advertised by the server; `/mcp` is appended  |

Blank optional values use their documented defaults. Explicit nonblank invalid integers, booleans, ports, URLs, or transport names fail validation rather than falling back silently.

`ENCRYPT=false` preserves the existing unencrypted connection behavior. Set `ENCRYPT=true` for TLS. With encryption enabled, keep `TRUST_SERVER_CERTIFICATE=false` for certificates that chain to a trusted authority. Use `TRUST_SERVER_CERTIFICATE=true` only when explicitly accepting a self-signed or otherwise untrusted certificate, such as local development.

## Multi-database behavior

`DATABASES` is an allowlist. Every tool accepts an optional `databaseName`. When a tool omits it, the server uses `DATABASE_NAME` if that name is allowed, otherwise it uses the first entry in `DATABASES`. A requested database outside the allowlist is rejected.

## Safe writes and DDL

`READONLY=true` removes insert, update, delete, and DDL tools. Read-only preview tools remain available because they do not modify data.

When writes are enabled:

1. `insert_data`, `update_data`, `delete_data`, and DDL tools require `confirmed: true` unless the client completes MCP elicitation.
2. `update_data` and `delete_data` require nonempty structured `filters`, not raw SQL WHERE text.
3. With the default `REQUIRE_WRITE_PREVIEW=true`, call `preview_update` or `preview_delete` first and pass its `previewToken` to the matching write.
4. Preview tokens expire after 10 minutes, are single-use, and are bound to the same tool, table, filters, and update payload.
5. `MAX_WRITE_ROWS` rejects oversized operations, and update/delete execution applies a row cap.

Supported filter operators are `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `IN`, `IS NULL`, and `IS NOT NULL`.

DDL tools are registered when `READONLY=false`, but calls fail with `DDL_DISABLED` unless `ENABLE_DDL=true`.

For `insert_data`, pass the table in `tableName` and the schema separately in `schemaName`. Do not use a dotted `schema.table` value for `tableName`.

## Streamable HTTP

The default transport is stdio. To run the stateless HTTP transport from a directory containing a configured `.env`:

```bash
MCP_TRANSPORT=http npx -y @eamonboyle/mssql-mcp
```

The default endpoint is:

```text
http://127.0.0.1:3333/mcp
```

An HTTP client must accept `application/json, text/event-stream`. Each HTTP request creates a fresh MCP server instance. Preview tokens use a process-wide store so they remain valid across requests to the same process.

For a reverse proxy or externally published path, set `MCP_BASE_URL` to the public base without the final `/mcp` segment:

```text
MCP_BASE_URL=https://example.com/services/mssql
```

The server continues binding to `MCP_HTTP_HOST:MCP_HTTP_PORT`, logs `https://example.com/services/mssql/mcp` as its public endpoint, and exposes that URL through `mssql://config/server`. `MCP_E2E_BASE_URL` is a separate test-harness variable used only by `scripts/e2e-mcp-tools.mjs`.

Cursor HTTP configuration:

```json
{
  "mcpServers": {
    "mssql-http": {
      "url": "http://127.0.0.1:3333/mcp"
    }
  }
}
```

## Tools

| Tool                     | Mode  | Purpose                                                          |
| ------------------------ | ----- | ---------------------------------------------------------------- |
| `list_databases`         | Read  | List configured databases                                        |
| `list_table`             | Read  | List tables, optionally filtered by schema names in `parameters` |
| `describe_table`         | Read  | Describe a table schema                                          |
| `list_objects`           | Read  | List tables, views, procedures, functions, and triggers          |
| `describe_object`        | Read  | Return object metadata and definitions                           |
| `summarize_schema`       | Read  | Summarize object counts by type and schema                       |
| `list_largest_tables`    | Read  | Rank tables by storage and row count                             |
| `list_foreign_keys`      | Read  | List foreign keys                                                |
| `describe_relationships` | Read  | Describe foreign keys involving one table                        |
| `describe_dependencies`  | Read  | List objects that depend on an object                            |
| `analyze_table`          | Read  | Return row counts, storage, and index details                    |
| `read_data`              | Read  | Execute a validated SELECT query                                 |
| `search_data`            | Read  | Search columns with parameterized LIKE predicates                |
| `explain_query`          | Read  | Generate an estimated SELECT execution plan                      |
| `preview_update`         | Read  | Preview an update and issue a token when required                |
| `preview_delete`         | Read  | Preview a delete and issue a token when required                 |
| `insert_data`            | Write | Insert rows                                                      |
| `update_data`            | Write | Update rows selected by structured filters                       |
| `delete_data`            | Write | Delete rows selected by structured filters                       |
| `create_table`           | DDL   | Create a table                                                   |
| `create_index`           | DDL   | Create an index                                                  |
| `drop_table`             | DDL   | Drop a table                                                     |

## Resources and prompts

Clients with MCP resource support can discover:

- `mssql://config/server`
- `mssql://config/prompts`
- `mssql://database/{databaseName}/tables`
- `mssql://database/{databaseName}/objects`
- `mssql://database/{databaseName}/schema-summary`
- `mssql://database/{databaseName}/foreign-keys`
- `mssql://table/{databaseName}/{schemaName}/{tableName}`
- `mssql://object/{databaseName}/{schemaName}/{objectName}`
- `mssql://database/{databaseName}/object/{schemaName}/{objectName}/dependencies`
- `mssql://query-plan/{planId}`
- `mssql://query-result/{resultId}`

Table and object listings are cached for 30 seconds. Query plan and large query result resources are temporary process-local artifacts.

Available prompts:

- `explore_schema`
- `draft_safe_select`
- `review_write_operation`

## Development

For local source development only:

```bash
git clone https://github.com/eamonboyle/mssql-mcp.git
cd mssql-mcp
npm install
npm run build
node /path/to/mssql-mcp/dist/index.js
```

The repository includes a seeded SQL Server 2022 Docker environment:

```bash
cp .env.example .env
npm run db:up
npm run test:e2e
```

See [`docs/dev-database.md`](docs/dev-database.md) for database and E2E details and [`CONTRIBUTING.md`](CONTRIBUTING.md) for build, lint, and test commands.

## Troubleshooting

- `SERVER_PORT must be a valid TCP port`: use a whole number from `1` to `65535`.
- `getaddrinfo ENOTFOUND localhost,1434`: move `1434` from `SERVER_NAME` to `SERVER_PORT`.
- `DDL_DISABLED`: set `ENABLE_DDL` to `"true"` only when DDL access is intended.
- `PREVIEW_TOKEN_INVALID`: create a new matching preview and use its token once within 10 minutes.
- stdio JSON parse errors: ensure scripts and dependencies write logs to stderr, not stdout.
- database rejected: add it to `DATABASES` and use the exact allowed name in `databaseName`.

## Security

- Use a dedicated SQL login with the minimum permissions required.
- Set `READONLY=true` whenever writes are unnecessary.
- Keep `ENABLE_DDL=false` unless schema changes are explicitly needed.
- Keep credentials out of source control and use your client's secret-input support or a secrets manager.
- Bind HTTP mode to a trusted interface and add network authentication or isolation outside this package.
- Set `ENCRYPT=true` for TLS deployments and keep `TRUST_SERVER_CERTIFICATE=false` when the server certificate is publicly or privately trusted.
- Report vulnerabilities through the [security policy](.github/SECURITY.md).

## Project links

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](.github/SECURITY.md)
- [License](LICENSE)

# Read and search data

Read and search lets a client run a validated SELECT, find rows by parameterized LIKE, and switch `databaseName` to ReportingDB without leaving the MCP session.

## Sub-features

- `read-select` returns seeded customer rows from `read_data`.
- `read-reject-write` rejects a non-SELECT with `SECURITY_VALIDATION_FAILED`.
- `search-email` finds `ada@example.com` through `search_data`.
- `read-reporting` reads `dbo.DailySales` in ReportingDB.

## How to get to it (user POV)

- Call `read_data` with a `SELECT` and optional `databaseName`.
- Call `search_data` with `tableName`, `columns`, and `searchTerm`.
- Pass `databaseName` `ReportingDB` to either tool.

## Driving it with mcp-rpc

Preconditions:

- Doctor passed against `http://127.0.0.1:3334/mcp`.
- `AppDB.dbo.Customers` includes `ada@example.com`.
- `ReportingDB.dbo.DailySales` has at least one row.

- **Read customers.** Select a few customers. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/read-and-search/read-customers.json --contains ada@example.com tools/call read_data '{"databaseName":"AppDB","query":"SELECT TOP 3 Id, Email FROM dbo.Customers ORDER BY Id"}'`. `payload.success` is true and `payload.data` includes Ada's email.
- **Reject writes.** Send an UPDATE as `query`. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/read-and-search/read-rejected.json --no-require-success --contains SECURITY_VALIDATION_FAILED tools/call read_data "{\"databaseName\":\"AppDB\",\"query\":\"UPDATE dbo.Customers SET Name = N'x'\"}"`. `payload.success` is false.
- **Search email.** Search Name and Email. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/read-and-search/search-ada.json --contains ada@example.com tools/call search_data '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers","columns":["Email","Name"],"searchTerm":"ada@example","limit":5}'`.
- **Search miss.** Search a term that should not match. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/read-and-search/search-empty.json tools/call search_data '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers","columns":["Email"],"searchTerm":"no-such-customer-xyz","limit":5}'`. `payload.success` is true and `payload.data` is an empty array.
- **ReportingDB.** Read sales. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/read-and-search/read-dailysales.json --contains DailySales tools/call read_data '{"databaseName":"ReportingDB","query":"SELECT TOP 1 SaleDate, OrderCount, Revenue FROM dbo.DailySales ORDER BY SaleDate"}'`. `payload.data` has a row.
- **Disallowed database.** Request a name outside the allowlist. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/read-and-search/invalid-database.json --no-require-success tools/call read_data '{"databaseName":"master","query":"SELECT 1 AS n"}'`. `payload.success` is false. The error code is `INVALID_DATABASE` or the message names an invalid database.
- **Proof.** Keep `read-customers.json` and `search-ada.json`. Both show `ada@example.com` from the MCP tool result, not from sqlcmd.

## Gotchas

- `read_data` only accepts queries that pass `validateReadQuery`. Leading comments, batches, and data-changing statements fail.
- `search_data` needs a nonempty `columns` array and a nonempty `searchTerm`.
- LIKE is `%term%` on each listed column. A too-short term matches extra rows.
- `databaseName` is an allowlist check against `DATABASES`. `master` is not allowed even for `sa`.
- `MAX_ROWS` truncates large results. Assert a specific email, not the full table length.

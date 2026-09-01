# Analyze queries

Analyze queries lets a client inspect an estimated SELECT plan, table storage, and the largest tables without changing data.

## Sub-features

- `analyze-explain` returns estimated plan XML for a SELECT on `Customers`.
- `analyze-table` returns row count and indexes for `Orders`.
- `analyze-largest` ranks tables and includes `Customers` or `Orders`.

## How to get to it (user POV)

- Call `explain_query` with the same class of SELECT that `read_data` accepts.
- Call `analyze_table` with `tableName` and optional `schemaName`.
- Call `list_largest_tables` with optional `limit` and `schemaName`.

## Driving it with mcp-rpc

Preconditions:

- Doctor passed against `http://127.0.0.1:3334/mcp`.
- Seeded `dbo.Customers` and `dbo.Orders` exist in AppDB.

- **Explain SELECT.** Ask for a plan. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/analyze-queries/explain-customers.json tools/call explain_query '{"databaseName":"AppDB","query":"SELECT * FROM dbo.Customers WHERE Id = 1"}'`. `payload.success` is true and `payload.data.planXml` is a string that starts with `<`.
- **Analyze Orders.** Inspect storage. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/analyze-queries/analyze-orders.json --contains Orders tools/call analyze_table '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Orders"}'`. `payload.data.summary` includes a row count.
- **Largest tables.** Rank tables. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/analyze-queries/largest-tables.json tools/call list_largest_tables '{"databaseName":"AppDB","schemaName":"dbo","limit":5}'`. `payload.data` is a nonempty array.
- **Explain rejects DML.** Send an UPDATE. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/analyze-queries/explain-rejected.json --no-require-success --contains SECURITY_VALIDATION_FAILED tools/call explain_query '{"databaseName":"AppDB","query":"DELETE FROM dbo.Customers"}'`.
- **Proof.** Keep `explain-customers.json` with `planXml`, and `analyze-orders.json` with a numeric row count. Plans are estimated. They do not execute the SELECT.

## Gotchas

- `explain_query` uses `SET SHOWPLAN_XML` on a dedicated connection. A validation failure happens before that.
- `planXml` may arrive as a long string. Assert a prefix or `ShowPlanXML`, not byte equality across SQL Server builds.
- `list_largest_tables` `limit` is clamped to `MAX_ROWS`.
- Query plan resources at `mssql://query-plan/{planId}` are process-local. They vanish when the verify process exits. Capture `planXml` from the tool result.

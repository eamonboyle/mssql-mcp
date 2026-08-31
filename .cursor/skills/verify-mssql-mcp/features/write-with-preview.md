# Write with preview

Write with preview lets a client insert a row, see which rows an update or delete would touch, then apply that change only after `confirmed` and a matching `previewToken`.

## Sub-features

- `write-insert` inserts a unique customer with `confirmed: true`.
- `write-confirm-required` refuses insert without `confirmed`.
- `write-preview-update` issues a `previewToken` for that row.
- `write-update` applies the previewed update.
- `write-preview-delete` issues a delete token for that row.
- `write-delete` deletes the row.

## How to get to it (user POV)

- Call `insert_data` with `tableName`, `data`, and `confirmed: true`.
- Call `preview_update`, then `update_data` with the same table, filters, updates, `previewToken`, and `confirmed: true`.
- Call `preview_delete`, then `delete_data` with the same table, filters, `previewToken`, and `confirmed: true`.

## Driving it with mcp-rpc

Preconditions:

- Doctor passed against `http://127.0.0.1:3334/mcp`.
- `READONLY=false` on the verify process.
- You pick a unique email such as `verify.<timestamp>@example.com`. Do not update seeded `ada@example.com`.

- **Reject unconfirmed insert.** Omit `confirmed`. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/insert-unconfirmed.json --no-require-success --contains CONFIRMATION_REQUIRED tools/call insert_data '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers","data":{"Name":"Unconfirmed","Email":"unconfirmed@example.com","City":"Testville"}}'`. `payload.success` is false.
- **Insert row.** Insert the unique email. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/insert.json --contains true tools/call insert_data '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers","data":{"Name":"Verify Insert","Email":"verify.REPLACE_ME@example.com","City":"Testville"},"confirmed":true}'`. `payload.success` is true.
- **Read inserted row.** Confirm the row exists. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/read-after-insert.json --contains verify.REPLACE_ME@example.com tools/call read_data "{\"databaseName\":\"AppDB\",\"query\":\"SELECT Id, Name, Email FROM dbo.Customers WHERE Email = N'verify.REPLACE_ME@example.com'\"}"`.
- **Preview update.** Preview a name change. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/preview-update.json --contains previewToken tools/call preview_update '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers","updates":{"Name":"Verify Updated"},"filters":[{"column":"Email","operator":"=","value":"verify.REPLACE_ME@example.com"}]}'`. Copy `payload.data.previewToken`. `payload.data.affectedRowCount` is 1.
- **Update row.** Apply the token. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/update.json tools/call update_data '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers","updates":{"Name":"Verify Updated"},"filters":[{"column":"Email","operator":"=","value":"verify.REPLACE_ME@example.com"}],"previewToken":"PASTE_TOKEN","confirmed":true}'`. `payload.success` is true.
- **Read updated row.** Confirm the new name. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/read-after-update.json --contains Verify Updated tools/call read_data "{\"databaseName\":\"AppDB\",\"query\":\"SELECT Name, Email FROM dbo.Customers WHERE Email = N'verify.REPLACE_ME@example.com'\"}"`.
- **Preview delete.** Preview removal. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/preview-delete.json --contains previewToken tools/call preview_delete '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers","filters":[{"column":"Email","operator":"=","value":"verify.REPLACE_ME@example.com"}]}'`. Copy the new token.
- **Delete row.** Apply the delete token. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/delete.json tools/call delete_data '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers","filters":[{"column":"Email","operator":"=","value":"verify.REPLACE_ME@example.com"}],"previewToken":"PASTE_TOKEN","confirmed":true}'`.
- **Read after delete.** Confirm the row is gone. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/write-with-preview/read-after-delete.json tools/call read_data "{\"databaseName\":\"AppDB\",\"query\":\"SELECT Id FROM dbo.Customers WHERE Email = N'verify.REPLACE_ME@example.com'\"}"`. `payload.data` is an empty array.
- **Proof.** Keep the insert, both previews, update, delete, and the three `read_data` files. The reads are the source of truth.

Replace `verify.REPLACE_ME@example.com` and `PASTE_TOKEN` with values from this run. Do not commit those values.

## Gotchas

- HTTP clients cannot complete MCP elicitation. Always pass `confirmed: true`.
- `previewToken` is single-use and expires after 10 minutes. It is bound to tool, table, filters, and the update payload.
- Changing filters or `updates` between preview and write yields `PREVIEW_TOKEN_INVALID`.
- Filters are structured objects with `column`, `operator`, and `value` or `values`. Raw SQL WHERE text is rejected.
- `insert_data` does not use a preview token. `update_data` and `delete_data` do when `REQUIRE_WRITE_PREVIEW` is true.
- Seeded customers are shared. Unique emails keep concurrent runs from colliding.
- A success message without the follow-up `read_data` is not proof.

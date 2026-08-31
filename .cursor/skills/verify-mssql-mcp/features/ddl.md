# DDL

DDL lets a client create a table, add an index, and drop that table when `ENABLE_DDL=true`. The verify launcher turns that flag on. A default `.env` leaves it off.

## Sub-features

- `ddl-disabled` is documented for processes with `ENABLE_DDL=false`. Skip it on the verify launcher.
- `ddl-create-table` creates a uniquely named scratch table.
- `ddl-create-index` creates an index on that table.
- `ddl-describe` shows the new table through `describe_table`.
- `ddl-drop-table` drops the scratch table.

## How to get to it (user POV)

- Call `create_table` with `tableName`, `columns`, and `confirmed: true`.
- Call `create_index` with `tableName`, `indexName`, `columns`, and `confirmed: true`.
- Call `drop_table` with `tableName` and `confirmed: true`.

## Driving it with mcp-rpc

Preconditions:

- Doctor passed. `mssql://config/server` has `enableDdl` true.
- Pick a table name such as `VerifyMcp1234567890` that is not already in AppDB.
- `confirmed: true` on every DDL call.

- **Create table.** Create the scratch table. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/ddl/create-table.json tools/call create_table '{"databaseName":"AppDB","schemaName":"dbo","tableName":"VerifyMcpREPLACE","columns":[{"name":"Id","type":"INT","nullable":false,"isPrimaryKey":true,"isIdentity":true},{"name":"Note","type":"NVARCHAR(100)","nullable":true}],"confirmed":true}'`. `payload.success` is true.
- **Describe table.** Confirm columns. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/ddl/describe-table.json --contains Note tools/call describe_table '{"databaseName":"AppDB","schemaName":"dbo","tableName":"VerifyMcpREPLACE"}'`.
- **Create index.** Index `Id`. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/ddl/create-index.json tools/call create_index '{"databaseName":"AppDB","schemaName":"dbo","tableName":"VerifyMcpREPLACE","indexName":"IX_VerifyMcpREPLACE_Id","columns":["Id"],"isUnique":true,"confirmed":true}'`. `payload.success` is true.
- **Drop table.** Remove the scratch table. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/ddl/drop-table.json tools/call drop_table '{"databaseName":"AppDB","schemaName":"dbo","tableName":"VerifyMcpREPLACE","confirmed":true}'`.
- **Describe after drop.** Confirm it is gone. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/ddl/describe-after-drop.json --no-require-success tools/call describe_table '{"databaseName":"AppDB","schemaName":"dbo","tableName":"VerifyMcpREPLACE"}'`. `payload.success` is false, or `payload.data` is empty.
- **Proof.** Keep create, describe, index, drop, and the post-drop describe. The two describes are the before and after.

Replace `VerifyMcpREPLACE` with the run-specific name before calling.

If you are not on the verify launcher and `ENABLE_DDL` is false, prove `DDL_DISABLED` instead with `create_table` and `--no-require-success`. Do not treat that skip as a create proof.

## Gotchas

- DDL tools are registered when `READONLY=false`. They still fail with `DDL_DISABLED` until `ENABLE_DDL=true`.
- `column.type` is a SQL type declaration only, such as `INT` or `NVARCHAR(100)`. Do not put NULL or PRIMARY KEY in `type`.
- Identity columns use `isIdentity`, `identitySeed`, and `identityIncrement`.
- Failed runs can leave a scratch table. Drop it by name before starting again.
- `list_table` resource cache can hide a brand-new table for 30 seconds. `describe_table` is the live check.
- Never drop seeded tables `Customers`, `Products`, `Orders`, `OrderItems`, or `DailySales`.

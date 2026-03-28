# Smoke test prompts — MSSQL MCP (database `test-mcp`)

Use with your MCP client on the **`test-mcp`** database. For every tool that accepts **`databaseName`**, pass **`test-mcp`** (exact name your server allows) unless the step is `list_databases`. Use **`schemaName` `dbo`** when describing `dbo.Users`.

This file lives in the repo and is not compiled into `dist` (build output is only from `src/`).

**Minimal subset (fast):** prompts 1, 2, 4, 7, 9, 11–13. On an empty database, run **Bootstrap** first.

## Bootstrap `dbo.Users` (optional — new or empty `test-mcp`)

Use this when `list_table` / `describe_table` shows no `Users` table or the table has no rows. Align any new table with the shape below (verified against `describe_table` on `test-mcp`: `id`, `email`, `created_at`, `first_name`, `surname` — all **NOT NULL**; `id` is an identity primary key; `email` is unique in typical setups).

**A.** List tables in `test-mcp` (`list_table`, `databaseName: test-mcp`). If `dbo.Users` is present, call `describe_table` (`databaseName: test-mcp`, `schemaName: dbo`, `tableName: Users`) and compare columns/types to **B**. If it already matches, skip **B**.

**B.** Create the table **only** if it is missing and **`ENABLE_DDL=true`**. Use `create_table` with `databaseName: test-mcp`, `schemaName: dbo`, `tableName: Users`, `confirmed: true`, and `columns` (order matters for readability; adjust flags to match your server's DDL rules):

- `id` — type `INT`, **not** nullable, **`isPrimaryKey: true`**, **`isIdentity: true`**
- `email` — type `NVARCHAR(255)`, **not** nullable, **`isUnique: true`**
- `created_at` — type `DATETIME2`, **not** nullable
- `first_name` — type `NVARCHAR(100)`, **not** nullable
- `surname` — type `NVARCHAR(100)`, **not** nullable  

If **`ENABLE_DDL=false`**, you cannot create the table via MCP; create it outside MCP or enable DDL, then continue.

**C.** Check row count with `read_data` on `test-mcp`, e.g. `SELECT COUNT(*) AS n FROM dbo.Users`. If `n > 0`, skip seeding.

**D.** Seed with `insert_data`: `databaseName: test-mcp`, `tableName: Users`, **`confirmed: true`**. Pass **`data`** as an array of objects. **Omit `id`** so the identity column fills. Use the same **snake_case** column names as in the database (`created_at`, `first_name`, `surname`). Example slice (10 rows — enough for search step 10):

```json
[
  { "email": "dummy.user.01@example.com", "created_at": "2026-01-02T11:31:00.000Z", "first_name": "James", "surname": "Smith" },
  { "email": "dummy.user.02@example.com", "created_at": "2026-01-03T12:32:00.000Z", "first_name": "Mary", "surname": "Johnson" },
  { "email": "dummy.user.03@example.com", "created_at": "2026-01-04T13:33:00.000Z", "first_name": "Robert", "surname": "Williams" },
  { "email": "dummy.user.04@example.com", "created_at": "2026-01-05T14:34:00.000Z", "first_name": "Patricia", "surname": "Brown" },
  { "email": "dummy.user.05@example.com", "created_at": "2026-01-06T15:35:00.000Z", "first_name": "John", "surname": "Jones" },
  { "email": "dummy.user.06@example.com", "created_at": "2026-01-07T16:36:00.000Z", "first_name": "Jennifer", "surname": "Garcia" },
  { "email": "dummy.user.07@example.com", "created_at": "2026-01-08T17:37:00.000Z", "first_name": "Michael", "surname": "Miller" },
  { "email": "dummy.user.08@example.com", "created_at": "2026-01-09T18:38:00.000Z", "first_name": "Linda", "surname": "Davis" },
  { "email": "dummy.user.09@example.com", "created_at": "2026-01-10T19:39:00.000Z", "first_name": "William", "surname": "Rodriguez" },
  { "email": "dummy.user.10@example.com", "created_at": "2026-01-11T20:40:00.000Z", "first_name": "Elizabeth", "surname": "Martinez" }
]
```

Each `insert_data` call must not exceed **`MAX_WRITE_ROWS`** (often **100** by default). For larger seeds, split into multiple batches (e.g. another 10+ rows per call) or raise `MAX_WRITE_ROWS` in the server environment.

**E.** Confirm with `read_data` (`SELECT TOP 5 * FROM dbo.Users ORDER BY id`) that rows look correct.

## Discovery & schema

1. Which databases can this MCP server use? Call the tool if you have it.  
   (`list_databases` — no `databaseName`; confirm `test-mcp` appears in the allowed list.)

2. List all tables in `test-mcp`.  
   (`list_table` with `databaseName: test-mcp`)

3. List tables, views, and procedures in `test-mcp`.  
   (`list_objects` with `databaseName: test-mcp`)

4. Describe the columns and types for `dbo.Users` in `test-mcp`.  
   (`describe_table` with `databaseName: test-mcp`, `schemaName: dbo`, `tableName: Users`)

5. Summarize foreign keys involving `Users` in `test-mcp`.  
   (`list_foreign_keys` with `databaseName: test-mcp`, `schemaName: dbo` to scope to `dbo`, or omit `schemaName` to list all FKs in the database.)

6. How is `dbo.Users` related to other tables in `test-mcp`?  
   (`describe_relationships` with `databaseName: test-mcp`, `schemaName: dbo`, `tableName: Users` — may be empty; still valid.)

## Analysis & plans

7. Run `analyze_table` on `dbo.Users` in `test-mcp` and summarize row count, nulls, and anything interesting.  
   (`databaseName: test-mcp`, `schemaName: dbo`, `tableName: Users`)

8. Use `explain_query` on `SELECT * FROM dbo.Users WHERE email LIKE N'%@%'` in `test-mcp`.  
   (`databaseName: test-mcp`)

## Reads & search

9. Using `read_data`, show up to 5 rows from `dbo.Users` in `test-mcp`, ordered by `id`.  
   (`databaseName: test-mcp`; your query must be a `SELECT` on `dbo.Users`.)

10. Using `search_data`, search `dbo.Users` in `test-mcp` on `email` and `first_name` for the term `dummy` (seed emails look like `dummy.user.01@example.com`) and return at most 10 rows.  
    (`databaseName: test-mcp`, `schemaName: dbo`, `tableName: Users`)

## Write path & previews (safe filters: `id = -1` usually matches no rows)

Requires two steps when **`REQUIRE_WRITE_PREVIEW=true`** (default): call **`preview_*`**, read **`data.previewToken`**, then call the write tool with the **same** scope plus **`previewToken`** and **`confirmed: true`**.

11. Preview an update on `test-mcp` `dbo.Users`: set `first_name` to `Smoke` where `id = -1`. Use `preview_update`; report affected row count, sample rows, and **`previewToken`** from `data`.

12. Preview deletes on `test-mcp` `dbo.Users` where `id = -1` using `preview_delete`; report affected row count and **`previewToken`** from `data`.

13. If the step 11 preview shows 0 rows (or you accept the risk), run **`update_data`** on `test-mcp` with **`schemaName: dbo`**, **`tableName: Users`**, the **same `updates` and `filters`** as step 11, **`previewToken`** from step 11, and **`confirmed: true`**. If `REQUIRE_WRITE_PREVIEW=false`, `previewToken` is omitted but **`confirmed: true`** still applies.

14. Only if you intend to delete: repeat step 12 if needed, then **`delete_data`** on `test-mcp` with **`schemaName: dbo`**, **`tableName: Users`**, the **same `filters`** as the preview, **`previewToken`** from that preview, and **`confirmed: true`**.

## Write preview token negative cases (`test-mcp`, `REQUIRE_WRITE_PREVIEW=true`)

Use safe filters (e.g. `id = -1`) so mismatched calls still affect **zero rows** if anything slips through. Every step uses **`databaseName: test-mcp`**, **`schemaName: dbo`**, **`tableName: Users`**, and **`confirmed: true`** on writes. Expect **`success: false`** and **`error.code: PREVIEW_TOKEN_INVALID`** (or the confirmation path first if `confirmed` is missing—complete the intended flow).

**A — Mismatch after preview (updates):** `preview_update` with `updates: { "first_name": "TokenOk" }`, `filters: [{ "column": "id", "operator": "=", "value": -1 }]`. Copy **`previewToken`**. Call **`update_data`** with the **same** filters but **`updates: { "first_name": "Changed" }`** and that token.

**B — Mismatch after preview (filters):** New `preview_update` with `first_name` → `TokenOk`, `id = -1`. Call **`update_data`** with the **same** `updates` but **`filters: [{ "column": "id", "operator": "=", "value": 0 }]`** (or change column / operator).

**C — Mismatch (identifiers):** Preview with **`databaseName: test-mcp`**, **`schemaName: dbo`**. Call **`update_data`** with the same payload but **omit `schemaName`** (or change **`tableName`** / **`databaseName`**).

**D — Cross-tool token:** Run **`preview_delete`** (`id = -1`). Pass that **`previewToken`** to **`update_data`** (matching filters/updates as you like). Optionally do the reverse: **`preview_update`** then **`delete_data`** with the update token.

**E — Reuse consumed token:** `preview_update` → successful **`update_data`** with that token → call **`update_data`** **again** with the **same** arguments and **same** `previewToken`. Second call should fail (grant already consumed).

**F — Bogus / empty token:** `preview_update` then **`update_data`** with **`previewToken: "not-a-real-token"`**, or omit **`previewToken`**.

**G — Expired token:** `preview_update`, wait **more than 10 minutes** without restarting the MCP server (in-memory store), then **`update_data`** with the old token. Should fail as **invalid/expired** if the grant aged out.

## DDL (only with `ENABLE_DDL=true`; still use `test-mcp`)

15. If `ENABLE_DDL` is true, create a throwaway table `dbo.McpSmoke123` with one `id` int column in `test-mcp`, describe it, then drop it.  
    (`databaseName: test-mcp` on each DDL tool; use `confirmed: true` when the server asks.)

16. If `ENABLE_DDL` is false, attempt to create a table on `test-mcp` and confirm the server returns a clear **DDL disabled** error.

## Structured results

17. For each tool you used, briefly quote `version`, `success`, and any `error.code` from the JSON if present.

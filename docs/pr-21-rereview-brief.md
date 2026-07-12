# PR #21 Re-review Brief

Please re-review PR #21, **Add SQL Server port, TLS, and public endpoint configuration**, using the business and compatibility decisions below as acceptance criteria.

## Product decision

MCP servers commonly auto-update without an administrator guiding each upgrade. A minor release must therefore avoid turning a previously working configuration into a startup failure. This PR should remain version **1.6.0** and must not introduce an undeclared breaking configuration migration.

Prefer backward-compatible defaults for omitted variables while continuing to reject malformed values that users explicitly provide.

## Required compatibility behavior

### Database selection

`DATABASE_NAME` and `DATABASES` must not both be required.

- With only `DATABASE_NAME=AppDB`, AppDB is the default and sole allowed database.
- With only `DATABASES=AppDB,ReportingDB`, both are allowed and the first entry, AppDB, is the default.
- With both variables, `DATABASE_NAME` is the default when it appears in `DATABASES`; otherwise the first allowlisted database remains the runtime default, preserving existing behavior.
- With neither variable, startup should fail with an actionable error.
- Requests for a database outside the resolved allowlist must still be rejected.

### Backward-compatible boolean defaults

Omitted variables must retain these existing defaults:

- `READONLY=false`
- `ENABLE_DDL=false`
- `TRUST_SERVER_CERTIFICATE=true`
- `ENCRYPT=false`

Explicit `TRUST_SERVER_CERTIFICATE=false` must now be honored. This fixes the previous behavior that effectively forced it to `true`.

Explicit malformed booleans must fail clearly. For example, `READONLY=yes` should terminate startup with:

```text
READONLY must be either "true" or "false".
```

### Versioning and documentation

- Package, lockfile, server resource, tests, and changelog should consistently report `1.6.0`.
- The changelog must not describe this as a breaking release.
- README configuration tables must distinguish genuinely required settings from optional settings with defaults.
- Please check for any other newly required variable or startup validation that could still break a configuration accepted by 1.5.x, including `SERVER_NAME`, `DB_USER`, and `DB_PASSWORD`. Flag any remaining compatibility regression rather than assuming stricter startup validation is harmless.

## Implementation decisions already made

- SQL connection settings are parsed and validated once at startup, then reused for normal and dedicated connection pools.
- Pool creation must not re-read `process.env` or revalidate unrelated MCP transport settings.
- Invalid explicitly supplied ports, integers, booleans, transport names, and public URLs should still produce actionable validation errors.
- `SERVER_PORT` remains optional and is passed separately to the `mssql` driver. When omitted, the driver default is used.
- `SERVER_NAME` must not be split or rewritten when building the driver configuration.
- `MCP_BASE_URL` remains optional and is relevant to the advertised public endpoint in HTTP mode.
- The existing `list_largest_tables` escaped `[rowCount]` fix remains in scope.
- Dead one-off configuration getters removed during review should remain removed unless there is a real caller.
- The E2E report intentionally distinguishes 22 unique registered tools from 23 invocations because `read_data` is exercised against both databases.
- Existing CRLF files are preserved; repository whitespace attributes should allow CRLF without hiding genuine trailing whitespace.

## Validation already completed

The current uncommitted implementation has passed:

- `npm run build`
- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `git diff --check`
- 22 unique registered MCP tools
- 23/23 E2E tool invocations

Live Cursor MCP testing also passed:

1. `DATABASE_NAME` only, with the three safety booleans omitted.
2. `DATABASES` only, with AppDB selected as the first/default database and ReportingDB explicitly queried.
3. Invalid `READONLY=yes`, which correctly prevented startup and produced an actionable error.
4. Restoration of the normal two-database configuration, reporting server version 1.6.0 and status `ready`.

## Re-review request

Please review the complete PR diff plus the current uncommitted changes. Focus on correctness rather than restating the intended design.

Report:

1. Any behavior that can still break a previously valid 1.5.x deployment.
2. Any mismatch among runtime behavior, tests, README, samples, `.env.example`, AGENTS.md, changelog, package version, and MCP resource metadata.
3. Any configuration path that reparses mutable environment state after startup.
4. Any missing tests for database fallback, default booleans, explicit false values, invalid values, port handling, TLS, or HTTP public endpoints.
5. Any security regression involving credentials, database allowlisting, read-only mode, DDL gating, TLS, or redacted resources.
6. Any unnecessary line-ending churn or `git diff --check` issue.

Classify findings by severity and include file/line references. If no blocking issues remain, say so explicitly and distinguish optional cleanup from merge blockers.

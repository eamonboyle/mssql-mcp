# Security Policy

## Supported Versions

We provide security updates for the latest release. Please upgrade to the newest version to receive security fixes.

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

If you discover a security issue, please report it privately by:

1. Opening a [Security Advisory](https://github.com/eamonboyle/mssql-mcp/security/advisories/new) (if you have access), or
2. Contacting the maintainers through GitHub (see the repository owner)

Include a description of the vulnerability, steps to reproduce, and any suggested fix. We will respond as soon as possible and work with you on a resolution.

## Security Best Practices

When using this MCP server:

- **Never commit credentials** - Use environment variables or a secrets manager for `DB_USER` and `DB_PASSWORD`.
- **Use read-only mode** when possible - Set `READONLY: "true"` for query-only workloads.
- **Limit database access** - Use a dedicated SQL user with minimal required permissions.
- **Use encrypted connections** - Set `ENCRYPT=true` and keep `TRUST_SERVER_CERTIFICATE=false` when the SQL Server certificate chains to a trusted authority. Enable certificate trust only when explicitly accepting a self-signed or otherwise untrusted certificate.
- **Protect HTTP deployments** - Bind to a trusted interface and place externally reachable MCP endpoints behind appropriate network authentication and isolation.

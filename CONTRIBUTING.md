# Contributing to MSSQL MCP Server

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository** and clone your fork locally.
2. **Install dependencies**: `npm install`
3. **Build the project**: `npm run build`
4. **Create a branch** for your changes: `git checkout -b feature/your-feature-name`

## Development

- **Build**: `npm run build`
- **Watch mode**: `npm run watch` (rebuilds on file changes)

The project uses TypeScript. Source files are in `src/`, compiled output goes to `dist/`.

## Submitting Changes

1. **Write clear commit messages** — Use present tense ("Add feature" not "Added feature").
2. **Keep changes focused** — One logical change per commit/PR.
3. **Test your changes** — Ensure the server builds and works with your SQL Server setup.
4. **Open a Pull Request** — Describe what you changed and why.

## Pull Request Process

1. Update the README or docs if you add configuration options or change behavior.
2. Ensure `npm run build` succeeds.
3. Fill out the PR template when opening a pull request.
4. Address any review feedback.

## Reporting Issues

- **Bug reports**: Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template.
- **Feature requests**: Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template.
- **Security issues**: Please do not open public issues for security vulnerabilities. Contact the maintainers privately.

## Code Style

- Follow the existing code style in the project.
- Use TypeScript strict mode.
- Prefer `async/await` over raw Promises where appropriate.

## Questions?

Open a [Discussion](https://github.com/your-username/mssql-mcp/discussions) or an issue if you have questions.

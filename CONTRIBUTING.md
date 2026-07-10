# Contributing

Thank you for contributing to `@grigoreo-dev/otask-mcp`.

## Language policy

Everything committed to this repository must be in English: code, comments,
documentation, commit messages, pull requests, issues, and GitHub templates.

## Development prerequisites

- Bun >= 1.1.0 (see `engines.bun` in `package.json`)

Recommended setup:

```bash
bun install
```

## Branch workflow

Use GitHub Flow:

1. Create a short-lived branch from `main`.
2. Make the change.
3. Open a pull request into `main`.
4. Wait for CI and review.
5. Merge with squash merge.

Branch name examples:

- `feat/<short-name>`
- `fix/<short-name>`
- `docs/<short-name>`
- `chore/<short-name>`
- `ci/<short-name>`

## Commit and PR titles

Use conventional commits / PR titles:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `ci: ...`
- `test: ...`
- `refactor: ...`

## Local validation

```bash
bun run lint
bun run build
bun test
```

Optional auto-fix:

```bash
bun run format
```

## Pull request process

1. Open a feature branch from `main`.
2. Fill the PR template.
3. Wait for required checks: `lint`, `build`, `unit`, `PR Title`.
4. Read CodeRabbit / Cubic feedback (advisory).
5. Address or explicitly resolve review comments.

## Releases

Publishing to npm is tag-driven:

1. Bump `version` in `package.json`.
2. Commit the bump.
3. Create and push tag `vX.Y.Z` where `X.Y.Z` matches `package.json`.
4. GitHub Actions workflow `publish.yml` runs tests, builds, and publishes
   `@grigoreo-dev/otask-mcp` via npm Trusted Publisher (OIDC).

Do not publish from untagged commits or from pull requests.

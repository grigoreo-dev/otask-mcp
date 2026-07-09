# Design: Publish npm package via GitHub Actions

**Date:** 2026-07-09  
**Status:** Approved for implementation planning  
**Repo:** `grigoreo-dev/otask-mcp`

## Problem

Package is not on npm. Manual `npm publish` requires local auth and is easy to ship without `dist/` (ignored by git). Need automated, secret-light publish from GitHub.

## Goals

1. Publish scoped package **`@grigoreo-dev/otask-mcp`** to the public npm registry
2. Trigger: **push of tags matching `v*`** (e.g. `v1.2.0`)
3. Auth: **OIDC Trusted Publisher** (no long-lived `NPM_TOKEN` secret)
4. Ship a complete tarball: built `dist/`, `README.md`, correct `bin` entries
5. Fail closed if git tag version ≠ `package.json` version

## Non-goals

- Auto-bump version on every main push
- GitHub Releases / changelog automation
- Private registry or dual-publish
- Publishing from PRs or untagged commits

## Package identity

| Field | Value |
|-------|--------|
| `name` | `@grigoreo-dev/otask-mcp` |
| Current version | `1.2.0` (first public release as this name) |
| Access | public (`npm publish --access public`) |
| `bin` | `otask-mcp` → `dist/index.js`, `otask-mcp-http` → `dist/mcp-http.js` |
| Install | `npx @grigoreo-dev/otask-mcp` / `npm i -g @grigoreo-dev/otask-mcp` |

CLI binary names stay unscoped (`otask-mcp`, `otask-mcp-http`); only the package name is scoped.

## Approach

**Tag-driven publish workflow (A)** — on `push` tags `v*`: checkout → install → test → build → assert version ↔ tag → `npm publish --access public --provenance`.

Rejected:

- **B** (Release + publish): extra UI step, not required
- **C** (changesets / release-please): overkill for a single package

## Architecture

```
developer:
  bump package.json version → commit → git tag vX.Y.Z → push tag

GitHub Actions (publish.yml):
  checkout
  setup Node (npm publish + provenance)
  setup Bun (install / test / build)
  bun install
  bun test
  bun run build
  assert: package.json version === tag without leading "v"
  npm publish --access public --provenance

npm:
  OIDC Trusted Publisher verifies GitHub workflow identity
  package @grigoreo-dev/otask-mcp published
```

## Workflow details

**File:** `.github/workflows/publish.yml`

| Item | Value |
|------|--------|
| Trigger | `on.push.tags: ['v*']` |
| Permissions | `contents: read`, `id-token: write` |
| Runner | `ubuntu-latest` |
| Node | 22.x (for `npm publish`) |
| Bun | latest stable (project runtime/test) |
| Publish | `npm publish --access public --provenance` |
| Environment | none (unless later restricted) |

Version check:

- Tag ref: `GITHUB_REF_NAME` e.g. `v1.2.0`
- Expected: strip leading `v` → `1.2.0`
- Compare to `node -p "require('./package.json').version"`
- Mismatch → fail job (no publish)

## package.json changes

1. Rename `"name"` → `"@grigoreo-dev/otask-mcp"`
2. Add `"files": ["dist", "README.md"]` so `dist/` is packed despite `.gitignore`
3. Add `"license": "MIT"` (or match repo preference if different)
4. Add `"repository"` pointing at `https://github.com/grigoreo-dev/otask-mcp.git`
5. Keep existing `bin`, scripts, dependencies

Optional but useful: `"publishConfig": { "access": "public" }` so access is not only a CLI flag.

## One-time npm Trusted Publisher setup

On [npmjs.com](https://www.npmjs.com/) (owner of org/user `grigoreo-dev`):

1. Ensure scope `@grigoreo-dev` exists and the GitHub account can publish under it
2. Configure **Trusted Publisher** for package `@grigoreo-dev/otask-mcp`:
   - Repository: `grigoreo-dev/otask-mcp`
   - Workflow filename: `publish.yml`
   - Environment: leave empty
3. First publish of a new package name can be done entirely via Trusted Publisher once configured; if npm requires a seed publish, do one local `npm publish --access public` with a short-lived token, then rely on OIDC only

No `NPM_TOKEN` GitHub secret in the steady state.

## Release procedure (after implementation)

```bash
# after version bump in package.json is committed on main
git tag v1.2.0
git push origin v1.2.0
# Actions runs publish.yml → package on npm
```

## Error handling

| Failure | Behavior |
|---------|----------|
| Tests fail | Job fails; no publish |
| Build fails | Job fails; no publish |
| Tag ≠ package.json version | Job fails; no publish |
| OIDC / Trusted Publisher misconfigured | `npm publish` fails with auth error |
| Version already on npm | `npm publish` fails (expected; bump version + new tag) |

## Testing / verification

- `npm pack --dry-run` locally after `files` change: must list `dist/**` and bins
- After first successful Action: `npm view @grigoreo-dev/otask-mcp version`
- Smoke: `npx @grigoreo-dev/otask-mcp --help` or process starts (stdio expects env; exit without credentials is OK if documented)

## Out of scope docs

README may later document install via scoped name; not required for this design to ship CI.

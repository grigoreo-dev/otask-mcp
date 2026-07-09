# npm Publish via GitHub Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish scoped package `@grigoreo-dev/otask-mcp` to npm on push of `v*` tags via OIDC Trusted Publisher.

**Architecture:** Tag-driven GitHub Actions workflow builds and tests with Bun, publishes with npm + OIDC provenance. `package.json` renames to scoped name and declares `files` so `dist/` ships despite `.gitignore`.

**Tech Stack:** GitHub Actions, Bun, Node 22, npm Trusted Publishing (OIDC), TypeScript `tsc` build

## Global Constraints

- Package name: `@grigoreo-dev/otask-mcp` (exact)
- Trigger: push tags matching `v*` only
- Auth: OIDC Trusted Publisher — no `NPM_TOKEN` secret
- Publish flags: `--access public --provenance`
- Version gate: tag without leading `v` must equal `package.json` version
- Workflow file name for Trusted Publisher config: `publish.yml`
- Bin names stay unscoped: `otask-mcp`, `otask-mcp-http`
- Do not commit `dist/` to git; pack via `"files": ["dist", "README.md"]`

## File map

| File | Responsibility |
|------|----------------|
| `package.json` | Scoped name, `files`, `publishConfig`, `repository`, `license` |
| `.github/workflows/publish.yml` | CI: test, build, version assert, npm publish |
| `README.md` | Install/usage with scoped package name (minimal) |

---

### Task 1: package.json for scoped public publish

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: npm package identity `@grigoreo-dev/otask-mcp@1.2.0` with packable `dist/` and public access

- [ ] **Step 1: Update package.json fields**

Set / ensure these keys (keep existing `version`, `bin`, `scripts`, `dependencies`, `devDependencies`, `engines`, `type`, `main`, `description`):

```json
{
  "name": "@grigoreo-dev/otask-mcp",
  "version": "1.2.0",
  "description": "MCP server for O!task API — stdio locally, Streamable HTTP for n8n",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "otask-mcp": "dist/index.js",
    "otask-mcp-http": "dist/mcp-http.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/grigoreo-dev/otask-mcp.git"
  },
  "license": "MIT",
  "scripts": { "...keep existing..." },
  "engines": { "bun": ">=1.1.0" },
  "dependencies": { "...keep..." },
  "devDependencies": { "...keep..." }
}
```

- [ ] **Step 2: Build and dry-run pack**

```bash
bun run build
npm pack --dry-run
```

Expected: tarball lists include `package/dist/index.js`, `package/dist/mcp-http.js`, `package/README.md`; package name shows `@grigoreo-dev/otask-mcp`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: scope package as @grigoreo-dev/otask-mcp for npm"
```

---

### Task 2: GitHub Actions publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

**Interfaces:**
- Consumes: `package.json` name/version/files from Task 1
- Produces: CI job that publishes on `v*` tags with OIDC

- [ ] **Step 1: Create workflow file**

Create `.github/workflows/publish.yml` with exact content:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - "v*"

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          registry-url: "https://registry.npmjs.org"

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Test
        run: bun test

      - name: Build
        run: bun run build

      - name: Assert tag matches package.json version
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          PKG="$(node -p "require('./package.json').version")"
          echo "tag=$TAG package=$PKG"
          if [ "$TAG" != "$PKG" ]; then
            echo "Tag version ($TAG) does not match package.json version ($PKG)"
            exit 1
          fi

      - name: Publish
        run: npm publish --access public --provenance
```

- [ ] **Step 2: YAML sanity check**

```bash
test -f .github/workflows/publish.yml
# optional if actionlint installed:
# actionlint .github/workflows/publish.yml
```

Expected: file exists; no secrets referenced.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: publish @grigoreo-dev/otask-mcp on v* tags via OIDC"
```

---

### Task 3: README install note + human Trusted Publisher checklist

**Files:**
- Modify: `README.md` (top section after title)

**Interfaces:**
- Consumes: package name `@grigoreo-dev/otask-mcp`

- [ ] **Step 1: Add install section after intro paragraph**

Insert after the first paragraph of `README.md`:

```markdown
## Установка

```bash
npm i -g @grigoreo-dev/otask-mcp
# или: npx @grigoreo-dev/otask-mcp
# HTTP: npx otask-mcp-http   # bin name stays unscoped
```

Публикация на npm: push tag `vX.Y.Z` (версия в tag = `package.json`). CI: `.github/workflows/publish.yml` (OIDC Trusted Publisher, без `NPM_TOKEN`).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: install via @grigoreo-dev/otask-mcp and tag publish"
```

---

### Task 4: Push main + first release tag (operator)

**Files:** none (git/npm ops)

**Interfaces:**
- Consumes: Tasks 1–3 on `main`

- [ ] **Step 1: Push commits**

```bash
git push origin main
```

- [ ] **Step 2: Configure Trusted Publisher on npmjs.com (manual, once)**

On npm (owner of `@grigoreo-dev`):

1. Package: `@grigoreo-dev/otask-mcp` (create / trusted publishing for new package if UI allows)
2. Repository: `grigoreo-dev/otask-mcp`
3. Workflow: `publish.yml`
4. Environment: empty

- [ ] **Step 3: Tag and push first version**

```bash
# ensure package.json version is 1.2.0
git tag v1.2.0
git push origin v1.2.0
```

- [ ] **Step 4: Verify**

```bash
# after Actions job succeeds
npm view @grigoreo-dev/otask-mcp version
# Expected: 1.2.0
```

If OIDC fails: fix Trusted Publisher settings and re-run failed job, or re-push tag after delete (prefer re-run job).

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Name `@grigoreo-dev/otask-mcp` | Task 1 |
| Trigger `v*` tags | Task 2 |
| OIDC / no NPM_TOKEN | Task 2 permissions + publish step |
| `--access public --provenance` | Task 2 |
| Version tag == package.json | Task 2 assert step |
| `files` includes dist | Task 1 |
| Trusted Publisher one-time setup | Task 4 |
| Release procedure tag push | Task 4 |
| README optional install | Task 3 |

No placeholders remaining.

# GitHub PR Pipeline Implementation Plan (otask-mcp)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a padloc-style GitHub Flow PR pipeline for otask-mcp: required Bun CI (lint/build/unit), conventional PR titles, Biome, contributor scaffolding, Dependabot, and advisory AI review configs — without changing tag-based npm publish.

**Architecture:** One feature branch ships all repository files. CI uses Bun + Biome (2-space). Required checks are `lint`, `build`, `unit`, and `PR Title`. CodeRabbit/Cubic are config-only (apps installed manually). Branch protection is documented in the existing UI checklist, not automated.

**Tech Stack:** GitHub Actions, Bun ≥1.1, Biome 2.5.3 (`@biomejs/biome`), TypeScript `tsc`, `bun test`, CodeRabbit, Cubic, Dependabot, CODEOWNERS, conventional PR titles.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-github-pr-pipeline-design.md`
- UI checklist already exists: `docs/superpowers/specs/2026-07-10-github-pr-pipeline-ui-checklist.md` (do not rewrite unless fixing errors)
- Repository artifacts MUST be English-only
- GitHub Flow only (`main` + short-lived branches)
- Required checks: `lint`, `build`, `unit`, `PR Title`
- No `e2e.yml`
- Do **not** modify `.github/workflows/publish.yml`
- Biome indent: **2 spaces** (match existing sources)
- AI review is advisory only (not required status checks)
- Do not configure branch protection via committed files
- Owner handle for CODEOWNERS: `@grigoreo-dev`
- Repo: `grigoreo-dev/otask-mcp`

## File Structure

| File | Responsibility |
|------|----------------|
| `biome.json` | Formatter/linter config (2-space) |
| `package.json` | Add `lint`/`format` scripts + `@biomejs/biome` |
| `bun.lockb` | Lockfile after Biome install |
| `.github/workflows/ci.yml` | Required jobs: lint, build, unit |
| `.github/workflows/pr-title.yml` | Conventional PR title check |
| `.github/CODEOWNERS` | Request `@grigoreo-dev` review |
| `.github/pull_request_template.md` | PR checklist |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug template |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Feature template |
| `.github/ISSUE_TEMPLATE/config.yml` | Disable blank issues + security link |
| `.github/dependabot.yml` | Weekly npm + github-actions |
| `.coderabbit.yaml` | Advisory CodeRabbit defaults |
| `cubic.yaml` | Advisory Cubic defaults |
| `CONTRIBUTING.md` | Contributor guide (Bun) |
| `src/**`, `tests/**`, etc. | One-time Biome format/lint fixes |

Unchanged:

- `.github/workflows/publish.yml`
- Design + UI checklist under `docs/superpowers/specs/`

---

### Task 1: Add Biome tooling and make the tree clean

**Files:**
- Create: `biome.json`
- Modify: `package.json`
- Modify: `bun.lockb` (via install)
- Modify: source/test files as needed by `biome check --write`

**Interfaces:**
- Produces: scripts `lint` = `biome check .`, `format` = `biome check --write .`
- Produces: clean `bun run lint` exit 0

- [ ] **Step 1: Create branch**

```bash
git checkout main
git pull --ff-only origin main 2>/dev/null || true
git checkout -b chore/github-pr-pipeline
```

- [ ] **Step 2: Install Biome 2.5.3**

```bash
bun add -d @biomejs/biome@2.5.3
```

If install fails on exact pin, run `npm view @biomejs/biome version`, install that 2.x version, and use the same version in `$schema` below.

- [ ] **Step 3: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.3/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": [
      "**",
      "!**/node_modules",
      "!**/dist",
      "!**/bun.lockb",
      "!**/package-lock.json",
      "!**/.superpowers",
      "!**/docs/superpowers",
      "!**/.worktrees",
      "!**/.codegraph"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "es5"
    }
  },
  "json": {
    "formatter": {
      "indentStyle": "space",
      "indentWidth": 2,
      "lineWidth": 100
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

If Biome 2.x on this machine rejects `files.includes` syntax, use the equivalent ignore pattern supported by the installed version (match padloc/`biome` docs for that version) while keeping the same ignore set.

- [ ] **Step 4: Add scripts to `package.json`**

Keep all existing fields. Add/update scripts:

```json
"scripts": {
  "start": "bun run dist/index.js",
  "start:http": "bun run dist/mcp-http.js",
  "dev": "bun --watch src/index.ts",
  "dev:http": "bun --watch src/mcp-http.ts",
  "build": "tsc",
  "clean": "rm -rf dist",
  "test": "bun test",
  "docs:parse": "bun run scripts/parse-docs.ts",
  "lint": "biome check .",
  "format": "biome check --write ."
}
```

Ensure `devDependencies` includes `"@biomejs/biome": "2.5.3"` (or the installed 2.x pin).

- [ ] **Step 5: Format and fix until lint is green**

```bash
bun run format
bun run lint 2>&1 | tee /tmp/opencode/otask-biome-check.log
```

If `bun run lint` fails:

1. Prefer auto-fixes: `bunx biome check --write .`
2. For real code issues, fix TypeScript/source minimally
3. Only if a recommended rule is high-noise/low-value for this small repo, set that rule to `"off"` in `biome.json` with a short English comment is not supported in JSON — instead document the disable reason in the commit message

Re-run until:

```bash
bun run lint
bun run build
bun test
```

All three exit 0.

- [ ] **Step 6: Commit**

```bash
git add biome.json package.json bun.lockb
git add -u src tests scripts
git status
git commit -m "$(cat <<'EOF'
chore: add Biome lint/format with 2-space style

Match existing otask-mcp indentation; required for PR CI lint job.
EOF
)"
```

---

### Task 2: Add required CI and PR title workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pr-title.yml`
- Do not touch: `.github/workflows/publish.yml`

**Interfaces:**
- Consumes: `bun run lint`, `bun run build`, `bun test`
- Produces: status checks named exactly `lint`, `build`, `unit`, `PR Title`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run Biome check
        run: bun run lint

  build:
    name: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Build TypeScript
        run: bun run build

  unit:
    name: unit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run unit tests
        run: bun test
```

- [ ] **Step 2: Create `.github/workflows/pr-title.yml`**

```yaml
name: PR Title

on:
  pull_request:
    types:
      - opened
      - edited
      - reopened
      - synchronize

permissions:
  contents: read
  pull-requests: read

jobs:
  pr-title:
    name: PR Title
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            docs
            chore
            ci
            test
            refactor
            build
            perf
            revert
          requireScope: false
```

- [ ] **Step 3: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('.github/workflows/pr-title.yml')); print('workflows yaml ok')"
```

Expected: `workflows yaml ok`

If PyYAML is missing: `python3 -c "import json,sys; ..."` is not enough for YAML — install with `pip install pyyaml` or use `node -e` with a YAML parser. Alternative:

```bash
bun -e "const fs=require('fs'); for (const f of ['.github/workflows/ci.yml','.github/workflows/pr-title.yml']) { if(!fs.existsSync(f)||!fs.readFileSync(f,'utf8').includes('name:')) throw new Error(f); } console.log('workflows present')"
```

- [ ] **Step 4: Confirm publish.yml untouched**

```bash
git diff -- .github/workflows/publish.yml
```

Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/pr-title.yml
git commit -m "$(cat <<'EOF'
ci: add PR CI (lint/build/unit) and conventional PR titles

Bun-based required checks; leave tag publish workflow unchanged.
EOF
)"
```

---

### Task 3: CODEOWNERS, PR template, issue templates

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

**Interfaces:**
- Produces: English-only contributor prompts aligned with Bun commands

- [ ] **Step 1: Create `.github/CODEOWNERS`**

```text
* @grigoreo-dev
```

- [ ] **Step 2: Create `.github/pull_request_template.md`**

```markdown
## Summary

<!-- Describe the change in 1-3 sentences. -->

## What changed

-

## Testing

<!-- List the commands you ran and the result. -->

- [ ] `bun run lint`
- [ ] `bun run build`
- [ ] `bun test`
- [ ] Other:

## Checklist

- [ ] The PR title follows the conventional format (`feat:`, `fix:`, `docs:`, `chore:`, etc.).
- [ ] All repository artifacts are in English.
- [ ] Documentation was updated where needed.
- [ ] AI review comments were read and either addressed or resolved.
- [ ] Follow-up work is listed explicitly, if any.
```

- [ ] **Step 3: Create `.github/ISSUE_TEMPLATE/bug_report.md`**

```markdown
---
name: Bug report
about: Report a reproducible problem
title: ""
labels: bug
assignees: ""
---

## Summary

<!-- What is broken? -->

## Steps to reproduce

1.
2.
3.

## Expected behavior

<!-- What did you expect to happen? -->

## Actual behavior

<!-- What happened instead? -->

## Environment

- Mode: stdio / HTTP gateway / HTTP passthrough
- Bun version:
- Operating system:
- Package version (`@grigoreo-dev/otask-mcp`):

## Logs or screenshots

<!-- Paste logs or attach screenshots if useful. Remove secrets (OTASK_*, MCP_AUTH_TOKEN) before posting. -->
```

- [ ] **Step 4: Create `.github/ISSUE_TEMPLATE/feature_request.md`**

```markdown
---
name: Feature request
about: Suggest an improvement or new capability
title: ""
labels: enhancement
assignees: ""
---

## Problem

<!-- What user problem should this solve? -->

## Proposed solution

<!-- What should change? -->

## Alternatives considered

<!-- What other approaches did you consider? -->

## Scope

- MCP tool surface / HTTP transport / docs / CI
- Breaking change: yes / no / unknown

## Additional context

<!-- Links, examples, or related issues. -->
```

- [ ] **Step 5: Create `.github/ISSUE_TEMPLATE/config.yml`**

```yaml
blank_issues_enabled: false
contact_links:
  - name: Security issue
    url: https://github.com/grigoreo-dev/otask-mcp/security/advisories/new
    about: Please report security vulnerabilities privately.
```

- [ ] **Step 6: Commit**

```bash
git add .github/CODEOWNERS .github/pull_request_template.md .github/ISSUE_TEMPLATE
git commit -m "$(cat <<'EOF'
chore: add CODEOWNERS, PR template, and issue templates

English-only contributor scaffolding aligned with Bun workflow.
EOF
)"
```

---

### Task 4: Dependabot and AI review configs

**Files:**
- Create: `.github/dependabot.yml`
- Create: `.coderabbit.yaml`
- Create: `cubic.yaml`

**Interfaces:**
- Produces: weekly update PRs; advisory AI configs with `skip-ai-review` escape hatch

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2

updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 5
    groups:
      npm-minor-and-patch:
        update-types:
          - "minor"
          - "patch"
    commit-message:
      prefix: "chore"
      include: "scope"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:30"
    groups:
      github-actions:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"
    commit-message:
      prefix: "ci"
      include: "scope"
```

- [ ] **Step 2: Create `.coderabbit.yaml`**

```yaml
# yaml-language-server: $schema=https://coderabbit.ai/integrations/schema.v2.json
language: "en-US"
early_access: false

reviews:
  profile: "chill"
  request_changes_workflow: false
  high_level_summary: true
  poem: false
  review_status: true
  review_details: false
  auto_review:
    enabled: true
    drafts: false
    labels:
      - "!skip-ai-review"
  path_filters:
    - "!**/node_modules/**"
    - "!**/bun.lockb"
    - "!**/package-lock.json"
    - "!docs/superpowers/**"
    - "!**/.superpowers/**"
    - "!**/dist/**"

chat:
  auto_reply: true
```

- [ ] **Step 3: Create `cubic.yaml`**

```yaml
# yaml-language-server: $schema=https://cubic.dev/schema/cubic-repository-config.schema.json
version: 1

reviews:
  enabled: true
  sensitivity: medium
  incremental_commits: true
  architecture_diagrams: false
  resolve_threads_when_addressed: true
  custom_instructions: |
    Review all repository artifacts in English only. Flag any non-English text
    in committed files. This repository is a Bun TypeScript MCP server for the
    O!task API (stdio + Streamable HTTP). Do not suggest padloc, pnpm, Vite,
    or unrelated stack migrations as incidental changes.
  ignore:
    files:
      - bun.lockb
      - package-lock.json
      - dist/**
      - docs/superpowers/**
      - .superpowers/**
    pr_labels:
      - skip-ai-review

pr_descriptions:
  generate: true
  instructions: |
    Keep PR descriptions concise and in English. Include testing evidence and
    call out deferred follow-up work explicitly.
```

- [ ] **Step 4: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/dependabot.yml')); yaml.safe_load(open('.coderabbit.yaml')); yaml.safe_load(open('cubic.yaml')); print('config yaml ok')"
```

Expected: `config yaml ok`

- [ ] **Step 5: Commit**

```bash
git add .github/dependabot.yml .coderabbit.yaml cubic.yaml
git commit -m "$(cat <<'EOF'
chore: add Dependabot and advisory AI review configs

CodeRabbit and Cubic are non-blocking; weekly npm and Actions updates.
EOF
)"
```

---

### Task 5: CONTRIBUTING.md and README pointer

**Files:**
- Create: `CONTRIBUTING.md`
- Modify: `README.md` (short Contributing section if missing)

**Interfaces:**
- Produces: documented local + PR workflow for Bun

- [ ] **Step 1: Create `CONTRIBUTING.md`**

```markdown
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
```

- [ ] **Step 2: Add a Contributing pointer to `README.md`**

If README has no Contributing section, append near the end (before any license footer if present):

```markdown
## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, PR checks, and the release tag flow.
```

Keep the rest of the README intact. If a Contributing section already exists, update the link only.

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md README.md
git commit -m "$(cat <<'EOF'
docs: add CONTRIBUTING guide for Bun GitHub Flow

Document required checks, English-only policy, and tag publish.
EOF
)"
```

---

### Task 6: Final verification

**Files:**
- None new; verify entire branch

- [ ] **Step 1: Run full local gate**

```bash
bun install --frozen-lockfile
bun run lint
bun run build
bun test
```

Expected: all exit 0.

- [ ] **Step 2: Confirm file set**

```bash
test -f .github/workflows/ci.yml
test -f .github/workflows/pr-title.yml
test -f .github/workflows/publish.yml
test -f .github/CODEOWNERS
test -f .github/pull_request_template.md
test -f .github/ISSUE_TEMPLATE/bug_report.md
test -f .github/ISSUE_TEMPLATE/feature_request.md
test -f .github/ISSUE_TEMPLATE/config.yml
test -f .github/dependabot.yml
test -f .coderabbit.yaml
test -f cubic.yaml
test -f biome.json
test -f CONTRIBUTING.md
test -f docs/superpowers/specs/2026-07-10-github-pr-pipeline-ui-checklist.md
echo "file set ok"
```

Expected: `file set ok`

- [ ] **Step 3: Confirm publish.yml has no local modifications vs main base**

```bash
git log --oneline main..HEAD -- .github/workflows/publish.yml
git diff main -- .github/workflows/publish.yml
```

Expected: no commits and empty diff for `publish.yml`.

- [ ] **Step 4: Show summary for PR**

```bash
git log --oneline main..HEAD
git diff --stat main...HEAD
```

- [ ] **Step 5: Optional — open PR (only if remote is configured and user asked)**

```bash
git push -u origin chore/github-pr-pipeline
gh pr create --base main --head chore/github-pr-pipeline \
  --title "ci: add GitHub PR pipeline (Bun, Biome, templates)" \
  --body "$(cat <<'EOF'
## Summary

Add padloc-style GitHub Flow pipeline for otask-mcp: Biome lint, required CI jobs, conventional PR titles, contributor scaffolding, Dependabot, and advisory AI review configs.

## Testing

- [x] `bun run lint`
- [x] `bun run build`
- [x] `bun test`

## Follow-up (manual)

After merge, apply `docs/superpowers/specs/2026-07-10-github-pr-pipeline-ui-checklist.md` (branch protection + CodeRabbit/Cubic install).
EOF
)"
```

Do **not** push or open a PR unless the user explicitly asked.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `ci.yml` lint/build/unit with Bun | Task 2 |
| `pr-title.yml` conventional types | Task 2 |
| Biome 2-space + scripts | Task 1 |
| CODEOWNERS `@grigoreo-dev` | Task 3 |
| PR + issue templates | Task 3 |
| Dependabot npm + actions | Task 4 |
| CodeRabbit + Cubic advisory | Task 4 |
| CONTRIBUTING.md Bun workflow | Task 5 |
| English-only artifacts | Tasks 3–5 content |
| No e2e.yml | (omitted by design) |
| publish.yml unchanged | Task 2 step 4, Task 6 step 3 |
| UI checklist | Already on main from design commit |

## Self-review notes

- No placeholders left in steps.
- Job names match branch-protection names in the UI checklist (`lint`, `build`, `unit`, `PR Title`).
- Biome version pin matches padloc (`2.5.3`) unless install forces another 2.x.

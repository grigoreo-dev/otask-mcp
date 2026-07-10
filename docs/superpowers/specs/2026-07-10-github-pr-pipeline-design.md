# GitHub PR Pipeline Design (otask-mcp)

**Date:** 2026-07-10  
**Repo:** `grigoreo-dev/otask-mcp`  
**Status:** Approved design, ready for implementation planning  
**Reference:** padloc `docs/superpowers/specs/2026-07-08-github-pr-pipeline-design.md`

## Summary

Adopt a mature GitHub Flow PR pipeline for otask-mcp, aligned with the padloc
fork workflow. The owner maintains the project alone but wants disciplined
checks, contributor scaffolding, and advisory AI review before outside
contributors arrive.

Runtime and package tooling differ from padloc:

| Concern | padloc | otask-mcp |
|---------|--------|-----------|
| Package manager | pnpm | Bun |
| Lint/format | Biome | Biome (new; 2-space indent to match existing code) |
| Unit tests | `pnpm test` | `bun test` |
| Build | multi-package builds | `tsc` (`bun run build`) |
| Publish | separate release workflows | existing `publish.yml` on `v*` tags (unchanged) |
| E2E | optional non-blocking | **none** (skip `e2e.yml`) |

All repository artifacts must be in English. Conversation with the owner may use
the owner's preferred language; committed files, commit messages, templates, and
PR/issue text must be English.

## Goals

- Require pull requests for changes to `main`.
- Gate merges on fast checks: Biome lint, TypeScript build, unit tests, PR title.
- Keep npm publish on tag push via existing OIDC Trusted Publisher workflow.
- Add advisory AI review (CodeRabbit + Cubic), not as required status checks.
- Add contributor scaffolding: PR template, issue templates, `CONTRIBUTING.md`,
  `CODEOWNERS`, Dependabot.
- Document GitHub UI settings that cannot live in the repo (branch protection,
  merge strategy, app install).

## Non-goals

- No `develop` branch or GitFlow.
- No required AI approval.
- No E2E workflow (no suite yet).
- No changes to tag-based npm `publish.yml` behavior.
- No automation that stores a personal GitHub token in the repository.
- No Dependabot automerge.

## Current repository state

Present:

- `.github/workflows/publish.yml` — tag `v*` → test → build → npm publish (OIDC)
- `package.json` scripts: `build`, `test`, `start`, `start:http`, `docs:parse`
- Bun lockfile (`bun.lockb`), TypeScript, unit tests under `tests/`

Missing:

- PR CI (`ci.yml`)
- PR title check
- CODEOWNERS, PR/issue templates
- Dependabot
- Biome / lint scripts
- CodeRabbit / Cubic config
- `CONTRIBUTING.md`
- Branch-protection UI setup guide

## Architecture

Three layers (same model as padloc).

### Layer 1 — Repository files (one implementation PR)

- `.github/workflows/ci.yml` — required fast checks
- `.github/workflows/pr-title.yml` — conventional PR titles
- `.github/CODEOWNERS`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/dependabot.yml`
- `.coderabbit.yaml`
- `cubic.yaml`
- `CONTRIBUTING.md`
- `biome.json`
- `package.json` — add `lint` / `format` scripts and `@biomejs/biome` devDependency
- Format existing sources once so `biome check` is clean
- `docs/superpowers/specs/2026-07-10-github-pr-pipeline-ui-checklist.md`

Do **not** modify `.github/workflows/publish.yml` except if a follow-up explicitly
needs it (out of scope).

### Layer 2 — GitHub Apps (manual)

- CodeRabbit for `grigoreo-dev/otask-mcp`
- Cubic.dev for `grigoreo-dev/otask-mcp`

Both comment on PRs; neither is a required status check.

### Layer 3 — GitHub repository settings (manual after Layer 1 merges)

- Protect `main`
- Require PR, 1 approval, code owner review, dismiss stale approvals
- Required status checks: `lint`, `build`, `unit`, `PR Title`
- Require branches up to date; require conversation resolution
- Squash merges only
- Allow admin bypass while solo

## CI design

### Required fast checks — `ci.yml`

Triggers:

- `pull_request`
- `push` to `main`

Global:

- `concurrency` cancels older runs for the same PR/ref
- Bun via `oven-sh/setup-bun@v2`
- Install: `bun install --frozen-lockfile`

Jobs (job `name` fields must match branch-protection check names):

1. **`lint`**
   - `bun run lint` → `biome check .`

2. **`build`**
   - `bun run build` → `tsc`

3. **`unit`**
   - `bun test`

These become required checks in branch protection after they have run on `main`.

### PR title — `pr-title.yml`

Use `amannn/action-semantic-pull-request@v5` with types:

`feat`, `fix`, `docs`, `chore`, `ci`, `test`, `refactor`, `build`, `perf`, `revert`

`requireScope: false`. This check is required.

### E2E

None. Revisit if an integration/smoke suite is added later.

### Publish (existing, unchanged)

`.github/workflows/publish.yml` remains the only release path: tag `v*` → test →
build → version assert → `npm publish` (OIDC or optional `NPM_TOKEN`).

## Biome design

- Add `@biomejs/biome` as a devDependency (Biome 2.x, same major as padloc).
- `biome.json`:
  - VCS integration with git ignore
  - Ignore: `dist/`, `node_modules/`, `docs/superpowers/**`, `.superpowers/**`,
    `bun.lockb`, lockfiles
  - Formatter: **2-space** indent (match existing otask-mcp sources; not padloc’s 4)
  - Linter: recommended rules; tune only if first format/check surfaces noise
- Scripts:
  - `"lint": "biome check ."`
  - `"format": "biome check --write ."`
- Implementation applies format once so CI is green without a second cleanup PR.

## AI review design

### CodeRabbit (`.coderabbit.yaml`)

- Language: `en-US`
- Profile: chill
- `request_changes_workflow: false`
- Auto-review non-draft PRs; skip when label `skip-ai-review`
- Path filters ignore: lockfiles, `dist/**`, `docs/superpowers/**`, `.superpowers/**`

### Cubic (`cubic.yaml`)

- Reviews enabled, medium sensitivity, incremental commits
- Ignore same generated/internal paths; label `skip-ai-review`
- Custom instructions: English-only artifacts; this is a Bun TypeScript MCP server
  for O!task — do not suggest padloc/pnpm/Vite migrations or unrelated stack changes

### Policy

- Comments are advisory; not required status checks
- Resolve or address relevant feedback before merge
- Reassess dual AI reviewers after ~1 month if noise is high

## Contributor scaffolding

### CODEOWNERS

```text
* @grigoreo-dev
```

### PR template

Sections: Summary, What changed, Testing checklist (`bun run lint`, `bun run build`,
`bun test`), general checklist (conventional title, English artifacts, docs, AI
review).

### Issue templates

- Bug: summary, repro steps, expected/actual, environment (Bun version, mode
  stdio/HTTP), logs (no secrets)
- Feature: problem, proposed solution, alternatives, scope (breaking?)
- `config.yml`: blank issues disabled; security contact via GitHub advisories for
  `grigoreo-dev/otask-mcp`

### CONTRIBUTING.md

- English-only policy
- Prerequisites: Bun ≥ 1.1
- Setup: `bun install`
- Branch names: `feat/`, `fix/`, `docs/`, `chore/`, `ci/`
- Conventional commits / PR titles
- Local validation: `bun run lint`, `bun run build`, `bun test`
- PR process: feature branch → template → CI → AI feedback → squash merge
- Release note: publish is tag-driven (`vX.Y.Z` must match `package.json`)

## Dependabot

`.github/dependabot.yml`:

- `npm` at `/`, weekly Monday, group minor+patch, open-PR limit 5, prefix `chore`
- `github-actions` at `/`, weekly, group all minor+patch, prefix `ci`
- No automerge

Note: ecosystem is `npm` for package manifests even though the project installs
with Bun; Dependabot still updates `package.json` / lockfile appropriately.

## GitHub UI checklist

Separate file:
`docs/superpowers/specs/2026-07-10-github-pr-pipeline-ui-checklist.md`

Owner applies after Layer 1 is on `main` and checks have run once.

## Acceptance criteria

- `main` uses GitHub Flow with PR-based merges (after UI setup).
- Required checks available: `lint`, `build`, `unit`, `PR Title`.
- `bun run lint`, `bun run build`, and `bun test` pass in CI and locally.
- Biome is configured with 2-space formatting and a clean tree.
- CodeRabbit and Cubic configs present; apps installed manually via checklist.
- AI review is not a required status check.
- Templates and `CONTRIBUTING.md` are English-only.
- Dependabot opens weekly npm and Actions update PRs.
- Existing tag publish workflow still works unchanged.

## Risks and follow-ups

- First Biome format may touch many files; keep it in the same pipeline PR so
  history stays coherent.
- Solo admin bypass is practical now; revisit when a second maintainer joins.
- Dependabot + Bun lockfile: verify the first Dependabot PR updates `bun.lockb`
  correctly; if not, document a manual `bun install` follow-up step.
- Dual AI reviewers may duplicate comments; drop one after a trial period if needed.
- Optional later: lightweight HTTP `/health` smoke job (still non-blocking).

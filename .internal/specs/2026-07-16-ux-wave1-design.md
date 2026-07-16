# Design: UX Wave 1 — landing, OAuth wizard, icon, list workspaces, disclaimer

**Date:** 2026-07-16  
**Status:** approved (brainstorming)  
**Delivery:** Wave PR (worker UX + core tools + docs; may land as layered commits/PRs under one plan)  
**Out of scope (Wave 2+):** human `#N` task numbers, compact comments, `otask_get_file`, search, MCP UI cards, deep slug audit beyond a short truth doc

## Goals

Public Cloudflare Worker + agent UX should be self-explanatory and usable without pasting UUIDs from the panel URL bar.

**Success criteria**

1. `GET https://…/` returns a mini landing (not 404) explaining remote MCP, how to connect `/mcp`, and an unofficial disclaimer.
2. OAuth Connect is a **2-step wizard**: email/password → dynamic workspace/project selects (no free-text slug fields for defaults/allow-lists).
3. Client/browser icon for the Worker is the **vendored O!task** mark (not the site icon from `grigoreo.dev`).
4. Agents can discover workspaces via `otask_list_workspaces` (`GET /api/v1/teams`).
5. If the user has **exactly one** workspace and no default is set, tools **auto-use** that workspace.
6. Missing-`ws_slug` errors tell the agent to call `otask_list_workspaces` (or re-auth with a default).
7. Disclaimer appears on landing, login wizard, and README: this project is **not** affiliated with / official O!task product.

## Non-goals (Wave 1)

- Changing allow-list **semantics** (still slug/id CSV in session props under the hood).
- Weakening security (password still never stored; token only in encrypted OAuth props after grant).
- MCP Apps / Claude “cards” UI.
- Board human numbers `#633`, file download tool, FTS search, comment compact mode.

## Ranking (full backlog, for later)

| Rank | Item | Wave |
|------|------|------|
| 1 | Landing `/` + disclaimer | 1 |
| 2 | OAuth dynamic 2-step form | 1 |
| 3 | O!task icon | 1 |
| 4 | `list_workspaces` + single-ws auto-default | 1 |
| 5 | Slugs truth (short doc) | 1 (docs only) |
| 6 | Human `#N` show/search | 2 |
| 7 | Compact comments | 2 |
| 8 | `otask_get_file` | 2 |
| 9 | Search tasks | 2 |
| 10 | MCP cards | 2 |

Also fold in `USAGE-FEEDBACK.md` items into ranks 7–9.

---

## Architecture

### A. Landing + static assets (Worker)

`AuthHandler` (or a thin `defaultHandler` router) today 404s anything except `/authorize`. Extend routing:

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/` | HTML landing (RU primary): what this is, connect URL `…/mcp`, GitHub, **unofficial disclaimer** |
| GET | `/favicon.ico` and/or `/icon.png` | vendored O!task icon bytes (`packages/worker/assets/…`) |
| GET/POST | `/authorize` | existing OAuth entry + **wizard** (below) |
| — | `/mcp` | unchanged (OAuthProvider `apiRoute`) |

No secrets on the landing page. Cache-Control for HTML: short or `no-store` for authorize; icon may be long-cache.

**Icon sourcing:** download/export official O!task mark once, commit under `packages/worker/assets/` (do **not** hotlink `otask.ru` at runtime). Confirm license/branding is acceptable for an unofficial connector; if unclear, use a clearly “MCP connector” badge that still prefers O!task brand colors over grigoreo.dev.

### B. OAuth 2-step wizard (Worker)

**Step 1 — credentials**

- GET `/authorize` → step-1 form: email, password only (+ privacy + disclaimer). No slug text fields.
- POST step 1: `loginOtaskWithPassword` → on success set **signed short-lived cookie**, render step 2.

**Cookie (approved)**

- Name e.g. `otask_mcp_pending`
- Value: payload + HMAC-SHA256 with `USER_ID_PEPPER` (or dedicated secret if we later split; Wave 1 reuses pepper with a fixed context string prefix `pending-v1:`)
- Payload fields: `otaskToken`, OAuth request fingerprint (serialized fields needed to re-run `completeAuthorization`), `exp` (unix, **≤ 5 minutes**), optional `email` hash only if needed for display — prefer **not** storing email plaintext
- Flags: `HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=300`
- Never log cookie value; never put token in HTML/query

**Step 2 — scope picks**

- Server reads cookie, verifies HMAC + exp; on failure → step 1 with error “сессия входа истекла”.
- With token: `GET /api/v1/teams` → workspaces; for each selected/default workspace load projects (`listProjects` / existing core API).
- UI:
  - **Default workspace** — required `<select>` (if teams empty → error copy)
  - **Default project** — `<select>` optional, options filtered by default workspace (may be empty)
  - **Allowed workspaces** — multi-select (optional; empty = no allow-list / all)
  - **Allowed projects** — multi-select (optional; empty = no allow-list / all)
- Labels show **human names**; values are **slugs** (and project id if slug missing) written into session props as today (`defaultWs`, `defaultProject`, `allowedWs`, `allowedProjects` CSV).
- POST step 2: re-verify cookie → build `OtaskSessionProps` → `completeAuthorization` → **clear cookie** → redirect.

**Security notes**

- Password only in step-1 POST body; dropped after login.
- Token in cookie only until grant completes or TTL.
- No allow-list bypass: empty multi-select means *unrestricted* (same as empty text fields today); non-empty means restrict.
- Wizard does not introduce new env credentials on public Worker.

### C. Core: list workspaces + single-ws auto-default

**API (catalog):** `GET /api/v1/teams` — “Получить пространства пользователя” (no `{ws_slug}`).

Add:

- `listWorkspaces` / `listTeams` in `packages/core/src/services/api.ts` + client facade
- Tool **`otask_list_workspaces`**: no args; returns compact `{ id, slug, name, … }` (map whatever teams payload provides; drop huge unused fields)
- `resolveWsSlug` in `scope.ts`:
  1. explicit arg
  2. `scope.defaultWs`
  3. **new:** if neither, call `listWorkspaces`; if **exactly one**, use its slug; if zero/many, throw improved error:
     - `ws_slug is required … Call otask_list_workspaces, then pass ws_slug, or reconnect OAuth with a default workspace.`

Project resolution unchanged except better errors that mention defaults from wizard.

### D. Disclaimer copy (canonical)

Short line (RU + EN where docs are EN):

> **Unofficial.** otask-mcp is an independent open-source MCP connector for the O!task API. Not affiliated with, endorsed by, or part of the O!task product/team.

Place on: landing footer, wizard privacy block, README top + privacy section, worker package README.

### E. Slugs truth (docs only in Wave 1)

Short `docs/SLUGS.md` (or README subsection):

- `ws_slug` / `project_slug` / `task_slug` are UUIDs from `panel.otask.ru` URLs and API fields `slug`.
- Defaults and allow-lists accept those slugs; projects also accept numeric id in allow-list/default_project.
- Human board numbers `#633` are **not** slugs (Wave 2).
- After wizard, users rarely type slugs; agents should prefer `list_*` tools.

### F. Testing

| Area | Tests |
|------|--------|
| Landing | GET `/` 200, contains disclaimer + `/mcp` |
| Icon | GET favicon returns non-empty image content-type |
| Wizard | step1 HTML; step2 after mock login lists options; bad/expired cookie rejected; complete path clears cookie (unit with mock OAuthHelpers) |
| list_workspaces | maps teams response |
| resolveWsSlug | 1 team auto; 0/2+ error with hint |
| Login page tests | extend existing `tests/worker-login-page.test.ts` |

### G. Docs / deploy

- README: remote MCP section mentions landing URL, wizard steps, new tool, disclaimer.
- No change to CF Builds deploy path required if assets are imported/bundled by Wrangler from `packages/worker`.
- After merge to `main`, CF dashboard build deploys Worker.

## Data flow (wizard)

```
Client OAuth → GET /authorize (step1)
  → POST email/password → O!task login
  → Set signed cookie (token + oauth fingerprint, 5m)
  → HTML step2 (teams + projects via API)
  → POST selects → verify cookie → completeAuthorization(props)
  → Clear cookie → redirect client with code
  → /mcp tools use encrypted props (token + defaults + allow-lists)
```

## Error handling

| Case | UX |
|------|-----|
| Bad password | step1 error, no cookie |
| Cookie missing/bad/expired | step1 error |
| Teams empty | step2 message: create workspace in O!task |
| completeAuthorization fails | step2 error, cookie kept until exp if retryable |
| Tool no ws | auto single-ws or error + `otask_list_workspaces` hint |

## Trade-offs (accepted)

| Decision | Trade-off |
|----------|-----------|
| Cookie carries token 5m | Brief window if XSS on authorize origin; mitigated by HttpOnly + short TTL + Path=/authorize |
| Reuse `USER_ID_PEPPER` for HMAC | One secret less to ops; rotation invalidates pending cookies and userIds together |
| Auto single-ws | Slight behavior change vs hard-fail; only when unambiguous |
| Multi-select → CSV props | Keeps existing guard code; no session schema migration |

## Implementation sketch (for plan, not code yet)

1. Worker router: `/`, assets, wizard pages/handlers.
2. Pending-cookie helper (sign/verify/clear).
3. Core `listTeams` + tool + `resolveWsSlug` auto.
4. Vendored icon asset.
5. Disclaimer strings shared or duplicated carefully in HTML builders.
6. Tests + README + SLUGS.md.
7. Ship via main → CF Builds.

## Open items resolved in brainstorming

- Packaging: **Wave PR**
- OAuth inter-step state: **signed cookie**
- Landing: **minimal**
- list_ws: **tool + single-ws auto-default**
- Security pack: **cookie flags + unit tests; not binding client_id in v1**

## Wave 2 pointer

Human `#N`, compact comments, `get_file`, search, MCP cards — separate design after Wave 1 ships.

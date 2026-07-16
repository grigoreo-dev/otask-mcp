# Design: UX Wave 1 — landing, OAuth wizard, icon, list workspaces, disclaimer

**Date:** 2026-07-16  
**Status:** approved (brainstorming) + stress-tested  
**Delivery:** Wave PR (worker UX + core tools + docs; may land as layered commits/PRs under one plan)  
**Out of scope (Wave 2+):** human `#N` task numbers, compact comments, `otask_get_file`, search, MCP UI cards, deep slug audit beyond a short truth doc

**Terminology (UI copy):** O!task **пространство** = API team / code `workspace`. User-facing RU strings use «пространство»; code/props keep `ws` / `workspace` / `defaultWs`.

## Goals

Public Cloudflare Worker + agent UX should be self-explanatory and usable without pasting UUIDs from the panel URL bar.

**Success criteria**

1. `GET https://…/` returns a mini landing (not 404) explaining remote MCP, how to connect `/mcp`, and an unofficial disclaimer.
2. OAuth Connect is a **2-step wizard**: email/password → dynamic пространство/project selects (no free-text slug fields for defaults/allow-lists). Auth first, then scope picks.
3. Client/browser icon for the Worker is the **vendored O!task** mark (not the site icon from `grigoreo.dev`).
4. Agents can discover пространства via `otask_list_workspaces` (`GET /api/v1/teams`).
5. If the user has **exactly one** пространство and no default is set, tools **auto-use** that пространство.
6. Missing-`ws_slug` errors tell the agent to call `otask_list_workspaces` (or re-auth with a default).
7. Disclaimer appears on landing, login wizard, and README: this project is **not** affiliated with / official O!task product.

## Non-goals (Wave 1)

- Changing allow-list **semantics** (still slug/id CSV in session props under the hood).
- Weakening security (password still never stored; token only in encrypted OAuth props after grant — never in HTML/query; pending token only in KV briefly).
- MCP Apps / Claude “cards” UI.
- Board human numbers `#633`, file download tool, FTS search, comment compact mode.
- Post-grant scope settings UI (changing defaults without re-auth) — out of Wave 1.

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

`AuthHandler` is `OAuthProvider` **defaultHandler**. Library routes (`/authorize` entry wiring, `/oauth/*`, well-known, `/mcp`) stay untouched. Extend **only** defaultHandler routing:

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/` | HTML landing (RU primary): what this is, connect URL `…/mcp`, GitHub, **unofficial disclaimer** |
| GET | `/favicon.ico` and/or `/icon.png` | vendored O!task icon bytes (`packages/worker/assets/…`) |
| GET/POST | `/authorize` | existing OAuth entry + **wizard** (below) |
| — | `/mcp` | unchanged (OAuthProvider `apiRoute`) |

No secrets on the landing page. Cache-Control for HTML: short or `no-store` for authorize; icon may be long-cache.

**Icon sourcing:** vendor official O!task mark under `packages/worker/assets/` (do **not** hotlink `otask.ru` at runtime). Brand residual risk accepted for unofficial connector (stress-test).

### B. OAuth 2-step wizard (Worker)

**Step 1 — credentials (auth first)**

- GET `/authorize` → step-1 form: email, password only (+ privacy + disclaimer). No slug text fields.
- POST step 1: `loginOtaskWithPassword` → on success:
  1. Write **pending session** to `OAUTH_KV` (see below)
  2. Set **tiny** signed cookie with only `pendingId`
  3. Render step 2 HTML

**Pending state (approved — KV, not Bearer-in-cookie)**

| Piece | Content |
|-------|---------|
| KV key | e.g. `pending:v1:<pendingId>` |
| KV value | JSON: `otaskToken`, OAuth request **fingerprint** (fields needed to re-run `completeAuthorization`: at least `client_id`, `redirect_uri`, `code_challenge` / state as required by helpers), `exp` (unix, **≤ 5 minutes**) |
| KV TTL | ≤ 300s (CF KV expiration) |
| Cookie name | e.g. `otask_mcp_pending` |
| Cookie value | `pendingId` + HMAC-SHA256 with `USER_ID_PEPPER` + context prefix `pending-v1:` (or `id.hmac`) |
| Cookie flags | `HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=300` |

- Never put token in cookie, HTML, or query.
- Never log token or full cookie.
- On step2 POST success: `completeAuthorization` → **delete** KV key → clear cookie.
- On expiry / bad HMAC / missing KV: step1 with «сессия входа истекла».
- **Fingerprint bind:** step2 must re-bind to the **same** OAuth client request; mismatch → step1 invalid session.

**Step 2 — scope picks (пространства / projects)**

- Verify cookie HMAC → load KV pending → verify `exp` + fingerprint vs current OAuth request.
- With token: `GET /api/v1/teams` → all пространства; **fan-out** `listProjects` for **every** пространство (user choice).
  - Parallel with concurrency cap (e.g. 5).
  - **Partial failure:** if projects fail for one пространство, keep step2; empty project options for that пространство + inline warning — do not fail whole page.
  - Soft warning copy if teams count is large (e.g. > 20): loading may take longer.
- UI labels (RU):
  - **Пространство по умолчанию** — required `<select>` (if teams empty → error: create пространство in O!task)
  - **Проект по умолчанию** — optional `<select>` (all projects across teams, or grouped; values include enough to resolve id/slug)
  - **Разрешённые пространства** — multi-select optional
  - **Разрешённые проекты** — multi-select optional
- Helper text (empty = unrestricted):  
  «Не выбрано = доступ ко всем пространствам/проектам аккаунта. Отметьте пункты, чтобы ограничить.»
- Labels show **human names**; values are **slugs** (and project id if slug missing) → session props as today (`defaultWs`, `defaultProject`, `allowedWs`, `allowedProjects` CSV).
- POST step 2: re-verify cookie + KV + fingerprint → build `OtaskSessionProps` → `completeAuthorization` → delete KV → clear cookie → redirect.

**Security notes**

- Password only in step-1 POST body; dropped after login.
- Token only in KV until grant or TTL; not in cookie.
- Empty multi-select = unrestricted (same as empty text fields today); non-empty = restrict; helper text required.
- Wizard does not introduce new env credentials on public Worker.
- Auto-default single пространство: if user later joins a 2nd team mid-session, tools keep the old implicit single-ws until re-auth (accepted).

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
- UI: «пространство» = workspace/team.

### F. Testing

| Area | Tests |
|------|--------|
| Landing | GET `/` 200, contains disclaimer + `/mcp` |
| Icon | GET favicon returns non-empty image content-type |
| Wizard | step1 HTML; step2 after mock login lists options; bad/expired cookie or missing KV rejected; complete path deletes KV + clears cookie; fingerprint mismatch rejected; partial project fan-out failure still renders step2 |
| list_workspaces | maps teams response |
| resolveWsSlug | 1 team auto; 0/2+ error with hint |
| Login page tests | extend existing `tests/worker-login-page.test.ts` |

### G. Docs / deploy

- README: remote MCP section mentions landing URL, wizard steps, new tool, disclaimer, «пространство» terminology.
- No change to CF Builds deploy path required if assets are imported/bundled by Wrangler from `packages/worker`.
- After merge to `main`, CF dashboard build deploys Worker.

## Data flow (wizard)

```
Client OAuth → GET /authorize (step1)
  → POST email/password → O!task login
  → KV put pending (token + oauth fingerprint, TTL≤5m)
  → Set tiny signed cookie (pendingId only)
  → HTML step2 (all teams + fan-out projects; partial fail OK)
  → POST selects → verify cookie+KV+fingerprint → completeAuthorization(props)
  → Delete KV + clear cookie → redirect client with code
  → /mcp tools use encrypted props (token + defaults + allow-lists)
```

## Error handling

| Case | UX |
|------|-----|
| Bad password | step1 error, no cookie/KV |
| Cookie/KV missing/bad/expired / fingerprint mismatch | step1 error «сессия входа истекла» |
| Teams empty | step2 message: create пространство in O!task |
| One team’s projects fail | step2 still works; warning on that пространство |
| completeAuthorization fails | step2 error; pending kept until TTL if retryable |
| Tool no ws | auto single-ws or error + `otask_list_workspaces` hint |

## Trade-offs (accepted)

| Decision | Trade-off |
|----------|-----------|
| Pending token in OAUTH_KV ≤5m | Operator with CF access can read KV; same trust model as OAuth grant storage; mitigated by short TTL + delete on grant |
| Tiny signed cookie (pendingId) | Safer than Bearer-in-cookie; depends on KV availability |
| Fingerprint bind | Rejects cookie reuse across different OAuth clients/requests |
| Load projects for **all** пространства | Heavier step2; mitigated by parallel + partial failure |
| Empty multi-select = unrestricted | UX surprise risk; mitigated by helper copy |
| Auto single-ws | Slight behavior change vs hard-fail; stale if user joins 2nd team mid-session until re-auth |
| Multi-select → CSV props | Keeps existing guard code; no session schema migration |
| Vendor O!task icon | Brand/ToS residual risk accepted by product owner |
| Reuse `USER_ID_PEPPER` for cookie HMAC | One secret less; rotation invalidates pending + userIds together |

## Implementation sketch (for plan, not code yet)

1. Worker router: `/`, assets, wizard pages/handlers in defaultHandler.
2. Pending KV + signed pendingId cookie helpers (put/get/delete/verify).
3. Core `listTeams` + tool + `resolveWsSlug` auto.
4. Step2: teams + parallel project fan-out with partial failure.
5. Vendored icon asset.
6. Disclaimer + «пространство» copy in HTML builders.
7. Tests + README + SLUGS.md.
8. Ship via main → CF Builds.

## Open items resolved

- Packaging: **Wave PR**
- OAuth inter-step state: **OAUTH_KV pending + tiny signed cookie (pendingId)** — not Bearer-in-cookie
- OAuth fingerprint: **bind** client request fields in KV payload
- Landing + favicon: **defaultHandler / AuthHandler router** (library OAuth routes untouched)
- Projects load: **all пространства**, parallel, partial failure OK
- Empty allow-list: **unrestricted** + helper text
- list_ws: **tool + single-ws auto-default**
- Icon: **vendor O!task mark** (brand risk accepted)
- UI term: **пространство**

## Wave 2 pointer

Human `#N`, compact comments, `get_file`, search, MCP cards — separate design after Wave 1 ships.

---

## Stress Test Results: UX Wave 1

### Resolved Decisions

- Routing `/` + favicon via AuthHandler defaultHandler; do not rewire OAuthProvider library routes — **Agree**
- Cookie XSS residual: prefer server-side pending, not long-lived token in browser — evolved to **KV pending + tiny cookie**
- OAuth fingerprint bind in pending payload — **Agree** (overrides earlier “not binding client_id in v1”)
- Auto-default single пространство stale after joining 2nd team until re-auth — **Agree**
- Vendor O!task icon (brand residual) — **Agree**
- Step2 projects: load for **all** пространства — **modified** from “default ws only” recommendation
- Fan-out resilience: parallel + partial failure + soft multi-team warning — **Agree**
- Empty multi-select unrestricted + helper copy — **Agree**
- Pending storage: **OAUTH_KV + signed pendingId cookie** (auth first, then scopes) — **Agree** (replaces Bearer-in-cookie)
- KV pending security: signed pendingId + TTL delete on complete — **Agree**
- Terminology: workspace UI = **пространство** — **user directive**

### Changes Made

- Replaced signed Bearer cookie with **KV pending session + tiny cookie**
- Added **fingerprint bind** to pending payload
- Projects: **all-teams fan-out** with parallel + partial failure
- UI copy: **пространство**; empty allow-list helper text
- Icon brand risk and routing decisions locked
- Status line updated to stress-tested

### Deferred / Parking Lot

- Post-grant “settings” to change scopes without full OAuth re-connect
- MCP cards, `#N`, get_file, search, compact comments (Wave 2)
- Dedicated HMAC secret separate from `USER_ID_PEPPER` (optional later)

### Confidence Assessment

- Overall: **High** for architecture of wizard + landing + list_workspaces
- Areas of concern: step2 latency with many teams (mitigated, not eliminated); CF operator trust for KV pending (same as grant store)

# Cloudflare Remote MCP Design (otask-mcp)

**Date:** 2026-07-10  
**Repo:** `grigoreo-dev/otask-mcp`  
**Status:** Approved design, ready for implementation planning  
**Audience:** Any remote MCP client (Claude web, Cursor, n8n, generic OAuth MCP clients)

## Summary

Expose O!task MCP as a **public Cloudflare Workers remote MCP server** with an
**OAuth 2.1 bridge** implemented on the same Worker. O!task has no OAuth API —
only `POST /api/v1/auth/login` (email + password) → long-lived Bearer token.
The Worker presents a login + scope form, never stores the password, holds the
O!task token only in an encrypted OAuth session, and proxies tool calls to the
O!task API.

Simultaneously **refactor** the existing Node stdio / HTTP gateway / HTTP
passthrough paths onto a **shared core** so tools, API client, mappers, and
guards live once and three thin adapters consume them:

1. stdio (local npm / Bun)
2. Node Streamable HTTP (Docker / n8n)
3. Cloudflare Worker (OAuth + `McpAgent`)

Official demo is hosted on the maintainer’s Cloudflare account; self-deploy is
first-class documented. User-facing docs (README) stay **Russian**, with emoji
section markers and copy-paste **agent install prompts** for every install mode.
Code, commits, PR titles, and this design remain **English**.

## Goals

- Any OAuth-capable remote MCP client can connect without running Docker.
- Login UI on the same Worker: email/password + optional scope defaults/allow-lists.
- Privacy story: password never stored; O!task token only in encrypted session;
  re-login when O!task token expires (no O!task refresh).
- Shared tool core; no divergent tool implementations per transport.
- Official public demo URL **and** self-deploy via Wrangler.
- README (RU): privacy + OSS intent, link to Cloudflare remote MCP docs, emoji
  navigation, agent prompts for all install paths.
- Minimal abuse protection: Cloudflare rate limits on authorize/login/MCP.

## Non-goals (v1)

- Native O!task OAuth / social login / MFA
- Captcha / Turnstile (v1)
- Billing / multi-tenant admin panel
- Storing or logging passwords or raw O!task tokens outside encrypted session
- Server-side `OTASK_*` credentials on the **public multi-user** Worker
- Deprecating Docker or stdio
- Making AI review bots required status checks

## Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Primary clients | **B** — any remote MCP client, not Claude-only |
| Auth model | OAuth 2.1 bridge on same Worker; upstream = password login |
| Credential storage | **A** — password never stored; O!task Bearer in encrypted session only |
| Token expiry | Re-login when O!task token dies (long-lived, no refresh) |
| Hosting | **C** — official CF demo + documented self-deploy |
| Scope | **C** — user sets defaults/allow-lists on login form → session |
| Existing transports | **B** — refactor to shared core + thin adapters |
| Abuse | **A** — CF rate limits + session TTL; no captcha in v1 |
| Architecture | **1** — CF Agents `McpAgent` + `workers-oauth-provider` |

## Architecture

```
MCP clients (Claude / Cursor / n8n / …)
        │  HTTPS + OAuth 2.1
        ▼
┌─────────────────────────────────────┐
│  Cloudflare Worker (remote MCP)     │
│  · workers-oauth-provider           │
│  · login UI (email/password+scope)  │
│  · McpAgent (Streamable HTTP MCP)   │
│  · session: encrypted O!task token  │
│    + scope (ws/project/allow-list)  │
└──────────────┬──────────────────────┘
               │ Bearer O!task (per API call)
               ▼
         O!task API (api.otask.ru)

Shared core (same monorepo):
  tools · api · mappers · guards · auth resolvers · createMcpServer
Adapters: stdio | http-node | worker
```

### Principles

1. **Password:** present only during the login HTTP request; never written to
   KV, DO, logs, or cookies.
2. **O!task access token:** stored only inside the OAuth provider encrypted
   session (props / Durable Object), bound to the MCP OAuth access token issued
   to the client.
3. **Public demo Worker:** no `OTASK_EMAIL` / `OTASK_PASSWORD` / `OTASK_AUTH_KEY`
   / gateway `MCP_AUTH_TOKEN` for multi-user traffic.
4. **Scope for Worker:** comes from session (login form), not from MCP client
   headers (Claude does not send `X-Otask-*`).
5. **stdio / Node HTTP:** keep current gateway vs passthrough semantics via
   env/headers; implement both on top of shared `OtaskAuthResolver` +
   `ScopeContext`.
6. **Yagni:** no custom OAuth stack if `workers-oauth-provider` covers authorize,
   token, and dynamic client registration needs of target clients.

## Scope and defaults (session)

| Field | Source (Worker) | Existing equivalent |
|-------|-----------------|---------------------|
| Default workspace | Login form → session | `OTASK_DEFAULT_WS` / `X-Otask-Default-Ws` |
| Default project | Login form → session | `OTASK_DEFAULT_PROJECT` / header |
| Allowed workspaces | Login form (optional) → session | `OTASK_ALLOWED_WS` / `X-Otask-Allowed-Ws` |
| Allowed projects | Login form (optional) → session | `OTASK_ALLOWED_PROJECTS` / header |

**Rules**

1. After successful O!task login, password is dropped; session stores
   `{ otaskToken, defaultWs?, defaultProject?, allowedWs?, allowedProjects? }`.
2. Each tool call builds `createPassthroughAuthResolver(otaskToken)` and
   `ScopeContext` from session (same guard semantics as today’s passthrough).
3. Empty allow-lists mean **off** (full token access), matching current behavior.
4. Missing defaults mean tools require explicit `ws_slug` / project identifiers.
5. Multi-user Worker **must not** merge server env allow-lists into user sessions
   (would incorrectly constrain other users’ accounts).

## OAuth and login UI

### Roles

| Role | Component |
|------|-----------|
| Authorization Server | Worker + `workers-oauth-provider` |
| Resource Server | `McpAgent` Streamable HTTP MCP endpoint |
| Upstream IdP | O!task password login (not OAuth) |

### Flow

1. Client → `GET /authorize?client_id&redirect_uri&state&…`
2. Worker serves login HTML (primary **RU**, short EN footer):
   - email / password
   - optional default workspace / project
   - optional allowed workspaces / projects (comma-separated)
   - privacy blurb: password not stored; token session-only; link to README privacy section
3. Form POST → `POST https://api.otask.ru/api/v1/auth/login` → on success drop
   password → encrypt session props
4. Redirect with authorization `code`
5. Client `POST /token` → receives **Worker-issued** OAuth access token (not raw
   O!task token)
6. MCP requests: `Authorization: Bearer <oauth-access>` → resolve session →
   O!task Bearer + ScopeContext → shared tools
7. O!task API 401 or known token expiry → MCP tool error instructing the user to
   reconnect / re-authorize the MCP server

### Rate limiting (v1)

- Cloudflare rate limiting (or WAF rules) on `/authorize`, login POST, and MCP
  routes
- Session TTL aligned with OAuth access token lifetime (implementation plan
  picks concrete numbers; must be ≤ remaining O!task token life when known)

## Repository layout

```
otask-mcp/
  packages/core/       # tools, api, mappers, guards, auth, createMcpServer
  packages/stdio/      # bin: otask-mcp
  packages/http-node/  # bin: otask-mcp-http (Docker / n8n)
  packages/worker/     # CF Worker: OAuth + McpAgent + login HTML
  wrangler.toml        # or packages/worker/wrangler.toml
  Dockerfile           # http-node image
  README.md            # RU product docs (emoji + agent prompts)
```

### Package boundaries

- **`core`:** no Node `http` server, no Workers globals; uses `fetch` + portable TS.
- **Contract:** `OtaskAuthResolver` + `ScopeContext` + `createMcpServer(auth, scope)`.
- **`stdio` / `http-node`:** env/header auth modes unchanged for operators.
- **`worker`:** transport + OAuth session mapping only.
- **npm publish:** keep user-facing package `@grigoreo-dev/otask-mcp` usable as
  today (stdio + HTTP entrypoints). Exact monorepo publish strategy is an
  implementation detail (single package re-export vs multi-package); must not
  break existing `otask-mcp` / `otask-mcp-http` bins without a major version.

### CI / deploy

- Existing Bun CI (lint, build, unit) covers monorepo packages.
- Optional GitHub Action: `wrangler deploy` on manual dispatch or release tag
  (not every PR).
- Branch protection and merge rules remain as already configured on `main`.

## Error handling

| Situation | Behavior |
|-----------|----------|
| Bad email/password | Login form error; no credential echo |
| Missing OAuth bearer on MCP | HTTP 401 |
| O!task token expired mid-session | MCP tool error: session expired, reconnect |
| Project/workspace allow-list deny | Same as current ProjectGuard / WsGuard errors |
| O!task upstream 5xx | Propagate compact error; no secrets in body |

## Security

- TLS only on public endpoints.
- Never log password, O!task token, or OAuth access token.
- Encrypt session props with provider secrets (Wrangler secrets).
- Public demo: multi-user passthrough-style only (per-user token).
- Self-deploy operators may still run **Node** gateway mode with server
  credentials + `MCP_AUTH_TOKEN` for single-tenant n8n — unchanged intent.
- Do not enable “store password for re-login” features in v1.

## Testing

| Layer | Coverage |
|-------|----------|
| `core` unit | Existing tool/guard/api tests; add session → `ScopeContext` mapper tests |
| `http-node` | Auth mode + header scope (existing patterns) |
| `worker` | Login handler with mocked O!task login; authorize → token happy path (minimal) |
| Manual | Claude web + Cursor against `wrangler dev` / demo URL |

No full browser e2e required in v1 CI.

## Documentation (README, Russian)

User-facing documentation is **Russian**, polished OSS tone, with:

1. **Emoji section markers** (examples): 🚀 connect, 🔒 privacy, ☁️ Worker,
   🐳 Docker, 💻 stdio, 🤖 agent prompts, 🔧 self-deploy.
2. **Privacy / trust** section: what is not stored (password), what is held
   ephemerally (token + scope in session), re-login on expiry, OSS motivation
   (make O!task usable from modern agent clients).
3. **Link** to official Cloudflare remote MCP documentation:
   https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/
4. **Mode matrix** extended with **remote Worker** alongside stdio / HTTP
   gateway / HTTP passthrough.
5. **Agent install prompts** — copy-paste blocks for each scenario:

| Scenario | Contents of prompt block |
|----------|--------------------------|
| Claude web → official URL | Steps + agent prompt to add remote MCP connector |
| Cursor → official URL | `mcp.json` snippet + agent prompt |
| Self-deploy Worker | Wrangler, secrets, URL + agent prompt |
| Docker / n8n passthrough | Compose/env + agent prompt |
| stdio local (npm/bun) | Env vars + agent prompt |
| Gateway self-host | `MCP_AUTH_TOKEN` + OTASK_* + agent prompt |

Each block: numbered human steps, then a fenced prompt “paste into your agent”.

Code comments and `docs/superpowers/**` stay English.

## Reference links

- Cloudflare remote MCP: https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/
- O!task API docs: https://api.otask.ru/docs
- Existing auth modes: `src/services/auth.ts`, README mode matrix

## Implementation phases (planning hint)

1. Extract `packages/core` without behavior change; wire stdio + http-node.
2. Add `packages/worker` OAuth + login UI + McpAgent using core.
3. Session → scope mapper + unit tests.
4. Rate limit + wrangler config + optional deploy workflow.
5. README RU overhaul (emoji, privacy, agent prompts, official URL).
6. Deploy official demo; smoke with Claude and Cursor.

Detailed task breakdown belongs in the implementation plan, not this design.

## Open implementation details (non-blocking for design)

- Exact OAuth access token TTL and session storage (KV vs DO props) — choose
  during plan using current `workers-oauth-provider` + Agents SDK docs.
- Whether npm remains a single package with path exports or becomes a workspace
  of published packages — choose for minimal break risk.
- Custom domain for demo vs `*.workers.dev` — operator choice at deploy time.

## Success criteria

- [ ] Claude web can complete OAuth connect against the Worker and call tools.
- [ ] Cursor (or another OAuth MCP client) can do the same.
- [ ] Password never appears in storage or logs; documented in RU README.
- [ ] Scope defaults/allow-lists set at login apply to subsequent tool calls.
- [ ] Expired O!task token yields clear reconnect guidance.
- [ ] stdio + Docker HTTP still work via shared core (existing tests green).
- [ ] Self-deploy instructions + agent prompts exist for all six scenarios.
- [ ] Official demo URL published in README when deployed.

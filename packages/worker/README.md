# O!task MCP — Cloudflare Worker

Remote MCP endpoint (Streamable HTTP + OAuth) for O!task. Private package; not published to npm.

> **Unofficial.** otask-mcp is an independent open-source MCP connector for the O!task API. Not affiliated with, endorsed by, or part of the O!task product/team. (**Неофициально** — не продукт O!task.)

Landing `/` and favicon are served by this Worker; OAuth login is a **2-step wizard** (credentials → pick default/allowed пространства & projects from selects).

## Deploy options (pick one)

| Path | Needs long-lived CF API token? | Best for |
|------|--------------------------------|----------|
| **Local `wrangler`** | No — `wrangler login` (browser OAuth) | First deploy, solo |
| **GitHub Actions** | **Yes** — repo secrets | Button deploy from CI |
| **Cloudflare Workers Builds (Git)** | No — CF GitHub App in dashboard | Auto-deploy on push to `main` |

KV namespace `OAUTH_KV` is **not** committed to git. `wrangler.toml` declares only the
binding; Wrangler [automatic provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning) (Beta)
creates the namespace on first deploy.

- **Local `wrangler deploy`:** Wrangler writes the generated `id` back into your local
  `wrangler.toml`. **Do not commit** that change — keep the id local (or in dashboard).
- **GitHub Actions / Workers Builds (from git):** the id is **not** written back to the
  repo; it lives in the Cloudflare dashboard only.

### 1) Local (simplest first time)

```bash
# repo root
bun install
bunx wrangler login          # once per machine

# required secret: HMAC pepper for userId (keeps email non-enumerable in KV)
bunx wrangler secret put USER_ID_PEPPER --config packages/worker/wrangler.toml

bun run deploy:worker        # build + wrangler deploy (KV OAUTH_KV auto-created)
```

URL: `https://otask-mcp.<account-subdomain>.workers.dev/mcp`

**Required secret:** `USER_ID_PEPPER` — any long random string
(e.g. `openssl rand -hex 32`). Without it, `/authorize` returns 500.
It is the HMAC key for the stored `userId`; keep it stable, or existing
grants stop matching on re-login.

### 2) GitHub Actions (current workflow)

Workflow: [`.github/workflows/deploy-worker.yml`](../../.github/workflows/deploy-worker.yml) — **manual** `workflow_dispatch` only.

**Yes, you need a key (API token):**

| GitHub secret | What |
|---------------|------|
| `CLOUDFLARE_API_TOKEN` | [Create Token](https://dash.cloudflare.com/profile/api-tokens) → template **Edit Cloudflare Workers** (or custom: Account Workers Scripts Edit + Account Workers KV Storage Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Dashboard right sidebar / Workers overview |

Set the `USER_ID_PEPPER` **Worker secret once** (`wrangler secret put`, or dashboard →
Worker → Settings → Variables → Secret). It persists across deploys — the workflow does
not set it.

Then: **Actions → Deploy Worker → Run workflow**. KV is provisioned automatically on deploy.

`publish.yml` (npm OIDC) is unrelated — no CF token there.

### 3) Cloudflare Workers Builds (Git) — no GH secrets

Dashboard → **Workers & Pages** → create/open worker **otask-mcp** → **Settings → Builds** → **Connect repository**.

Suggested settings for this monorepo:

| Field | Value |
|-------|--------|
| Repository | `grigoreo-dev/otask-mcp` |
| Production branch | `main` |
| Root directory | `/` (repo root) |
| Build command | `bun install && bun run build` |
| Deploy command | `bunx wrangler deploy --config packages/worker/wrangler.toml` |

Or set root to `packages/worker` and build command:

```bash
cd ../.. && bun install && bun run build
```

deploy:

```bash
npx wrangler deploy
```

Enable deploy on every push to `main`. The first `wrangler deploy` provisions `OAUTH_KV`
(the build step only compiles); check **Workers & Pages → KV** in the dashboard if needed.

## Local development

```bash
bun install
bun run build
cd packages/worker
bun run dev                    # local KV auto-provisioned for wrangler dev
```

For `wrangler dev`, `USER_ID_PEPPER` comes from `packages/worker/.dev.vars`
(gitignored) — **not** `wrangler secret put`, which targets the deployed Worker:

```dotenv
USER_ID_PEPPER=local-dev-pepper
```

## Rate limiting (dashboard, not code)

1. Dashboard → **Security** → Rate limiting / WAF.
2. `/authorize` POST ≤ 10 / min / IP.
3. `/mcp` ≤ 120 / min / IP (tune later).
4. Free tier: WAF custom rule / Managed Challenge on authorize POST.

## Notes

- Public multi-user Worker: **no** `OTASK_*` / `MCP_AUTH_TOKEN` in `[vars]`.
- KV `OAUTH_KV` is auto-provisioned on first deploy — no ids in git. To reuse an existing
  namespace, add `id = "..."` locally or bind via dashboard (not required for default flow).
- **`USER_ID_PEPPER` is a required secret** (`wrangler secret put`), not a `[vars]`
  value — never commit it. Rotating it invalidates existing grants (users re-login).
- Connect flow: `GET /` landing → client OAuth to `/mcp` → `/authorize` step1 (email/password) → step2 (пространство/project selects). Empty allow-list selects = unrestricted.
- Slug truth (UUID vs board `#N`): see repo [`docs/SLUGS.md`](../../docs/SLUGS.md).

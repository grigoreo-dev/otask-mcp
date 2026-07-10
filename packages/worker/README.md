# O!task MCP — Cloudflare Worker

Remote MCP endpoint (Streamable HTTP + OAuth) for O!task. Private package; not published to npm.

## Deploy options (pick one)

| Path | Needs long-lived CF API token? | Best for |
|------|--------------------------------|----------|
| **Local `wrangler`** | No — `wrangler login` (browser OAuth) | First deploy, solo |
| **GitHub Actions** | **Yes** — repo secrets | Button deploy from CI |
| **Cloudflare Workers Builds (Git)** | No — CF GitHub App in dashboard | Auto-deploy on push to `main` |

### 1) Local (simplest first time)

```bash
# repo root
bun install
bunx wrangler login          # once per machine

# create OAuth KV, paste printed id into packages/worker/wrangler.toml
bun run worker:kv

# edit packages/worker/wrangler.toml:
#   id = "<from create>"
#   preview_id = "<same or preview namespace>"

# required secret: HMAC pepper for userId (keeps email non-enumerable in KV)
bunx wrangler secret put USER_ID_PEPPER --config packages/worker/wrangler.toml

bun run deploy:worker
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

Also: real KV `id` must already be in committed `wrangler.toml` (or Actions will fail on placeholder).

Set the `USER_ID_PEPPER` **Worker secret once** (`wrangler secret put`, or dashboard →
Worker → Settings → Variables → Secret). It persists across deploys — the workflow does
not set it.

Then: **Actions → Deploy Worker → Run workflow**.

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

Still need a real `OAUTH_KV` id in `wrangler.toml` before first successful build.

Optional: enable deploy on every push to `main`.

## Local development

```bash
bun install
bun run build
cd packages/worker
bunx wrangler kv namespace create OAUTH_KV   # once; update wrangler.toml
bunx wrangler secret put USER_ID_PEPPER      # once; required for /authorize
bun run dev                                  # local: put USER_ID_PEPPER in .dev.vars
```

For `wrangler dev`, put the pepper in `packages/worker/.dev.vars` (gitignored):

```
USER_ID_PEPPER=local-dev-pepper
```

## Rate limiting (dashboard, not code)

1. Dashboard → **Security** → Rate limiting / WAF.
2. `/authorize` POST ≤ 10 / min / IP.
3. `/mcp` ≤ 120 / min / IP (tune later).
4. Free tier: WAF custom rule / Managed Challenge on authorize POST.

## Notes

- Public multi-user Worker: **no** `OTASK_*` / `MCP_AUTH_TOKEN` in `[vars]`.
- Placeholder KV ids in git are intentional until first `worker:kv`.
- **`USER_ID_PEPPER` is a required secret** (`wrangler secret put`), not a `[vars]`
  value — never commit it. Rotating it invalidates existing grants (users re-login).

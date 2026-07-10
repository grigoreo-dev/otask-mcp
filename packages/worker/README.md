# O!task MCP — Cloudflare Worker

Remote MCP endpoint (Streamable HTTP + OAuth) for O!task. Private package; not published to npm.

## Local development

```bash
# from repo root
bun install
bun run build
bun install --cwd packages/worker

# create OAUTH_KV and paste id into wrangler.toml
cd packages/worker
bunx wrangler kv namespace create OAUTH_KV
bun run dev
```

## Deploy (manual)

### Local

```bash
# from repo root first: bun run build
cd packages/worker
bunx wrangler deploy
```

### GitHub Actions

Workflow: [`.github/workflows/deploy-worker.yml`](../../.github/workflows/deploy-worker.yml) (`workflow_dispatch` only).

Required repository secrets:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers deploy permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |

Run: **Actions → Deploy Worker → Run workflow**.

`publish.yml` (npm OIDC on `v*` tags) is unchanged and independent of this workflow.

## Rate limiting (dashboard config, not code)

No captcha or in-worker rate limits in v1. Configure in Cloudflare:

1. Dashboard → **Security** → **Rate limiting rules** (or WAF custom rules on free tier).
2. **Rule A** — path `/authorize`, method `POST`: ≤ **10 requests / minute / IP**.
3. **Rule B** — path `/mcp`: ≤ **120 requests / minute / IP** (tune under load).
4. If classic Rate limiting is unavailable (e.g. free plan): use a **WAF custom rule** with rate limiting / challenge, or Managed Challenge on `/authorize` POST as a lighter alternative.

Revisit thresholds after production traffic.

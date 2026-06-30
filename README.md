# otask-mcp-server

[MCP-сервер](https://modelcontextprotocol.io) для [O!task API](https://api.otask.ru/docs).

## Режимы запуска

| Режим | Команда | Клиент |
|-------|---------|--------|
| MCP stdio | `bun start` | Cursor / OpenCode |
| MCP Streamable HTTP | `bun run start:http` | n8n MCP Client Tool |

## Аутентификация HTTP (`/mcp`)

Всегда через заголовок `Authorization: Bearer …` от HTTP-клиента. Два сценария:

### 1. Gateway (серверные credentials в env)

Сервер сам ходит в O!task API. Endpoint **нельзя** оставлять открытым.

```env
OTASK_AUTH_KEY=...          # или OTASK_EMAIL + OTASK_PASSWORD
MCP_AUTH_TOKEN=...          # обязателен в gateway-режиме
```

Клиент (n8n):

```
Authorization: Bearer <MCP_AUTH_TOKEN>
```

### 2. Passthrough (без OTASK_* в env)

Сервер **не** хранит credentials O!task. Bearer клиента пробрасывается в `api.otask.ru`.

```env
# OTASK_* не заданы
```

Клиент (n8n):

```
Authorization: Bearer <O!task token>
```

Тот же токен, что для прямых вызовов O!task API.

### Stdio (локально)

Только gateway-логика через env (без `MCP_AUTH_TOKEN`):

```env
OTASK_AUTH_KEY=...
# или OTASK_EMAIL + OTASK_PASSWORD
```

## MCP HTTP endpoint

| | |
|---|---|
| URL | `https://otask-mcp.grigoreo.dev/mcp` |
| Health | `GET /health` → `{ ok, authMode: "gateway" \| "passthrough" }` |
| Порт | `3847` |

### n8n MCP Client Tool

- URL: `https://otask-mcp.grigoreo.dev/mcp`
- Transport: **HTTP Streamable**
- **Gateway:** credential с `MCP_AUTH_TOKEN`
- **Passthrough:** credential с O!task Bearer (как в workflow 009)

Tools: `otask_get_task`, `otask_update_task`.

## Разработка

```bash
bun install && bun run build
bun start              # stdio
bun run dev:http       # HTTP hot reload
```

# otask-mcp-server

[MCP-сервер](https://modelcontextprotocol.io) и HTTP-прокси для [O!task API](https://api.otask.ru/docs).

## Режимы

| Режим | Запуск | Аутентификация |
|-------|--------|----------------|
| MCP (stdio) | `bun start` | `OTASK_AUTH_KEY` или `OTASK_EMAIL` + `OTASK_PASSWORD` |
| HTTP proxy | `bun run start:http` | только `AUTH_TOKEN` — прозрачный прокси на `api.otask.ru` |

## HTTP proxy

Прозрачный reverse proxy: те же пути, методы, тела запросов и ответы, что у O!task API.

```bash
AUTH_TOKEN=your-otask-bearer-token PORT=3847 bun run start:http
```

```bash
curl -sS \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Accept: application/json" \
  "http://localhost:3847/api/v1/ws/{ws_slug}/tasks/{task_slug}"
```

- Проксирует `GET|POST|PUT|PATCH|DELETE|HEAD` на `/api/*` → `https://api.otask.ru/api/*`
- Клиент обязан передать `Authorization: Bearer <AUTH_TOKEN>` (тот же токен уходит upstream)
- `GET /health` — проверка живости (без auth)

**Production:** [https://otask-mcp.grigoreo.dev](https://otask-mcp.grigoreo.dev) (Dokploy, проект n8n на msk).

## MCP-инструменты

| Инструмент | Метод | Описание |
|------------|-------|----------|
| `otask_get_task` | `GET /api/v1/ws/{ws_slug}/tasks/{task_slug}` | Получить задачу по slug |
| `otask_update_task` | `POST .../tasks/{task_slug}/update` | Обновить задачу (частичные поля; мерж с текущим состоянием) |

## Аутентификация

Задайте **один** из вариантов:

| Переменная | Описание |
|------------|----------|
| `OTASK_AUTH_KEY` | Статический Bearer-токен |
| `OTASK_EMAIL` + `OTASK_PASSWORD` | Логин через `POST /api/v1/auth/login` (токен кэшируется в памяти) |

## Разработка

Требуется [Bun](https://bun.sh) ≥ 1.1.

```bash
bun install
bun run build
bun start
```

## Cursor / OpenCode

Подключение в workspace: `.cursor/mcp.json` и `opencode.json`. Секреты — в корневом `.env`.

## Slug'и

Из URL задачи `https://panel.otask.ru/ws/{ws_slug}/tasks/{task_slug}` — UUID в пути используйте как `ws_slug` и `task_slug`.

# otask-mcp-server

[MCP-сервер](https://modelcontextprotocol.io) для [O!task API](https://api.otask.ru/docs): инструменты `otask_get_task` и `otask_update_task`.

## Режимы

| Режим | Запуск | Куда подключать |
|-------|--------|-----------------|
| **MCP stdio** | `bun start` | Cursor / OpenCode (локально) |
| **MCP Streamable HTTP** | `bun run start:http` | n8n → **MCP Client Tool** |

## MCP HTTP (для n8n)

Транспорт: [Streamable HTTP](https://modelcontextprotocol.io) (не reverse proxy к O!task).

| Параметр | Значение |
|----------|----------|
| Endpoint | `POST` / `GET` **`/mcp`** |
| Production URL | `https://otask-mcp.grigoreo.dev/mcp` |
| Health | `GET /health` |
| Порт (контейнер) | `3847` |

### n8n: MCP Client Tool

1. Добавь ноду **MCP Client Tool** к AI Agent.
2. URL: `https://otask-mcp.grigoreo.dev/mcp`
3. Transport: **HTTP Streamable** (или аналог в UI n8n).
4. Если задан `MCP_AUTH_TOKEN` на сервере — заголовок `Authorization: Bearer <MCP_AUTH_TOKEN>`.

Агент увидит tools: `otask_get_task`, `otask_update_task`.

### Локальный запуск HTTP

```bash
bun install && bun run build
OTASK_EMAIL=... OTASK_PASSWORD=... PORT=3847 bun run start:http
```

Опционально защита endpoint:

```bash
MCP_AUTH_TOKEN=secret bun run start:http
```

## MCP-инструменты

| Инструмент | Метод API | Описание |
|------------|-----------|----------|
| `otask_get_task` | `GET /api/v1/ws/{ws_slug}/tasks/{task_slug}` | Получить задачу |
| `otask_update_task` | `POST .../tasks/{task_slug}/update` | Обновить (частичные поля, мерж с текущим) |

## Аутентификация O!task (сервер → api.otask.ru)

Задайте **один** вариант в env приложения:

| Переменная | Описание |
|------------|----------|
| `OTASK_AUTH_KEY` | Статический Bearer-токен |
| `OTASK_EMAIL` + `OTASK_PASSWORD` | Login `POST /api/v1/auth/login`, токен кэшируется |

| `MCP_AUTH_TOKEN` | Опционально: Bearer для доступа к `/mcp` (клиенты n8n) |

## Разработка

Требуется [Bun](https://bun.sh) ≥ 1.1.

```bash
bun install
bun run build
bun start          # stdio для Cursor
bun run dev:http   # hot reload HTTP
```

## Cursor / OpenCode

`.cursor/mcp.json` / `opencode.json` → stdio `projects/otask-mcp/dist/index.js`. Секреты O!task — в корневом `.env`.

## Slug'и

Из URL `https://panel.otask.ru/ws/{ws_slug}/tasks/{task_slug}` — UUID в пути.

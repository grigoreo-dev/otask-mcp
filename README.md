# otask-mcp-server

[MCP-сервер](https://modelcontextprotocol.io) для [O!task API](https://api.otask.ru/docs). Отдаёт операции O!task (воркспейс/задачи) как MCP-инструменты для агентов (Cursor, OpenCode, n8n MCP Client Tool).

## Режимы

| Режим | Команда | Как выбирается | Авторизация клиента |
|-------|---------|----------------|---------------------|
| **stdio** | `bun start` | Локальный процесс; всегда берёт credentials из env сервера | Без HTTP; задайте `OTASK_*` в env |
| **HTTP gateway** | `bun run start:http` | Есть `OTASK_AUTH_KEY` **или** `OTASK_EMAIL`+`OTASK_PASSWORD` | `Authorization: Bearer <MCP_AUTH_TOKEN>` |
| **HTTP passthrough** | `bun run start:http` | Нет credentials `OTASK_*` в env | `Authorization: Bearer <токен O!task>` (проксируется в API) |

Определение: `hasServerOtaskCredentials()` — gateway, если задан статический ключ или email+password; иначе passthrough. Проверка: `GET /health` → `authMode: "gateway" | "passthrough"`.

stdio требует `OTASK_*` (без них падает при старте). HTTP gateway требует `MCP_AUTH_TOKEN`, если заданы `OTASK_*` (иначе падает при старте).

## Переменные окружения

| Переменная | Где используется | Когда обязательна | Назначение |
|------------|------------------|-------------------|------------|
| `OTASK_AUTH_KEY` | stdio, HTTP gateway | stdio **или** gateway (альтернатива: email/password) | Статический O!task Bearer, которым пользуется сервер |
| `OTASK_EMAIL` | stdio, HTTP gateway | вместе с `OTASK_PASSWORD` как альтернатива ключу | Логин для получения токена |
| `OTASK_PASSWORD` | stdio, HTTP gateway | вместе с `OTASK_EMAIL` | Пароль для логина |
| `MCP_AUTH_TOKEN` | HTTP gateway | режим gateway | Общий секрет, который должен отправлять клиент; **не** токен O!task |
| `OTASK_ALLOWED_PROJECTS` | stdio, HTTP gateway | опционально | Список slug и/или числовых ID проектов через запятую |
| `PORT` | HTTP | опционально (по умолчанию `3847`) | Порт прослушивания |
| `HOST` | HTTP | опционально (по умолчанию `0.0.0.0`) | Адрес привязки |

## HTTP-заголовки

| Заголовок | Режим | Назначение |
|-----------|-------|------------|
| `Authorization: Bearer …` | gateway | Должен совпадать с `MCP_AUTH_TOKEN` |
| `Authorization: Bearer …` | passthrough | Токен O!task API; проксируется на каждый запрос к API |
| `X-Otask-Allowed-Projects` | **только passthrough** | Slug/ID через запятую; в gateway игнорируется (используйте env) |

## Эндпоинты (HTTP)

| | |
|---|---|
| MCP | `POST`/`GET` `/mcp` (Streamable HTTP) |
| Health | `GET /health` → `{ ok, mode, authMode, projectGuard }`, где `projectGuard` — `"env" \| "header" \| "off"` |

Пример деплоя: `https://otask-mcp.grigoreo.dev/mcp` (порт `3847` в Docker).

## Примеры для n8n

### Gateway (credentials O!task хранит сервер)

Env сервера:

```env
OTASK_AUTH_KEY=...
MCP_AUTH_TOKEN=super-secret-mcp-token
OTASK_ALLOWED_PROJECTS=my-project,42
```

n8n **MCP Client Tool**:

- URL: `https://otask-mcp.example/mcp`
- Transport: **HTTP Streamable**
- Credential / header: `Authorization: Bearer super-secret-mcp-token`
- **Не** отправляйте `X-Otask-Allowed-Projects` (allow-list берётся из env сервера)

### Passthrough (токен O!task у клиента)

Env сервера: без `OTASK_AUTH_KEY` / `OTASK_EMAIL` / `OTASK_PASSWORD`.

n8n **MCP Client Tool**:

- URL: `https://otask-mcp.example/mcp`
- Transport: **HTTP Streamable**
- Credential / header: `Authorization: Bearer <тот же токен, что и для api.otask.ru>`
- Опционально: `X-Otask-Allowed-Projects: eng-backlog,99`

### Stdio (Cursor / OpenCode)

```env
OTASK_AUTH_KEY=...
# или OTASK_EMAIL + OTASK_PASSWORD
OTASK_ALLOWED_PROJECTS=my-project
```

```bash
bun start
```

## Инструменты

Регистрируются в `src/tools/registry.ts` (краткие intent для агентов):

| Инструмент | Назначение |
|------------|------------|
| `otask_get_task` | Получить одну задачу по workspace + slug задачи (посмотреть поля перед обновлением) |
| `otask_update_task` | Обновить существующую задачу (name, board, performers, tags, description, …) |
| `otask_list_projects` | Список проектов воркспейса (с фильтром по allow-list, если задан) |
| `otask_list_project_tasks` | Список задач в проекте |
| `otask_list_board` | Список досок/колонок (статусов) проекта — узнать `board_id` / `board_column_id` |
| `otask_list_members` | Список участников воркспейса (ID исполнителей для назначения) |
| `otask_list_tags` | Список тегов воркспейса для меток |
| `otask_list_comments` | Список комментариев к задаче |
| `otask_add_comment` | Добавить комментарий (опционально `parent_id` для ответов) |
| `otask_create_task` | Создать задачу (обязательно: `ws_slug`, `project_id`, `name`, `board_id`, `board_column_id`, `end_at`) |
| `otask_move_task` | Переместить задачу в другую колонку доски (статус) |
| `otask_archive_task` | Архивировать задачу |

Если активен allow-list проектов, project-scoped инструменты проверяют членство (или фильтруют списки); пустой allow-list = доступны все проекты.

## Allow-list проектов

Формат: **slug** и/или **числовые ID** через запятую (пробелы обрезаются). Пусто / не задано = выключено.

### Gateway / stdio — env

```env
OTASK_ALLOWED_PROJECTS=product-roadmap,eng-backlog,42
```

`GET /health` → `projectGuard: "env"`, если значение непустое.

### Passthrough — заголовок запроса

```http
X-Otask-Allowed-Projects: product-roadmap,42
```

`GET /health` (с этим заголовком) → `projectGuard: "header"`. Gateway этот заголовок игнорирует и всегда использует `OTASK_ALLOWED_PROJECTS`.

## Снимок API-документации

Пересобрать локальный каталог API из HTML-доки O!task (Scribe):

```bash
bun run docs:parse
```

Пишет в `docs/catalog/` с живой HTML-страницы доки (или `bun run docs:parse --file path` для офлайн HTML).

## Разработка

```bash
bun install
bun run build          # tsc → dist/
bun test               # bun test
bun start              # stdio MCP
bun run start:http     # Streamable HTTP MCP
bun run dev            # stdio hot reload
bun run dev:http       # HTTP hot reload
```

### Добавление инструмента

1. `src/services/api.ts` / `client.ts` — метод API при необходимости  
2. `src/schemas/` — Zod input schema  
3. `src/tools/my-tool.ts` — `createMyTool({ api, guard })` → `ToolDefinition`  
4. `src/tools/registry.ts` — добавить factory в `toolFactories`  

`server.ts` / `register.ts` править не нужно — регистрация централизована.

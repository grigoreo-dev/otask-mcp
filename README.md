# otask-mcp-server

[MCP-сервер](https://modelcontextprotocol.io) для [O!task API](https://api.otask.ru/docs). Отдаёт операции O!task (воркспейс/задачи) как MCP-инструменты для агентов (Cursor, OpenCode, n8n MCP Client Tool).

## Установка

```bash
npm i -g @grigoreo-dev/otask-mcp
# или: npx @grigoreo-dev/otask-mcp
# HTTP: npx otask-mcp-http   # bin name stays unscoped
```

Публикация на npm: push tag `vX.Y.Z` (версия в tag = `package.json`). CI: `.github/workflows/publish.yml` (OIDC Trusted Publisher, без `NPM_TOKEN`).

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
| `OTASK_DEFAULT_WS` | stdio, HTTP | опционально | Workspace slug по умолчанию (если tool не передал `ws_slug`) |
| `OTASK_DEFAULT_PROJECT` | stdio, HTTP | опционально | Project slug **или** numeric id по умолчанию |
| `OTASK_ALLOWED_WS` | stdio, HTTP gateway | опционально | Allow-list workspace slug через запятую |
| `OTASK_ALLOWED_PROJECTS` | stdio, HTTP gateway | опционально | Allow-list project slug и/или numeric id через запятую |
| `PORT` | HTTP | опционально (по умолчанию `3847`) | Порт прослушивания |
| `HOST` | HTTP | опционально (по умолчанию `0.0.0.0`) | Адрес привязки |

Default должен входить в allow-list, если list непустой (иначе сервер падает при старте).

## HTTP-заголовки

| Заголовок | Режим | Назначение |
|-----------|-------|------------|
| `Authorization: Bearer …` | gateway | Должен совпадать с `MCP_AUTH_TOKEN` |
| `Authorization: Bearer …` | passthrough | Токен O!task API; проксируется на каждый запрос к API |
| `X-Otask-Allowed-Projects` | **только passthrough** | Allow-list projects; в gateway — env |
| `X-Otask-Allowed-Ws` | **только passthrough** | Allow-list workspaces |
| `X-Otask-Default-Ws` | **passthrough** (override env) | Default workspace slug |
| `X-Otask-Default-Project` | **passthrough** (override env) | Default project slug/id |

## Эндпоинты (HTTP)

| | |
|---|---|
| MCP | `POST`/`GET` `/mcp` (Streamable HTTP) |
| Health | `GET /health` → `{ ok, mode, authMode, projectGuard, wsGuard, defaults }` (`"env" \| "header" \| "off"`) |

Пример деплоя: `https://otask-mcp.grigoreo.dev/mcp` (порт `3847` в Docker).

## Примеры для n8n

### Gateway (credentials O!task хранит сервер)

Env сервера:

```env
OTASK_AUTH_KEY=...
MCP_AUTH_TOKEN=super-secret-mcp-token
OTASK_DEFAULT_WS=246cd090-27a2-4f00-b4d6-2018d4d7ffe1
OTASK_DEFAULT_PROJECT=3156e838-b2b8-4537-8379-97131c22f60b
OTASK_ALLOWED_WS=246cd090-27a2-4f00-b4d6-2018d4d7ffe1
OTASK_ALLOWED_PROJECTS=3156e838-b2b8-4537-8379-97131c22f60b,35747
```

n8n **MCP Client Tool**:

- URL: `https://otask-mcp.example/mcp`
- Transport: **HTTP Streamable**
- Credential / header: `Authorization: Bearer super-secret-mcp-token`
- **Не** отправляйте `X-Otask-*` allow/default headers (берутся из env сервера)

### Passthrough (токен O!task у клиента)

Env сервера: без `OTASK_AUTH_KEY` / `OTASK_EMAIL` / `OTASK_PASSWORD`.

n8n **MCP Client Tool**:

- URL: `https://otask-mcp.example/mcp`
- Transport: **HTTP Streamable**
- Credential / header: `Authorization: Bearer <тот же токен, что и для api.otask.ru>`
- Опционально: `X-Otask-Allowed-Projects`, `X-Otask-Allowed-Ws`, `X-Otask-Default-Ws`, `X-Otask-Default-Project`

### Stdio (Cursor / OpenCode)

```env
OTASK_AUTH_KEY=...
# или OTASK_EMAIL + OTASK_PASSWORD
OTASK_DEFAULT_WS=...
OTASK_DEFAULT_PROJECT=my-project
OTASK_ALLOWED_WS=...
OTASK_ALLOWED_PROJECTS=my-project
```

```bash
bun start
```

## Инструменты

Регистрируются в `src/tools/registry.ts` (краткие intent для агентов):

| Инструмент | Назначение |
|------------|------------|
| `otask_me` | Текущий пользователь (id, имя, email, timezone) |
| `otask_list_tasks` | Задачи воркспейса; по умолчанию `mine=true`; фильтры `performer_ids`, `project_ids`, `priority_ids`, `due`, `page` |
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

Inbox (после настройки `OTASK_DEFAULT_WS`):

```text
# утренний inbox
otask_me
otask_list_tasks  # mine=true
otask_list_tasks due=today
otask_list_tasks due=overdue
```

Если активен allow-list проектов, project-scoped инструменты проверяют членство (или фильтруют списки); пустой allow-list = доступны все проекты.

## Defaults и allow-list (ws + projects)

| Что | Env (gateway/stdio) | Header (passthrough) |
|-----|---------------------|----------------------|
| Default workspace | `OTASK_DEFAULT_WS` | `X-Otask-Default-Ws` (override) |
| Default project | `OTASK_DEFAULT_PROJECT` (slug или id) | `X-Otask-Default-Project` |
| Limit workspaces | `OTASK_ALLOWED_WS` | `X-Otask-Allowed-Ws` |
| Limit projects | `OTASK_ALLOWED_PROJECTS` | `X-Otask-Allowed-Projects` |

Формат allow-list: значения через запятую (пробелы обрезаются). Projects: **slug** и/или **numeric id**. WS: только slug. Пусто = off.

```env
OTASK_DEFAULT_WS=246cd090-27a2-4f00-b4d6-2018d4d7ffe1
OTASK_DEFAULT_PROJECT=3156e838-b2b8-4537-8379-97131c22f60b
OTASK_ALLOWED_WS=246cd090-27a2-4f00-b4d6-2018d4d7ffe1
OTASK_ALLOWED_PROJECTS=3156e838-b2b8-4537-8379-97131c22f60b,product-roadmap,42
```

`otask_list_board` по умолчанию шлёт `type=status` (так требует O!task API).

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

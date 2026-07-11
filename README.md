# otask-mcp-server

[MCP-сервер](https://modelcontextprotocol.io) для [O!task API](https://api.otask.ru/docs). Отдаёт операции O!task (воркспейс/задачи) как MCP-инструменты для агентов (Claude, Cursor, OpenCode, n8n MCP Client Tool).

## 🚀 Возможности

- **stdio** — локальный MCP для Claude Desktop / Cursor / OpenCode
- **HTTP gateway / passthrough** — Streamable HTTP для n8n и self-host
- **Remote MCP (Cloudflare Worker)** — OAuth-логин O!task, без пароля в конфиге клиента
- Allow-list workspace/project, defaults, inbox-сценарии (`otask_list_tasks`)
- Open source: [grigoreo-dev/otask-mcp](https://github.com/grigoreo-dev/otask-mcp)

```bash
npm i -g @grigoreo-dev/otask-mcp
# или: npx @grigoreo-dev/otask-mcp
# HTTP: npx otask-mcp-http   # bin name stays unscoped
```

Публикация на npm: push tag `vX.Y.Z` (версия в tag = `package.json`). CI: `.github/workflows/publish.yml` (OIDC Trusted Publisher, без `NPM_TOKEN`).

## 🔒 Приватность и доверие

Касается **Cloudflare Worker** (remote MCP) и библиотеки [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider):

| Что | Где | Кто видит |
|-----|-----|-----------|
| **Пароль O!task** | только memory на POST `/authorize` | **нигде не пишется** (ни KV, ни env, ни git) |
| **Токен O!task + scope** (`props`) | grant в **Cloudflare KV** (`OAUTH_KV`) | **end-to-end encrypted**: ключ шифрования — секрет access-токена MCP; из сырого KV **нельзя** прочитать props без валидного Bearer |
| **userId** | KV, не зашифрован | **`HMAC-SHA256(email, secret pepper)`** — не email; без секрета `USER_ID_PEPPER` перебором по словарю email **не** сматчить |
| **metadata** | KV, не зашифрован | **пусто** (`{}`) — email в хранилище не пишется |
| **Access token MCP** | у клиента (Claude и т.д.) | клиент + тот, кто перехватит Bearer |

- Пароль **не** хранится после логина: email+password → `POST api.otask.ru/.../login` → API-токен → в `props`, пароль drop.
- O!task Bearer **нужен** для запросов к API → лежит в encrypted `props`, не в открытом виде.
- `userId = HMAC-SHA256(email, USER_ID_PEPPER)`: стабильный id (повторный логин заменяет старый grant), но **email в KV нет** и хэш не перебрать без секрета.
- Публичный Worker **без** `OTASK_*` / `MCP_AUTH_TOKEN` в env: multi-user, каждый — своя OAuth-сессия.
- После expiry/401 — **повторный Connect** (re-login).
- Код open source: self-deploy и аудит. Паттерн: [Remote MCP on Cloudflare](https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/).
- Официальный URL: **TBD after first deploy** (`https://otask-mcp.<account>.workers.dev/mcp`).

**Доверие к оператору Worker:** в хранилище нет ни пароля, ни email plaintext, а O!task-токен — только encrypted `props`. Но владелец Cloudflare-аккаунта **может сменить код** Worker (залогировать `ctx.props` / токен на своём деплое). Гарантия — открытый код: не доверяете чужому demo → self-deploy.

**Не кладите** `OTASK_PASSWORD`, `OTASK_AUTH_KEY` и токены в git, скриншоты и issue.

## ☁️ Remote MCP (Cloudflare)

Официальный endpoint (после первого деплоя):

```text
https://otask-mcp.<account>.workers.dev/mcp
```

Пока публичный demo не выкатан — URL **TBD after first deploy**. Self-host: см. [🔧 Self-deploy Worker](#-self-deploy-worker).

### Подключение (OAuth)

1. В MCP-клиенте добавьте remote server с URL `…/mcp`.
2. Запустите **Connect / OAuth** flow клиента.
3. На странице логина Worker введите **email + password** O!task.
4. После успешного authorize клиент получает access token сессии MCP; вызовы `/mcp` идут с этим токеном.
5. Default workspace/project — на форме логина (или явные `ws_slug` / project args в tools). Self-host stdio/HTTP: env `OTASK_DEFAULT_*`.

На публичном Worker **нет** `OTASK_*` в env: multi-user, credentials только в сессии пользователя.

## 💻 stdio (локально)

Локальный процесс; credentials только из env сервера.

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
# или: npx @grigoreo-dev/otask-mcp
```

stdio **требует** `OTASK_*` (без них падает при старте).

## 🐳 Docker / HTTP

```bash
bun run start:http
# Docker: образ из Dockerfile, PORT=3847
```

| | |
|---|---|
| MCP | `POST`/`GET` `/mcp` (Streamable HTTP) |
| Health | `GET /health` → `{ ok, mode, authMode, projectGuard, wsGuard, defaults }` (`"env" \| "header" \| "off"`) |

Пример self-host: `https://otask-mcp.example/mcp` (порт `3847` в Docker).

### Gateway (credentials O!task на сервере)

```env
OTASK_AUTH_KEY=...
MCP_AUTH_TOKEN=...
OTASK_DEFAULT_WS=...
OTASK_DEFAULT_PROJECT=...
OTASK_ALLOWED_WS=...
OTASK_ALLOWED_PROJECTS=...
```

Клиент: `Authorization: Bearer <MCP_AUTH_TOKEN>` (не токен O!task). **Не** шлите `X-Otask-*` allow/default (берутся из env).

### Passthrough (токен O!task у клиента)

Env сервера: **без** `OTASK_AUTH_KEY` / `OTASK_EMAIL` / `OTASK_PASSWORD`.

Клиент: `Authorization: Bearer <токен api.otask.ru>`. Опционально: `X-Otask-Allowed-Projects`, `X-Otask-Allowed-Ws`, `X-Otask-Default-Ws`, `X-Otask-Default-Project`.

Проверка: `GET /health` → `authMode: "gateway" | "passthrough"`.

## 🔀 Режимы auth

| Режим | Где | Команда / URL | Авторизация клиента |
|-------|-----|---------------|---------------------|
| **stdio** | локально | `bun start` / `otask-mcp` | Нет HTTP; `OTASK_*` в env процесса |
| **HTTP gateway** | Node/Docker | `bun run start:http` | `Authorization: Bearer <MCP_AUTH_TOKEN>`; на сервере есть `OTASK_*` |
| **HTTP passthrough** | Node/Docker | `bun run start:http` | `Authorization: Bearer <токен O!task>`; **нет** `OTASK_*` в env |
| **remote Worker** | Cloudflare | `https://…/mcp` + OAuth | OAuth Connect → логин email+password на Worker; API-токен в сессии, не в env Worker |

Определение HTTP (Node): `hasServerOtaskCredentials()` — gateway, если задан статический ключ или email+password; иначе passthrough. HTTP gateway **требует** `MCP_AUTH_TOKEN`, если заданы `OTASK_*` (иначе падает при старте).

## 🤖 Промпты для агентов

Скопируйте блок в чат агента.

### Claude web → официальный URL

```
Подключи remote MCP сервер O!task:
- URL: https://otask-mcp.<account>.workers.dev/mcp
- Используй OAuth / Connect flow клиента
- Default workspace/project задаются на форме логина Worker (или явными args tools)
Не сохраняй мой пароль в файлы репозитория.
```

(Пока demo не выкатан — URL **TBD after first deploy**.)

### Cursor → официальный URL

```
Добавь в MCP config Cursor remote server O!task:
url: https://otask-mcp.<account>.workers.dev/mcp
auth: oauth
После connect проверь otask_me.
```

### Self-deploy Worker

```
Задеплой otask-mcp Worker из репозитория grigoreo-dev/otask-mcp:
1) bun install; bun run build (из корня)
2) wrangler login (один раз)
3) bun run deploy:worker   # KV OAUTH_KV создаётся автоматически
4) Дай мне URL /mcp и пропиши в MCP клиент с OAuth
```

### Docker passthrough

```
Подними otask-mcp HTTP passthrough в Docker без OTASK_* в env.
Клиент шлёт Authorization: Bearer <O!task token>.
PORT 3847. Проверь GET /health.
```

### stdio local

```
Установи @grigoreo-dev/otask-mcp, настрой stdio MCP с OTASK_EMAIL+OTASK_PASSWORD
или OTASK_AUTH_KEY. Добавь в Claude Desktop / Cursor mcp servers.
```

### Gateway self-host

```
HTTP gateway: задай OTASK_* + MCP_AUTH_TOKEN.
Клиент шлёт Bearer MCP_AUTH_TOKEN, не токен O!task.
```

## 🔧 Self-deploy Worker

Пакет: `packages/worker` (не публикуется на npm). Подробнее: [`packages/worker/README.md`](./packages/worker/README.md).

```bash
# из корня репозитория
bun install
bunx wrangler login              # один раз (браузер, без API-токена)
# секрет для HMAC userId (email не хранится в KV в переборно-открытом виде)
bunx wrangler secret put USER_ID_PEPPER --config packages/worker/wrangler.toml

bun run deploy:worker            # build + deploy; KV OAUTH_KV создаётся автоматически
```

Подробнее (GH Actions, Workers Builds из git, secrets): [`packages/worker/README.md`](packages/worker/README.md).

- Endpoint MCP: `https://otask-mcp.<ваш-subdomain>.workers.dev/mcp`
- OAuth: `/authorize`, `/oauth/token`, `/oauth/register`
- **Не** задавайте `OTASK_*` в `[vars]` для multi-user публичного деплоя
- **GitHub Actions** (кнопка Deploy): нужны secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
- **Cloudflare Workers Builds** (git в dashboard): токен в GitHub **не** нужен — CF GitHub App; build из monorepo

Rate limiting — в dashboard Cloudflare (см. worker README), не в коде v1.

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

Remote Worker: user credentials **не** через эти env (OAuth-сессия).

## HTTP-заголовки

| Заголовок | Режим | Назначение |
|-----------|-------|------------|
| `Authorization: Bearer …` | gateway | Должен совпадать с `MCP_AUTH_TOKEN` |
| `Authorization: Bearer …` | passthrough | Токен O!task API; проксируется на каждый запрос к API |
| `Authorization: Bearer …` | remote Worker | Access token OAuth-сессии MCP (после Connect) |
| `X-Otask-Allowed-Projects` | **только passthrough** | Allow-list projects; в gateway — env |
| `X-Otask-Allowed-Ws` | **только passthrough** | Allow-list workspaces |
| `X-Otask-Default-Ws` | **passthrough** (override env) | Default workspace slug |
| `X-Otask-Default-Project` | **passthrough** (override env) | Default project slug/id |

## Примеры для n8n

### Gateway

- URL: `https://otask-mcp.example/mcp`
- Transport: **HTTP Streamable**
- Credential / header: `Authorization: Bearer <MCP_AUTH_TOKEN>`
- **Не** отправляйте `X-Otask-*` allow/default headers

### Passthrough

- URL: `https://otask-mcp.example/mcp`
- Transport: **HTTP Streamable**
- Credential / header: `Authorization: Bearer <токен api.otask.ru>`
- Опционально: `X-Otask-Allowed-*`, `X-Otask-Default-*`

## Инструменты

Регистрируются в `packages/core/src/tools/registry.ts`:

| Инструмент | Назначение |
|------------|------------|
| `otask_me` | Текущий пользователь (id, имя, email, timezone) |
| `otask_list_tasks` | Задачи воркспейса; по умолчанию `mine=true`; фильтры `performer_ids`, `project_ids`, `priority_ids`, `due`, `page` |
| `otask_get_task` | Получить одну задачу по workspace + slug задачи |
| `otask_update_task` | Обновить существующую задачу |
| `otask_list_projects` | Список проектов воркспейса (с фильтром по allow-list) |
| `otask_list_project_tasks` | Задачи проекта: по умолчанию активные задачи из UI board snapshot; `active_only=false` для полного legacy-списка |
| `otask_list_board` | Доски/колонки (статусы) с `type`, `is_system`, `tasks_count`; `type=completed` помечает завершённую колонку |
| `otask_list_members` | Участники воркспейса |
| `otask_list_tags` | Теги воркспейса |
| `otask_list_comments` | Комментарии к задаче |
| `otask_add_comment` | Добавить комментарий (`parent_id` для ответов) |
| `otask_create_task` | Создать задачу (`name`, `board_id`, `board_column_id`, `end_at`, …) |
| `otask_move_task` | Переместить задачу в другую колонку |
| `otask_archive_task` | Архивировать задачу |

Inbox (после `OTASK_DEFAULT_WS`):

```text
otask_me
otask_list_tasks  # mine=true
otask_list_tasks due=today
otask_list_tasks due=overdue
```

## Defaults и allow-list (ws + projects)

| Что | Env (gateway/stdio) | Header (passthrough) |
|-----|---------------------|----------------------|
| Default workspace | `OTASK_DEFAULT_WS` | `X-Otask-Default-Ws` (override) |
| Default project | `OTASK_DEFAULT_PROJECT` (slug или id) | `X-Otask-Default-Project` |
| Limit workspaces | `OTASK_ALLOWED_WS` | `X-Otask-Allowed-Ws` |
| Limit projects | `OTASK_ALLOWED_PROJECTS` | `X-Otask-Allowed-Projects` |

Формат allow-list: значения через запятую. Projects: **slug** и/или **numeric id**. WS: только slug. Пусто = off.

`otask_list_board` по умолчанию шлёт `type=status` (так требует O!task API).

## Снимок API-документации

```bash
bun run docs:parse
```

Пишет в `docs/catalog/` (или `bun run docs:parse --file path` для офлайн HTML).

## Разработка

Монорепо: `packages/core`, `packages/stdio`, `packages/http-node`, `packages/worker`.

```bash
bun install
bun run build          # core → stdio → http-node
bun test
bun start              # stdio MCP
bun run start:http     # Streamable HTTP MCP
bun run dev            # stdio hot reload
bun run dev:http       # HTTP hot reload
```

### Добавление инструмента

1. `packages/core/src/services/api.ts` / `client.ts` — метод API при необходимости  
2. `packages/core/src/schemas/` — Zod input schema  
3. `packages/core/src/tools/my-tool.ts` — factory → `ToolDefinition`  
4. `packages/core/src/tools/registry.ts` — добавить в `toolFactories`  

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, PR checks, and the release tag flow.

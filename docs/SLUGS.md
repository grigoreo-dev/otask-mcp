# Slugs в O!task MCP

> **Неофициально.** otask-mcp — независимый open-source MCP-коннектор к API O!task. Не аффилирован с O!task, не является его частью и не поддерживается им.

## Что такое slug

В tools и defaults используются **slug** — UUID из URL `panel.otask.ru` и полей `slug` в API O!task:

| Параметр | Что это |
|----------|---------|
| `ws_slug` | пространство (workspace / team) |
| `project_slug` | проект |
| `task_slug` | задача |

Пример фрагмента URL панели: `…/ws/<ws_slug>/…/tasks/<task_slug>`.

## Defaults и allow-list

- `OTASK_DEFAULT_WS` / `OTASK_ALLOWED_WS` (и OAuth-defaults Remote MCP) принимают **slug пространства** (UUID).
- `OTASK_DEFAULT_PROJECT` / `OTASK_ALLOWED_PROJECTS` принимают **slug проекта** (UUID) **или** numeric id проекта.
- Пустой allow-list = **без ограничения** (доступ ко всем пространствам/проектам, к которым есть доступ у токена).

## Что slug **не** является

Номера досок в UI вроде **`#633`** — **не** slug. Их нельзя подставлять в `ws_slug` / `project_slug` / `task_slug`. Поддержка человекочитаемых board numbers — Wave 2.

## Когда slug вообще нужен

После OAuth-визарда (выбор пространства и проекта из списков) пользователь **редко** вводит UUID вручную. Агентам предпочтительнее:

1. `otask_list_workspaces` — список пространств (если одно — может подставиться автоматически);
2. `otask_list_projects` — проекты пространства;
3. дальше tools с явным `ws_slug` / `project_slug` / `task_slug` только когда нужно.

stdio / HTTP: defaults через env `OTASK_DEFAULT_*` (те же UUID-slug или project id).

## Терминология

| UI / docs (RU) | Код / API |
|----------------|-----------|
| **пространство** | workspace / team (`ws_slug`, `GET /api/v1/teams`) |
| проект | project (`project_slug` или numeric id) |
| задача | task (`task_slug`) |

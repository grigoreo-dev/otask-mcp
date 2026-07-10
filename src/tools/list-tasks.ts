import {
  ListTasksInputSchema,
  type ListTasksInput,
} from "../schemas/workspace.js";
import {
  collectTasksWithDueScan,
  DUE_SCAN_MAX_PAGES,
  type DueFilter,
} from "../services/due-filter.js";
import { agentListResult } from "../services/format.js";
import { createMeCache } from "../services/me-cache.js";
import { resolveWsSlug } from "../services/scope.js";
import { compactTask } from "../services/task-mapper.js";
import type { ListWorkspaceTasksQuery } from "../types.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createListTasksTool({
  api,
  guard,
  scope,
  meCache,
}: ToolDeps): ToolDefinition<ListTasksInput> {
  const cache = meCache ?? createMeCache(() => api.getMe());

  return {
    name: "otask_list_tasks",
    config: {
      title: "List O!task Workspace Tasks",
      description: `List workspace tasks with optional mine / performer / project / priority / due filters.

Args:
  - ws_slug: optional if OTASK_DEFAULT_WS is set
  - page: API page (default 1)
  - mine: default true — filter performer_ids to current user (ignored when performer_ids set)
  - performer_ids, project_ids, priority_ids: optional API filters
  - due: none|overdue|today|week — client-side filter; multi-page scan when not none

Returns compact tasks via agent list envelope. Meta in next.

Docs: https://api.otask.ru/docs`,
      inputSchema: ListTasksInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async (input) => {
      try {
        const ws = resolveWsSlug(input.ws_slug, scope);
        const due: DueFilter = input.due ?? "none";
        const page = input.page ?? 1;

        let performer_ids: number[] | undefined;
        let timeZone = "UTC";
        let mineEffective = false;

        if (input.performer_ids?.length) {
          performer_ids = input.performer_ids;
          if (due !== "none") {
            const me = await cache.get();
            timeZone = me.timezone;
          }
        } else if (input.mine !== false) {
          const me = await cache.get();
          performer_ids = [me.id];
          timeZone = me.timezone;
          mineEffective = true;
        } else if (due !== "none") {
          const me = await cache.get();
          timeZone = me.timezone;
        }

        const baseQuery: ListWorkspaceTasksQuery = { page };
        if (performer_ids?.length) baseQuery.performer_ids = performer_ids;
        if (input.project_ids?.length) baseQuery.project_ids = input.project_ids;
        if (input.priority_ids?.length) {
          baseQuery.priority_ids = input.priority_ids;
        }

        let idToSlug: Map<number, string> | undefined;
        if (!guard.list.isEmpty) {
          const projects = await api.listProjects(ws);
          idToSlug = new Map(projects.map((p) => [p.id, p.slug]));
        }

        const allow = (projectId: number) =>
          guard.allows({
            id: projectId,
            slug: idToSlug?.get(projectId),
          });

        if (due === "none") {
          const result = await api.listWorkspaceTasks(ws, baseQuery);
          const items = result.tasks
            .filter((t) => allow(t.project_id))
            .map((t) => compactTask(t));
          const mineLabel =
            input.performer_ids?.length != null && input.performer_ids.length > 0
              ? "performer_ids"
              : `mine=${mineEffective}`;
          const payload = agentListResult(
            `${items.length} task(s) (${mineLabel})`,
            items,
            result.meta,
          );
          return jsonToolResult(
            payload,
            payload as unknown as Record<string, unknown>,
          );
        }

        const scanned = await collectTasksWithDueScan({
          fetchPage: async (p) => {
            const r = await api.listWorkspaceTasks(ws, {
              ...baseQuery,
              page: p,
            });
            return {
              tasks: r.tasks,
              meta: r.meta as Record<string, unknown> | undefined,
            };
          },
          startPage: page,
          due,
          now: new Date(),
          timeZone,
          maxPages: DUE_SCAN_MAX_PAGES,
          allow,
        });

        const items = scanned.tasks.map((t) => compactTask(t));
        const payload = agentListResult(
          `${items.length} task(s) (due=${due}, scanned_pages=${scanned.meta.scanned_pages})`,
          items,
          scanned.meta,
        );
        return jsonToolResult(
          payload,
          payload as unknown as Record<string, unknown>,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

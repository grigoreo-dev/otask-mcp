import {
  ArchiveTaskInputSchema,
  type ArchiveTaskInput,
} from "../schemas/task.js";
import { assertProjectIdAllowed } from "../services/project-guard.js";
import { resolveWsSlug } from "../services/scope.js";
import { compactTask } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createArchiveTaskTool({
  api,
  guard,
  scope,
}: ToolDeps): ToolDefinition<ArchiveTaskInput> {
  return {
    name: "otask_archive_task",
    config: {
      title: "Archive O!task Task",
      description: `Archive a task (POST .../in-archive). Fetches the task first to enforce project allow-list.

Args:
  - ws_slug: optional if OTASK_DEFAULT_WS is set
  - task_slug: task identity

Returns archived compact task.

Docs: https://api.otask.ru/docs`,
      inputSchema: ArchiveTaskInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    handler: async ({ ws_slug, task_slug }) => {
      try {
        const ws = resolveWsSlug(ws_slug, scope);
        const current = await api.getTask(ws, task_slug);
        const projectSlug =
          typeof current.project_slug === "string"
            ? current.project_slug
            : undefined;
        await assertProjectIdAllowed(
          guard,
          () => api.listProjects(ws),
          current.project_id,
          projectSlug,
        );
        const task = await api.archiveTask(ws, task_slug);
        const summary = compactTask(task);
        return jsonToolResult(summary, { task: summary });
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

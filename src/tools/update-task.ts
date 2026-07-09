import {
  UpdateTaskInputSchema,
  type UpdateTaskInput,
} from "../schemas/task.js";
import { assertProjectIdAllowed } from "../services/project-guard.js";
import { resolveWsSlug } from "../services/scope.js";
import {
  buildUpdateBodyFromTask,
  summarizeTask,
} from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createUpdateTaskTool({
  api,
  guard,
  scope,
}: ToolDeps): ToolDefinition<UpdateTaskInput> {
  return {
    name: "otask_update_task",
    config: {
      title: "Update O!task Task",
      description: `Update an existing O!task task. Sends POST /api/v1/ws/{ws_slug}/tasks/{task_slug}/update.

The O!task API requires a full task payload. This tool fetches the current task, merges your changes, then submits the update. Only pass fields you want to change. Project must be allow-listed when configured.

Common updates:
  - board_column_id: move task to another column/status
  - name, description, end_at, priority_id
  - performers, tags, subtasks, files
  - comment: optional note recorded with the update

Args:
  - ws_slug: optional if OTASK_DEFAULT_WS is set
  - task_slug: UUID from panel.otask.ru
  - Any task fields to change (all optional except task_slug)

Returns updated task summary on success.

Docs: https://api.otask.ru/docs#zadaci-POSTapi-v1-ws--ws_slug--tasks--task_slug--update`,
      inputSchema: UpdateTaskInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    handler: async (params) => {
      const { ws_slug, task_slug, ...changes } = params;

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
        const body = buildUpdateBodyFromTask(current, {
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(changes.board_id !== undefined
            ? { board_id: changes.board_id }
            : {}),
          ...(changes.board_column_id !== undefined
            ? { board_column_id: changes.board_column_id }
            : {}),
          ...(changes.comment !== undefined
            ? { comment: changes.comment }
            : {}),
          ...(changes.description !== undefined
            ? { description: changes.description }
            : {}),
          ...(changes.end_at !== undefined ? { end_at: changes.end_at } : {}),
          ...(changes.files !== undefined ? { files: changes.files } : {}),
          ...(changes.performers !== undefined
            ? { performers: changes.performers }
            : {}),
          ...(changes.priority_id !== undefined
            ? { priority_id: changes.priority_id }
            : {}),
          ...(changes.project_id !== undefined
            ? { project_id: changes.project_id }
            : {}),
          ...(changes.subtasks !== undefined
            ? { subtasks: changes.subtasks }
            : {}),
          ...(changes.tags !== undefined ? { tags: changes.tags } : {}),
        });

        if (changes.project_id !== undefined) {
          await assertProjectIdAllowed(
            guard,
            () => api.listProjects(ws),
            changes.project_id,
          );
        }

        const result = await api.updateTask(ws, task_slug, body);
        const summary = summarizeTask(result.task);

        return jsonToolResult(
          {
            success: result.success,
            message: result.message,
            task: summary,
            is_recovery: result.is_recovery,
            is_detach_parent: result.is_detach_parent,
          },
          {
            success: result.success,
            message: result.message,
            task: summary,
          },
        );
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

import {
  MoveTaskInputSchema,
  type MoveTaskInput,
} from "../schemas/task.js";
import { assertProjectIdAllowed } from "../services/project-guard.js";
import {
  buildUpdateBodyFromTask,
  compactTask,
} from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createMoveTaskTool({
  api,
  guard,
}: ToolDeps): ToolDefinition<MoveTaskInput> {
  return {
    name: "otask_move_task",
    config: {
      title: "Move O!task Task",
      description: `Move a task to another board column (status). Fetches the task, merges board_column_id (and optional board_id), then updates.

Discover column IDs via otask_list_board. Project must be allow-listed when configured.

Args:
  - ws_slug, task_slug: task identity
  - board_column_id: target column
  - board_id: optional if changing board

Returns updated compact task.

Docs: https://api.otask.ru/docs`,
      inputSchema: MoveTaskInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async ({ ws_slug, task_slug, board_column_id, board_id }) => {
      try {
        const current = await api.getTask(ws_slug, task_slug);
        const projectSlug =
          typeof current.project_slug === "string"
            ? current.project_slug
            : undefined;
        await assertProjectIdAllowed(
          guard,
          () => api.listProjects(ws_slug),
          current.project_id,
          projectSlug,
        );
        const body = buildUpdateBodyFromTask(current, {
          board_column_id,
          ...(board_id !== undefined ? { board_id } : {}),
        });
        const result = await api.updateTask(ws_slug, task_slug, body);
        const summary = compactTask(result.task);
        return jsonToolResult(
          {
            success: result.success,
            message: result.message,
            task: summary,
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

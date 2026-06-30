import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CHARACTER_LIMIT } from "../constants.js";
import { UpdateTaskInputSchema } from "../schemas/task.js";
import { formatApiError, getTask, updateTask } from "../services/api.js";
import {
  buildUpdateBodyFromTask,
  summarizeTask,
} from "../services/task-mapper.js";

export function registerUpdateTaskTool(server: McpServer): void {
  server.registerTool(
    "otask_update_task",
    {
      title: "Update O!task Task",
      description: `Update an existing O!task task. Sends POST /api/v1/ws/{ws_slug}/tasks/{task_slug}/update.

The O!task API requires a full task payload. This tool fetches the current task, merges your changes, then submits the update. Only pass fields you want to change.

Common updates:
  - board_column_id: move task to another column/status
  - name, description, end_at, priority_id
  - performers, tags, subtasks, files
  - comment: optional note recorded with the update

Args:
  - ws_slug, task_slug: UUIDs from panel.otask.ru
  - Any task fields to change (all optional except slugs)

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
    async (params) => {
      const { ws_slug, task_slug, ...changes } = params;

      try {
        const current = await getTask(ws_slug, task_slug);
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

        const result = await updateTask(ws_slug, task_slug, body);
        const summary = summarizeTask(result.task);

        let text = JSON.stringify(
          {
            success: result.success,
            message: result.message,
            task: summary,
            is_recovery: result.is_recovery,
            is_detach_parent: result.is_detach_parent,
          },
          null,
          2,
        );

        if (text.length > CHARACTER_LIMIT) {
          text = text.slice(0, CHARACTER_LIMIT) + "\n… (truncated)";
        }

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            success: result.success,
            message: result.message,
            task: summary,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: formatApiError(error) }],
          isError: true,
        };
      }
    },
  );
}

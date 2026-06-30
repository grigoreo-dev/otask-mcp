import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CHARACTER_LIMIT } from "../constants.js";
import { GetTaskInputSchema } from "../schemas/task.js";
import { formatApiError, getTask } from "../services/api.js";
import { summarizeTask } from "../services/task-mapper.js";

export function registerGetTaskTool(server: McpServer): void {
  server.registerTool(
    "otask_get_task",
    {
      title: "Get O!task Task",
      description: `Fetch a task from O!task by workspace and task slug.

Use before otask_update_task to inspect current field values (board_id, performers, tags, etc.).

Args:
  - ws_slug: Workspace UUID from panel.otask.ru URL (/ws/{ws_slug}/...)
  - task_slug: Task UUID from URL (.../tasks/{task_slug})

Returns JSON with key task fields: id, slug, name, description, end_at, board_id, board_column_id, priority_id, project_id, performers, tags.

Docs: https://api.otask.ru/docs#zadaci-GETapi-v1-ws--ws_slug--tasks--task_slug`,
      inputSchema: GetTaskInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ws_slug, task_slug }) => {
      try {
        const task = await getTask(ws_slug, task_slug);
        const summary = summarizeTask(task);
        let text = JSON.stringify(summary, null, 2);

        if (text.length > CHARACTER_LIMIT) {
          text =
            text.slice(0, CHARACTER_LIMIT) +
            "\n… (truncated; use specific field queries via get + update)";
        }

        return {
          content: [{ type: "text", text }],
          structuredContent: { task: summary },
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

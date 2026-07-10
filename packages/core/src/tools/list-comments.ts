import { type ListCommentsInput, ListCommentsInputSchema } from "../schemas/task.js";
import { assertProjectIdAllowed } from "../services/project-guard.js";
import { resolveWsSlug } from "../services/scope.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createListCommentsTool({
  api,
  guard,
  scope,
}: ToolDeps): ToolDefinition<ListCommentsInput> {
  return {
    name: "otask_list_comments",
    config: {
      title: "List O!task Task Comments",
      description: `List comments on a task. Fetches the task first to enforce project allow-list.

Args:
  - ws_slug: optional if OTASK_DEFAULT_WS is set
  - task_slug: task identity

Returns API comments payload.

Docs: https://api.otask.ru/docs`,
      inputSchema: ListCommentsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async ({ ws_slug, task_slug }) => {
      try {
        const ws = resolveWsSlug(ws_slug, scope);
        const current = await api.getTask(ws, task_slug);
        const projectSlug =
          typeof current.project_slug === "string" ? current.project_slug : undefined;
        await assertProjectIdAllowed(
          guard,
          () => api.listProjects(ws),
          current.project_id,
          projectSlug
        );
        const data = await api.listComments(ws, task_slug);
        return jsonToolResult(data, data as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

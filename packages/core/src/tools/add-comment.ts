import { type AddCommentInput, AddCommentInputSchema } from "../schemas/task.js";
import { assertProjectIdAllowed } from "../services/project-guard.js";
import { resolveWsSlug } from "../services/scope.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createAddCommentTool({
  api,
  guard,
  scope,
}: ToolDeps): ToolDefinition<AddCommentInput> {
  return {
    name: "otask_add_comment",
    config: {
      title: "Add O!task Task Comment",
      description: `Add a comment on a task (optional parent_id for replies). Fetches the task first to enforce project allow-list.

Args:
  - ws_slug: optional if OTASK_DEFAULT_WS is set
  - task_slug: task identity
  - comment: comment body
  - parent_id: optional parent comment ID

Returns API store response.

Docs: https://api.otask.ru/docs`,
      inputSchema: AddCommentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    handler: async ({ ws_slug, task_slug, comment, parent_id }) => {
      try {
        const ws = await resolveWsSlug(ws_slug, scope, () => api.listWorkspaces());
        const current = await api.getTask(ws, task_slug);
        const projectSlug =
          typeof current.project_slug === "string" ? current.project_slug : undefined;
        await assertProjectIdAllowed(
          guard,
          () => api.listProjects(ws),
          current.project_id,
          projectSlug
        );
        const data = await api.addComment(ws, task_slug, comment, parent_id);
        return jsonToolResult(data, data as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

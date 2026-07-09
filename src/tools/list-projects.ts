import {
  WsSlugSchema,
  type WsSlugInput,
} from "../schemas/workspace.js";
import { agentListResult } from "../services/format.js";
import { compactProject } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createListProjectsTool({
  api,
  guard,
}: ToolDeps): ToolDefinition<WsSlugInput> {
  return {
    name: "otask_list_projects",
    config: {
      title: "List O!task Projects",
      description: `List projects in a workspace. Results are filtered by the project allow-list when configured.

Args:
  - ws_slug: Workspace UUID from panel.otask.ru

Returns compact projects: id, slug, name, status_id.

Docs: https://api.otask.ru/docs`,
      inputSchema: WsSlugSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async ({ ws_slug }) => {
      try {
        const projects = await api.listProjects(ws_slug);
        const allowed = guard.filterProjects(projects);
        const items = allowed.map((p) => compactProject(p));
        const payload = agentListResult(
          `${items.length} project(s)`,
          items,
        );
        return jsonToolResult(payload, payload as unknown as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

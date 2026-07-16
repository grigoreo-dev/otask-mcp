import { z } from "zod";
import { agentListResult } from "../services/format.js";
import { compactWorkspace } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

const EmptySchema = z.object({}).strict();

export function createListWorkspacesTool({ api }: ToolDeps): ToolDefinition<Record<string, never>> {
  return {
    name: "otask_list_workspaces",
    config: {
      title: "List O!task Workspaces (пространства)",
      description: `List workspaces (пространства / teams) for the authenticated user. No args.
Use when ws_slug is missing or to discover slugs before other tools.

Returns compact: id, slug, name.

Docs: https://api.otask.ru/docs`,
      inputSchema: EmptySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async () => {
      try {
        const teams = await api.listWorkspaces();
        const items = teams.map((t) =>
          compactWorkspace({
            id: Number(t.id),
            slug: String(t.slug ?? ""),
            name: String(t.name ?? t.slug ?? ""),
          })
        );
        const payload = agentListResult(`${items.length} workspace(s)`, items);
        return jsonToolResult(payload, payload as unknown as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

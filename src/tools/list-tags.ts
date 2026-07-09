import {
  WsSlugSchema,
  type WsSlugInput,
} from "../schemas/workspace.js";
import { agentListResult } from "../services/format.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createListTagsTool({
  api,
}: ToolDeps): ToolDefinition<WsSlugInput> {
  return {
    name: "otask_list_tags",
    config: {
      title: "List O!task Tags",
      description: `List workspace tags for labeling tasks.

Args:
  - ws_slug: Workspace UUID from panel.otask.ru

Returns tags as agent list envelope.

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
        const tags = await api.listTags(ws_slug);
        const payload = agentListResult(`${tags.length} tag(s)`, tags);
        return jsonToolResult(payload, payload as unknown as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

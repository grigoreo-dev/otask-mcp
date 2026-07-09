import {
  WsSlugSchema,
  type WsSlugInput,
} from "../schemas/workspace.js";
import { agentListResult } from "../services/format.js";
import { resolveWsSlug } from "../services/scope.js";
import { compactTag } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createListTagsTool({
  api,
  scope,
}: ToolDeps): ToolDefinition<WsSlugInput> {
  return {
    name: "otask_list_tags",
    config: {
      title: "List O!task Tags",
      description: `List workspace tags for labeling tasks.

Args:
  - ws_slug: optional if OTASK_DEFAULT_WS is set

Returns compact tags (id, name, slug?, color?) as agent list envelope.

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
        const ws = resolveWsSlug(ws_slug, scope);
        const tags = await api.listTags(ws);
        const items = tags.map((t) =>
          compactTag(t as { id: number; name: string; slug?: string; color?: string }),
        );
        const payload = agentListResult(`${items.length} tag(s)`, items);
        return jsonToolResult(payload, payload as unknown as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

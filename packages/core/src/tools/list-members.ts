import { type WsSlugInput, WsSlugSchema } from "../schemas/workspace.js";
import { agentListResult } from "../services/format.js";
import { resolveWsSlug } from "../services/scope.js";
import { compactMember } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createListMembersTool({ api, scope }: ToolDeps): ToolDefinition<WsSlugInput> {
  return {
    name: "otask_list_members",
    config: {
      title: "List O!task Members",
      description: `List workspace members (performers for assignment).

Args:
  - ws_slug: optional if OTASK_DEFAULT_WS is set

Returns compact members: id, name, email, status_text.

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
        const members = await api.listMembers(ws);
        const items = members.map((m) =>
          compactMember(
            (m ?? {}) as {
              id?: number;
              user_id?: number;
              full_name?: string;
              email?: string;
              status_text?: string;
            }
          )
        );
        const payload = agentListResult(`${items.length} member(s)`, items);
        return jsonToolResult(payload, payload as unknown as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

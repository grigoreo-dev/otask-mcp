import { z } from "zod";
import { type CompactMe, createMeCache } from "../services/me-cache.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

const EmptySchema = z.object({}).strict();

export function createMeTool({ api, meCache }: ToolDeps): ToolDefinition<Record<string, never>> {
  const cache = meCache ?? createMeCache(() => api.getMe());
  return {
    name: "otask_me",
    config: {
      title: "Current O!task User",
      description: `Return the authenticated O!task user (id, full_name, email, timezone).

Use before otask_list_tasks when you need the performer id explicitly.
No args.

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
        const me: CompactMe = await cache.get();
        return jsonToolResult(me, me as unknown as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

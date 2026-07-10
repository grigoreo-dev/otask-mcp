import { type ListBoardInput, ListBoardInputSchema } from "../schemas/workspace.js";
import { resolveProjectSlug, resolveWsSlug } from "../services/scope.js";
import { compactBoard, compactColumn } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createListBoardTool({ api, scope }: ToolDeps): ToolDefinition<ListBoardInput> {
  return {
    name: "otask_list_board",
    config: {
      title: "List O!task Board",
      description: `List boards and columns for a project (statuses). Project must be on the allow-list when configured.

Use before create/move to discover board_id and board_column_id.
API requires type=status (defaulted by this tool).

Args:
  - ws_slug, project_slug: optional if defaults set
  - type: defaults to "status"
  - board_slug: optional specific board

Returns compact boards and columns (id, name, slug?, color?, board_id?).

Docs: https://api.otask.ru/docs`,
      inputSchema: ListBoardInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async ({ ws_slug, project_slug, type, board_slug }) => {
      try {
        const ws = resolveWsSlug(ws_slug, scope);
        const project = await resolveProjectSlug(project_slug, scope, () => api.listProjects(ws));
        const query = {
          type: type ?? "status",
          ...(board_slug !== undefined ? { board_slug } : {}),
        };
        const result = await api.listBoard(ws, project, query);
        const boards = result.boards.map((b) =>
          compactBoard(b as { id: number; name: string; slug?: string; color?: string })
        );
        const columns = result.columns.map((c) =>
          compactColumn(
            c as {
              id: number;
              name: string;
              slug?: string;
              color?: string;
              board_id?: number;
            }
          )
        );
        const payload = {
          summary: `${boards.length} board(s), ${columns.length} column(s)`,
          boards,
          columns,
          next: null,
        };
        return jsonToolResult(payload, payload);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

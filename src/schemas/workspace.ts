import { z } from "zod";

export const WsSlugSchema = z
  .object({
    ws_slug: z
      .string()
      .min(1)
      .describe("Workspace slug (UUID from panel.otask.ru URL)"),
  })
  .strict();

export type WsSlugInput = z.infer<typeof WsSlugSchema>;

export const ProjectSlugSchema = WsSlugSchema.extend({
  project_slug: z
    .string()
    .min(1)
    .describe("Project slug (UUID from panel.otask.ru URL)"),
}).strict();

export type ProjectSlugInput = z.infer<typeof ProjectSlugSchema>;

export const ListProjectTasksInputSchema = ProjectSlugSchema.extend({
  page: z.number().int().optional().describe("Page number for pagination"),
  status_id: z.number().int().optional().describe("Filter by status id"),
  board_id: z.number().int().optional().describe("Filter by board id"),
  board_column_id: z
    .number()
    .int()
    .optional()
    .describe("Filter by board column id"),
}).strict();

export type ListProjectTasksInput = z.infer<typeof ListProjectTasksInputSchema>;

export const ListBoardInputSchema = ProjectSlugSchema.extend({
  type: z.string().optional().describe("Board type filter"),
  board_slug: z.string().optional().describe("Specific board slug"),
}).strict();

export type ListBoardInput = z.infer<typeof ListBoardInputSchema>;

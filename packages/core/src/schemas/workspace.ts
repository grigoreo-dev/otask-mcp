import { z } from "zod";

export const WsSlugSchema = z
  .object({
    ws_slug: z
      .string()
      .min(1)
      .optional()
      .describe("Workspace slug (UUID from panel.otask.ru). Optional if OTASK_DEFAULT_WS is set."),
  })
  .strict();

export type WsSlugInput = z.infer<typeof WsSlugSchema>;

export const ProjectSlugSchema = WsSlugSchema.extend({
  project_slug: z
    .string()
    .min(1)
    .optional()
    .describe("Project slug (UUID from panel.otask.ru). Optional if OTASK_DEFAULT_PROJECT is set."),
}).strict();

export type ProjectSlugInput = z.infer<typeof ProjectSlugSchema>;

export const ListProjectTasksInputSchema = ProjectSlugSchema.extend({
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Page number for legacy task_list mode when active_only=false"),
  status_id: z
    .number()
    .int()
    .optional()
    .describe("Legacy/internal O!task status id; project task endpoint may ignore this"),
  board_id: z
    .number()
    .int()
    .optional()
    .describe("Client-side board filter in active board snapshot mode"),
  board_column_id: z
    .number()
    .int()
    .optional()
    .describe("Client-side column filter in active board snapshot mode"),
  active_only: z
    .boolean()
    .optional()
    .describe("Default true. Use board snapshot and exclude columns where type=completed."),
  detail: z
    .enum(["compact", "full"])
    .optional()
    .describe("compact (default): omit HTML description; full: include description"),
}).strict();

export type ListProjectTasksInput = z.infer<typeof ListProjectTasksInputSchema>;

export const ListBoardInputSchema = ProjectSlugSchema.extend({
  type: z
    .string()
    .optional()
    .describe('Board type filter (API requires "status"; defaulted by tool)'),
  board_slug: z.string().optional().describe("Specific board slug"),
}).strict();

export type ListBoardInput = z.infer<typeof ListBoardInputSchema>;

export const ListTasksInputSchema = WsSlugSchema.extend({
  page: z.number().int().positive().optional().describe("API page number (default 1)"),
  mine: z
    .boolean()
    .optional()
    .describe(
      "If true (default), filter performer_ids to current user. Ignored when performer_ids set."
    ),
  performer_ids: z.array(z.number().int()).optional().describe("Filter by performer user ids"),
  project_ids: z.array(z.number().int()).optional().describe("Filter by project ids"),
  priority_ids: z.array(z.number().int()).optional().describe("Filter by priority ids"),
  due: z
    .enum(["none", "overdue", "today", "week"])
    .optional()
    .describe("Client-side due filter using me.timezone; scans up to 5 API pages when not none"),
}).strict();

export type ListTasksInput = z.infer<typeof ListTasksInputSchema>;

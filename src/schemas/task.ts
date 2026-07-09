import { z } from "zod";

export const WsTaskSlugSchema = z
  .object({
    ws_slug: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Workspace slug (UUID from panel.otask.ru). Optional if OTASK_DEFAULT_WS is set.",
      ),
    task_slug: z
      .string()
      .min(1)
      .describe("Task slug (UUID from panel.otask.ru URL)"),
  })
  .strict();

export const SubtaskSchema = z
  .object({
    id: z.number().nullable().describe("Subtask ID, null for new subtasks"),
    end_at: z.string().describe("Subtask due date (ISO 8601)"),
    is_completed: z.boolean(),
    name: z.string(),
    performers: z.array(z.number()).describe("Performer user IDs"),
  })
  .strict();

export const FileSchema = z
  .object({
    name: z.string(),
    temp_src: z.string().describe("Temporary upload filename from O!task"),
  })
  .strict();

export const UpdateTaskInputSchema = WsTaskSlugSchema.extend({
  name: z.string().optional().describe("Task title"),
  board_id: z.number().int().optional().describe("Board ID"),
  board_column_id: z.number().int().optional().describe("Column/status ID"),
  comment: z
    .string()
    .optional()
    .describe("Comment added with the update (use empty string to skip)"),
  description: z.string().optional().describe("Task description (HTML allowed)"),
  end_at: z.string().optional().describe("Due date (ISO 8601)"),
  files: z.array(FileSchema).optional().describe("Attached files"),
  performers: z
    .array(z.string())
    .optional()
    .describe("Performer IDs as strings"),
  priority_id: z.number().int().optional().describe("Priority ID"),
  project_id: z.number().int().optional().describe("Project ID"),
  subtasks: z.array(SubtaskSchema).optional(),
  tags: z.array(z.string()).optional().describe("Tag IDs as strings"),
}).strict();

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const GetTaskInputSchema = WsTaskSlugSchema;

export type GetTaskInput = z.infer<typeof GetTaskInputSchema>;

export const MoveTaskInputSchema = WsTaskSlugSchema.extend({
  board_column_id: z.number().int().describe("Target column/status ID"),
  board_id: z
    .number()
    .int()
    .optional()
    .describe("Target board ID if changing board"),
}).strict();

export type MoveTaskInput = z.infer<typeof MoveTaskInputSchema>;

export const CreateTaskInputSchema = z
  .object({
    ws_slug: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Workspace slug. Optional if OTASK_DEFAULT_WS is set.",
      ),
    project_id: z
      .number()
      .int()
      .optional()
      .describe(
        "Project ID (must be allow-listed). Optional if OTASK_DEFAULT_PROJECT is set.",
      ),
    name: z.string().min(1).describe("Task title"),
    board_id: z
      .number()
      .int()
      .describe("Board ID — discover via otask_list_board"),
    board_column_id: z
      .number()
      .int()
      .describe("Column ID — discover via otask_list_board"),
    end_at: z.string().describe("Due date (ISO 8601)"),
    comment: z.string().optional(),
    description: z.string().optional(),
    priority_id: z.number().int().optional(),
    performers: z
      .array(z.string())
      .optional()
      .describe("Performer IDs as strings"),
    tags: z.array(z.string()).optional().describe("Tag IDs as strings"),
  })
  .strict();

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const ArchiveTaskInputSchema = WsTaskSlugSchema;

export type ArchiveTaskInput = z.infer<typeof ArchiveTaskInputSchema>;

export const ListCommentsInputSchema = WsTaskSlugSchema;

export type ListCommentsInput = z.infer<typeof ListCommentsInputSchema>;

export const AddCommentInputSchema = WsTaskSlugSchema.extend({
  comment: z.string().min(1).describe("Comment body"),
  parent_id: z
    .number()
    .int()
    .optional()
    .describe("Parent comment ID for replies"),
}).strict();

export type AddCommentInput = z.infer<typeof AddCommentInputSchema>;

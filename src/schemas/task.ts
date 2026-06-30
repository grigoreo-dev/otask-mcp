import { z } from "zod";

export const WsTaskSlugSchema = z
  .object({
    ws_slug: z
      .string()
      .min(1)
      .describe("Workspace slug (UUID from panel.otask.ru URL)"),
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

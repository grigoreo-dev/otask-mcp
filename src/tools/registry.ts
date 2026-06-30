import { createGetTaskTool } from "./get-task.js";
import { createUpdateTaskTool } from "./update-task.js";

/** Add new tools here — one factory per file. */
export const toolFactories = [
  createGetTaskTool,
  createUpdateTaskTool,
] as const;

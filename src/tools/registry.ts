import { createGetTaskTool } from "./get-task.js";
import { createListBoardTool } from "./list-board.js";
import { createListMembersTool } from "./list-members.js";
import { createListProjectTasksTool } from "./list-project-tasks.js";
import { createListProjectsTool } from "./list-projects.js";
import { createListTagsTool } from "./list-tags.js";
import { createUpdateTaskTool } from "./update-task.js";

/** Add new tools here — one factory per file. */
export const toolFactories = [
  createGetTaskTool,
  createUpdateTaskTool,
  createListProjectsTool,
  createListProjectTasksTool,
  createListBoardTool,
  createListMembersTool,
  createListTagsTool,
] as const;

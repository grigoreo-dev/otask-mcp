import { createAddCommentTool } from "./add-comment.js";
import { createArchiveTaskTool } from "./archive-task.js";
import { createCreateTaskTool } from "./create-task.js";
import { createGetTaskTool } from "./get-task.js";
import { createListBoardTool } from "./list-board.js";
import { createListCommentsTool } from "./list-comments.js";
import { createListMembersTool } from "./list-members.js";
import { createListProjectTasksTool } from "./list-project-tasks.js";
import { createListProjectsTool } from "./list-projects.js";
import { createListTagsTool } from "./list-tags.js";
import { createMoveTaskTool } from "./move-task.js";
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
  createListCommentsTool,
  createAddCommentTool,
  createCreateTaskTool,
  createMoveTaskTool,
  createArchiveTaskTool,
] as const;

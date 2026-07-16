import type {
  CreateTaskBody,
  ListBoardQuery,
  ListBoardResult,
  ListProjectTasksResult,
  ListWorkspaceTasksQuery,
  ListWorkspaceTasksResult,
  OtaskProjectSummary,
  OtaskTask,
  UpdateTaskBody,
  UpdateTaskResult,
} from "../types.js";
import {
  addComment,
  archiveTask,
  createTask,
  getMe,
  getTask,
  listBoard,
  listComments,
  listMembers,
  listProjects,
  listProjectTasks,
  listTags,
  listTeams,
  listWorkspaceTasks,
  type OtaskWorkspaceSummary,
  updateTask,
} from "./api.js";
import type { OtaskAuthResolver } from "./auth.js";

/** O!task API bound to a single auth resolver (per MCP server / HTTP request). */
export interface OtaskClient {
  getMe(): Promise<unknown>;
  listWorkspaces(): Promise<OtaskWorkspaceSummary[]>;
  getTask(wsSlug: string, taskSlug: string): Promise<OtaskTask>;
  updateTask(wsSlug: string, taskSlug: string, body: UpdateTaskBody): Promise<UpdateTaskResult>;
  listProjects(wsSlug: string): Promise<OtaskProjectSummary[]>;
  listProjectTasks(
    wsSlug: string,
    projectSlug: string,
    query?: Record<string, string | number | undefined>
  ): Promise<ListProjectTasksResult>;
  listWorkspaceTasks(
    wsSlug: string,
    query?: ListWorkspaceTasksQuery
  ): Promise<ListWorkspaceTasksResult>;
  listBoard(wsSlug: string, projectSlug: string, query?: ListBoardQuery): Promise<ListBoardResult>;
  listMembers(wsSlug: string): Promise<unknown[]>;
  listTags(wsSlug: string): Promise<unknown[]>;
  listComments(wsSlug: string, taskSlug: string, body?: object): Promise<unknown>;
  addComment(
    wsSlug: string,
    taskSlug: string,
    comment: string,
    parentId?: number
  ): Promise<unknown>;
  createTask(wsSlug: string, body: CreateTaskBody): Promise<OtaskTask>;
  archiveTask(wsSlug: string, taskSlug: string): Promise<OtaskTask>;
}

export function createOtaskClient(auth: OtaskAuthResolver): OtaskClient {
  return {
    getMe: () => getMe(auth),
    listWorkspaces: () => listTeams(auth),
    getTask: (wsSlug, taskSlug) => getTask(wsSlug, taskSlug, auth),
    updateTask: (wsSlug, taskSlug, body) => updateTask(wsSlug, taskSlug, body, auth),
    listProjects: (wsSlug) => listProjects(wsSlug, auth),
    listProjectTasks: (wsSlug, projectSlug, query) =>
      listProjectTasks(wsSlug, projectSlug, query, auth),
    listWorkspaceTasks: (wsSlug, query) => listWorkspaceTasks(wsSlug, query, auth),
    listBoard: (wsSlug, projectSlug, query) => listBoard(wsSlug, projectSlug, query, auth),
    listMembers: (wsSlug) => listMembers(wsSlug, auth),
    listTags: (wsSlug) => listTags(wsSlug, auth),
    listComments: (wsSlug, taskSlug, body) => listComments(wsSlug, taskSlug, body, auth),
    addComment: (wsSlug, taskSlug, comment, parentId) =>
      addComment(wsSlug, taskSlug, comment, parentId, auth),
    createTask: (wsSlug, body) => createTask(wsSlug, body, auth),
    archiveTask: (wsSlug, taskSlug) => archiveTask(wsSlug, taskSlug, auth),
  };
}

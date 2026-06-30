import type { OtaskAuthResolver } from "./auth.js";
import { getTask, updateTask } from "./api.js";
import type { OtaskTask, UpdateTaskBody, UpdateTaskResult } from "../types.js";

/** O!task API bound to a single auth resolver (per MCP server / HTTP request). */
export interface OtaskClient {
  getTask(wsSlug: string, taskSlug: string): Promise<OtaskTask>;
  updateTask(
    wsSlug: string,
    taskSlug: string,
    body: UpdateTaskBody,
  ): Promise<UpdateTaskResult>;
}

export function createOtaskClient(auth: OtaskAuthResolver): OtaskClient {
  return {
    getTask: (wsSlug, taskSlug) => getTask(wsSlug, taskSlug, auth),
    updateTask: (wsSlug, taskSlug, body) =>
      updateTask(wsSlug, taskSlug, body, auth),
  };
}

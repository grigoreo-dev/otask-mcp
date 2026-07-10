import { API_BASE_URL } from "../constants.js";
import type {
  CreateTaskBody,
  ListBoardResult,
  ListProjectTasksResult,
  ListWorkspaceTasksQuery,
  ListWorkspaceTasksResult,
  OtaskApiResponse,
  OtaskProjectSummary,
  OtaskTask,
  UpdateTaskBody,
  UpdateTaskResult,
} from "../types.js";
import type { OtaskAuthResolver } from "./auth.js";

export class OtaskApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "OtaskApiError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new OtaskApiError(
        "O!task authorization expired or rejected (401). Reconnect the MCP server and sign in again.",
        401,
        body
      );
    }
    const detail =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : JSON.stringify(body).slice(0, 500);
    throw new OtaskApiError(
      `O!task API error (${response.status}): ${detail}`,
      response.status,
      body
    );
  }

  return body as T;
}

async function headersFor(auth: OtaskAuthResolver): Promise<Record<string, string>> {
  return auth();
}

function wsUrl(wsSlug: string, path: string): string {
  return `${API_BASE_URL}/api/v1/ws/${encodeURIComponent(wsSlug)}${path}`;
}

function withQuery(url: string, query?: Record<string, string | number | undefined>): string {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function assertSuccess<T>(result: OtaskApiResponse<T>, status: number, fallback: string): T {
  if (!result.success) {
    throw new OtaskApiError(result.message ?? fallback, status, result);
  }
  return result.data;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickArray(data: unknown, key: string, status = 200): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (obj && Array.isArray(obj[key])) return obj[key] as unknown[];
  throw new OtaskApiError(`Unexpected API response: missing array field "${key}"`, status, data);
}

function pickTask(data: unknown): OtaskTask {
  const obj = asRecord(data);
  if (obj && obj.task && typeof obj.task === "object") {
    return obj.task as OtaskTask;
  }
  return data as OtaskTask;
}

export async function getMe(auth: OtaskAuthResolver): Promise<unknown> {
  const headers = await headersFor(auth);
  const response = await fetch(`${API_BASE_URL}/api/v1/me`, {
    method: "GET",
    headers,
  });
  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  return assertSuccess(result, response.status, "Failed to get me");
}

function appendArrayParams(
  params: URLSearchParams,
  key: string,
  values: number[] | undefined
): void {
  if (!values?.length) return;
  values.forEach((v, i) => {
    params.set(`${key}[${i}]`, String(v));
  });
}

export async function listWorkspaceTasks(
  wsSlug: string,
  query: ListWorkspaceTasksQuery | undefined,
  auth: OtaskAuthResolver
): Promise<ListWorkspaceTasksResult> {
  const headers = await headersFor(auth);
  const params = new URLSearchParams();
  if (query?.page !== undefined) params.set("page", String(query.page));
  appendArrayParams(params, "performer_ids", query?.performer_ids);
  appendArrayParams(params, "project_ids", query?.project_ids);
  appendArrayParams(params, "priority_ids", query?.priority_ids);
  const qs = params.toString();
  const url = wsUrl(wsSlug, "/tasks") + (qs ? `?${qs}` : "");
  const response = await fetch(url, { method: "GET", headers });
  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(result, response.status, "Failed to list workspace tasks");
  if (Array.isArray(data)) {
    return { tasks: data as OtaskTask[] };
  }
  const obj = asRecord(data);
  if (obj && Array.isArray(obj.tasks)) {
    return {
      tasks: obj.tasks as OtaskTask[],
      meta: asRecord(obj.meta) ?? undefined,
    };
  }
  throw new OtaskApiError(
    'Unexpected API response: missing array field "tasks"',
    response.status,
    data
  );
}

export async function getTask(
  wsSlug: string,
  taskSlug: string,
  auth: OtaskAuthResolver
): Promise<OtaskTask> {
  const headers = await headersFor(auth);
  const response = await fetch(wsUrl(wsSlug, `/tasks/${encodeURIComponent(taskSlug)}`), {
    method: "GET",
    headers,
  });

  const result = await parseResponse<OtaskApiResponse<OtaskTask>>(response);
  return assertSuccess(result, response.status, "Failed to get task");
}

export async function updateTask(
  wsSlug: string,
  taskSlug: string,
  body: UpdateTaskBody,
  auth: OtaskAuthResolver
): Promise<UpdateTaskResult> {
  const headers = await headersFor(auth);
  const response = await fetch(wsUrl(wsSlug, `/tasks/${encodeURIComponent(taskSlug)}/update`), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const result =
    await parseResponse<
      OtaskApiResponse<{
        task: OtaskTask;
        is_recovery?: boolean;
        is_detach_parent?: boolean;
      }>
    >(response);

  const data = assertSuccess(result, response.status, "Failed to update task");

  return {
    success: true,
    message: result.message,
    task: data.task,
    is_recovery: data.is_recovery,
    is_detach_parent: data.is_detach_parent,
  };
}

export async function listProjects(
  wsSlug: string,
  auth: OtaskAuthResolver
): Promise<OtaskProjectSummary[]> {
  const headers = await headersFor(auth);
  const response = await fetch(wsUrl(wsSlug, "/projects/list"), {
    method: "GET",
    headers,
  });

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(result, response.status, "Failed to list projects");
  return pickArray(data, "projects", response.status) as OtaskProjectSummary[];
}

export async function listProjectTasks(
  wsSlug: string,
  projectSlug: string,
  query: Record<string, string | number | undefined> | undefined,
  auth: OtaskAuthResolver
): Promise<ListProjectTasksResult> {
  const headers = await headersFor(auth);
  const url = withQuery(wsUrl(wsSlug, `/projects/${encodeURIComponent(projectSlug)}/tasks`), query);
  const response = await fetch(url, { method: "GET", headers });

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(result, response.status, "Failed to list project tasks");

  if (Array.isArray(data)) {
    return { tasks: data as OtaskTask[] };
  }

  const obj = asRecord(data);
  if (obj && Array.isArray(obj.tasks)) {
    return { tasks: obj.tasks as OtaskTask[], meta: obj.meta };
  }

  throw new OtaskApiError(
    'Unexpected API response: missing array field "tasks"',
    response.status,
    data
  );
}

export async function listBoard(
  wsSlug: string,
  projectSlug: string,
  query: { type?: string; board_slug?: string } | undefined,
  auth: OtaskAuthResolver
): Promise<ListBoardResult> {
  const headers = await headersFor(auth);
  const url = withQuery(
    wsUrl(wsSlug, `/projects/${encodeURIComponent(projectSlug)}/boards`),
    query
  );
  const response = await fetch(url, { method: "GET", headers });

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(result, response.status, "Failed to list board");
  const obj = asRecord(data);
  const hasBoards = obj !== null && Array.isArray(obj.boards);
  const hasColumns = obj !== null && Array.isArray(obj.columns);

  if (!hasBoards && !hasColumns) {
    throw new OtaskApiError(
      "Unexpected API response: missing board envelope (boards/columns)",
      response.status,
      data
    );
  }

  return {
    boards: hasBoards ? (obj!.boards as unknown[]) : [],
    columns: hasColumns ? (obj!.columns as unknown[]) : [],
  };
}

export async function listMembers(wsSlug: string, auth: OtaskAuthResolver): Promise<unknown[]> {
  const headers = await headersFor(auth);
  const response = await fetch(wsUrl(wsSlug, "/members/list"), {
    method: "GET",
    headers,
  });

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(result, response.status, "Failed to list members");
  return pickArray(data, "members", response.status);
}

export async function listTags(wsSlug: string, auth: OtaskAuthResolver): Promise<unknown[]> {
  const headers = await headersFor(auth);
  const response = await fetch(wsUrl(wsSlug, "/kanbans/tags"), {
    method: "GET",
    headers,
  });

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(result, response.status, "Failed to list tags");
  return pickArray(data, "tags", response.status);
}

export async function listComments(
  wsSlug: string,
  taskSlug: string,
  body: object | undefined,
  auth: OtaskAuthResolver
): Promise<unknown> {
  const headers = await headersFor(auth);
  const response = await fetch(
    wsUrl(wsSlug, `/tasks/${encodeURIComponent(taskSlug)}/comments/get`),
    {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    }
  );

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  return assertSuccess(result, response.status, "Failed to list comments");
}

export async function addComment(
  wsSlug: string,
  taskSlug: string,
  comment: string,
  parentId: number | undefined,
  auth: OtaskAuthResolver
): Promise<unknown> {
  const headers = await headersFor(auth);
  const payload: { comment: string; parent_id?: number } = { comment };
  if (parentId !== undefined) {
    payload.parent_id = parentId;
  }

  const response = await fetch(
    wsUrl(wsSlug, `/tasks/${encodeURIComponent(taskSlug)}/comments/store`),
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }
  );

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  return assertSuccess(result, response.status, "Failed to add comment");
}

export async function createTask(
  wsSlug: string,
  body: CreateTaskBody,
  auth: OtaskAuthResolver
): Promise<OtaskTask> {
  const headers = await headersFor(auth);
  const response = await fetch(wsUrl(wsSlug, "/tasks/create"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(result, response.status, "Failed to create task");
  return pickTask(data);
}

export async function archiveTask(
  wsSlug: string,
  taskSlug: string,
  auth: OtaskAuthResolver
): Promise<OtaskTask> {
  const headers = await headersFor(auth);
  const response = await fetch(wsUrl(wsSlug, `/tasks/${encodeURIComponent(taskSlug)}/in-archive`), {
    method: "POST",
    headers,
  });

  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(result, response.status, "Failed to archive task");
  return pickTask(data);
}

export function formatApiError(error: unknown): string {
  if (error instanceof OtaskApiError) {
    if (error.status === 404) {
      return `Error: Task or workspace not found. Check ws_slug and task_slug. ${error.message}`;
    }
    if (error.status === 401) {
      return `Error: ${error.message}`;
    }
    if (error.status === 403) {
      return `Error: O!task auth failed. Check Bearer token. ${error.message}`;
    }
    if (error.status === 429) {
      return "Error: Rate limit exceeded. Wait before retrying.";
    }
    return error.message;
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Error: ${String(error)}`;
}

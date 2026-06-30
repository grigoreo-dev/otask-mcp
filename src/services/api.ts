import type { OtaskAuthResolver } from "./auth.js";
import type {
  OtaskApiResponse,
  OtaskTask,
  UpdateTaskBody,
  UpdateTaskResult,
} from "../types.js";
import { API_BASE_URL } from "../constants.js";

export class OtaskApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "OtaskApiError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : JSON.stringify(body).slice(0, 500);
    throw new OtaskApiError(
      `O!task API error (${response.status}): ${detail}`,
      response.status,
      body,
    );
  }

  return body as T;
}

async function headersFor(auth: OtaskAuthResolver): Promise<Record<string, string>> {
  return auth();
}

export async function getTask(
  wsSlug: string,
  taskSlug: string,
  auth: OtaskAuthResolver,
): Promise<OtaskTask> {
  const headers = await headersFor(auth);
  const response = await fetch(
    `${API_BASE_URL}/api/v1/ws/${encodeURIComponent(wsSlug)}/tasks/${encodeURIComponent(taskSlug)}`,
    { method: "GET", headers },
  );

  const result = await parseResponse<OtaskApiResponse<OtaskTask>>(response);
  if (!result.success) {
    throw new OtaskApiError(
      result.message ?? "Failed to get task",
      response.status,
      result,
    );
  }

  return result.data;
}

export async function updateTask(
  wsSlug: string,
  taskSlug: string,
  body: UpdateTaskBody,
  auth: OtaskAuthResolver,
): Promise<UpdateTaskResult> {
  const headers = await headersFor(auth);
  const response = await fetch(
    `${API_BASE_URL}/api/v1/ws/${encodeURIComponent(wsSlug)}/tasks/${encodeURIComponent(taskSlug)}/update`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );

  const result = await parseResponse<
    OtaskApiResponse<{
      task: OtaskTask;
      is_recovery?: boolean;
      is_detach_parent?: boolean;
    }>
  >(response);

  if (!result.success) {
    throw new OtaskApiError(
      result.message ?? "Failed to update task",
      response.status,
      result,
    );
  }

  return {
    success: true,
    message: result.message,
    task: result.data.task,
    is_recovery: result.data.is_recovery,
    is_detach_parent: result.data.is_detach_parent,
  };
}

export function formatApiError(error: unknown): string {
  if (error instanceof OtaskApiError) {
    if (error.status === 404) {
      return `Error: Task or workspace not found. Check ws_slug and task_slug. ${error.message}`;
    }
    if (error.status === 401 || error.status === 403) {
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

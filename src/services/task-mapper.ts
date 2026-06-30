import type { OtaskTask, OtaskSubtask, UpdateTaskBody } from "../types.js";

function performerIds(task: OtaskTask): string[] {
  if (!Array.isArray(task.performers)) {
    return [];
  }
  return task.performers.map((p) => {
    if (typeof p === "object" && p !== null && "id" in p) {
      return String((p as { id: number }).id);
    }
    return String(p);
  });
}

function tagIds(task: OtaskTask): string[] {
  if (!Array.isArray(task.tags)) {
    return [];
  }
  return task.tags.map((t) => {
    if (typeof t === "object" && t !== null && "id" in t) {
      return String((t as { id: number }).id);
    }
    return String(t);
  });
}

function normalizeSubtasks(task: OtaskTask): OtaskSubtask[] {
  if (!Array.isArray(task.subtasks)) {
    return [];
  }
  return task.subtasks.map((s) => ({
    id: s.id ?? null,
    end_at: s.end_at,
    is_completed: s.is_completed,
    name: s.name,
    performers: Array.isArray(s.performers) ? s.performers : [],
  }));
}

export function buildUpdateBodyFromTask(
  task: OtaskTask,
  overrides: Partial<UpdateTaskBody> = {},
): UpdateTaskBody {
  const base: UpdateTaskBody = {
    name: task.name,
    board_id: task.board_id,
    board_column_id: task.board_column_id,
    comment: "",
    description: task.description ?? "",
    end_at: task.end_at ?? new Date().toISOString(),
    files: Array.isArray(task.files) ? task.files : [],
    performers: performerIds(task),
    priority_id: task.priority_id,
    project_id: task.project_id,
    subtasks: normalizeSubtasks(task),
    tags: tagIds(task),
  };

  return { ...base, ...overrides };
}

export function summarizeTask(task: OtaskTask): Record<string, unknown> {
  return {
    id: task.id,
    slug: task.slug,
    name: task.name,
    description: task.description,
    end_at: task.end_at,
    priority_id: task.priority_id,
    project_id: task.project_id,
    board_id: task.board_id,
    board_column_id: task.board_column_id,
    status_id: task.status_id,
    performers: performerIds(task),
    tags: tagIds(task),
    subtasks_count: Array.isArray(task.subtasks) ? task.subtasks.length : 0,
  };
}

import type { OtaskTask, OtaskSubtask, UpdateTaskBody } from "../types.js";

export interface CompactTask {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  end_at: string | null;
  priority_id: number;
  project_id: number;
  board_id: number;
  board_column_id: number;
  status_id?: number;
  performers: Array<{ id: string; name?: string }>;
  tags: Array<{ id: string; name?: string }>;
  comments_count?: number;
  subtasks_count?: number;
}

export interface CompactProject {
  id: number;
  slug: string;
  name: string;
  status_id?: number;
}

export interface CompactMember {
  id?: number;
  name?: string;
  email?: string;
  status_text?: string;
}

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

function compactRefs(
  value: unknown,
): Array<{ id: string; name?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    if (typeof item === "object" && item !== null && "id" in item) {
      const obj = item as { id: unknown; name?: unknown };
      const ref: { id: string; name?: string } = { id: String(obj.id) };
      if (typeof obj.name === "string") {
        ref.name = obj.name;
      }
      return ref;
    }
    return { id: String(item) };
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

export function compactTask(task: OtaskTask): CompactTask {
  const out: CompactTask = {
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
    performers: compactRefs(task.performers),
    tags: compactRefs(task.tags),
    subtasks_count: Array.isArray(task.subtasks) ? task.subtasks.length : 0,
  };

  if (typeof task.comments_count === "number") {
    out.comments_count = task.comments_count;
  }

  return out;
}

export function compactProject(p: {
  id: number;
  slug: string;
  name: string;
  status_id?: number;
}): CompactProject {
  const out: CompactProject = {
    id: p.id,
    slug: p.slug,
    name: p.name,
  };
  if (p.status_id !== undefined) {
    out.status_id = p.status_id;
  }
  return out;
}

export function compactMember(m: {
  id?: number;
  user_id?: number;
  full_name?: string;
  email?: string;
  status_text?: string;
}): CompactMember {
  const out: CompactMember = {};
  if (m.id !== undefined) {
    out.id = m.id;
  } else if (m.user_id !== undefined) {
    out.id = m.user_id;
  }
  if (m.full_name !== undefined) {
    out.name = m.full_name;
  }
  if (m.email !== undefined) {
    out.email = m.email;
  }
  if (m.status_text !== undefined) {
    out.status_text = m.status_text;
  }
  return out;
}

export function summarizeTask(task: OtaskTask): CompactTask {
  return compactTask(task);
}

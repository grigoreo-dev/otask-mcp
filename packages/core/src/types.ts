export interface LoginResponse {
  token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface OtaskSubtask {
  id: number | null;
  end_at: string;
  is_completed: boolean;
  name: string;
  performers: number[];
}

export interface OtaskFile {
  name: string;
  temp_src: string;
}

export interface OtaskTask {
  id: number;
  name: string;
  priority_id: number;
  description: string;
  end_at: string | null;
  status_id: number;
  kanban_status_id?: number;
  project_id: number;
  slug: string;
  board_id: number;
  board_column_id: number;
  performers?: Array<{ id: number } | number | string>;
  tags?: Array<{ id: number } | string>;
  subtasks?: OtaskSubtask[];
  files?: OtaskFile[];
  [key: string]: unknown;
}

export interface OtaskApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface UpdateTaskBody {
  name: string;
  board_id: number;
  board_column_id: number;
  comment: string;
  description: string;
  end_at: string;
  files: OtaskFile[];
  performers: string[];
  priority_id: number;
  project_id: number;
  subtasks: OtaskSubtask[];
  tags: string[];
}

export interface UpdateTaskResult {
  success: boolean;
  message?: string;
  task: OtaskTask;
  is_recovery?: boolean;
  is_detach_parent?: boolean;
}

export interface CreateTaskBody {
  name: string;
  board_id: number;
  board_column_id: number;
  end_at: string;
  project_id: number;
  comment?: string;
  description?: string;
  priority_id?: number;
  performers?: string[];
  tags?: string[];
}

export interface OtaskProjectSummary {
  id: number;
  slug: string;
  name: string;
  status_id?: number;
}

export interface ListProjectTasksResult {
  tasks: OtaskTask[];
  meta?: unknown;
}

export interface ListWorkspaceTasksQuery {
  page?: number;
  performer_ids?: number[];
  project_ids?: number[];
  priority_ids?: number[];
}

export interface ListWorkspaceTasksResult {
  tasks: OtaskTask[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
    [key: string]: unknown;
  };
}

export interface ListBoardResult {
  boards: unknown[];
  columns: unknown[];
}

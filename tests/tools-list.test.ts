import { describe, expect, mock, test } from "bun:test";
import type { OtaskClient } from "../packages/core/src/services/client.ts";
import { createMeCache } from "../packages/core/src/services/me-cache.ts";
import {
  createProjectGuard,
  parseProjectAllowList,
} from "../packages/core/src/services/project-guard.ts";
import {
  createWsGuard,
  parseWsAllowList,
  type ScopeContext,
} from "../packages/core/src/services/scope.ts";
import { createGetTaskTool } from "../packages/core/src/tools/get-task.ts";
import { createListBoardTool } from "../packages/core/src/tools/list-board.ts";
import { createListMembersTool } from "../packages/core/src/tools/list-members.ts";
import { createListProjectTasksTool } from "../packages/core/src/tools/list-project-tasks.ts";
import { createListProjectsTool } from "../packages/core/src/tools/list-projects.ts";
import { createListTagsTool } from "../packages/core/src/tools/list-tags.ts";
import { createListTasksTool } from "../packages/core/src/tools/list-tasks.ts";
import { createMeTool } from "../packages/core/src/tools/me.ts";
import { toolFactories } from "../packages/core/src/tools/registry.ts";
import type { ToolDeps } from "../packages/core/src/tools/types.ts";
import type { OtaskTask } from "../packages/core/src/types.ts";

function sampleTask(overrides: Partial<OtaskTask> = {}): OtaskTask {
  return {
    id: 10,
    slug: "task-10",
    name: "Do thing",
    description: "details",
    end_at: "2026-07-01T00:00:00Z",
    priority_id: 2,
    project_id: 5,
    board_id: 1,
    board_column_id: 3,
    status_id: 7,
    performers: [{ id: 100 }],
    tags: [{ id: 9 }],
    subtasks: [],
    files: [],
    ...overrides,
  };
}

function mockApi(partial: Partial<OtaskClient> = {}): OtaskClient {
  return {
    getMe: mock(async () => ({
      id: 11458,
      full_name: "Test User",
      email: "t@e.st",
      timezone: "Europe/Moscow",
    })),
    getTask: mock(async () => sampleTask()),
    updateTask: mock(async () => ({
      success: true,
      task: sampleTask(),
    })),
    listProjects: mock(async () => []),
    listProjectTasks: mock(async () => ({ tasks: [] })),
    listWorkspaceTasks: mock(async () => ({
      tasks: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    })),
    listBoard: mock(async () => ({ boards: [], columns: [], tasks: [] })),
    listMembers: mock(async () => []),
    listTags: mock(async () => []),
    listComments: mock(async () => ({})),
    addComment: mock(async () => ({})),
    createTask: mock(async () => sampleTask()),
    archiveTask: mock(async () => sampleTask()),
    ...partial,
  };
}

function emptyScope(projectAllow = ""): ScopeContext {
  return {
    wsGuard: createWsGuard(parseWsAllowList(undefined)),
    projectGuard: createProjectGuard(parseProjectAllowList(projectAllow)),
  };
}

function deps(
  apiPartial: Partial<OtaskClient> = {},
  allowList = "",
  scopeOverrides: Partial<ScopeContext> = {}
): ToolDeps {
  const scope = { ...emptyScope(allowList), ...scopeOverrides };
  return {
    api: mockApi(apiPartial),
    guard: scope.projectGuard,
    scope,
  };
}

function parseContent(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0]!.text);
}

describe("otask_list_projects", () => {
  test("filters by allow-list and returns compact agent list", async () => {
    const d = deps(
      {
        listProjects: mock(async () => [
          { id: 1, slug: "a", name: "Alpha", status_id: 1, noise: true },
          { id: 2, slug: "b", name: "Beta" },
          { id: 3, slug: "c", name: "Gamma" },
        ]),
      },
      "a,2"
    );
    const tool = createListProjectsTool(d);
    const result = await tool.handler({ ws_slug: "ws-1" });
    expect(result.isError).toBeUndefined();
    const body = parseContent(result) as {
      summary: string;
      items: Array<{ id: number; slug: string; name: string }>;
      next: null;
    };
    expect(body.next).toBeNull();
    expect(body.items).toEqual([
      { id: 1, slug: "a", name: "Alpha", status_id: 1 },
      { id: 2, slug: "b", name: "Beta" },
    ]);
    expect(body.items[0]).not.toHaveProperty("noise");
    expect(body.summary).toMatch(/2/);
    expect(d.api.listProjects).toHaveBeenCalledWith("ws-1");
  });

  test("returns all projects when allow-list empty", async () => {
    const d = deps({
      listProjects: mock(async () => [
        { id: 1, slug: "a", name: "Alpha" },
        { id: 2, slug: "b", name: "Beta" },
      ]),
    });
    const tool = createListProjectsTool(d);
    const body = parseContent(await tool.handler({ ws_slug: "ws" })) as { items: unknown[] };
    expect(body.items).toHaveLength(2);
  });
});

describe("otask_list_project_tasks", () => {
  test("otask_list_project_tasks defaults to active board snapshot and excludes completed", async () => {
    const listBoard = mock(async () => ({
      boards: [{ id: 44237, name: "Поиск Патентов" }],
      columns: [
        { id: 230273, name: "Сделать", board_id: 44237, type: "new", tasks_count: 2 },
        { id: 230276, name: "Завершено", board_id: 44237, type: "completed", tasks_count: 225 },
      ],
      tasks: [
        sampleTask({
          id: 1,
          name: "Active",
          project_id: 5,
          board_id: 44237,
          board_column_id: 230273,
          description: "<p>hidden</p>",
        }),
        sampleTask({
          id: 2,
          name: "Done",
          project_id: 5,
          board_id: 44237,
          board_column_id: 230276,
          description: "<p>hidden</p>",
        }),
      ],
    }));
    const d = deps(
      {
        listProjects: mock(async () => [{ id: 5, slug: "proj", name: "Proj" }]),
        listBoard,
      },
      "",
      { defaultWs: "ws-main", defaultProject: "proj" }
    );
    const tool = createListProjectTasksTool(d);

    const result = await tool.handler({});
    expect(result.isError).toBeUndefined();
    const payload = parseContent(result) as {
      summary: string;
      items: Array<Record<string, unknown>>;
      meta: Record<string, unknown>;
    };

    expect(listBoard).toHaveBeenCalledWith(
      expect.any(String),
      "proj",
      expect.objectContaining({
        type: "status",
        field_id: "_0",
        separate_subtasks: 1,
      })
    );
    expect(payload.summary).toContain("1 active task(s)");
    expect(payload.summary).toContain("excluded 225 completed");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: 1,
      name: "Active",
      column_name: "Сделать",
      column_type: "new",
      is_completed: false,
    });
    expect(payload.items[0]).not.toHaveProperty("description");
    expect(payload.meta).toMatchObject({
      source: "board_snapshot",
      completed_column_ids: [230276],
      excluded_completed_count: 225,
    });
  });

  test("otask_list_project_tasks active_only=false uses legacy task list", async () => {
    const listProjectTasks = mock(async () => ({
      tasks: [
        sampleTask({
          id: 2,
          name: "Done",
          project_id: 5,
          board_column_id: 230276,
          description: "<p>hidden</p>",
        }),
      ],
      meta: { current_page: 1, total: 248 },
    }));
    const d = deps(
      {
        listProjects: mock(async () => [{ id: 5, slug: "proj", name: "Proj" }]),
        listProjectTasks,
      },
      "",
      { defaultWs: "ws-main", defaultProject: "proj" }
    );
    const tool = createListProjectTasksTool(d);

    const result = await tool.handler({ active_only: false, page: 1 });
    expect(result.isError).toBeUndefined();
    const payload = parseContent(result) as {
      items: Array<Record<string, unknown>>;
      meta: Record<string, unknown>;
    };

    expect(listProjectTasks).toHaveBeenCalledWith(expect.any(String), "proj", { page: 1 });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).not.toHaveProperty("description");
    expect(payload.meta).toMatchObject({
      source: "task_list",
      includes_completed: true,
    });
  });

  test("asserts project slug then returns compact tasks", async () => {
    const d = deps(
      {
        listProjectTasks: mock(async () => ({
          tasks: [
            sampleTask({ id: 1, slug: "t1", name: "One", project_id: 5 }),
            sampleTask({ id: 2, slug: "t2", name: "Two", project_id: 5 }),
          ],
          meta: { page: 1 },
        })),
      },
      "proj-a"
    );
    const tool = createListProjectTasksTool(d);
    const result = await tool.handler({
      ws_slug: "ws-1",
      project_slug: "proj-a",
      active_only: false,
    });
    expect(result.isError).toBeUndefined();
    const body = parseContent(result) as {
      summary: string;
      items: Array<{ id: number; slug: string; name: string }>;
      next: unknown;
    };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ id: 1, slug: "t1", name: "One" });
    expect(body.items[0]).not.toHaveProperty("files");
    expect(body.next).toEqual({ page: 1 });
    expect(d.api.listProjectTasks).toHaveBeenCalledWith("ws-1", "proj-a", undefined);
  });

  test("blocks disallowed project_slug", async () => {
    const d = deps(
      {
        listProjects: mock(async () => [{ id: 1, slug: "forbidden", name: "Forbidden" }]),
        listProjectTasks: mock(async () => ({ tasks: [] })),
      },
      "allowed-only"
    );
    const tool = createListProjectTasksTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      project_slug: "forbidden",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Project not allowed/);
    expect(d.api.listProjectTasks).not.toHaveBeenCalled();
  });

  test("allow-list numeric id only resolves project and succeeds", async () => {
    const d = deps(
      {
        listProjects: mock(async () => [{ id: 42, slug: "proj-by-id", name: "By Id" }]),
        listProjectTasks: mock(async () => ({
          tasks: [sampleTask({ id: 1, slug: "t1", project_id: 42 })],
        })),
      },
      "42"
    );
    const tool = createListProjectTasksTool(d);
    const result = await tool.handler({
      ws_slug: "ws-1",
      project_slug: "proj-by-id",
      active_only: false,
    });
    expect(result.isError).toBeUndefined();
    const body = parseContent(result) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
    expect(d.api.listProjects).toHaveBeenCalledWith("ws-1");
    expect(d.api.listProjectTasks).toHaveBeenCalledWith("ws-1", "proj-by-id", undefined);
  });

  test("forwards optional page and status_id query to api", async () => {
    const d = deps(
      {
        listProjects: mock(async () => [{ id: 5, slug: "proj-a", name: "A" }]),
        listProjectTasks: mock(async () => ({ tasks: [] })),
      },
      "proj-a"
    );
    const tool = createListProjectTasksTool(d);
    await tool.handler({
      ws_slug: "ws-1",
      project_slug: "proj-a",
      active_only: false,
      page: 2,
      status_id: 7,
    });
    expect(d.api.listProjectTasks).toHaveBeenCalledWith("ws-1", "proj-a", {
      page: 2,
      status_id: 7,
    });
  });
});

describe("otask_list_board", () => {
  test("asserts project and returns compact boards/columns", async () => {
    const d = deps(
      {
        listProjects: mock(async () => [{ id: 1, slug: "p1", name: "P1" }]),
        listBoard: mock(async () => ({
          boards: [
            {
              id: 1,
              name: "Main",
              slug: "main",
              color: "#fff",
              pivot: { noise: true },
              localtz: "UTC",
            },
          ],
          columns: [
            {
              id: 10,
              name: "Todo",
              board_id: 1,
              slug: "todo",
              pivot: { x: 1 },
              localtz: "UTC",
            },
            {
              id: 230276,
              name: "Завершено",
              color: "#1DB464",
              board_id: 44237,
              type: "completed",
              is_system: true,
              tasks_count: 225,
            },
          ],
        })),
      },
      "p1"
    );
    const tool = createListBoardTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      project_slug: "p1",
    });
    expect(result.isError).toBeUndefined();
    const body = parseContent(result) as {
      summary: string;
      boards: Array<Record<string, unknown>>;
      columns: Array<Record<string, unknown>>;
      next: null;
    };
    expect(body.boards).toEqual([{ id: 1, name: "Main", slug: "main", color: "#fff" }]);
    expect(body.columns).toEqual([
      { id: 10, name: "Todo", slug: "todo", board_id: 1 },
      {
        id: 230276,
        name: "Завершено",
        color: "#1DB464",
        board_id: 44237,
        type: "completed",
        is_system: true,
        tasks_count: 225,
      },
    ]);
    expect(body.boards[0]).not.toHaveProperty("pivot");
    expect(body.boards[0]).not.toHaveProperty("localtz");
    expect(body.columns[0]).not.toHaveProperty("pivot");
    expect(body.next).toBeNull();
    expect(d.api.listBoard).toHaveBeenCalledWith("ws", "p1", { type: "status" });
  });

  test("blocks disallowed project", async () => {
    const d = deps(
      {
        listProjects: mock(async () => [{ id: 9, slug: "nope", name: "Nope" }]),
      },
      "only-this"
    );
    const tool = createListBoardTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      project_slug: "nope",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Project not allowed/);
  });
});

describe("otask_list_members", () => {
  test("returns compact members without guard", async () => {
    const d = deps({
      listMembers: mock(async () => [
        {
          user_id: 55,
          full_name: "Grace Hopper",
          email: "g@example.com",
          status_text: "active",
          role: "admin",
        },
      ]),
    });
    const tool = createListMembersTool(d);
    const body = parseContent(await tool.handler({ ws_slug: "ws" })) as {
      items: Array<Record<string, unknown>>;
      next: null;
    };
    expect(body.items).toEqual([
      {
        id: 55,
        name: "Grace Hopper",
        email: "g@example.com",
        status_text: "active",
      },
    ]);
    expect(body.items[0]).not.toHaveProperty("role");
    expect(body.next).toBeNull();
  });
});

describe("otask_list_tags", () => {
  test("returns compact tags as agent list", async () => {
    const d = deps({
      listTags: mock(async () => [
        { id: 1, name: "bug", color: "#f00", slug: "bug", pivot: { x: 1 } },
        { id: 2, name: "feature", localtz: "UTC" },
      ]),
    });
    const tool = createListTagsTool(d);
    const body = parseContent(await tool.handler({ ws_slug: "ws" })) as {
      summary: string;
      items: Array<Record<string, unknown>>;
      next: null;
    };
    expect(body.items).toEqual([
      { id: 1, name: "bug", slug: "bug", color: "#f00" },
      { id: 2, name: "feature" },
    ]);
    expect(body.items[0]).not.toHaveProperty("pivot");
    expect(body.items[1]).not.toHaveProperty("localtz");
    expect(body.next).toBeNull();
    expect(d.api.listTags).toHaveBeenCalledWith("ws");
  });
});

describe("otask_get_task guard", () => {
  test("returns compact task when project allowed", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 5, name: "Allowed" })),
      },
      "5"
    );
    const tool = createGetTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
    });
    expect(result.isError).toBeUndefined();
    const body = parseContent(result) as { id: number; name: string };
    expect(body).toMatchObject({ id: 10, name: "Allowed", project_id: 5 });
    expect(body).not.toHaveProperty("files");
  });

  test("errors when project_id not allowed", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 99 })),
      },
      "5"
    );
    const tool = createGetTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Project not allowed/);
  });

  test("slug-only allow-list allows get when listProjects maps project_id to slug", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 42 })),
        listProjects: mock(async () => [{ id: 42, slug: "allowed-proj", name: "Allowed" }]),
      },
      "allowed-proj"
    );
    const tool = createGetTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.listProjects).toHaveBeenCalledWith("ws");
  });

  test("slug-only allow-list denies get when project_id maps to other slug", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 99 })),
        listProjects: mock(async () => [
          { id: 42, slug: "allowed-proj", name: "Allowed" },
          { id: 99, slug: "other", name: "Other" },
        ]),
      },
      "allowed-proj"
    );
    const tool = createGetTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Project not allowed/);
  });
});

describe("otask_me", () => {
  test("returns compact me via cache", async () => {
    const getMe = mock(async () => ({
      id: 11458,
      full_name: "Test User",
      email: "t@e.st",
      timezone: "Europe/Moscow",
      params: { noise: 1 },
    }));
    const d = deps({ getMe });
    d.meCache = createMeCache(() => d.api.getMe());
    const tool = createMeTool(d);
    const result = await tool.handler({});
    expect(result.isError).toBeUndefined();
    const body = parseContent(result) as {
      id: number;
      full_name: string;
      timezone: string;
    };
    expect(body).toEqual({
      id: 11458,
      full_name: "Test User",
      email: "t@e.st",
      timezone: "Europe/Moscow",
    });
    expect(body).not.toHaveProperty("params");
  });
});

describe("otask_list_tasks", () => {
  test("defaults mine=true and passes performer_ids from me", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [sampleTask({ project_id: 5, end_at: "2026-07-09T12:00:00Z" })],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    }));
    const getMe = mock(async () => ({
      id: 11458,
      full_name: "U",
      timezone: "UTC",
    }));
    const d = deps({ listWorkspaceTasks, getMe });
    d.meCache = createMeCache(() => d.api.getMe());
    const tool = createListTasksTool(d);
    const result = await tool.handler({ ws_slug: "ws-1" });
    expect(result.isError).toBeUndefined();
    expect(listWorkspaceTasks).toHaveBeenCalledWith("ws-1", {
      page: 1,
      performer_ids: [11458],
    });
  });

  test("mine=false omits performer_ids", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    }));
    const d = deps({
      listWorkspaceTasks,
      getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
    });
    d.meCache = createMeCache(() => d.api.getMe());
    await createListTasksTool(d).handler({ ws_slug: "ws-1", mine: false });
    expect(listWorkspaceTasks).toHaveBeenCalledWith("ws-1", { page: 1 });
  });

  test("explicit performer_ids overrides mine", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    }));
    const d = deps({
      listWorkspaceTasks,
      getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
    });
    d.meCache = createMeCache(() => d.api.getMe());
    await createListTasksTool(d).handler({
      ws_slug: "ws-1",
      performer_ids: [99],
    });
    expect(listWorkspaceTasks).toHaveBeenCalledWith("ws-1", {
      page: 1,
      performer_ids: [99],
    });
  });

  test("allow-list drops tasks from other projects", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [sampleTask({ id: 1, project_id: 5 }), sampleTask({ id: 2, project_id: 99 })],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 2 },
    }));
    const d = deps(
      {
        listWorkspaceTasks,
        getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
      },
      "5"
    );
    d.meCache = createMeCache(() => d.api.getMe());
    const result = await createListTasksTool(d).handler({
      ws_slug: "ws-1",
      mine: false,
    });
    const body = parseContent(result) as { items: Array<{ id: number }> };
    expect(body.items.map((i) => i.id)).toEqual([1]);
  });

  test("slug-only allow-list keeps tasks after resolving project id via listProjects", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [sampleTask({ id: 1, project_id: 5 }), sampleTask({ id: 2, project_id: 99 })],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 2 },
    }));
    const listProjects = mock(async () => [{ id: 5, slug: "proj-slug", name: "P" }]);
    const d = deps(
      {
        listWorkspaceTasks,
        listProjects,
        getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
      },
      "proj-slug"
    );
    d.meCache = createMeCache(() => d.api.getMe());
    const result = await createListTasksTool(d).handler({
      ws_slug: "ws-1",
      mine: false,
    });
    const body = parseContent(result) as { items: Array<{ id: number }> };
    expect(body.items.map((i) => i.id)).toEqual([1]);
    expect(listProjects).toHaveBeenCalledWith("ws-1");
  });

  test("due=overdue scans pages with cap metadata", async () => {
    const listWorkspaceTasks = mock(async (_ws: string, q?: { page?: number }) => {
      const page = q?.page ?? 1;
      return {
        tasks: [
          sampleTask({
            id: page,
            end_at: page === 1 ? "2020-01-01T00:00:00Z" : "2030-01-01T00:00:00Z",
          }),
        ],
        meta: {
          current_page: page,
          last_page: 10,
          per_page: 20,
          total: 200,
        },
      };
    });
    const d = deps({
      listWorkspaceTasks,
      getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
    });
    d.meCache = createMeCache(() => d.api.getMe());
    const result = await createListTasksTool(d).handler({
      ws_slug: "ws-1",
      mine: false,
      due: "overdue",
      page: 1,
    });
    const body = parseContent(result) as {
      items: Array<{ id: number }>;
      next: { scanned_pages: number; scan_capped: boolean; filtered_count: number };
    };
    expect(body.items.map((i) => i.id)).toEqual([1]);
    expect(body.next.scanned_pages).toBe(5);
    expect(body.next.scan_capped).toBe(true);
    expect(listWorkspaceTasks).toHaveBeenCalledTimes(5);
  });
});

describe("registry", () => {
  test("registers all read tools", () => {
    const names = toolFactories.map((f) => f(deps()).name);
    expect(names).toContain("otask_me");
    expect(names).toContain("otask_list_projects");
    expect(names).toContain("otask_list_project_tasks");
    expect(names).toContain("otask_list_board");
    expect(names).toContain("otask_list_members");
    expect(names).toContain("otask_list_tags");
    expect(names).toContain("otask_get_task");
    expect(names).toContain("otask_list_tasks");
  });
});

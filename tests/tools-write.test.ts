import { describe, expect, mock, test } from "bun:test";
import {
  createProjectGuard,
  parseProjectAllowList,
} from "../src/services/project-guard.ts";
import {
  createWsGuard,
  parseWsAllowList,
} from "../src/services/scope.ts";
import type { OtaskClient } from "../src/services/client.ts";
import type { OtaskTask } from "../src/types.ts";
import type { ToolDeps } from "../src/tools/types.ts";
import { createCreateTaskTool } from "../src/tools/create-task.ts";
import { createMoveTaskTool } from "../src/tools/move-task.ts";
import { createArchiveTaskTool } from "../src/tools/archive-task.ts";
import { createListCommentsTool } from "../src/tools/list-comments.ts";
import { createAddCommentTool } from "../src/tools/add-comment.ts";
import { createUpdateTaskTool } from "../src/tools/update-task.ts";
import { toolFactories } from "../src/tools/registry.ts";

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
    getTask: mock(async () => sampleTask()),
    updateTask: mock(async () => ({
      success: true,
      task: sampleTask(),
    })),
    listProjects: mock(async () => []),
    listProjectTasks: mock(async () => ({ tasks: [] })),
    listBoard: mock(async () => ({ boards: [], columns: [] })),
    listMembers: mock(async () => []),
    listTags: mock(async () => []),
    listComments: mock(async () => ({ comments: [] })),
    addComment: mock(async () => ({ id: 1 })),
    createTask: mock(async () => sampleTask()),
    archiveTask: mock(async () => sampleTask()),
    ...partial,
  };
}

function deps(
  apiPartial: Partial<OtaskClient> = {},
  allowList = "",
): ToolDeps {
  const projectGuard = createProjectGuard(parseProjectAllowList(allowList));
  return {
    api: mockApi(apiPartial),
    guard: projectGuard,
    scope: {
      wsGuard: createWsGuard(parseWsAllowList(undefined)),
      projectGuard,
    },
  };
}

function parseContent(result: {
  content: Array<{ type: string; text: string }>;
}): unknown {
  return JSON.parse(result.content[0]!.text);
}

describe("otask_create_task", () => {
  test("guard blocks create outside allow-list", async () => {
    const d = deps({}, "5");
    const tool = createCreateTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      project_id: 99,
      name: "New",
      board_id: 1,
      board_column_id: 2,
      end_at: "2026-08-01T00:00:00Z",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Project not allowed/);
    expect(d.api.createTask).not.toHaveBeenCalled();
  });

  test("creates task when project_id allowed", async () => {
    const created = sampleTask({ id: 99, name: "New", project_id: 5 });
    const d = deps(
      {
        createTask: mock(async () => created),
      },
      "5",
    );
    const tool = createCreateTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      project_id: 5,
      name: "New",
      board_id: 1,
      board_column_id: 2,
      end_at: "2026-08-01T00:00:00Z",
      description: "desc",
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.createTask).toHaveBeenCalledWith("ws", {
      project_id: 5,
      name: "New",
      board_id: 1,
      board_column_id: 2,
      end_at: "2026-08-01T00:00:00Z",
      description: "desc",
    });
    const body = parseContent(result) as { id: number; name: string };
    expect(body).toMatchObject({ id: 99, name: "New", project_id: 5 });
  });

  test("slug-only allow-list allows create when listProjects returns matching id+slug", async () => {
    const created = sampleTask({ id: 99, name: "New", project_id: 42 });
    const d = deps(
      {
        listProjects: mock(async () => [
          { id: 42, slug: "allowed-proj", name: "Allowed" },
        ]),
        createTask: mock(async () => created),
      },
      "allowed-proj",
    );
    const tool = createCreateTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      project_id: 42,
      name: "New",
      board_id: 1,
      board_column_id: 2,
      end_at: "2026-08-01T00:00:00Z",
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.listProjects).toHaveBeenCalledWith("ws");
    expect(d.api.createTask).toHaveBeenCalled();
  });
});

describe("otask_move_task", () => {
  test("calls update with board_column_id after get+guard", async () => {
    const d = deps(
      {
        getTask: mock(async () =>
          sampleTask({ project_id: 5, board_id: 1, board_column_id: 3 }),
        ),
        updateTask: mock(async (_ws, _slug, body) => ({
          success: true,
          task: sampleTask({ board_column_id: body.board_column_id }),
        })),
      },
      "5",
    );
    const tool = createMoveTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      board_column_id: 8,
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.getTask).toHaveBeenCalledWith("ws", "task-10");
    expect(d.api.updateTask).toHaveBeenCalled();
    const updateCall = (d.api.updateTask as ReturnType<typeof mock>).mock
      .calls[0]!;
    expect(updateCall[0]).toBe("ws");
    expect(updateCall[1]).toBe("task-10");
    expect(updateCall[2]).toMatchObject({
      board_column_id: 8,
      board_id: 1,
      project_id: 5,
    });
  });

  test("blocks move when project not allowed", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 99 })),
      },
      "5",
    );
    const tool = createMoveTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      board_column_id: 8,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Project not allowed/);
    expect(d.api.updateTask).not.toHaveBeenCalled();
  });

  test("slug-only allow-list allows move when listProjects maps project_id", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 42 })),
        listProjects: mock(async () => [
          { id: 42, slug: "allowed-proj", name: "Allowed" },
        ]),
        updateTask: mock(async () => ({
          success: true,
          task: sampleTask({ project_id: 42, board_column_id: 8 }),
        })),
      },
      "allowed-proj",
    );
    const tool = createMoveTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      board_column_id: 8,
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.listProjects).toHaveBeenCalledWith("ws");
    expect(d.api.updateTask).toHaveBeenCalled();
  });

  test("slug-only allow-list denies move for wrong project", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 99 })),
        listProjects: mock(async () => [
          { id: 99, slug: "other", name: "Other" },
        ]),
      },
      "allowed-proj",
    );
    const tool = createMoveTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      board_column_id: 8,
    });
    expect(result.isError).toBe(true);
    expect(d.api.updateTask).not.toHaveBeenCalled();
  });

  test("passes optional board_id override", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 5, board_id: 1 })),
        updateTask: mock(async () => ({
          success: true,
          task: sampleTask({ board_id: 2, board_column_id: 9 }),
        })),
      },
      "5",
    );
    const tool = createMoveTaskTool(d);
    await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      board_column_id: 9,
      board_id: 2,
    });
    const body = (d.api.updateTask as ReturnType<typeof mock>).mock.calls[0]![2];
    expect(body).toMatchObject({ board_id: 2, board_column_id: 9 });
  });
});

describe("otask_archive_task", () => {
  test("gets task for guard then archives", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 5 })),
        archiveTask: mock(async () => sampleTask({ id: 10, name: "Archived" })),
      },
      "5",
    );
    const tool = createArchiveTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.getTask).toHaveBeenCalledWith("ws", "task-10");
    expect(d.api.archiveTask).toHaveBeenCalledWith("ws", "task-10");
  });

  test("blocks archive outside allow-list", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 99 })),
      },
      "5",
    );
    const tool = createArchiveTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
    });
    expect(result.isError).toBe(true);
    expect(d.api.archiveTask).not.toHaveBeenCalled();
  });
});

describe("otask_list_comments", () => {
  test("guards via get then lists comments", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 5 })),
        listComments: mock(async () => ({
          comments: [{ id: 1, comment: "hi" }],
        })),
      },
      "5",
    );
    const tool = createListCommentsTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.getTask).toHaveBeenCalledWith("ws", "task-10");
    expect(d.api.listComments).toHaveBeenCalledWith("ws", "task-10");
    const body = parseContent(result);
    expect(body).toEqual({ comments: [{ id: 1, comment: "hi" }] });
  });

  test("blocks list comments outside allow-list", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 99 })),
      },
      "5",
    );
    const tool = createListCommentsTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
    });
    expect(result.isError).toBe(true);
    expect(d.api.listComments).not.toHaveBeenCalled();
  });
});

describe("otask_add_comment", () => {
  test("guards then stores comment", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 5 })),
        addComment: mock(async () => ({ id: 7, comment: "note" })),
      },
      "5",
    );
    const tool = createAddCommentTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      comment: "note",
      parent_id: 3,
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.addComment).toHaveBeenCalledWith("ws", "task-10", "note", 3);
  });

  test("blocks add comment outside allow-list", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 99 })),
      },
      "5",
    );
    const tool = createAddCommentTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      comment: "nope",
    });
    expect(result.isError).toBe(true);
    expect(d.api.addComment).not.toHaveBeenCalled();
  });
});

describe("otask_update_task guard", () => {
  test("injects guard after getTask", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 99 })),
      },
      "5",
    );
    const tool = createUpdateTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      name: "Nope",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Project not allowed/);
    expect(d.api.updateTask).not.toHaveBeenCalled();
  });

  test("updates when project allowed", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 5 })),
        updateTask: mock(async () => ({
          success: true,
          task: sampleTask({ name: "Renamed" }),
        })),
      },
      "5",
    );
    const tool = createUpdateTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      name: "Renamed",
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.updateTask).toHaveBeenCalled();
  });

  test("blocks update when destination project_id outside allow-list", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 5 })),
      },
      "5",
    );
    const tool = createUpdateTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      project_id: 99,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Project not allowed/);
    expect(d.api.updateTask).not.toHaveBeenCalled();
  });

  test("slug-only allow-list allows update when listProjects maps project_id", async () => {
    const d = deps(
      {
        getTask: mock(async () => sampleTask({ project_id: 42 })),
        listProjects: mock(async () => [
          { id: 42, slug: "allowed-proj", name: "Allowed" },
        ]),
        updateTask: mock(async () => ({
          success: true,
          task: sampleTask({ project_id: 42, name: "Renamed" }),
        })),
      },
      "allowed-proj",
    );
    const tool = createUpdateTaskTool(d);
    const result = await tool.handler({
      ws_slug: "ws",
      task_slug: "task-10",
      name: "Renamed",
    });
    expect(result.isError).toBeUndefined();
    expect(d.api.listProjects).toHaveBeenCalledWith("ws");
    expect(d.api.updateTask).toHaveBeenCalled();
  });
});

describe("registry write tools", () => {
  test("registers create/move/archive/comment tools", () => {
    const names = toolFactories.map((f) => f(deps()).name);
    expect(names).toContain("otask_create_task");
    expect(names).toContain("otask_move_task");
    expect(names).toContain("otask_archive_task");
    expect(names).toContain("otask_list_comments");
    expect(names).toContain("otask_add_comment");
    expect(names).toContain("otask_update_task");
  });
});

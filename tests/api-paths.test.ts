import { afterEach, describe, expect, mock, test } from "bun:test";
import { createOtaskClient } from "../src/services/client.ts";
import { API_BASE_URL } from "../src/constants.ts";

const auth = async () => ({
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
  Accept: "application/json",
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

function mockJsonFetch(handler: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const payload = handler(url, init);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("api paths and envelopes", () => {
  test("getTask uses correct URL", async () => {
    let calledUrl = "";
    mockJsonFetch((url) => {
      calledUrl = url;
      return {
        success: true,
        data: {
          id: 1,
          name: "T",
          priority_id: 1,
          description: "",
          end_at: null,
          status_id: 1,
          project_id: 10,
          slug: "task-1",
          board_id: 2,
          board_column_id: 3,
        },
      };
    });

    const client = createOtaskClient(auth);
    const task = await client.getTask("ws1", "task-1");

    expect(calledUrl).toBe(`${API_BASE_URL}/api/v1/ws/ws1/tasks/task-1`);
    expect(task.slug).toBe("task-1");
  });

  test("listProjects normalizes data.projects envelope", async () => {
    let calledUrl = "";
    mockJsonFetch((url) => {
      calledUrl = url;
      return {
        success: true,
        data: {
          projects: [
            { id: 1, slug: "p1", name: "Project 1", status_id: 1 },
            { id: 2, slug: "p2", name: "Project 2" },
          ],
        },
      };
    });

    const client = createOtaskClient(auth);
    const projects = await client.listProjects("my-ws");

    expect(calledUrl).toBe(`${API_BASE_URL}/api/v1/ws/my-ws/projects/list`);
    expect(projects).toEqual([
      { id: 1, slug: "p1", name: "Project 1", status_id: 1 },
      { id: 2, slug: "p2", name: "Project 2" },
    ]);
  });

  test("listProjects accepts bare array data", async () => {
    mockJsonFetch(() => ({
      success: true,
      data: [{ id: 9, slug: "only", name: "Only" }],
    }));

    const client = createOtaskClient(auth);
    const projects = await client.listProjects("ws");
    expect(projects).toEqual([{ id: 9, slug: "only", name: "Only" }]);
  });

  test("listProjectTasks builds query and normalizes tasks", async () => {
    let calledUrl = "";
    mockJsonFetch((url) => {
      calledUrl = url;
      return {
        success: true,
        data: {
          tasks: [
            {
              id: 5,
              name: "A",
              priority_id: 1,
              description: "",
              end_at: null,
              status_id: 1,
              project_id: 1,
              slug: "a",
              board_id: 1,
              board_column_id: 1,
            },
          ],
          meta: { total: 1 },
        },
      };
    });

    const client = createOtaskClient(auth);
    const result = await client.listProjectTasks("ws", "proj", {
      page: 2,
      search: "foo",
      empty: undefined,
    });

    expect(calledUrl).toContain(
      `${API_BASE_URL}/api/v1/ws/ws/projects/proj/tasks?`,
    );
    expect(calledUrl).toContain("page=2");
    expect(calledUrl).toContain("search=foo");
    expect(calledUrl).not.toContain("empty");
    expect(result.tasks).toHaveLength(1);
    expect(result.meta).toEqual({ total: 1 });
  });

  test("listBoard hits boards path with query", async () => {
    let calledUrl = "";
    mockJsonFetch((url) => {
      calledUrl = url;
      return {
        success: true,
        data: { boards: [{ id: 1 }], columns: [{ id: 2 }] },
      };
    });

    const client = createOtaskClient(auth);
    const board = await client.listBoard("ws", "proj", {
      type: "kanban",
      board_slug: "main",
    });

    expect(calledUrl).toContain(
      `${API_BASE_URL}/api/v1/ws/ws/projects/proj/boards?`,
    );
    expect(calledUrl).toContain("type=kanban");
    expect(calledUrl).toContain("board_slug=main");
    expect(board.boards).toEqual([{ id: 1 }]);
    expect(board.columns).toEqual([{ id: 2 }]);
  });

  test("listMembers and listTags use correct paths", async () => {
    const urls: string[] = [];
    mockJsonFetch((url) => {
      urls.push(url);
      if (url.includes("/members/list")) {
        return { success: true, data: { members: [{ id: 1 }] } };
      }
      return { success: true, data: [{ id: 7, name: "tag" }] };
    });

    const client = createOtaskClient(auth);
    const members = await client.listMembers("ws");
    const tags = await client.listTags("ws");

    expect(urls[0]).toBe(`${API_BASE_URL}/api/v1/ws/ws/members/list`);
    expect(urls[1]).toBe(`${API_BASE_URL}/api/v1/ws/ws/kanbans/tags`);
    expect(members).toEqual([{ id: 1 }]);
    expect(tags).toEqual([{ id: 7, name: "tag" }]);
  });

  test("listComments POSTs to comments/get", async () => {
    let calledUrl = "";
    let method = "";
    let body: unknown;
    mockJsonFetch((url, init) => {
      calledUrl = url;
      method = init?.method ?? "GET";
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return { success: true, data: { comments: [] } };
    });

    const client = createOtaskClient(auth);
    const result = await client.listComments("ws", "t1", { page: 1 });

    expect(calledUrl).toBe(
      `${API_BASE_URL}/api/v1/ws/ws/tasks/t1/comments/get`,
    );
    expect(method).toBe("POST");
    expect(body).toEqual({ page: 1 });
    expect(result).toEqual({ comments: [] });
  });

  test("addComment POSTs comment and optional parent_id", async () => {
    let calledUrl = "";
    let body: unknown;
    mockJsonFetch((url, init) => {
      calledUrl = url;
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return { success: true, data: { id: 99 } };
    });

    const client = createOtaskClient(auth);
    const result = await client.addComment("ws", "t1", "hello", 5);

    expect(calledUrl).toBe(
      `${API_BASE_URL}/api/v1/ws/ws/tasks/t1/comments/store`,
    );
    expect(body).toEqual({ comment: "hello", parent_id: 5 });
    expect(result).toEqual({ id: 99 });
  });

  test("createTask POSTs body to tasks/create", async () => {
    let calledUrl = "";
    let body: unknown;
    mockJsonFetch((url, init) => {
      calledUrl = url;
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return {
        success: true,
        data: {
          id: 3,
          name: "New",
          priority_id: 1,
          description: "",
          end_at: "2026-01-01",
          status_id: 1,
          project_id: 10,
          slug: "new",
          board_id: 1,
          board_column_id: 2,
        },
      };
    });

    const client = createOtaskClient(auth);
    const createBody = {
      name: "New",
      board_id: 1,
      board_column_id: 2,
      end_at: "2026-01-01",
      project_id: 10,
    };
    const task = await client.createTask("ws", createBody);

    expect(calledUrl).toBe(`${API_BASE_URL}/api/v1/ws/ws/tasks/create`);
    expect(body).toEqual(createBody);
    expect(task.slug).toBe("new");
  });

  test("archiveTask POSTs to in-archive", async () => {
    let calledUrl = "";
    let method = "";
    mockJsonFetch((url, init) => {
      calledUrl = url;
      method = init?.method ?? "GET";
      return {
        success: true,
        data: {
          id: 3,
          name: "Archived",
          priority_id: 1,
          description: "",
          end_at: null,
          status_id: 9,
          project_id: 10,
          slug: "t1",
          board_id: 1,
          board_column_id: 2,
        },
      };
    });

    const client = createOtaskClient(auth);
    const task = await client.archiveTask("ws", "t1");

    expect(calledUrl).toBe(
      `${API_BASE_URL}/api/v1/ws/ws/tasks/t1/in-archive`,
    );
    expect(method).toBe("POST");
    expect(task.slug).toBe("t1");
  });
});

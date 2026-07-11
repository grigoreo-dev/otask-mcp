import { describe, expect, test } from "bun:test";
import { agentListResult } from "../packages/core/src/services/format.ts";
import {
  buildUpdateBodyFromTask,
  compactColumn,
  compactMember,
  compactProject,
  compactTask,
  summarizeTask,
} from "../packages/core/src/services/task-mapper.ts";
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
    performers: [{ id: 100, name: "Ada" } as { id: number }],
    tags: [{ id: 9, name: "bug" } as { id: number }],
    subtasks: [
      {
        id: 1,
        end_at: "2026-07-02T00:00:00Z",
        is_completed: false,
        name: "sub",
        performers: [],
      },
    ],
    files: [],
    noisy_field: "drop-me",
    nested_noise: { a: 1 },
    ...overrides,
  };
}

describe("agentListResult", () => {
  test("wraps summary, items, and defaults next to null", () => {
    const result = agentListResult("found 2", [{ id: 1 }, { id: 2 }]);
    expect(result).toEqual({
      summary: "found 2",
      items: [{ id: 1 }, { id: 2 }],
      next: null,
    });
  });

  test("passes through next when provided", () => {
    const result = agentListResult("more", [], { cursor: "abc" });
    expect(result.next).toEqual({ cursor: "abc" });
  });
});

describe("compactTask", () => {
  test("keeps only known CompactTask fields and strips noise", () => {
    const out = compactTask(sampleTask());
    expect(out).toEqual({
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
      performers: [{ id: "100", name: "Ada" }],
      tags: [{ id: "9", name: "bug" }],
      subtasks_count: 1,
    });
    expect(out).not.toHaveProperty("noisy_field");
    expect(out).not.toHaveProperty("nested_noise");
    expect(out).not.toHaveProperty("files");
    expect(out).not.toHaveProperty("subtasks");
  });

  test("maps numeric and string performers/tags without names", () => {
    const out = compactTask(
      sampleTask({
        performers: [42, "99"],
        tags: ["tag-a", 3],
      })
    );
    expect(out.performers).toEqual([{ id: "42" }, { id: "99" }]);
    expect(out.tags).toEqual([{ id: "tag-a" }, { id: "3" }]);
  });

  test("includes comments_count when present", () => {
    const out = compactTask(sampleTask({ comments_count: 4 }));
    expect(out.comments_count).toBe(4);
  });

  test("handles missing performers/tags/subtasks", () => {
    const out = compactTask(
      sampleTask({
        performers: undefined,
        tags: undefined,
        subtasks: undefined,
      })
    );
    expect(out.performers).toEqual([]);
    expect(out.tags).toEqual([]);
    expect(out.subtasks_count).toBe(0);
  });

  test("compactTask preserves description by default and in full detail", () => {
    const task = sampleTask({ description: "<p>large html</p>" });

    expect(compactTask(task)).toMatchObject({ description: "<p>large html</p>" });
    expect(compactTask(task, { detail: "full" })).toMatchObject({
      description: "<p>large html</p>",
    });
  });

  test("compactTask omits description only in compact detail", () => {
    const task = sampleTask({ description: "<p>large html</p>" });

    expect(compactTask(task, { detail: "compact" })).not.toHaveProperty("description");
  });

  test("compactTask enriches task with column metadata", () => {
    const task = sampleTask({ board_column_id: 230276, task_number: 693 });

    expect(
      compactTask(task, {
        column: {
          id: 230276,
          name: "Завершено",
          type: "completed",
          tasks_count: 225,
        },
      })
    ).toMatchObject({
      task_number: 693,
      column_name: "Завершено",
      column_type: "completed",
      is_completed: true,
    });
  });

  test("compactTask column enrichment with non-completed type", () => {
    const task = sampleTask({ board_column_id: 100 });

    const out = compactTask(task, {
      column: {
        id: 100,
        name: "В работе",
        type: "active",
        tasks_count: 10,
      },
    });

    expect(out).toMatchObject({
      column_name: "В работе",
      column_type: "active",
      is_completed: false,
    });
  });

  test("compactTask marks completed via name fallback when type is null", () => {
    const task = sampleTask({ board_column_id: 200 });

    const out = compactTask(task, {
      column: {
        id: 200,
        name: "Готово",
        type: null,
        tasks_count: 5,
      },
    });

    expect(out).toMatchObject({
      column_name: "Готово",
      column_type: null,
      is_completed: true,
    });
  });
});

describe("compactProject", () => {
  test("keeps only known fields", () => {
    const out = compactProject({
      id: 1,
      slug: "p1",
      name: "Project",
      status_id: 2,
      extra: true,
    } as { id: number; slug: string; name: string; status_id?: number });
    expect(out).toEqual({
      id: 1,
      slug: "p1",
      name: "Project",
      status_id: 2,
    });
    expect(out).not.toHaveProperty("extra");
  });
});

describe("compactColumn", () => {
  test("compactColumn keeps board metadata used by UI completed detection", () => {
    expect(
      compactColumn({
        id: 230276,
        name: "Завершено",
        color: "#1DB464",
        board_id: 44237,
        type: "completed",
        is_system: true,
        tasks_count: 225,
      })
    ).toEqual({
      id: 230276,
      name: "Завершено",
      color: "#1DB464",
      board_id: 44237,
      type: "completed",
      is_system: true,
      tasks_count: 225,
    });
  });
});

describe("compactMember", () => {
  test("normalizes id from user_id and full_name to name", () => {
    const out = compactMember({
      user_id: 55,
      full_name: "Grace Hopper",
      email: "g@example.com",
      status_text: "active",
      role: "admin",
    });
    expect(out).toEqual({
      id: 55,
      name: "Grace Hopper",
      email: "g@example.com",
      status_text: "active",
    });
    expect(out).not.toHaveProperty("role");
    expect(out).not.toHaveProperty("user_id");
    expect(out).not.toHaveProperty("full_name");
  });

  test("prefers id over user_id", () => {
    const out = compactMember({ id: 1, user_id: 2, full_name: "A" });
    expect(out.id).toBe(1);
  });
});

describe("summarizeTask", () => {
  test("delegates to compactTask shape", () => {
    const task = sampleTask();
    expect(summarizeTask(task)).toEqual(compactTask(task));
  });
});

describe("buildUpdateBodyFromTask", () => {
  test("still builds update body with performer/tag id strings", () => {
    const body = buildUpdateBodyFromTask(sampleTask(), { comment: "hi" });
    expect(body.performers).toEqual(["100"]);
    expect(body.tags).toEqual(["9"]);
    expect(body.comment).toBe("hi");
    expect(body.name).toBe("Do thing");
  });
});

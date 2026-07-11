import { describe, expect, test } from "bun:test";
import {
  buildColumnMap,
  flattenBoardColumns,
  getCompletedColumnIds,
  sumColumnTaskCounts,
} from "../packages/core/src/services/board-snapshot.js";

describe("board snapshot helpers", () => {
  test("flattens nested board columns and keeps metadata", () => {
    const columns = flattenBoardColumns([
      {
        id: 230276,
        name: "Завершено",
        board_id: 44237,
        type: "completed",
        is_system: true,
        tasks_count: 225,
        columns: [
          {
            id: 230273,
            name: "Сделать",
            board_id: 44237,
            type: "new",
            is_system: true,
            tasks_count: 18,
          },
        ],
      },
    ]);

    expect(columns).toEqual([
      {
        id: 230276,
        name: "Завершено",
        board_id: 44237,
        type: "completed",
        is_system: true,
        tasks_count: 225,
      },
      {
        id: 230273,
        name: "Сделать",
        board_id: 44237,
        type: "new",
        is_system: true,
        tasks_count: 18,
      },
    ]);
  });

  test("detects completed columns by type first and fallback names second", () => {
    const columns = flattenBoardColumns([
      { id: 1, name: "Anything", type: "completed", tasks_count: 10 },
      { id: 2, name: "Готово", type: null, tasks_count: 5 },
      { id: 3, name: "Сделать", type: "new", tasks_count: 7 },
    ]);

    expect([...getCompletedColumnIds(columns)].sort()).toEqual([1, 2]);
  });

  test("builds column map and sums task counts", () => {
    const columns = flattenBoardColumns([
      { id: 1, name: "Done", type: "completed", tasks_count: 225 },
      { id: 2, name: "Todo", type: "new", tasks_count: 18 },
    ]);
    const map = buildColumnMap(columns);
    const completed = getCompletedColumnIds(columns);

    expect(map.get(1)?.name).toBe("Done");
    expect(sumColumnTaskCounts(columns, completed)).toBe(225);
  });
});

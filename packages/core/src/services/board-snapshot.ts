export interface BoardColumnInfo {
  id: number;
  name: string;
  board_id?: number;
  type?: string | null;
  is_system?: boolean;
  tasks_count?: number;
}

const COMPLETED_NAMES = new Set(["завершено", "готово", "done", "completed", "closed"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanField(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("ru-RU");
}

export function flattenBoardColumns(columns: unknown[]): BoardColumnInfo[] {
  const out: BoardColumnInfo[] = [];

  const visit = (value: unknown) => {
    const record = asRecord(value);
    if (!record) return;

    const id = numberField(record.id);
    const name = stringField(record.name);
    if (id !== undefined && name !== undefined) {
      const info: BoardColumnInfo = { id, name };
      const boardId = numberField(record.board_id);
      const type = record.type === null ? null : stringField(record.type);
      const isSystem = booleanField(record.is_system);
      const tasksCount = numberField(record.tasks_count);

      if (boardId !== undefined) info.board_id = boardId;
      if (type !== undefined || record.type === null) info.type = type ?? null;
      if (isSystem !== undefined) info.is_system = isSystem;
      if (tasksCount !== undefined) info.tasks_count = tasksCount;
      out.push(info);
    }

    const children = record.columns;
    if (Array.isArray(children)) {
      for (const child of children) visit(child);
    }
  };

  for (const column of columns) visit(column);
  return out;
}

export function buildColumnMap(columns: BoardColumnInfo[]): Map<number, BoardColumnInfo> {
  return new Map(columns.map((column) => [column.id, column]));
}

export function isCompletedColumn(column: BoardColumnInfo): boolean {
  if (column.type === "completed") return true;
  return COMPLETED_NAMES.has(normalizeName(column.name));
}

export function getCompletedColumnIds(columns: BoardColumnInfo[]): Set<number> {
  return new Set(columns.filter(isCompletedColumn).map((column) => column.id));
}

export function sumColumnTaskCounts(columns: BoardColumnInfo[], ids: Set<number>): number {
  return columns.reduce((sum, column) => {
    if (!ids.has(column.id)) return sum;
    return sum + (column.tasks_count ?? 0);
  }, 0);
}

export type DueFilter = "none" | "overdue" | "today" | "week";

export const DUE_SCAN_MAX_PAGES = 5;

/** Start of calendar day in `timeZone`, as UTC epoch ms. */
export function startOfDayUtcMs(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  // Interpret Y-M-D as local civil date in timeZone via iterative offset (or Temporal if available).
  // Practical approach: format a candidate and binary-search is overkill —
  // use Date with noon UTC then adjust by offset of that tz on that day:
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = tzOffsetMs(new Date(utcGuess), timeZone);
  return utcGuess - offset;
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - date.getTime();
}

export function matchesDue(
  endAt: string | null | undefined,
  due: DueFilter,
  now: Date,
  timeZone: string
): boolean {
  if (due === "none") return true;
  if (endAt == null || endAt === "") return false;
  const endMs = Date.parse(endAt);
  if (Number.isNaN(endMs)) return false;
  const start = startOfDayUtcMs(now, timeZone);
  const dayMs = 24 * 60 * 60 * 1000;
  if (due === "overdue") return endMs < start;
  if (due === "today") return endMs >= start && endMs < start + dayMs;
  if (due === "week") return endMs >= start && endMs < start + 7 * dayMs;
  return true;
}

export function filterTasksByDue<T extends { end_at?: string | null }>(
  tasks: T[],
  due: DueFilter,
  now: Date,
  timeZone: string
): T[] {
  if (due === "none") return tasks;
  return tasks.filter((t) => matchesDue(t.end_at, due, now, timeZone));
}

export async function collectTasksWithDueScan<
  T extends { end_at?: string | null; project_id: number },
>(options: {
  fetchPage: (page: number) => Promise<{ tasks: T[]; meta?: Record<string, unknown> }>;
  startPage: number;
  due: DueFilter;
  now: Date;
  timeZone: string;
  maxPages: number;
  allow: (projectId: number) => boolean;
}): Promise<{ tasks: T[]; meta: Record<string, unknown> }> {
  const { fetchPage, startPage, due, now, timeZone, maxPages, allow } = options;
  const accumulated: T[] = [];
  let lastMeta: Record<string, unknown> = {};
  let scanned = 0;
  let lastPage = Number.POSITIVE_INFINITY;

  for (let p = startPage; p < startPage + maxPages; p++) {
    if (p > lastPage) break;
    const result = await fetchPage(p);
    scanned++;
    lastMeta = result.meta && typeof result.meta === "object" ? { ...result.meta } : {};
    const lp = lastMeta.last_page;
    if (typeof lp === "number" && Number.isFinite(lp)) {
      lastPage = lp;
    }
    const filtered = filterTasksByDue(result.tasks, due, now, timeZone).filter((t) =>
      allow(t.project_id)
    );
    accumulated.push(...filtered);
    if (p >= lastPage) break;
  }

  const scan_capped = scanned >= maxPages && startPage + scanned - 1 < lastPage;

  return {
    tasks: accumulated,
    meta: {
      ...lastMeta,
      filtered_count: accumulated.length,
      scanned_pages: scanned,
      scan_capped,
      start_page: startPage,
    },
  };
}

/** Minimal fields for Kalender/Gantt (hindari import siklik dari workspace-client). */
export type ScheduleIssue = {
  id: string;
  project_id: string;
  parent_id: string | null;
  sort_order: number;
  starts_at: string | null;
  due_at: string | null;
  key_display: string | null;
  title: string;
  last_note?: string | null;
  last_note_at?: string | null;
};

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function parseIsoDate(iso: string | null): Date | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

/** True if `day` (local midnight) falls on or between starts_at and due_at (inclusive by local date). */
export function issueCoversLocalDay(
  issue: Pick<ScheduleIssue, "starts_at" | "due_at">,
  day: Date
): boolean {
  const s = parseIsoDate(issue.starts_at);
  const e = parseIsoDate(issue.due_at);
  if (!s && !e) return false;
  const start = startOfDay(s ?? e!);
  const end = endOfDay(e ?? s!);
  const mid = startOfDay(day);
  return mid.getTime() >= start.getTime() && mid.getTime() <= end.getTime();
}

export function issueHasSchedule(
  issue: Pick<ScheduleIssue, "starts_at" | "due_at">
): boolean {
  return Boolean(issue.starts_at || issue.due_at);
}

export function barRange(
  issue: Pick<ScheduleIssue, "starts_at" | "due_at">
): { start: Date; end: Date } | null {
  const s = parseIsoDate(issue.starts_at);
  const e = parseIsoDate(issue.due_at);
  if (!s && !e) return null;
  if (s && e) {
    const a = startOfDay(s);
    const b = endOfDay(e);
    if (a.getTime() > b.getTime()) return { start: startOfDay(e), end: endOfDay(s) };
    return { start: a, end: b };
  }
  const one = s ?? e!;
  return { start: startOfDay(one), end: endOfDay(one) };
}

function collectDescendantIds(
  rootId: string,
  issues: ScheduleIssue[],
  into: Set<string>
): void {
  into.add(rootId);
  for (const c of issues) {
    if (c.parent_id === rootId) collectDescendantIds(c.id, issues, into);
  }
}

export function visibleIssuesForSchedule(
  issues: ScheduleIssue[],
  projectId: string,
  taskId: string | null,
  mode: "calendar" | "gantt"
): ScheduleIssue[] {
  const inProject = issues.filter((i) => i.project_id === projectId);
  if (!taskId) {
    if (mode === "gantt") {
      return inProject.filter((i) => !i.parent_id);
    }
    return inProject;
  }
  const allowed = new Set<string>();
  collectDescendantIds(taskId, issues, allowed);
  return inProject.filter((i) => allowed.has(i.id));
}

export function monthMatrix(monthAnchor: Date): { date: Date; inMonth: boolean }[][] {
  const first = startOfMonth(monthAnchor);
  const last = endOfMonth(monthAnchor);
  const startWeekday = first.getDay();
  const daysInMonth = last.getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];
  const prevMonth = addMonths(first, -1);
  const prevLast = endOfMonth(prevMonth).getDate();
  for (let i = 0; i < startWeekday; i++) {
    const dayNum = prevLast - startWeekday + 1 + i;
    cells.push({
      date: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), dayNum),
      inMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: new Date(first.getFullYear(), first.getMonth(), d),
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) {
    const lastCell = cells[cells.length - 1]!;
    const next = new Date(lastCell.date);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  const rows: { date: Date; inMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

const DAY_MS = 86400000;

export function ganttPixelLayout(
  issues: ScheduleIssue[],
  dayWidthPx: number,
  padDays: number
): {
  minDay: Date;
  maxDay: Date;
  totalDays: number;
  widthPx: number;
  bars: {
    issue: ScheduleIssue;
    leftPx: number;
    widthPx: number;
  }[];
} | null {
  const withRange = issues
    .map((issue) => ({ issue, range: barRange(issue) }))
    .filter((x): x is { issue: ScheduleIssue; range: { start: Date; end: Date } } =>
      Boolean(x.range)
    );
  if (withRange.length === 0) return null;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const { range } of withRange) {
    minT = Math.min(minT, range.start.getTime());
    maxT = Math.max(maxT, range.end.getTime());
  }
  const minDay = startOfDay(new Date(minT - padDays * DAY_MS));
  const maxDayStart = startOfDay(new Date(maxT + padDays * DAY_MS));
  const totalDays = Math.max(
    1,
    Math.round((maxDayStart.getTime() - minDay.getTime()) / DAY_MS) + 1
  );
  const widthPx = totalDays * dayWidthPx;
  const bars = withRange.map(({ issue, range }) => {
    const startDay = startOfDay(range.start);
    const endDay = startOfDay(range.end);
    const startOffset = Math.round(
      (startDay.getTime() - minDay.getTime()) / DAY_MS
    );
    const endOffset = Math.round(
      (endDay.getTime() - minDay.getTime()) / DAY_MS
    );
    const spanDays = Math.max(1, endOffset - startOffset + 1);
    return {
      issue,
      leftPx: startOffset * dayWidthPx,
      widthPx: spanDays * dayWidthPx,
    };
  });
  return { minDay, maxDay: maxDayStart, totalDays, widthPx, bars };
}

export function formatShortDate(iso: string | null): string {
  const d = parseIsoDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

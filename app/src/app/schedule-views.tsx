"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  formatShortDate,
  ganttPixelLayout,
  issueHasSchedule,
  monthMatrix,
  parseIsoDate,
  sameLocalDay,
  startOfMonth,
  visibleIssuesForSchedule,
  type ScheduleIssue,
} from "./schedule-utils";

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function compactNote(note: string | null | undefined): string {
  const raw = (note ?? "").trim();
  if (!raw) return "";
  return raw.replace(/\s+/g, " ");
}

function initialCalendarMonth(
  issues: ScheduleIssue[],
  projectId: string | null,
  taskId: string | null
): Date {
  if (!projectId) return startOfMonth(new Date());
  const vis = visibleIssuesForSchedule(issues, projectId, taskId, "calendar").filter(
    (i) => Boolean(parseIsoDate(i.last_note_at ?? null))
  );
  const firstIso = vis
    .map((i) => i.last_note_at)
    .filter(Boolean)
    .sort()[0];
  if (firstIso) return startOfMonth(new Date(firstIso));
  return startOfMonth(new Date());
}

type CalProps = {
  issues: ScheduleIssue[];
  projectId: string | null;
  taskId: string | null;
  onSelectIssue: (issueId: string) => void;
};

export function CalendarScheduleView({
  issues,
  projectId,
  taskId,
  onSelectIssue,
}: CalProps) {
  const visible = useMemo(() => {
    if (!projectId) return [];
    return visibleIssuesForSchedule(issues, projectId, taskId, "calendar");
  }, [issues, projectId, taskId]);

  const withCalendarNote = useMemo(
    () => visible.filter((i) => Boolean(parseIsoDate(i.last_note_at ?? null))),
    [visible]
  );

  const [monthCursor, setMonthCursor] = useState(() =>
    initialCalendarMonth(issues, projectId, taskId)
  );

  const matrix = useMemo(() => monthMatrix(monthCursor), [monthCursor]);

  const title = monthCursor.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  if (!projectId) {
    return <p className="text-sm text-slate-500">Pilih project.</p>;
  }

  return (
    <div className="space-y-3">
      {taskId && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Kalender memfilter <strong>unit kerja terpilih dan unit turunan</strong> dalam
          project ini. Item ditampilkan berdasarkan tanggal <strong>Kapan</strong>{" "}
          (catatan terakhir).
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold capitalize text-slate-800">
          {title}
        </h4>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMonthCursor((m) => addMonths(m, -1))}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Bulan lalu
          </button>
          <button
            type="button"
            onClick={() => setMonthCursor((m) => addMonths(m, 1))}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Bulan depan →
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-center text-xs">
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th
                  key={d}
                  className="w-[14.2857%] border-b border-slate-200 bg-slate-50 py-2 font-medium text-slate-600"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={ri}>
                {row.map(({ date, inMonth }, ci) => {
                  const dayIssues = withCalendarNote.filter((i) => {
                    const notedAt = parseIsoDate(i.last_note_at ?? null);
                    if (!notedAt) return false;
                    return sameLocalDay(notedAt, date);
                  });
                  const maxVisibleDayIssues = 3;
                  const visibleDayIssues = dayIssues.slice(0, maxVisibleDayIssues);
                  const hiddenIssueCount = Math.max(0, dayIssues.length - visibleDayIssues.length);
                  return (
                    <td
                      key={ci}
                      className={`h-28 align-top border border-slate-100 p-1 ${
                        inMonth ? "bg-white" : "bg-slate-50/80 text-slate-400"
                      }`}
                    >
                      <div className="h-full overflow-hidden text-left">
                        <span
                          className={`inline-block rounded px-1 font-medium ${
                            inMonth ? "text-slate-800" : "text-slate-400"
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        <ul className="mt-1 space-y-0.5">
                          {visibleDayIssues.map((i) => {
                            const note = compactNote(i.last_note);
                            const titleText = `${i.key_display ? `${i.key_display} ` : ""}${i.title}`;
                            const tooltip = note ? `${titleText}\nCatatan: ${note}` : titleText;
                            return (
                              <li key={i.id}>
                                <button
                                  type="button"
                                  onClick={() => onSelectIssue(i.id)}
                                  className="w-full rounded bg-blue-50 px-1 py-0.5 text-left text-[10px] text-blue-900 hover:bg-blue-100"
                                  title={tooltip}
                                >
                                  <p className="truncate font-medium">
                                    {i.key_display ? `${i.key_display} ` : ""}
                                    <span className="font-normal">{i.title}</span>
                                  </p>
                                  {note ? (
                                    <p className="mt-0.5 truncate text-[9px] text-blue-800/90">
                                      {note}
                                    </p>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                          {hiddenIssueCount > 0 ? (
                            <li
                              className="truncate rounded px-1 py-0.5 text-[10px] text-slate-500"
                              title={`${hiddenIssueCount} item lainnya`}
                            >
                              ...
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {withCalendarNote.length === 0 && (
        <p className="text-sm text-slate-500">
          Belum ada unit kerja dengan catatan terakhir pada scope ini.
        </p>
      )}
    </div>
  );
}

function depthInTree(
  issue: ScheduleIssue,
  issues: ScheduleIssue[],
  cache: Map<string, number>
): number {
  if (!issue.parent_id) return 0;
  const hit = cache.get(issue.id);
  if (hit !== undefined) return hit;
  const parent = issues.find((x) => x.id === issue.parent_id);
  const d = parent ? 1 + depthInTree(parent, issues, cache) : 0;
  cache.set(issue.id, d);
  return d;
}

type GanttProps = {
  issues: ScheduleIssue[];
  projectId: string | null;
  taskId: string | null;
  onSelectIssue: (issueId: string) => void;
};

export function GanttScheduleView({
  issues,
  projectId,
  taskId,
  onSelectIssue,
}: GanttProps) {
  const visible = useMemo(() => {
    if (!projectId) return [];
    return visibleIssuesForSchedule(issues, projectId, taskId, "gantt");
  }, [issues, projectId, taskId]);

  const withSchedule = useMemo(() => {
    const list = visible.filter(issueHasSchedule);
    const cache = new Map<string, number>();
    return [...list].sort((a, b) => {
      const da = depthInTree(a, issues, cache);
      const db = depthInTree(b, issues, cache);
      if (da !== db) return da - db;
      return a.sort_order - b.sort_order;
    });
  }, [visible, issues]);

  const layout = useMemo(
    () => ganttPixelLayout(withSchedule, 22, 2),
    [withSchedule]
  );

  if (!projectId) {
    return <p className="text-sm text-slate-500">Pilih project.</p>;
  }

  return (
    <div className="space-y-3">
      {taskId && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Gantt menampilkan <strong>unit kerja terpilih + unit turunan</strong> yang punya
          jadwal. Scope project menampilkan hanya unit kerja level atas.
        </p>
      )}
      {!taskId && (
        <p className="text-xs text-slate-500">
          Skala horizontal = hari (lebar tetap). Gulir ke kanan untuk rentang
          panjang.
        </p>
      )}
      {!layout ? (
        <p className="text-sm text-slate-500">
          Tidak ada bar dengan tanggal untuk scope ini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <div style={{ width: layout.widthPx + 200 }} className="relative">
            <div
              className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50 text-[10px] text-slate-500"
              style={{ marginLeft: 200, width: layout.widthPx }}
            >
              {Array.from({ length: layout.totalDays }, (_, i) => {
                const t = layout.minDay.getTime() + i * 86400000;
                const d = new Date(t);
                return (
                  <div
                    key={i}
                    className="shrink-0 border-l border-slate-100 text-center leading-tight"
                    style={{ width: 22 }}
                  >
                    <div>{d.getDate()}</div>
                    <div className="text-[9px] text-slate-400">
                      {d.toLocaleDateString("id-ID", { month: "short" })}
                    </div>
                  </div>
                );
              })}
            </div>
            {(() => {
              const depthCache = new Map<string, number>();
              return layout.bars.map(({ issue, leftPx, widthPx }) => {
                const depth = depthInTree(issue, issues, depthCache);
                return (
                <div
                  key={issue.id}
                  className="flex items-stretch border-b border-slate-100"
                >
                  <div className="w-[200px] shrink-0 border-r border-slate-100 bg-slate-50/50 px-2 py-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onSelectIssue(issue.id)}
                      className="w-full text-left hover:text-blue-700"
                      style={{ paddingLeft: depth * 10 }}
                    >
                      <span className="font-mono text-[10px] text-slate-500">
                        {issue.key_display ?? "—"}
                      </span>
                      <span className="mt-0.5 block font-medium text-slate-800">
                        {issue.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {formatShortDate(issue.starts_at)} →{" "}
                        {formatShortDate(issue.due_at)}
                      </span>
                    </button>
                  </div>
                  <div
                    className="relative py-2"
                    style={{ width: layout.widthPx }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectIssue(issue.id)}
                      className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md bg-teal-500/90 text-left text-[10px] font-medium text-white shadow-sm hover:bg-teal-600"
                      style={{
                        left: leftPx,
                        width: Math.max(widthPx, 18),
                        paddingLeft: 4,
                        paddingRight: 4,
                      }}
                      title={issue.title}
                    >
                      <span className="truncate">{issue.key_display}</span>
                    </button>
                  </div>
                </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

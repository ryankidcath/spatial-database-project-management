import type { ViewId } from "./workspace-views";

const VIEW_PARAMS: Record<ViewId, string> = {
  Dashboard: "dashboard",
  Tabel: "tabel",
  Berkas: "berkas",
  Laporan: "laporan",
  Map: "map",
  Kanban: "kanban",
  Kalender: "kalender",
  Gantt: "gantt",
};

const PARAM_TO_VIEW = Object.fromEntries(
  Object.entries(VIEW_PARAMS).map(([view, param]) => [param, view as ViewId])
) as Record<string, ViewId>;

export function viewToParam(view: ViewId): string {
  return VIEW_PARAMS[view];
}

export function parseViewParam(raw: string | null): ViewId | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return PARAM_TO_VIEW[key] ?? null;
}

"use client";

import { useMemo, useState } from "react";

export type ProjectRow = {
  id: string;
  name: string;
  key: string;
  organization_id: string;
};

export type IssueRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  key_display: string | null;
  title: string;
  sort_order: number;
};

const VIEWS = [
  "Dashboard",
  "Tabel",
  "Map",
  "Kanban",
  "Kalender",
  "Gantt",
] as const;

type ViewId = (typeof VIEWS)[number];

type Props = {
  projects: ProjectRow[];
  issues: IssueRow[];
  fetchError: string | null;
};

function flattenIssuesForProject(
  projectId: string,
  issues: IssueRow[]
): IssueRow[] {
  return flattenIssuesWithDepth(projectId, issues).map((x) => x.issue);
}

function flattenIssuesWithDepth(
  projectId: string,
  issues: IssueRow[]
): { issue: IssueRow; depth: number }[] {
  const list = issues.filter((i) => i.project_id === projectId);
  const byParent = new Map<string | null, IssueRow[]>();
  for (const i of list) {
    const k = i.parent_id;
    const arr = byParent.get(k) ?? [];
    arr.push(i);
    byParent.set(k, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }
  const out: { issue: IssueRow; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const c of children) {
      out.push({ issue: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function WorkspaceClient({ projects, issues, fetchError }: Props) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(projects[0]?.id ? [projects[0].id] : [])
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projects[0]?.id ?? null
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("Dashboard");

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedTask = useMemo(
    () => issues.find((i) => i.id === selectedTaskId) ?? null,
    [issues, selectedTaskId]
  );

  const issuesInScope = useMemo(() => {
    if (!selectedProjectId) return [];
    return flattenIssuesForProject(selectedProjectId, issues);
  }, [selectedProjectId, issues]);

  const topLevelCount = useMemo(
    () => issues.filter((i) => i.project_id === selectedProjectId && !i.parent_id)
      .length,
    [issues, selectedProjectId]
  );

  const toggleExpand = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-red-200 bg-white p-6 text-sm text-red-800">
          <p className="font-semibold">Gagal memuat data dari Supabase</p>
          <p className="mt-2 text-red-700">{fetchError}</p>
          <p className="mt-4 text-slate-600">
            Pastikan migration{" "}
            <code className="rounded bg-slate-100 px-1">0002_core_pm_initial.sql</code>{" "}
            sudah di-push:{" "}
            <code className="rounded bg-slate-100 px-1">npx supabase db push</code>
          </p>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-6 text-sm text-amber-900">
          <p className="font-semibold">Belum ada project</p>
          <p className="mt-2 text-amber-800">
            Jalankan migration seed atau tambah baris di{" "}
            <code className="rounded bg-slate-100 px-1">core_pm.projects</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white p-4">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Spatial PM
        </h1>
        <div className="mt-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Project
          </p>
          {projects.map((p) => {
            const expanded = expandedProjectIds.has(p.id);
            const treeRows = flattenIssuesWithDepth(p.id, issues);
            const isSelectedProject = selectedProjectId === p.id && !selectedTaskId;

            return (
              <div key={p.id} className="rounded-md border border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    toggleExpand(p.id);
                    setSelectedProjectId(p.id);
                    setSelectedTaskId(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded-t-md px-3 py-2 text-left text-sm font-medium ${
                    isSelectedProject
                      ? "bg-blue-50 text-blue-800"
                      : "bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-xs">{expanded ? "▼" : "▶"}</span>
                  {p.name}
                </button>
                {expanded && (
                  <ul className="space-y-0.5 border-t border-slate-100 py-1 pl-2">
                    {treeRows.map(({ issue: t, depth }) => {
                      const isTask = selectedTaskId === t.id;
                      return (
                        <li key={t.id} style={{ paddingLeft: depth * 12 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(p.id);
                              setSelectedTaskId(t.id);
                            }}
                            className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                              isTask
                                ? "bg-blue-100 text-blue-900"
                                : "text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {t.key_display ? `${t.key_display} — ` : ""}
                            {t.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Scope aktif
          </p>
          <h2 className="text-lg font-semibold">
            {selectedTask
              ? `Task: ${selectedTask.key_display ? `${selectedTask.key_display} — ` : ""}${selectedTask.title}`
              : selectedProject
                ? `Project: ${selectedProject.name}`
                : "—"}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setActiveView(view)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  activeView === view
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </header>

        <section className="flex-1 p-6">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
            <h3 className="text-base font-semibold">
              {activeView} —{" "}
              {selectedTask ? "fokus task" : "cakupan project"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Data berasal dari <code className="rounded bg-slate-100 px-1">core_pm</code>
              . Pilih task di kiri untuk menyempitkan konteks; pilih header project
              untuk kembali ke cakupan seluruh project.
            </p>
            {activeView === "Dashboard" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md bg-slate-50 p-3 text-sm">
                  Task level atas:{" "}
                  <span className="font-semibold">{topLevelCount}</span>
                </div>
                <div className="rounded-md bg-slate-50 p-3 text-sm">
                  Total baris terurut (dengan sub-task):{" "}
                  <span className="font-semibold">{issuesInScope.length}</span>
                </div>
                <div className="rounded-md bg-slate-50 p-3 text-sm">
                  Project key:{" "}
                  <span className="font-semibold">
                    {selectedProject?.key ?? "—"}
                  </span>
                </div>
                <div className="rounded-md bg-slate-50 p-3 text-sm">
                  View aktif:{" "}
                  <span className="font-semibold">{activeView}</span>
                </div>
              </div>
            )}
            {activeView !== "Dashboard" && (
              <p className="mt-4 text-sm text-slate-500">
                Isi view ini di increment berikutnya (tabel/kanban/kalender/gantt/map).
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

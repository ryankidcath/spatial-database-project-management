"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { KanbanBoard } from "./kanban-board";
import { CalendarScheduleView, GanttScheduleView } from "./schedule-views";
import { formatShortDate } from "./schedule-utils";
import { parseViewParam, viewToParam } from "./workspace-url";
import { VIEWS, type ViewId } from "./workspace-views";

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
};

export type ProjectRow = {
  id: string;
  name: string;
  key: string;
  organization_id: string;
};

export type StatusRow = {
  id: string;
  project_id: string;
  name: string;
  category: string;
  position: number;
};

export type IssueRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  status_id: string | null;
  key_display: string | null;
  title: string;
  sort_order: number;
  starts_at: string | null;
  due_at: string | null;
};

type Props = {
  organizations: OrganizationRow[];
  projects: ProjectRow[];
  statuses: StatusRow[];
  issues: IssueRow[];
  fetchError: string | null;
};

type TableRow = { issue: IssueRow; depth: number };

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

export function WorkspaceClient({
  organizations,
  projects,
  statuses,
  issues,
  fetchError,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orgsWithProjects = useMemo(() => {
    const ids = new Set(projects.map((p) => p.organization_id));
    return organizations
      .filter((o) => ids.has(o.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations, projects]);

  const canonicalOrgId = useMemo(() => {
    const o = searchParams.get("org");
    if (
      o &&
      orgsWithProjects.some((x) => x.id === o) &&
      projects.some((p) => p.organization_id === o)
    ) {
      return o;
    }
    return projects[0]?.organization_id ?? null;
  }, [searchParams, orgsWithProjects, projects]);

  const projectsInOrg = useMemo(() => {
    if (!canonicalOrgId) return [];
    return projects
      .filter((p) => p.organization_id === canonicalOrgId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, canonicalOrgId]);

  const selectedProjectId = useMemo(() => {
    const q = searchParams.get("project");
    if (q && projectsInOrg.some((p) => p.id === q)) return q;
    return projectsInOrg[0]?.id ?? null;
  }, [searchParams, projectsInOrg]);

  const selectedTaskId = useMemo(() => {
    const q = searchParams.get("task");
    if (!q || !selectedProjectId) return null;
    const ok = issues.some(
      (i) => i.id === q && i.project_id === selectedProjectId
    );
    return ok ? q : null;
  }, [searchParams, issues, selectedProjectId]);

  const activeView = useMemo((): ViewId => {
    return parseViewParam(searchParams.get("view")) ?? "Dashboard";
  }, [searchParams]);

  useEffect(() => {
    if (projects.length === 0 || !canonicalOrgId || !selectedProjectId) return;
    const p = new URLSearchParams(searchParams.toString());
    let dirty = false;
    if (p.get("org") !== canonicalOrgId) {
      p.set("org", canonicalOrgId);
      dirty = true;
    }
    if (p.get("project") !== selectedProjectId) {
      p.set("project", selectedProjectId);
      dirty = true;
    }
    if (!p.get("view")) {
      p.set("view", viewToParam("Dashboard"));
      dirty = true;
    }
    const tid = p.get("task");
    if (
      tid &&
      !issues.some(
        (i) => i.id === tid && i.project_id === selectedProjectId
      )
    ) {
      p.delete("task");
      dirty = true;
    }
    if (dirty) {
      router.replace(`/?${p.toString()}`, { scroll: false });
    }
  }, [
    projects.length,
    canonicalOrgId,
    selectedProjectId,
    searchParams,
    router,
    issues,
  ]);

  const selectedOrganization = useMemo(
    () => orgsWithProjects.find((o) => o.id === canonicalOrgId) ?? null,
    [orgsWithProjects, canonicalOrgId]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedTask = useMemo(
    () => issues.find((i) => i.id === selectedTaskId) ?? null,
    [issues, selectedTaskId]
  );

  const statusesForProject = useMemo(() => {
    if (!selectedProjectId) return [];
    return statuses
      .filter((s) => s.project_id === selectedProjectId)
      .sort((a, b) => a.position - b.position);
  }, [statuses, selectedProjectId]);

  const issuesInScope = useMemo(() => {
    if (!selectedProjectId) return [];
    return flattenIssuesForProject(selectedProjectId, issues);
  }, [selectedProjectId, issues]);

  const topLevelCount = useMemo(
    () =>
      issues.filter(
        (i) => i.project_id === selectedProjectId && !i.parent_id
      ).length,
    [issues, selectedProjectId]
  );

  const tableRows = useMemo((): TableRow[] => {
    if (!selectedProjectId) return [];
    if (selectedTaskId) {
      const self = issues.find((i) => i.id === selectedTaskId);
      if (!self) return [];
      const children = issues
        .filter((i) => i.parent_id === selectedTaskId)
        .sort((a, b) => a.sort_order - b.sort_order);
      const rows: TableRow[] = [{ issue: self, depth: 0 }];
      for (const c of children) {
        rows.push({ issue: c, depth: 1 });
      }
      return rows;
    }
    return flattenIssuesWithDepth(selectedProjectId, issues);
  }, [selectedProjectId, selectedTaskId, issues]);

  const replaceQuery = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.replace(`/?${p.toString()}`, { scroll: false });
  };

  const selectIssueInScope = (issueId: string) => {
    if (!selectedProjectId) return;
    const proj = projects.find((p) => p.id === selectedProjectId);
    replaceQuery((q) => {
      if (proj) q.set("org", proj.organization_id);
      q.set("project", selectedProjectId);
      q.set("task", issueId);
    });
  };

  if (fetchError) {
    const isSchemaError =
      /invalid schema|core_pm/i.test(fetchError) ||
      fetchError.includes("PGRST106");

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-red-200 bg-white p-6 text-sm text-red-800">
          <p className="font-semibold">Gagal memuat data dari Supabase</p>
          <p className="mt-2 text-red-700">{fetchError}</p>
          {isSchemaError ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
              <p className="font-medium">Schema API belum di-expose</p>
              <p className="mt-2 text-sm">
                Di Supabase Dashboard:{" "}
                <strong>Project Settings → Data API / API → Exposed schemas</strong>
                , tambahkan{" "}
                <code className="rounded bg-white px-1">core_pm</code> (dan nanti{" "}
                <code className="rounded bg-white px-1">plm</code>,{" "}
                <code className="rounded bg-white px-1">spatial</code>,{" "}
                <code className="rounded bg-white px-1">finance</code> jika dipakai).
              </p>
              <p className="mt-2 text-sm">
                Panduan di repo:{" "}
                <code className="rounded bg-white px-1">docs/supabase-expose-schemas.md</code>
              </p>
            </div>
          ) : (
            <p className="mt-4 text-slate-600">
              Pastikan migration{" "}
              <code className="rounded bg-slate-100 px-1">0002_core_pm_initial.sql</code>{" "}
              sudah di-push:{" "}
              <code className="rounded bg-slate-100 px-1">npx supabase db push</code>
            </p>
          )}
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
            Organisasi
          </p>
          <div className="flex flex-col gap-1">
            {orgsWithProjects.map((o) => {
              const active = canonicalOrgId === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    replaceQuery((q) => {
                      q.set("org", o.id);
                      const first = projects
                        .filter((p) => p.organization_id === o.id)
                        .sort((a, b) => a.name.localeCompare(b.name))[0];
                      if (first) q.set("project", first.id);
                      q.delete("task");
                    });
                  }}
                  className={`rounded-md px-3 py-2 text-left text-sm font-medium ${
                    active
                      ? "bg-blue-50 text-blue-800"
                      : "bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Project
          </p>
          {projectsInOrg.map((p) => {
            const treeRows = flattenIssuesWithDepth(p.id, issues);
            const isSelectedProject =
              selectedProjectId === p.id && !selectedTaskId;

            return (
              <div key={p.id} className="rounded-md border border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    replaceQuery((q) => {
                      q.set("org", p.organization_id);
                      q.set("project", p.id);
                      q.delete("task");
                    });
                  }}
                  className={`flex w-full items-center gap-2 rounded-t-md px-3 py-2 text-left text-sm font-medium ${
                    isSelectedProject
                      ? "bg-blue-50 text-blue-800"
                      : "bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-xs text-slate-400">▾</span>
                  {p.name}
                </button>
                <ul className="space-y-0.5 border-t border-slate-100 py-1 pl-2">
                  {treeRows.map(({ issue: t, depth }) => {
                    const isTask = selectedTaskId === t.id;
                    return (
                      <li key={t.id} style={{ paddingLeft: depth * 12 }}>
                        <button
                          type="button"
                          onClick={() => {
                            replaceQuery((q) => {
                              q.set("org", p.organization_id);
                              q.set("project", p.id);
                              q.set("task", t.id);
                            });
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
          {selectedOrganization && (
            <p className="mt-1 text-xs text-slate-600">
              Organisasi:{" "}
              <span className="font-medium">{selectedOrganization.name}</span>
            </p>
          )}
          <p className="mt-1 truncate text-xs text-slate-500">
            URL:{" "}
            <code className="rounded bg-slate-100 px-1">
              ?org=…&amp;project=…&amp;task=…&amp;view=…
            </code>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() =>
                  replaceQuery((q) => q.set("view", viewToParam(view)))
                }
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

        <section className="flex-1 overflow-auto p-6">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
            <h3 className="text-base font-semibold">
              {activeView} —{" "}
              {selectedTask ? "fokus task" : "cakupan project"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Data dari <code className="rounded bg-slate-100 px-1">core_pm</code>
              . Query:{" "}
              <code className="rounded bg-slate-100 px-1">
                org={canonicalOrgId?.slice(0, 8)}…
              </code>{" "}
              <code className="rounded bg-slate-100 px-1">
                project={selectedProjectId?.slice(0, 8)}…
              </code>
              {selectedTaskId && (
                <>
                  {" "}
                  <code className="rounded bg-slate-100 px-1">
                    task={selectedTaskId.slice(0, 8)}…
                  </code>
                </>
              )}{" "}
              <code className="rounded bg-slate-100 px-1">
                view={viewToParam(activeView)}
              </code>
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
            {activeView === "Tabel" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="py-2 pr-4 font-medium">Key</th>
                      <th className="py-2 pr-4 font-medium">Judul</th>
                      <th className="py-2 pr-4 font-medium">Mulai</th>
                      <th className="py-2 pr-4 font-medium">Tenggat</th>
                      <th className="py-2 pr-4 font-medium">Sub-task?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(({ issue, depth }) => {
                      const isChild = Boolean(issue.parent_id);
                      return (
                        <tr
                          key={issue.id}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                            <span style={{ paddingLeft: depth * 12 }}>
                              {issue.key_display ?? "—"}
                            </span>
                          </td>
                          <td className="py-2 pr-4">{issue.title}</td>
                          <td className="py-2 pr-4 text-slate-600">
                            {formatShortDate(issue.starts_at)}
                          </td>
                          <td className="py-2 pr-4 text-slate-600">
                            {formatShortDate(issue.due_at)}
                          </td>
                          <td className="py-2 pr-4 text-slate-600">
                            {isChild ? "Ya" : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {tableRows.length === 0 && (
                  <p className="mt-2 text-sm text-slate-500">
                    Tidak ada baris untuk scope ini.
                  </p>
                )}
              </div>
            )}
            {activeView === "Map" && (
              <p className="mt-4 text-sm text-amber-800">
                Modul <strong>spatial</strong> belum diaktifkan — peta menyusul
                setelah Leaflet + data geometri.
              </p>
            )}
            {activeView === "Kanban" && selectedProjectId && (
              <div className="mt-4">
                {selectedTaskId && (
                  <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    Scope <strong>task</strong> aktif — board tetap menampilkan
                    semua task level atas project ini. Klik nama project di kiri
                    untuk fokus project saja.
                  </p>
                )}
                {statusesForProject.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Belum ada status untuk project ini.
                  </p>
                ) : (
                  <KanbanBoard
                    projectId={selectedProjectId}
                    statuses={statusesForProject}
                    issuesFromServer={issues}
                    onSelectIssue={selectIssueInScope}
                    onPersistError={() => {}}
                    onPersisted={() => router.refresh()}
                  />
                )}
              </div>
            )}
            {activeView === "Kalender" && selectedProjectId && (
              <div className="mt-4">
                <CalendarScheduleView
                  key={`cal-${selectedProjectId}-${selectedTaskId ?? "p"}`}
                  issues={issues}
                  projectId={selectedProjectId}
                  taskId={selectedTaskId}
                  onSelectIssue={selectIssueInScope}
                />
              </div>
            )}
            {activeView === "Gantt" && selectedProjectId && (
              <div className="mt-4">
                <GanttScheduleView
                  key={`gantt-${selectedProjectId}-${selectedTaskId ?? "p"}`}
                  issues={issues}
                  projectId={selectedProjectId}
                  taskId={selectedTaskId}
                  onSelectIssue={selectIssueInScope}
                />
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createOrganizationProjectAction,
  joinDemoProjectsAction,
  signOut,
} from "@/app/auth/actions";
import { NotificationsBell } from "./notifications-bell";
import { BerkasDetailPanel } from "./berkas-detail-panel";
import {
  LaporanPanel,
  type PlmBerkasStatusSummaryRow,
  type PlmLegalisasiTahapSummaryRow,
  type PlmPengukuranStatusSummaryRow,
} from "./laporan-panel";
import { FinancePanel } from "./finance-panel";
import {
  createProjectTaskAction,
  reopenTaskAction,
  setTaskDoneAction,
} from "./core-task-actions";
import type {
  FinanceInvoiceItemRow,
  FinanceInvoiceRow,
  FinancePembayaranRow,
} from "./finance-types";
import { BerkasListPanel } from "./berkas-list-panel";
import { OrganizationModuleToggles } from "./organization-module-toggles";
import type { BerkasPermohonanRow } from "./plm-berkas-types";
import type {
  LegalisasiGuFileRow,
  LegalisasiGuHistoryRow,
  LegalisasiGuRow,
} from "./plm-legalisasi-types";
import type {
  AlatUkurRow,
  PengukuranAlatRow,
  PengukuranDokumenRow,
  PengukuranLapanganRow,
  PengukuranSurveyorRow,
  PermohonanInfoSpasialRow,
} from "./plm-pengukuran-types";
import { KanbanBoard } from "./kanban-board";
import { CalendarScheduleView, GanttScheduleView } from "./schedule-views";
import { formatShortDate } from "./schedule-utils";
import {
  effectiveEnabledModuleCodes,
  isViewAllowedForModules,
  viewsForEnabledModules,
  type ModuleRegistryRow,
  type OrganizationModuleRow,
} from "./workspace-modules";
import { parseViewParam, viewToParam } from "./workspace-url";
import { findMapOverlapWarnings } from "./map-spatial-overlap";
import type { MapFootprint } from "./workspace-map";
import { type ViewId } from "./workspace-views";
import type { UserNotificationRow } from "./user-notification-types";

const WorkspaceMap = dynamic(
  () => import("./workspace-map").then((m) => m.WorkspaceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(70vh,560px)] items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-600">
        Memuat peta…
      </div>
    ),
  }
);

export type DemoFootprintRow = {
  id: string;
  project_id: string;
  label: string;
  geojson: unknown;
};

/** Baris view `spatial.v_bidang_hasil_ukur_map` (Fase 4 F4-2 / F4-3). */
export type BidangHasilUkurMapRow = {
  id: string;
  project_id: string;
  berkas_id: string;
  label: string;
  geojson: unknown;
};

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
  footprints: DemoFootprintRow[];
  bidangHasilUkurMap: BidangHasilUkurMapRow[];
  moduleRegistry: ModuleRegistryRow[];
  organizationModules: OrganizationModuleRow[];
  berkasPermohonan: BerkasPermohonanRow[];
  legalisasiGu: LegalisasiGuRow[];
  legalisasiGuFiles: LegalisasiGuFileRow[];
  legalisasiGuHistory: LegalisasiGuHistoryRow[];
  permohonanInfoSpasial: PermohonanInfoSpasialRow[];
  pengukuranLapangan: PengukuranLapanganRow[];
  pengukuranSurveyor: PengukuranSurveyorRow[];
  pengukuranAlat: PengukuranAlatRow[];
  pengukuranDokumen: PengukuranDokumenRow[];
  alatUkur: AlatUkurRow[];
  plmBerkasStatusSummary?: PlmBerkasStatusSummaryRow[];
  plmLegalisasiTahapSummary?: PlmLegalisasiTahapSummaryRow[];
  plmPengukuranStatusSummary?: PlmPengukuranStatusSummaryRow[];
  financeInvoices?: FinanceInvoiceRow[];
  financeInvoiceItems?: FinanceInvoiceItemRow[];
  financePembayaran?: FinancePembayaranRow[];
  fetchError: string | null;
  userEmail: string | null;
  userNotifications?: UserNotificationRow[];
  joinError?: string | null;
};

type TableRow = { issue: IssueRow; depth: number };

function statusBadgeClass(category: string | null | undefined): string {
  if (category === "done") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (category === "in_progress") {
    return "bg-blue-100 text-blue-800";
  }
  return "bg-slate-100 text-slate-700";
}

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
  footprints,
  bidangHasilUkurMap,
  moduleRegistry,
  organizationModules,
  berkasPermohonan,
  legalisasiGu,
  legalisasiGuFiles,
  legalisasiGuHistory,
  permohonanInfoSpasial,
  pengukuranLapangan,
  pengukuranSurveyor,
  pengukuranAlat,
  pengukuranDokumen,
  alatUkur,
  plmBerkasStatusSummary = [],
  plmLegalisasiTahapSummary = [],
  plmPengukuranStatusSummary = [],
  financeInvoices = [],
  financeInvoiceItems = [],
  financePembayaran = [],
  fetchError,
  userEmail,
  userNotifications = [],
  joinError,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  const [taskPending, startTaskTransition] = useTransition();

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

  const selectedBerkasId = useMemo(() => {
    if (parseViewParam(searchParams.get("view")) !== "Berkas") return null;
    const q = searchParams.get("berkas");
    if (!q || !selectedProjectId) return null;
    const ok = berkasPermohonan.some(
      (b) => b.id === q && b.project_id === selectedProjectId
    );
    return ok ? q : null;
  }, [searchParams, berkasPermohonan, selectedProjectId]);

  const selectedBerkas = useMemo(() => {
    if (!selectedBerkasId || !selectedProjectId) return null;
    return (
      berkasPermohonan.find(
        (b) => b.id === selectedBerkasId && b.project_id === selectedProjectId
      ) ?? null
    );
  }, [berkasPermohonan, selectedBerkasId, selectedProjectId]);

  const [mapShowDemo, setMapShowDemo] = useState(true);
  const [mapShowHasilUkur, setMapShowHasilUkur] = useState(true);

  const mapHighlightBerkasId = useMemo(() => {
    if (parseViewParam(searchParams.get("view")) !== "Map") return null;
    const q = searchParams.get("berkas");
    if (!q || !selectedProjectId) return null;
    const ok = berkasPermohonan.some(
      (b) => b.id === q && b.project_id === selectedProjectId
    );
    return ok ? q : null;
  }, [searchParams, berkasPermohonan, selectedProjectId]);

  const berkasIdsWithBidangInProject = useMemo(() => {
    const s = new Set<string>();
    if (!selectedProjectId) return s;
    for (const row of bidangHasilUkurMap) {
      if (row.project_id === selectedProjectId) s.add(row.berkas_id);
    }
    return s;
  }, [bidangHasilUkurMap, selectedProjectId]);

  const activeView = useMemo((): ViewId => {
    const raw = parseViewParam(searchParams.get("view")) ?? "Dashboard";
    const enabled = effectiveEnabledModuleCodes(
      canonicalOrgId,
      organizationModules
    );
    if (!isViewAllowedForModules(raw, enabled)) return "Dashboard";
    return raw;
  }, [searchParams, canonicalOrgId, organizationModules]);

  const enabledModulesForOrg = useMemo(
    () => effectiveEnabledModuleCodes(canonicalOrgId, organizationModules),
    [canonicalOrgId, organizationModules]
  );

  const visibleViews = useMemo(
    () => viewsForEnabledModules(enabledModulesForOrg),
    [enabledModulesForOrg]
  );

  const showBerkasBidangColumn = useMemo(
    () =>
      enabledModulesForOrg.has("plm") &&
      enabledModulesForOrg.has("spatial"),
    [enabledModulesForOrg]
  );

  const enabledModuleLabels = useMemo(() => {
    if (moduleRegistry.length === 0) {
      return [...enabledModulesForOrg].sort().join(", ");
    }
    return moduleRegistry
      .filter((m) => enabledModulesForOrg.has(m.module_code))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => m.display_name)
      .join(" · ");
  }, [moduleRegistry, enabledModulesForOrg]);

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
    const enabled = effectiveEnabledModuleCodes(
      canonicalOrgId,
      organizationModules
    );
    if (parseViewParam(p.get("view")) === "Map" && !enabled.has("spatial")) {
      p.set("view", viewToParam("Dashboard"));
      dirty = true;
    }
    if (parseViewParam(p.get("view")) === "Berkas" && !enabled.has("plm")) {
      p.set("view", viewToParam("Dashboard"));
      dirty = true;
    }
    if (parseViewParam(p.get("view")) === "Laporan" && !enabled.has("plm")) {
      p.set("view", viewToParam("Dashboard"));
      dirty = true;
    }
    if (parseViewParam(p.get("view")) === "Keuangan" && !enabled.has("finance")) {
      p.set("view", viewToParam("Dashboard"));
      dirty = true;
    }
    const viewParsed = parseViewParam(p.get("view"));
    const berkasParam = p.get("berkas");
    const berkasAllowedViews = new Set(["Berkas", "Map"]);
    if (
      berkasParam &&
      viewParsed &&
      !berkasAllowedViews.has(viewParsed)
    ) {
      p.delete("berkas");
      dirty = true;
    }
    if (
      berkasParam &&
      selectedProjectId &&
      (viewParsed === "Berkas" || viewParsed === "Map")
    ) {
      const ok = berkasPermohonan.some(
        (b) => b.id === berkasParam && b.project_id === selectedProjectId
      );
      if (!ok) {
        p.delete("berkas");
        dirty = true;
      }
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
    organizationModules,
    berkasPermohonan,
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
  const defaultStatusId = statusesForProject[0]?.id ?? null;

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

  const footprintsForSelectedProject = useMemo(() => {
    if (!selectedProjectId) return [];
    return footprints.filter((f) => f.project_id === selectedProjectId);
  }, [footprints, selectedProjectId]);

  const bidangHasilUkurForSelectedProject = useMemo(() => {
    if (!selectedProjectId) return [];
    return bidangHasilUkurMap.filter(
      (b) => b.project_id === selectedProjectId
    );
  }, [bidangHasilUkurMap, selectedProjectId]);

  const mapLayersForSelectedProject = useMemo((): MapFootprint[] => {
    const demo: MapFootprint[] = footprintsForSelectedProject.map((f) => ({
      id: `demo:${f.id}`,
      label: f.label,
      geojson: f.geojson,
      layerKind: "demo",
    }));
    const hasil: MapFootprint[] = bidangHasilUkurForSelectedProject.map(
      (b) => ({
        id: `hasil:${b.id}`,
        label: b.label,
        geojson: b.geojson,
        layerKind: "bidang_hasil_ukur",
        berkasId: b.berkas_id,
      })
    );
    return [...demo, ...hasil];
  }, [footprintsForSelectedProject, bidangHasilUkurForSelectedProject]);

  const mapOverlapWarnings = useMemo(
    () =>
      findMapOverlapWarnings(
        footprintsForSelectedProject.map((f) => ({
          label: f.label,
          geojson: f.geojson,
        })),
        bidangHasilUkurForSelectedProject.map((b) => ({
          label: b.label,
          geojson: b.geojson,
        }))
      ),
    [footprintsForSelectedProject, bidangHasilUkurForSelectedProject]
  );

  const visibleMapLayers = useMemo(() => {
    return mapLayersForSelectedProject.filter((layer) => {
      const k = layer.layerKind ?? "demo";
      if (k === "demo") return mapShowDemo;
      if (k === "bidang_hasil_ukur") return mapShowHasilUkur;
      return true;
    });
  }, [mapLayersForSelectedProject, mapShowDemo, mapShowHasilUkur]);

  const berkasForSelectedProject = useMemo(() => {
    if (!selectedProjectId) return [];
    return berkasPermohonan.filter((b) => b.project_id === selectedProjectId);
  }, [berkasPermohonan, selectedProjectId]);

  const financeInvoicesInProject = useMemo(
    () =>
      financeInvoices.filter((i) => i.project_id === (selectedProjectId ?? "")),
    [financeInvoices, selectedProjectId]
  );

  const financeInvoiceIdsInProject = useMemo(
    () => new Set(financeInvoicesInProject.map((i) => i.id)),
    [financeInvoicesInProject]
  );

  const financeItemsInProject = useMemo(
    () =>
      financeInvoiceItems.filter((it) =>
        financeInvoiceIdsInProject.has(it.invoice_id)
      ),
    [financeInvoiceItems, financeInvoiceIdsInProject]
  );

  const financePembayaranInProject = useMemo(
    () =>
      financePembayaran.filter((p) =>
        financeInvoiceIdsInProject.has(p.invoice_id)
      ),
    [financePembayaran, financeInvoiceIdsInProject]
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
  const statusById = useMemo(
    () => new Map(statusesForProject.map((s) => [s.id, s])),
    [statusesForProject]
  );

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

  const openBerkasDetail = (berkasId: string) => {
    if (!selectedProjectId) return;
    const proj = projects.find((p) => p.id === selectedProjectId);
    replaceQuery((q) => {
      if (proj) q.set("org", proj.organization_id);
      q.set("project", selectedProjectId);
      q.set("view", viewToParam("Berkas"));
      q.set("berkas", berkasId);
      q.delete("task");
    });
  };

  const openMapForBerkas = (berkasId: string) => {
    if (!selectedProjectId) return;
    const proj = projects.find((p) => p.id === selectedProjectId);
    replaceQuery((q) => {
      if (proj) q.set("org", proj.organization_id);
      q.set("project", selectedProjectId);
      q.set("view", viewToParam("Map"));
      q.set("berkas", berkasId);
      q.delete("task");
    });
  };

  if (fetchError) {
    const isSchemaError =
      /invalid schema|core_pm|spatial|plm/i.test(fetchError) ||
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
                <code className="rounded bg-white px-1">core_pm</code>,{" "}
                <code className="rounded bg-white px-1">plm</code> (Fase 3),{" "}
                <code className="rounded bg-white px-1">spatial</code>,{" "}
                <code className="rounded bg-white px-1">finance</code> sesuai kebutuhan.
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-6 text-sm text-amber-900">
          <p className="font-semibold">Tidak ada project yang dapat diakses</p>
          <p className="mt-2 text-amber-800">
            Dengan RLS aktif, Anda hanya melihat project tempat akun menjadi{" "}
            <code className="rounded bg-slate-100 px-1">project_members</code>.
            User baru sekarang mulai dari kosong; Anda bisa membuat organisasi
            dan project pertama langsung dari form di bawah.
          </p>
          {joinError && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-red-900">
              {joinError}
            </p>
          )}
          {userEmail && (
            <form action={createOrganizationProjectAction} className="mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Buat organisasi + project pertama
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Nama organisasi *
                  <input
                    name="organization_name"
                    required
                    placeholder="Contoh: KJSB Cirebon"
                    className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-700">
                  Slug organisasi (opsional)
                  <input
                    name="organization_slug"
                    placeholder="kjsb-cirebon"
                    className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-700">
                  Nama project *
                  <input
                    name="project_name"
                    required
                    placeholder="Contoh: PLM Cirebon 2027"
                    className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-700">
                  Kode project (opsional)
                  <input
                    name="project_key"
                    placeholder="PLM27"
                    className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-700">
                Deskripsi project (opsional)
                <textarea
                  name="project_description"
                  rows={2}
                  placeholder="Catatan singkat project"
                  className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Buat organisasi & project
              </button>
            </form>
          )}
          {userEmail && (
            <form action={joinDemoProjectsAction} className="mt-3">
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Atau gabung ke project demo (KJSB)
              </button>
            </form>
          )}
          <p className="mt-4 text-xs text-slate-600">
            Jika tetap kosong, tambahkan baris di{" "}
            <code className="rounded bg-slate-100 px-1">core_pm.project_members</code>{" "}
            untuk <code className="rounded bg-slate-100 px-1">auth.users.id</code> Anda,
            atau minta admin menambahkan ke project.
          </p>
          {userEmail && (
            <form action={signOut} className="mt-6">
              <button
                type="submit"
                className="text-xs text-slate-500 underline hover:text-slate-800"
              >
                Keluar ({userEmail})
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const pilotBannerOn =
    process.env.NEXT_PUBLIC_SHOW_PILOT_BANNER === "1" ||
    process.env.NEXT_PUBLIC_SHOW_PILOT_BANNER === "true";
  const pilotBannerText =
    process.env.NEXT_PUBLIC_PILOT_BANNER_TEXT?.trim() ||
    "Versi pilot — fitur dan data dapat berubah. Laporkan masalah ke tim proyek.";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {pilotBannerOn ? (
        <div
          role="status"
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950"
        >
          {pilotBannerText}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
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
        {canonicalOrgId && userEmail && (
          <OrganizationModuleToggles
            organizationId={canonicalOrgId}
            moduleRegistry={moduleRegistry}
            organizationModules={organizationModules}
          />
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
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
              ?org=…&amp;project=…&amp;task=…&amp;view=…&amp;berkas=…
            </code>
          </p>
            </div>
            {userEmail && (
              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
                <NotificationsBell notifications={userNotifications} />
                <form action={signOut} className="shrink-0">
                  <p className="text-right text-xs text-slate-600">{userEmail}</p>
                  <button
                    type="submit"
                    className="mt-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Keluar
                  </button>
                </form>
              </div>
            )}
          </div>
          {joinError && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              {joinError}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleViews.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() =>
                  replaceQuery((q) => {
                    q.set("view", viewToParam(view));
                    if (view !== "Berkas" && view !== "Map") {
                      q.delete("berkas");
                    }
                  })
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
              <>
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
                  <div className="rounded-md bg-slate-50 p-3 text-sm sm:col-span-2 lg:col-span-4">
                    Modul organisasi (Fase 2):{" "}
                    <span className="font-semibold">{enabledModuleLabels}</span>
                  </div>
                </div>
                {selectedProjectId && (
                  <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tambah task cepat (core PM)
                    </p>
                    <form
                      className="mt-2 flex flex-wrap items-end gap-2"
                      action={(fd) => {
                        setTaskMsg(null);
                        fd.set("project_id", selectedProjectId);
                        if (defaultStatusId) fd.set("status_id", defaultStatusId);
                        startTaskTransition(async () => {
                          const r = await createProjectTaskAction(fd);
                          if (r.error) {
                            setTaskMsg(r.error);
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      <label className="text-xs text-slate-700">
                        Judul task *
                        <input
                          name="title"
                          required
                          placeholder="Contoh: Susun jadwal kickoff"
                          className="mt-0.5 block w-72 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-700">
                        Mulai
                        <input
                          name="starts_at"
                          type="date"
                          className="mt-0.5 block rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-700">
                        Tenggat
                        <input
                          name="due_at"
                          type="date"
                          className="mt-0.5 block rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={taskPending}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Tambah task
                      </button>
                    </form>
                    {taskMsg && (
                      <p className="mt-2 text-xs text-red-600" role="alert">
                        {taskMsg}
                      </p>
                    )}
                  </div>
                )}
                {selectedProjectId && selectedTask && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Tambah subtask ke task terpilih
                    </p>
                    <p className="mt-1 text-xs text-amber-900/90">
                      Parent:{" "}
                      <span className="font-medium">
                        {selectedTask.key_display ? `${selectedTask.key_display} — ` : ""}
                        {selectedTask.title}
                      </span>
                    </p>
                    <form
                      className="mt-2 flex flex-wrap items-end gap-2"
                      action={(fd) => {
                        setTaskMsg(null);
                        fd.set("project_id", selectedProjectId);
                        fd.set("parent_id", selectedTask.id);
                        const childStatusId = selectedTask.status_id ?? defaultStatusId;
                        if (childStatusId) fd.set("status_id", childStatusId);
                        startTaskTransition(async () => {
                          const r = await createProjectTaskAction(fd);
                          if (r.error) {
                            setTaskMsg(r.error);
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      <label className="text-xs text-slate-700">
                        Judul subtask *
                        <input
                          name="title"
                          required
                          placeholder="Contoh: Lengkapi dokumen pendukung"
                          className="mt-0.5 block w-72 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-700">
                        Mulai
                        <input
                          name="starts_at"
                          type="date"
                          className="mt-0.5 block rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-700">
                        Tenggat
                        <input
                          name="due_at"
                          type="date"
                          className="mt-0.5 block rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={taskPending}
                        className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                      >
                        Tambah subtask
                      </button>
                    </form>
                    {taskMsg && (
                      <p className="mt-2 text-xs text-red-600" role="alert">
                        {taskMsg}
                      </p>
                    )}
                  </div>
                )}
                {enabledModulesForOrg.has("plm") && selectedProjectId && (
                  <div className="mt-6">
                    <BerkasListPanel
                      rows={berkasForSelectedProject}
                      title="Ringkasan berkas PLM"
                      description={
                        <>
                          Project{" "}
                          <span className="font-medium text-slate-700">
                            {selectedProject?.name ?? "—"}
                          </span>
                          . Klik baris atau buka tab{" "}
                          <strong>Berkas</strong> untuk detail + alur status.
                        </>
                      }
                      onRowClick={openBerkasDetail}
                      berkasIdsWithBidang={
                        showBerkasBidangColumn
                          ? berkasIdsWithBidangInProject
                          : undefined
                      }
                      onOpenBerkasInMap={openMapForBerkas}
                    />
                  </div>
                )}
              </>
            )}
            {activeView === "Tabel" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="py-2 pr-4 font-medium">Key</th>
                      <th className="py-2 pr-4 font-medium">Judul</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Mulai</th>
                      <th className="py-2 pr-4 font-medium">Tenggat</th>
                      <th className="py-2 pr-4 font-medium">Sub-task?</th>
                      <th className="py-2 pr-4 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(({ issue, depth }) => {
                      const isChild = Boolean(issue.parent_id);
                      const st = issue.status_id ? statusById.get(issue.status_id) : null;
                      const isDone = st?.category === "done";
                      return (
                        <tr
                          key={issue.id}
                          className={`border-b border-slate-100 hover:bg-slate-50 ${
                            selectedTaskId === issue.id ? "bg-blue-50/60" : ""
                          }`}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectIssueInScope(issue.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectIssueInScope(issue.id);
                            }
                          }}
                        >
                          <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                            <span style={{ paddingLeft: depth * 12 }}>
                              {issue.key_display ?? "—"}
                            </span>
                          </td>
                          <td className="py-2 pr-4">{issue.title}</td>
                          <td className="py-2 pr-4">
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                                st?.category
                              )}`}
                            >
                              {st?.name ?? "Tanpa status"}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-slate-600">
                            {formatShortDate(issue.starts_at)}
                          </td>
                          <td className="py-2 pr-4 text-slate-600">
                            {formatShortDate(issue.due_at)}
                          </td>
                          <td className="py-2 pr-4 text-slate-600">
                            {isChild ? "Ya" : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {selectedProjectId ? (
                              <form
                                action={(fd) => {
                                  fd.set("issue_id", issue.id);
                                  fd.set("project_id", selectedProjectId);
                                  startTaskTransition(async () => {
                                    const r = await setTaskDoneAction(fd);
                                    if (r.error) {
                                      setTaskMsg(r.error);
                                      return;
                                    }
                                    router.refresh();
                                  });
                                }}
                              >
                                <button
                                  type="submit"
                                  disabled={taskPending}
                                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                                    isDone
                                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  } disabled:opacity-70`}
                                  onClick={(e) => {
                                    if (!isDone) return;
                                    e.preventDefault();
                                    const fd = new FormData();
                                    fd.set("issue_id", issue.id);
                                    fd.set("project_id", selectedProjectId);
                                    startTaskTransition(async () => {
                                      const r = await reopenTaskAction(fd);
                                      if (r.error) {
                                        setTaskMsg(r.error);
                                        return;
                                      }
                                      router.refresh();
                                    });
                                  }}
                                >
                                  {isDone ? "Buka lagi" : "Selesaikan"}
                                </button>
                              </form>
                            ) : null}
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
            {activeView === "Berkas" && (
              <div className="mt-4 space-y-3">
                {!selectedProjectId ? (
                  <p className="text-sm text-slate-500">
                    Pilih project untuk melihat daftar berkas.
                  </p>
                ) : (
                  <>
                    {selectedTaskId && (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        Scope <strong>task</strong> aktif — daftar berkas tetap
                        untuk seluruh <strong>project</strong> ini.
                      </p>
                    )}
                    {selectedBerkasId && selectedBerkas ? (
                      <BerkasDetailPanel
                        berkas={selectedBerkas}
                        projectName={selectedProject?.name ?? "—"}
                        hasBidangDiMap={berkasIdsWithBidangInProject.has(
                          selectedBerkas.id
                        )}
                        onLihatDiPeta={() => openMapForBerkas(selectedBerkas.id)}
                        legalisasiGuRows={legalisasiGu}
                        legalisasiGuFiles={legalisasiGuFiles}
                        legalisasiGuHistory={legalisasiGuHistory}
                        organizationId={
                          projects.find((p) => p.id === selectedBerkas.project_id)
                            ?.organization_id ?? null
                        }
                        permohonanInfoSpasial={permohonanInfoSpasial}
                        pengukuranLapangan={pengukuranLapangan}
                        pengukuranSurveyor={pengukuranSurveyor}
                        pengukuranAlat={pengukuranAlat}
                        pengukuranDokumen={pengukuranDokumen}
                        alatUkur={alatUkur}
                        onBack={() =>
                          replaceQuery((q) => {
                            q.delete("berkas");
                          })
                        }
                      />
                    ) : (
                      <BerkasListPanel
                        rows={berkasForSelectedProject}
                        showCatatan
                        title="Daftar berkas permohonan"
                        description={`Data schema plm · project: ${selectedProject?.name ?? "—"} — klik baris untuk detail.`}
                        onRowClick={openBerkasDetail}
                        berkasIdsWithBidang={
                          showBerkasBidangColumn
                            ? berkasIdsWithBidangInProject
                            : undefined
                        }
                        onOpenBerkasInMap={openMapForBerkas}
                      />
                    )}
                  </>
                )}
              </div>
            )}
            {activeView === "Laporan" && (
              <div className="mt-4">
                <p className="mb-3 text-sm text-slate-600">
                  Agregat dari view SQL schema{" "}
                  <span className="font-mono">plm</span> (RLS mengikuti akses
                  berkas). Lingkup: project yang Anda miliki di sidebar.
                </p>
                <LaporanPanel
                  projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                  berkasByStatus={plmBerkasStatusSummary}
                  legalisasiByTahap={plmLegalisasiTahapSummary}
                  pengukuranByStatus={plmPengukuranStatusSummary}
                />
              </div>
            )}
            {activeView === "Keuangan" && (
              <div className="mt-4">
                <FinancePanel
                  projectId={selectedProjectId}
                  organizationId={canonicalOrgId}
                  plmEnabled={enabledModulesForOrg.has("plm")}
                  berkasOptions={berkasForSelectedProject.map((b) => ({
                    id: b.id,
                    nomor_berkas: b.nomor_berkas,
                  }))}
                  invoices={financeInvoicesInProject}
                  invoiceItems={financeItemsInProject}
                  pembayaran={financePembayaranInProject}
                />
              </div>
            )}
            {activeView === "Map" && (
              <div className="mt-4 space-y-3">
                {!selectedProjectId ? (
                  <p className="text-sm text-slate-500">
                    Pilih project untuk melihat peta.
                  </p>
                ) : (
                  <>
                    {selectedTaskId && (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        Scope <strong>task</strong> aktif — peta menampilkan
                        footprint demo dan bidang hasil ukur untuk seluruh
                        project ini (bukan geometri per task).
                      </p>
                    )}
                    {mapLayersForSelectedProject.length > 0 &&
                    visibleMapLayers.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        Semua lapisan peta dimatikan. Aktifkan minimal satu
                        checkbox di bawah.
                      </p>
                    ) : mapLayersForSelectedProject.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        Belum ada geometri di peta untuk project ini. Footprint
                        demo: migration{" "}
                        <code className="rounded bg-slate-100 px-1">
                          0004_spatial_demo_footprints.sql
                        </code>
                        . Bidang hasil ukur (PLM):{" "}
                        <code className="rounded bg-slate-100 px-1">
                          0010
                        </code>{" "}
                        + view{" "}
                        <code className="rounded bg-slate-100 px-1">
                          0011
                        </code>
                        /{" "}
                        <code className="rounded bg-slate-100 px-1">
                          0012
                        </code>
                        , modul <strong>plm</strong> aktif di organisasi, schema{" "}
                        <code className="rounded bg-slate-100 px-1">spatial</code>{" "}
                        di Data API (
                        <code className="rounded bg-slate-100 px-1">
                          docs/supabase-expose-schemas.md
                        </code>
                        ).
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {mapHighlightBerkasId && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            <span>
                              Sorotan peta: berkas{" "}
                              <span className="font-mono font-semibold">
                                {berkasPermohonan.find(
                                  (b) => b.id === mapHighlightBerkasId
                                )?.nomor_berkas ?? "—"}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
                              onClick={() =>
                                replaceQuery((q) => {
                                  q.delete("berkas");
                                })
                              }
                            >
                              Hapus sorotan
                            </button>
                          </div>
                        )}
                        {mapOverlapWarnings.length > 0 && (
                          <div className="rounded-md border border-amber-300 bg-amber-50/95 px-3 py-2 text-sm text-amber-950">
                            <p className="font-medium">
                              Peringatan tumpang tindih (periksa di peta)
                            </p>
                            <ul className="mt-1 list-inside list-disc text-xs leading-relaxed">
                              {mapOverlapWarnings.map((w, i) => (
                                <li key={i}>
                                  {w.kind === "hasil_hasil" ? (
                                    <>
                                      &quot;{w.labelA}&quot; dan &quot;
                                      {w.labelB}&quot; berpotong bertumpang.
                                    </>
                                  ) : (
                                    <>
                                      Footprint demo &quot;{w.demoLabel}
                                      &quot; berpotong dengan hasil ukur &quot;
                                      {w.hasilLabel}&quot;.
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[11px] text-amber-900/85">
                              Pemeriksaan di browser; aturan server/trigger
                              dapat ditambahkan sesuai §10.3.
                            </p>
                          </div>
                        )}
                        {mapLayersForSelectedProject.length > 0 && (
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-700">
                            <span className="font-medium text-slate-600">
                              Lapisan:
                            </span>
                            <label className="inline-flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300"
                                checked={mapShowDemo}
                                disabled={
                                  footprintsForSelectedProject.length === 0
                                }
                                onChange={(e) =>
                                  setMapShowDemo(e.target.checked)
                                }
                              />
                              Footprint demo
                            </label>
                            <label className="inline-flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300"
                                checked={mapShowHasilUkur}
                                disabled={
                                  bidangHasilUkurForSelectedProject.length === 0
                                }
                                onChange={(e) =>
                                  setMapShowHasilUkur(e.target.checked)
                                }
                              />
                              Bidang hasil ukur
                            </label>
                          </div>
                        )}
                        <WorkspaceMap
                          footprints={visibleMapLayers}
                          highlightBerkasId={mapHighlightBerkasId}
                        />
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>
                            <span
                              className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                              style={{ background: "#3b82f6" }}
                            />{" "}
                            Footprint demo
                          </span>
                          <span>
                            <span
                              className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                              style={{ background: "#10b981" }}
                            />{" "}
                            Bidang hasil ukur (berkas PLM)
                          </span>
                          <span>
                            <span
                              className="mr-1 inline-block h-2 w-2 rounded-sm border border-amber-600 align-middle"
                              style={{ background: "#ea580c" }}
                            />{" "}
                            Sorotan berkas (URL{" "}
                            <code className="text-[10px]">berkas=</code>)
                          </span>
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
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
    </div>
  );
}

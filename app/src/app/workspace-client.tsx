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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  updateTaskProgressAction,
} from "./core-task-actions";
import type {
  FinanceInvoiceItemRow,
  FinanceInvoiceRow,
  FinancePembayaranRow,
} from "./finance-types";
import { BerkasListPanel } from "./berkas-list-panel";
import { OrganizationModuleToggles } from "./organization-module-toggles";
import { ThemeToggle } from "@/components/theme-toggle";
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
      <div className="flex h-[min(70vh,560px)] items-center justify-center rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
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
  progress_target: string | null;
  progress_actual: string | null;
  issue_weight: string;
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
type TaskConfirmState = { issueId: string; mode: "done" | "reopen"; title: string };

const STATUS_BADGE_CLASS: Record<string, string> = {
  done:
    "border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  in_progress:
    "border border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  todo:
    "border border-border bg-muted text-muted-foreground",
};

function statusBadgeClass(category: string | null | undefined): string {
  if (!category) return STATUS_BADGE_CLASS.todo;
  return STATUS_BADGE_CLASS[category] ?? STATUS_BADGE_CLASS.todo;
}

function computeIssueProgressPercent(
  issue: IssueRow,
  statusCategory: string | null | undefined
): number {
  const target = issue.progress_target == null ? NaN : Number(issue.progress_target);
  const actual = issue.progress_actual == null ? NaN : Number(issue.progress_actual);
  if (Number.isFinite(target) && target > 0 && Number.isFinite(actual) && actual >= 0) {
    return Math.max(0, Math.min(100, (actual / target) * 100));
  }
  if (statusCategory === "done") return 100;
  return 0;
}

function computeWeightedProgressByIssue(
  projectIssues: IssueRow[],
  statusById: Map<string, StatusRow>
): Map<string, number> {
  const childrenByParent = new Map<string, IssueRow[]>();
  for (const issue of projectIssues) {
    if (!issue.parent_id) continue;
    const arr = childrenByParent.get(issue.parent_id) ?? [];
    arr.push(issue);
    childrenByParent.set(issue.parent_id, arr);
  }

  const memo = new Map<string, number>();
  const walk = (issue: IssueRow): number => {
    const cached = memo.get(issue.id);
    if (cached != null) return cached;

    const children = childrenByParent.get(issue.id) ?? [];
    if (children.length === 0) {
      const st = issue.status_id ? statusById.get(issue.status_id) : null;
      const leafPct = computeIssueProgressPercent(issue, st?.category);
      memo.set(issue.id, leafPct);
      return leafPct;
    }

    let weightedSum = 0;
    let weightTotal = 0;
    for (const child of children) {
      const wRaw = Number(child.issue_weight);
      const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
      const pct = walk(child);
      weightedSum += pct * w;
      weightTotal += w;
    }
    const pct = weightTotal > 0 ? weightedSum / weightTotal : 0;
    memo.set(issue.id, pct);
    return pct;
  };

  for (const issue of projectIssues) {
    walk(issue);
  }
  return memo;
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
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [subtaskDialogOpen, setSubtaskDialogOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [taskConfirm, setTaskConfirm] = useState<TaskConfirmState | null>(null);
  const [collapsedIssueIds, setCollapsedIssueIds] = useState<Set<string>>(
    () => new Set()
  );

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
    return issues
      .filter((i) => i.project_id === selectedProjectId && !i.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((issue) => ({ issue, depth: 0 }));
  }, [selectedProjectId, selectedTaskId, issues]);
  const statusById = useMemo(
    () => new Map(statusesForProject.map((s) => [s.id, s])),
    [statusesForProject]
  );
  const issueProgressById = useMemo(() => {
    if (!selectedProjectId) return new Map<string, number>();
    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    return computeWeightedProgressByIssue(projectIssues, statusById);
  }, [issues, selectedProjectId, statusById]);
  const projectProgressPercent = useMemo(() => {
    if (!selectedProjectId) return 0;
    const topLevel = issues.filter(
      (i) => i.project_id === selectedProjectId && !i.parent_id
    );
    if (topLevel.length === 0) return 0;
    let weightedSum = 0;
    let weightTotal = 0;
    for (const issue of topLevel) {
      const pct = issueProgressById.get(issue.id) ?? 0;
      const wRaw = Number(issue.issue_weight);
      const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
      weightedSum += pct * w;
      weightTotal += w;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : 0;
  }, [issues, issueProgressById, selectedProjectId]);

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
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="max-w-lg rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">
          <p className="font-semibold">Gagal memuat data dari Supabase</p>
          <p className="mt-2 text-red-700">{fetchError}</p>
          {isSchemaError ? (
            <div className="mt-4 rounded-md border border-primary/25 bg-primary/10 p-3 text-foreground">
              <p className="font-medium">Schema API belum di-expose</p>
              <p className="mt-2 text-sm">
                Di Supabase Dashboard:{" "}
                <strong>Project Settings → Data API / API → Exposed schemas</strong>
                , tambahkan{" "}
                <code className="rounded bg-card px-1">core_pm</code>,{" "}
                <code className="rounded bg-card px-1">plm</code> (Fase 3),{" "}
                <code className="rounded bg-card px-1">spatial</code>,{" "}
                <code className="rounded bg-card px-1">finance</code> sesuai kebutuhan.
              </p>
              <p className="mt-2 text-sm">
                Panduan di repo:{" "}
                <code className="rounded bg-card px-1">docs/supabase-expose-schemas.md</code>
              </p>
            </div>
          ) : (
            <p className="mt-4 text-muted-foreground">
              Pastikan migration{" "}
              <code className="rounded bg-muted px-1">0002_core_pm_initial.sql</code>{" "}
              sudah di-push:{" "}
              <code className="rounded bg-muted px-1">npx supabase db push</code>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6">
        <div className="max-w-lg rounded-lg border border-border bg-card p-6 text-sm text-foreground">
          <p className="font-semibold">Tidak ada project yang dapat diakses</p>
          <p className="mt-2 text-muted-foreground">
            Dengan RLS aktif, Anda hanya melihat project tempat akun menjadi{" "}
            <code className="rounded bg-muted px-1">project_members</code>.
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
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Buat organisasi + project pertama
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nama organisasi *</Label>
                  <Input
                    name="organization_name"
                    required
                    placeholder="Contoh: KJSB Cirebon"
                    className="h-8 bg-background text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Slug organisasi (opsional)
                  </Label>
                  <Input
                    name="organization_slug"
                    placeholder="kjsb-cirebon"
                    className="h-8 bg-background text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nama project *</Label>
                  <Input
                    name="project_name"
                    required
                    placeholder="Contoh: PLM Cirebon 2027"
                    className="h-8 bg-background text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Kode project (opsional)</Label>
                  <Input
                    name="project_key"
                    placeholder="PLM27"
                    className="h-8 bg-background text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Deskripsi project (opsional)
                </Label>
                <Textarea
                  name="project_description"
                  rows={2}
                  placeholder="Catatan singkat project"
                  className="min-h-14 bg-background text-sm"
                />
              </div>
              <Button type="submit">
                Buat organisasi & project
              </Button>
            </form>
          )}
          {userEmail && (
            <form action={joinDemoProjectsAction} className="mt-3">
              <Button type="submit" variant="secondary">
                Atau gabung ke project demo (KJSB)
              </Button>
            </form>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Jika tetap kosong, tambahkan baris di{" "}
            <code className="rounded bg-muted px-1">core_pm.project_members</code>{" "}
            untuk <code className="rounded bg-muted px-1">auth.users.id</code> Anda,
            atau minta admin menambahkan ke project.
          </p>
          {userEmail && (
            <form action={signOut} className="mt-6">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-auto px-1 text-xs text-muted-foreground underline hover:text-foreground"
              >
                Keluar ({userEmail})
              </Button>
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {pilotBannerOn ? (
        <div
          role="status"
          className="shrink-0 border-b border-primary/25 bg-primary/10 px-4 py-2 text-center text-xs font-medium text-foreground"
        >
          {pilotBannerText}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
      <aside className="w-72 shrink-0 border-r border-sidebar-border/90 bg-sidebar/95 p-4 text-sidebar-foreground">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Spatial PM
        </h1>
        <div className="mt-6 space-y-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/20 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Organisasi
          </p>
          <div className="flex flex-col gap-1">
            {orgsWithProjects.map((o) => {
              const active = canonicalOrgId === o.id;
              return (
                <Button
                  key={o.id}
                  type="button"
                  variant="ghost"
                  size="sm"
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
                  className={`h-auto w-full justify-start px-3 py-2 text-left text-sm font-medium ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "bg-transparent text-sidebar-foreground hover:bg-sidebar-accent/70"
                  }`}
                >
                  {o.name}
                </Button>
              );
            })}
          </div>
        </div>
        <div className="mt-6 space-y-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/20 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Project
          </p>
          {projectsInOrg.map((p) => {
            const treeRows = flattenIssuesWithDepth(p.id, issues);
            const projectIssues = issues.filter((i) => i.project_id === p.id);
            const parentByIssueId = new Map(
              projectIssues.map((i) => [i.id, i.parent_id])
            );
            const issueIdsWithChildren = new Set(
              projectIssues.filter((i) => i.parent_id).map((i) => i.parent_id as string)
            );
            const visibleTreeRows = treeRows.filter(({ issue }) => {
              let parentId = issue.parent_id;
              while (parentId) {
                if (collapsedIssueIds.has(parentId)) return false;
                parentId = parentByIssueId.get(parentId) ?? null;
              }
              return true;
            });
            const isSelectedProject =
              selectedProjectId === p.id && !selectedTaskId;

            return (
              <div key={p.id} className="rounded-xl border border-sidebar-border/80 bg-sidebar-accent/35 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    replaceQuery((q) => {
                      q.set("org", p.organization_id);
                      q.set("project", p.id);
                      q.delete("task");
                    });
                  }}
                  className={`h-auto w-full justify-start gap-2 rounded-t-md px-3 py-2 text-left text-sm font-medium ${
                    isSelectedProject
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "bg-transparent text-sidebar-foreground hover:bg-sidebar-accent/70"
                  }`}
                >
                  <span className="text-xs text-muted-foreground">▾</span>
                  {p.name}
                </Button>
                <ul className="space-y-0.5 border-t border-sidebar-border/70 py-1 pl-2">
                  {visibleTreeRows.map(({ issue: t, depth }) => {
                    const isTask = selectedTaskId === t.id;
                    const hasChildren = issueIdsWithChildren.has(t.id);
                    const isCollapsed = collapsedIssueIds.has(t.id);
                    return (
                      <li key={t.id} style={{ paddingLeft: depth * 12 }}>
                        <div className="flex items-center gap-1">
                          {hasChildren ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto rounded px-1 text-xs text-muted-foreground hover:bg-sidebar-accent"
                              title={isCollapsed ? "Expand" : "Collapse"}
                              onClick={() => {
                                setCollapsedIssueIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(t.id)) next.delete(t.id);
                                  else next.add(t.id);
                                  return next;
                                });
                              }}
                            >
                              {isCollapsed ? "▸" : "▾"}
                            </Button>
                          ) : (
                            <span className="inline-block w-4 text-center text-xs text-muted-foreground/50">
                              ·
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              replaceQuery((q) => {
                                q.set("org", p.organization_id);
                                q.set("project", p.id);
                                q.set("task", t.id);
                              });
                            }}
                            className={`h-auto w-full justify-start rounded-md px-2 py-1.5 text-left text-sm ${
                              isTask
                                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/70"
                            }`}
                          >
                            {t.title}
                          </Button>
                        </div>
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

      <main className="flex min-w-0 flex-1 flex-col bg-muted/40">
        <header className="border-b border-border bg-card/90 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Scope aktif
          </p>
          <h2 className="text-lg font-semibold">
            {selectedTask
              ? `Task: ${selectedTask.title}`
              : selectedProject
                ? `Project: ${selectedProject.name}`
                : "—"}
          </h2>
          {selectedOrganization && (
            <p className="mt-1 text-xs text-muted-foreground">
              Organisasi:{" "}
              <span className="font-medium">{selectedOrganization.name}</span>
            </p>
          )}
          <p className="mt-1 truncate text-xs text-muted-foreground">
            URL:{" "}
            <code className="rounded bg-muted px-1">
              ?org=…&amp;project=…&amp;task=…&amp;view=…&amp;berkas=…
            </code>
          </p>
            </div>
            {userEmail && (
              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
                <NotificationsBell notifications={userNotifications} />
                <ThemeToggle />
                <form action={signOut} className="shrink-0">
                  <p className="text-right text-xs text-muted-foreground">{userEmail}</p>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="mt-1 h-auto px-2 py-1 text-xs"
                  >
                    Keluar
                  </Button>
                </form>
              </div>
            )}
          </div>
          {joinError && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              {joinError}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {visibleViews.map((view) => (
              <Button
                key={view}
                type="button"
                variant={activeView === view ? "default" : "secondary"}
                size="sm"
                onClick={() =>
                  replaceQuery((q) => {
                    q.set("view", viewToParam(view));
                    if (view !== "Berkas" && view !== "Map") {
                      q.delete("berkas");
                    }
                  })
                }
                className="h-8 rounded-full px-3 text-sm font-medium"
              >
                {view}
              </Button>
            ))}
          </div>
        </header>

        <section className="flex-1 overflow-auto p-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h3 className="text-base font-semibold">
              {activeView} —{" "}
              {selectedTask ? "fokus task" : "cakupan project"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Data dari <code className="rounded bg-muted px-1">core_pm</code>
              . Query:{" "}
              <code className="rounded bg-muted px-1">
                org={canonicalOrgId?.slice(0, 8)}…
              </code>{" "}
              <code className="rounded bg-muted px-1">
                project={selectedProjectId?.slice(0, 8)}…
              </code>
              {selectedTaskId && (
                <>
                  {" "}
                  <code className="rounded bg-muted px-1">
                    task={selectedTaskId.slice(0, 8)}…
                  </code>
                </>
              )}{" "}
              <code className="rounded bg-muted px-1">
                view={viewToParam(activeView)}
              </code>
            </p>
            {activeView === "Dashboard" && (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="shadow-none">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Task level atas:{" "}
                      <span className="font-semibold text-foreground">{topLevelCount}</span>
                    </CardContent>
                  </Card>
                  <Card className="shadow-none">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Total baris terurut (dengan sub-task):{" "}
                      <span className="font-semibold text-foreground">{issuesInScope.length}</span>
                    </CardContent>
                  </Card>
                  <Card className="shadow-none">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Nama project:{" "}
                      <span className="font-semibold text-foreground">
                        {selectedProject?.name ?? "—"}
                      </span>
                    </CardContent>
                  </Card>
                  <Card className="shadow-none">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      View aktif:{" "}
                      <span className="font-semibold text-foreground">{activeView}</span>
                    </CardContent>
                  </Card>
                  <Card className="shadow-none">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Progress project:{" "}
                      <span className="font-semibold text-foreground">
                        {projectProgressPercent.toFixed(1)}%
                      </span>
                    </CardContent>
                  </Card>
                  <Card className="shadow-none sm:col-span-2 lg:col-span-4">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Modul organisasi (Fase 2):{" "}
                      <span className="font-semibold text-foreground">{enabledModuleLabels}</span>
                    </CardContent>
                  </Card>
                </div>
                {selectedProjectId && (
                  <div className="mt-5 rounded-xl border border-border bg-muted/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tambah task cepat (core PM)
                      </p>
                      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                        <DialogTrigger render={<Button size="sm" />}>
                          + Task
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Tambah task</DialogTitle>
                            <DialogDescription>
                              Buat task level project dengan data jadwal dan progres opsional.
                            </DialogDescription>
                          </DialogHeader>
                          <form
                            className="grid gap-3"
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
                                setTaskDialogOpen(false);
                                router.refresh();
                              });
                            }}
                          >
                            <div className="space-y-1">
                              <Label>Judul task *</Label>
                              <Input
                                name="title"
                                required
                                placeholder="Contoh: Susun jadwal kickoff"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label>Mulai</Label>
                                <Input name="starts_at" type="date" />
                              </div>
                              <div className="space-y-1">
                                <Label>Tenggat</Label>
                                <Input name="due_at" type="date" />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label>Target</Label>
                                <Input name="progress_target" type="number" min="0" step="0.01" />
                              </div>
                              <div className="space-y-1">
                                <Label>Realisasi</Label>
                                <Input name="progress_actual" type="number" min="0" step="0.01" />
                              </div>
                              <div className="space-y-1">
                                <Label>Bobot</Label>
                                <Input
                                  name="issue_weight"
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  defaultValue="1"
                                />
                              </div>
                            </div>
                            <Button type="submit" disabled={taskPending}>
                              Simpan task
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                    {taskMsg && (
                      <p className="mt-2 text-xs text-red-600" role="alert">
                        {taskMsg}
                      </p>
                    )}
                  </div>
                )}
                {selectedProjectId && selectedTask && (
                  <div className="mt-3 rounded-md border border-primary/25 bg-primary/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        Tambah subtask ke task terpilih
                      </p>
                      <Dialog
                        open={subtaskDialogOpen}
                        onOpenChange={setSubtaskDialogOpen}
                      >
                        <DialogTrigger
                          render={
                            <Button size="sm" variant="secondary" />
                          }
                        >
                          + Subtask
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Tambah subtask</DialogTitle>
                            <DialogDescription>
                              Subtask akan ditambahkan di bawah task terpilih.
                            </DialogDescription>
                          </DialogHeader>
                          <form
                            className="grid gap-3"
                            action={(fd) => {
                              setTaskMsg(null);
                              fd.set("project_id", selectedProjectId);
                              fd.set("parent_id", selectedTask.id);
                              const childStatusId =
                                selectedTask.status_id ?? defaultStatusId;
                              if (childStatusId) fd.set("status_id", childStatusId);
                              startTaskTransition(async () => {
                                const r = await createProjectTaskAction(fd);
                                if (r.error) {
                                  setTaskMsg(r.error);
                                  return;
                                }
                                setSubtaskDialogOpen(false);
                                router.refresh();
                              });
                            }}
                          >
                            <div className="space-y-1">
                              <Label>Judul subtask *</Label>
                              <Input
                                name="title"
                                required
                                placeholder="Contoh: Lengkapi dokumen pendukung"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label>Mulai</Label>
                                <Input name="starts_at" type="date" />
                              </div>
                              <div className="space-y-1">
                                <Label>Tenggat</Label>
                                <Input name="due_at" type="date" />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label>Target</Label>
                                <Input
                                  name="progress_target"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Realisasi</Label>
                                <Input
                                  name="progress_actual"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Bobot</Label>
                                <Input
                                  name="issue_weight"
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  defaultValue="1"
                                />
                              </div>
                            </div>
                            <Button type="submit" disabled={taskPending}>
                              Simpan subtask
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Parent:{" "}
                      <span className="font-medium">
                        {selectedTask.title}
                      </span>
                    </p>
                    {taskMsg && (
                      <p className="mt-2 text-xs text-red-600" role="alert">
                        {taskMsg}
                      </p>
                    )}
                  </div>
                )}
                {selectedProjectId && selectedTask && (
                  <div className="mt-3 rounded-md border border-sky-200 bg-sky-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">
                        Progress angka (opsional)
                      </p>
                      <Dialog
                        open={progressDialogOpen}
                        onOpenChange={setProgressDialogOpen}
                      >
                        <DialogTrigger
                          render={
                            <Button size="sm" variant="outline" />
                          }
                        >
                          Update progress
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Update progress angka</DialogTitle>
                            <DialogDescription>
                              Ubah target, realisasi, dan bobot task terpilih.
                            </DialogDescription>
                          </DialogHeader>
                          <form
                            className="grid gap-3"
                            action={(fd) => {
                              setTaskMsg(null);
                              fd.set("project_id", selectedProjectId);
                              fd.set("issue_id", selectedTask.id);
                              startTaskTransition(async () => {
                                const r = await updateTaskProgressAction(fd);
                                if (r.error) {
                                  setTaskMsg(r.error);
                                  return;
                                }
                                setProgressDialogOpen(false);
                                router.refresh();
                              });
                            }}
                          >
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label>Target</Label>
                                <Input
                                  name="progress_target"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={selectedTask.progress_target ?? ""}
                                  placeholder="mis. 120"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Realisasi</Label>
                                <Input
                                  name="progress_actual"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={selectedTask.progress_actual ?? ""}
                                  placeholder="mis. 48"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Bobot</Label>
                                <Input
                                  name="issue_weight"
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  defaultValue={selectedTask.issue_weight ?? "1"}
                                />
                              </div>
                            </div>
                            <Button type="submit" disabled={taskPending}>
                              Simpan angka
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <p className="mt-1 text-xs text-sky-900/90">
                      Task:{" "}
                      <span className="font-medium">
                        {selectedTask.title}
                      </span>
                    </p>
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
                          <span className="font-medium text-foreground">
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
              <div className="mt-5 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 pr-4 font-medium">Judul</th>
                      <th className="px-4 py-3 pr-4 font-medium">Status</th>
                      <th className="px-4 py-3 pr-4 font-medium">Bobot</th>
                      <th className="px-4 py-3 pr-4 font-medium">Realisasi/Target</th>
                      <th className="px-4 py-3 pr-4 font-medium">Progress %</th>
                      <th className="px-4 py-3 pr-4 font-medium">Mulai</th>
                      <th className="px-4 py-3 pr-4 font-medium">Tenggat</th>
                      <th className="px-4 py-3 pr-4 font-medium">Sub-task?</th>
                      <th className="px-4 py-3 pr-4 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!selectedTaskId && selectedProject && (
                      <tr className="border-b border-border bg-primary/10">
                        <td className="px-4 py-3 pr-4 font-semibold text-primary">
                          {selectedProject.name}
                        </td>
                        <td className="px-4 py-3 pr-4 text-primary">Ringkasan</td>
                        <td className="px-4 py-3 pr-4 text-primary">—</td>
                        <td className="px-4 py-3 pr-4 text-primary">— / —</td>
                        <td className="px-4 py-3 pr-4 font-semibold text-primary">
                          {projectProgressPercent.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 pr-4 text-primary">—</td>
                        <td className="px-4 py-3 pr-4 text-primary">—</td>
                        <td className="px-4 py-3 pr-4 text-primary">—</td>
                        <td className="px-4 py-3 pr-4 text-primary">—</td>
                      </tr>
                    )}
                    {tableRows.map(({ issue, depth }) => {
                      const isChild = Boolean(issue.parent_id);
                      const st = issue.status_id ? statusById.get(issue.status_id) : null;
                      const isDone = st?.category === "done";
                      const progressPct = issueProgressById.get(issue.id) ?? 0;
                      const isSelectedRootRow =
                        selectedTaskId != null && issue.id === selectedTaskId;
                      return (
                        <tr
                          key={issue.id}
                          className={`border-b border-border/70 hover:bg-muted/60 ${
                            selectedTaskId === issue.id ? "bg-primary/10" : ""
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
                          <td
                            className={`py-2 pr-4 ${
                              isSelectedRootRow ? "font-semibold text-primary" : ""
                            }`}
                          >
                            <span className="pl-4" style={{ paddingLeft: depth * 12 }}>
                              {issue.title}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <Badge className={statusBadgeClass(st?.category)}>
                              {st?.name ?? "Tanpa status"}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {issue.issue_weight ?? "1"}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {issue.progress_actual ?? "—"} / {issue.progress_target ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {progressPct.toFixed(1)}%
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {formatShortDate(issue.starts_at)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {formatShortDate(issue.due_at)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {isChild ? "Ya" : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {selectedProjectId ? (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isDone ? "outline" : "secondary"}
                                  disabled={taskPending}
                                  className="h-auto px-2 py-0.5 text-xs font-medium disabled:opacity-70"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setTaskConfirm({
                                      issueId: issue.id,
                                      mode: isDone ? "reopen" : "done",
                                      title: issue.title,
                                    });
                                  }}
                                >
                                  {isDone ? "Buka lagi" : "Selesaikan"}
                                </Button>
                                <Dialog
                                  open={taskConfirm?.issueId === issue.id}
                                  onOpenChange={(open) => {
                                    if (!open) setTaskConfirm(null);
                                  }}
                                >
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>
                                        {taskConfirm?.mode === "reopen"
                                          ? "Konfirmasi buka lagi task"
                                          : "Konfirmasi selesaikan task"}
                                      </DialogTitle>
                                      <DialogDescription>
                                        {taskConfirm?.mode === "reopen"
                                          ? `Task "${taskConfirm?.title ?? issue.title}" akan dibuka lagi.`
                                          : `Task "${taskConfirm?.title ?? issue.title}" dan seluruh child-nya akan ditandai selesai.`}
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setTaskConfirm(null)}
                                      >
                                        Batal
                                      </Button>
                                      <Button
                                        type="button"
                                        disabled={taskPending}
                                        onClick={() => {
                                          const current = taskConfirm;
                                          if (!current || !selectedProjectId) return;
                                          setTaskMsg(null);
                                          const fd = new FormData();
                                          fd.set("issue_id", current.issueId);
                                          fd.set("project_id", selectedProjectId);
                                          startTaskTransition(async () => {
                                            const r =
                                              current.mode === "reopen"
                                                ? await reopenTaskAction(fd)
                                                : await setTaskDoneAction(fd);
                                            if (r.error) {
                                              setTaskMsg(r.error);
                                              return;
                                            }
                                            setTaskConfirm(null);
                                            router.refresh();
                                          });
                                        }}
                                      >
                                        {taskConfirm?.mode === "reopen"
                                          ? "Ya, buka lagi"
                                          : "Ya, selesaikan"}
                                      </Button>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {tableRows.length === 0 && (
                  <p className="m-4 text-sm text-muted-foreground">
                    Tidak ada baris untuk scope ini.
                  </p>
                )}
              </div>
            )}
            {activeView === "Berkas" && (
              <div className="mt-4 space-y-3">
                {!selectedProjectId ? (
                  <p className="text-sm text-muted-foreground">
                    Pilih project untuk melihat daftar berkas.
                  </p>
                ) : (
                  <>
                    {selectedTaskId && (
                      <p className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
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
                <p className="mb-3 text-sm text-muted-foreground">
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
                  <p className="text-sm text-muted-foreground">
                    Pilih project untuk melihat peta.
                  </p>
                ) : (
                  <>
                    {selectedTaskId && (
                      <p className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
                        Scope <strong>task</strong> aktif — peta menampilkan
                        footprint demo dan bidang hasil ukur untuk seluruh
                        project ini (bukan geometri per task).
                      </p>
                    )}
                    {mapLayersForSelectedProject.length > 0 &&
                    visibleMapLayers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Semua lapisan peta dimatikan. Aktifkan minimal satu
                        checkbox di bawah.
                      </p>
                    ) : mapLayersForSelectedProject.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Belum ada geometri di peta untuk project ini. Footprint
                        demo: migration{" "}
                        <code className="rounded bg-muted px-1">
                          0004_spatial_demo_footprints.sql
                        </code>
                        . Bidang hasil ukur (PLM):{" "}
                        <code className="rounded bg-muted px-1">
                          0010
                        </code>{" "}
                        + view{" "}
                        <code className="rounded bg-muted px-1">
                          0011
                        </code>
                        /{" "}
                        <code className="rounded bg-muted px-1">
                          0012
                        </code>
                        , modul <strong>plm</strong> aktif di organisasi, schema{" "}
                        <code className="rounded bg-muted px-1">spatial</code>{" "}
                        di Data API (
                        <code className="rounded bg-muted px-1">
                          docs/supabase-expose-schemas.md
                        </code>
                        ).
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {mapHighlightBerkasId && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
                            <span>
                              Sorotan peta: berkas{" "}
                              <span className="font-mono font-semibold">
                                {berkasPermohonan.find(
                                  (b) => b.id === mapHighlightBerkasId
                                )?.nomor_berkas ?? "—"}
                              </span>
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto px-2 py-1 text-xs"
                              onClick={() =>
                                replaceQuery((q) => {
                                  q.delete("berkas");
                                })
                              }
                            >
                              Hapus sorotan
                            </Button>
                          </div>
                        )}
                        {mapOverlapWarnings.length > 0 && (
                          <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
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
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              Pemeriksaan di browser; aturan server/trigger
                              dapat ditambahkan sesuai §10.3.
                            </p>
                          </div>
                        )}
                        {mapLayersForSelectedProject.length > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-muted-foreground">
                              Lapisan peta:
                            </span>
                            <Popover>
                              <PopoverTrigger
                                render={<Button type="button" size="sm" variant="outline" />}
                              >
                                Atur lapisan
                              </PopoverTrigger>
                              <PopoverContent className="w-64 space-y-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Tampilkan lapisan
                                </p>
                                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                  <input
                                    type="checkbox"
                                    className="rounded border-border"
                                    checked={mapShowDemo}
                                    disabled={footprintsForSelectedProject.length === 0}
                                    onChange={(e) => setMapShowDemo(e.target.checked)}
                                  />
                                  Footprint demo
                                </label>
                                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                  <input
                                    type="checkbox"
                                    className="rounded border-border"
                                    checked={mapShowHasilUkur}
                                    disabled={
                                      bidangHasilUkurForSelectedProject.length === 0
                                    }
                                    onChange={(e) => setMapShowHasilUkur(e.target.checked)}
                                  />
                                  Bidang hasil ukur
                                </label>
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                        <WorkspaceMap
                          footprints={visibleMapLayers}
                          highlightBerkasId={mapHighlightBerkasId}
                        />
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
                              className="mr-1 inline-block h-2 w-2 rounded-sm border border-primary/60 align-middle"
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
                  <p className="mb-3 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
                    Scope <strong>task</strong> aktif — board tetap menampilkan
                    semua task level atas project ini. Klik nama project di kiri
                    untuk fokus project saja.
                  </p>
                )}
                {statusesForProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
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

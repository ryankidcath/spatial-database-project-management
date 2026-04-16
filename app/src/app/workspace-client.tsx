"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, PanelLeft, Trash2 } from "lucide-react";
import {
  addProjectMemberByEmailAction,
  createProjectInOrganizationAction,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  deleteProjectAction,
  deleteTaskAction,
  reopenTaskAction,
  setTaskDoneAction,
  updateTaskProgressAction,
} from "./core-task-actions";
import {
  deleteAllIssueGeometryFeaturesForIssueAction,
  deleteIssueGeometryFeatureByIdAction,
  updateIssueGeometryFeaturePropertiesAction,
  upsertIssueGeometryFeatureAction,
  upsertIssueGeometryFeatureBatchAction,
} from "./issue-geometry-feature-actions";
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
import { overlapDisplayLabelForIssueGeometryRow } from "./issue-geometry-overlap-label";
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

/** Baris view `spatial.v_issue_geometry_feature_map` (fitur geometri 1:N per task). */
export type IssueGeometryFeatureMapRow = {
  id: string;
  project_id: string;
  issue_id: string;
  feature_key: string;
  label: string;
  properties: unknown;
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

export type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string | null;
};

type Props = {
  organizations: OrganizationRow[];
  projects: ProjectRow[];
  statuses: StatusRow[];
  issues: IssueRow[];
  projectMembers: ProjectMemberRow[];
  footprints: DemoFootprintRow[];
  bidangHasilUkurMap: BidangHasilUkurMapRow[];
  issueGeometryFeatureMap: IssueGeometryFeatureMapRow[];
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
type TaskDeleteConfirmState = { issueId: string; title: string };
type ProjectDeleteConfirmState = { projectId: string; name: string };
type MapGeometryInputMode = "single" | "batch" | "manage";
type BatchGeojsonPreview = {
  valid: boolean;
  reason?: string;
  featureCount: number;
  propertyKeys: string[];
  geometryTypeCounts: Record<string, number>;
  withFeatureKey: number;
  withIdFallback: number;
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  done:
    "border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  in_progress:
    "border border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  todo:
    "border border-border bg-muted text-muted-foreground",
};
const SPATIAL_TABLE_PAGE_SIZE = 100;

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

function analyzeBatchGeojson(raw: string): BatchGeojsonPreview | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {
        valid: false,
        reason: "JSON root bukan object.",
        featureCount: 0,
        propertyKeys: [],
        geometryTypeCounts: {},
        withFeatureKey: 0,
        withIdFallback: 0,
      };
    }
    const root = parsed as { type?: string; features?: unknown[] };
    if (root.type !== "FeatureCollection" || !Array.isArray(root.features)) {
      return {
        valid: false,
        reason: "Root harus FeatureCollection dan memiliki array features.",
        featureCount: 0,
        propertyKeys: [],
        geometryTypeCounts: {},
        withFeatureKey: 0,
        withIdFallback: 0,
      };
    }

    const keySet = new Set<string>();
    const geometryTypeCounts: Record<string, number> = {};
    let withFeatureKey = 0;
    let withIdFallback = 0;
    let validFeatureCount = 0;

    for (const feat of root.features) {
      if (!feat || typeof feat !== "object") continue;
      const f = feat as {
        type?: string;
        properties?: unknown;
        geometry?: { type?: string } | null;
      };
      if (f.type !== "Feature") continue;
      validFeatureCount++;

      const geomType = f.geometry?.type ?? "(tanpa geometry)";
      geometryTypeCounts[geomType] = (geometryTypeCounts[geomType] ?? 0) + 1;

      if (f.properties && typeof f.properties === "object" && !Array.isArray(f.properties)) {
        const props = f.properties as Record<string, unknown>;
        for (const k of Object.keys(props)) keySet.add(k);
        const fk = props.feature_key;
        const id = props.id ?? props.ID ?? props.Id;
        if (fk != null && String(fk).trim() !== "") withFeatureKey++;
        else if (id != null && String(id).trim() !== "") withIdFallback++;
      }
    }

    return {
      valid: true,
      featureCount: validFeatureCount,
      propertyKeys: [...keySet].sort((a, b) => a.localeCompare(b)),
      geometryTypeCounts,
      withFeatureKey,
      withIdFallback,
    };
  } catch {
    return {
      valid: false,
      reason: "JSON tidak valid.",
      featureCount: 0,
      propertyKeys: [],
      geometryTypeCounts: {},
      withFeatureKey: 0,
      withIdFallback: 0,
    };
  }
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

function issueGeometryPropertiesForDisplay(
  row: IssueGeometryFeatureMapRow
): Record<string, unknown> {
  const props =
    typeof row.properties === "object" && row.properties !== null
      ? ({ ...row.properties } as Record<string, unknown>)
      : {};
  return {
    ...props,
    feature_key: row.feature_key,
  };
}

function compactValuePreview(value: unknown, maxChars = 120): string {
  if (value == null) return "—";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    const text = JSON.stringify(value) ?? "";
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  } catch {
    return String(value);
  }
}

const NON_EDITABLE_SPATIAL_ATTR_KEYS = new Set(["_row_id", "feature_key"]);

type SpatialAttributeEditEntry = { key: string; value: string };

function cellValueForSpatialEditInput(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function parseSpatialAttributeValue(text: string): unknown {
  const t = text.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (
    !/^["[{]/.test(t) &&
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)
  ) {
    return Number(t);
  }
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return text;
  }
}

function buildSpatialAttributeEditEntries(
  row: IssueGeometryFeatureMapRow
): SpatialAttributeEditEntry[] {
  const merged = issueGeometryPropertiesForDisplay(row);
  const entries: SpatialAttributeEditEntry[] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (NON_EDITABLE_SPATIAL_ATTR_KEYS.has(k)) continue;
    entries.push({ key: k, value: cellValueForSpatialEditInput(v) });
  }
  if (entries.length === 0) entries.push({ key: "", value: "" });
  return entries;
}

export function WorkspaceClient({
  organizations,
  projects,
  statuses,
  issues,
  projectMembers = [],
  footprints,
  bidangHasilUkurMap,
  issueGeometryFeatureMap = [],
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
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [subtaskDialogOpen, setSubtaskDialogOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [mapGeomDialogOpen, setMapGeomDialogOpen] = useState(false);
  const [mapGeomInputMode, setMapGeomInputMode] =
    useState<MapGeometryInputMode>("single");
  const [mapGeomMsg, setMapGeomMsg] = useState<string | null>(null);
  const [mapGeomBatchMsg, setMapGeomBatchMsg] = useState<string | null>(null);
  const [mapGeomBatchText, setMapGeomBatchText] = useState("");
  const [mapGeomDeleteMsg, setMapGeomDeleteMsg] = useState<string | null>(null);
  const [mapGeomFormNonce, setMapGeomFormNonce] = useState(0);
  const [mapGeomPending, startMapGeomTransition] = useTransition();
  const openMapGeomDialog = useCallback(() => {
    setMapGeomInputMode("single");
    setMapGeomMsg(null);
    setMapGeomBatchMsg(null);
    setMapGeomDeleteMsg(null);
    setMapGeomBatchText("");
    setMapGeomFormNonce((n) => n + 1);
    setMapGeomDialogOpen(true);
  }, []);
  const [memberPending, startMemberTransition] = useTransition();
  const [taskConfirm, setTaskConfirm] = useState<TaskConfirmState | null>(null);
  const [taskDeleteConfirm, setTaskDeleteConfirm] =
    useState<TaskDeleteConfirmState | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] =
    useState<ProjectDeleteConfirmState | null>(null);
  const [projectMsg, setProjectMsg] = useState<string | null>(null);
  const [memberMsg, setMemberMsg] = useState<string | null>(null);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedIssueIds, setCollapsedIssueIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

  const [mapShowIssueGeometry, setMapShowIssueGeometry] = useState(true);
  const [spatialSearchText, setSpatialSearchText] = useState("");
  const [spatialTablePage, setSpatialTablePage] = useState(1);
  const [spatialAttributeEditRow, setSpatialAttributeEditRow] =
    useState<IssueGeometryFeatureMapRow | null>(null);
  const [spatialAttributeEditEntries, setSpatialAttributeEditEntries] =
    useState<SpatialAttributeEditEntry[]>([]);
  const [spatialAttributeEditMsg, setSpatialAttributeEditMsg] = useState<
    string | null
  >(null);
  const [spatialAttributeEditPending, startSpatialAttributeEditTransition] =
    useTransition();

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

  const selectedScopePath = useMemo(() => {
    if (!selectedProject) return "—";
    if (!selectedTask) return selectedProject.name;

    const byId = new Map(
      issues
        .filter((i) => i.project_id === selectedProject.id)
        .map((i) => [i.id, i] as const)
    );

    const chain: string[] = [];
    const visited = new Set<string>();
    let cursor: IssueRow | null = selectedTask;
    while (cursor && !visited.has(cursor.id)) {
      chain.push(cursor.title);
      visited.add(cursor.id);
      cursor = cursor.parent_id ? (byId.get(cursor.parent_id) ?? null) : null;
    }

    chain.reverse();
    return [selectedProject.name, ...chain].join(" > ");
  }, [issues, selectedProject, selectedTask]);

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

  const issueGeometryForSelectedProject = useMemo(() => {
    if (!selectedProjectId) return [];
    return issueGeometryFeatureMap.filter(
      (g) => g.project_id === selectedProjectId
    );
  }, [issueGeometryFeatureMap, selectedProjectId]);

  const issueIdsInSelectedTaskSubtree = useMemo(() => {
    if (!selectedProjectId || !selectedTaskId) return null;
    const childByParent = new Map<string, string[]>();
    for (const issue of issues) {
      if (issue.project_id !== selectedProjectId || !issue.parent_id) continue;
      const arr = childByParent.get(issue.parent_id) ?? [];
      arr.push(issue.id);
      childByParent.set(issue.parent_id, arr);
    }
    const out = new Set<string>();
    const stack = [selectedTaskId];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (out.has(id)) continue;
      out.add(id);
      const children = childByParent.get(id) ?? [];
      for (const c of children) stack.push(c);
    }
    return out;
  }, [issues, selectedProjectId, selectedTaskId]);

  const issueGeometriesForManageTask = useMemo(() => {
    if (!selectedProjectId || !selectedTaskId) return [];
    return issueGeometryFeatureMap
      .filter(
        (g) =>
          g.project_id === selectedProjectId && g.issue_id === selectedTaskId
      )
      .sort((a, b) => a.feature_key.localeCompare(b.feature_key));
  }, [issueGeometryFeatureMap, selectedProjectId, selectedTaskId]);

  const issueGeometryVisibleForMap = useMemo(() => {
    if (!issueIdsInSelectedTaskSubtree) return issueGeometryForSelectedProject;
    return issueGeometryForSelectedProject.filter((g) =>
      issueIdsInSelectedTaskSubtree.has(g.issue_id)
    );
  }, [issueGeometryForSelectedProject, issueIdsInSelectedTaskSubtree]);

  const mapGeomBatchPreview = useMemo(
    () => analyzeBatchGeojson(mapGeomBatchText),
    [mapGeomBatchText]
  );

  const issueTitleById = useMemo(() => {
    const m = new Map<string, string>();
    if (!selectedProjectId) return m;
    for (const issue of issues) {
      if (issue.project_id !== selectedProjectId) continue;
      m.set(issue.id, issue.title);
    }
    return m;
  }, [issues, selectedProjectId]);

  const issueGeometryRowsForTableView = useMemo(
    () => {
      return issueGeometryForSelectedProject
        .filter((g) =>
          issueIdsInSelectedTaskSubtree
            ? issueIdsInSelectedTaskSubtree.has(g.issue_id)
            : true
        )
        .sort((a, b) => {
          const at = issueTitleById.get(a.issue_id) ?? "";
          const bt = issueTitleById.get(b.issue_id) ?? "";
          return (
            at.localeCompare(bt) ||
            a.feature_key.localeCompare(b.feature_key) ||
            a.id.localeCompare(b.id)
          );
        });
    },
    [
      issueGeometryForSelectedProject,
      issueIdsInSelectedTaskSubtree,
      issueTitleById,
    ]
  );

  const spatialSearchQuery = useMemo(
    () => spatialSearchText.trim().toLowerCase(),
    [spatialSearchText]
  );

  const issueGeometryRowsForTableViewFiltered = useMemo(() => {
    if (!spatialSearchQuery) return issueGeometryRowsForTableView;
    return issueGeometryRowsForTableView.filter((row) => {
      const unitTitle = (issueTitleById.get(row.issue_id) ?? row.issue_id).toLowerCase();
      if (unitTitle.includes(spatialSearchQuery)) return true;
      const props = issueGeometryPropertiesForDisplay(row);
      for (const [key, value] of Object.entries(props)) {
        if (key.toLowerCase().includes(spatialSearchQuery)) return true;
        if (compactValuePreview(value, 500).toLowerCase().includes(spatialSearchQuery)) {
          return true;
        }
      }
      return false;
    });
  }, [issueGeometryRowsForTableView, issueTitleById, spatialSearchQuery]);

  const spatialTableTotalRows = issueGeometryRowsForTableViewFiltered.length;
  const spatialTableTotalPages = Math.max(
    1,
    Math.ceil(spatialTableTotalRows / SPATIAL_TABLE_PAGE_SIZE)
  );

  useEffect(() => {
    setSpatialTablePage(1);
  }, [selectedProjectId, selectedTaskId, spatialSearchQuery]);

  useEffect(() => {
    if (spatialTablePage > spatialTableTotalPages) {
      setSpatialTablePage(spatialTableTotalPages);
    }
  }, [spatialTablePage, spatialTableTotalPages]);

  const issueGeometryRowsForTableViewPaged = useMemo(() => {
    const start = (spatialTablePage - 1) * SPATIAL_TABLE_PAGE_SIZE;
    return issueGeometryRowsForTableViewFiltered.slice(
      start,
      start + SPATIAL_TABLE_PAGE_SIZE
    );
  }, [issueGeometryRowsForTableViewFiltered, spatialTablePage]);

  const issueGeometryAttributeKeysForTableView = useMemo(() => {
    const set = new Set<string>();
    for (const row of issueGeometryRowsForTableViewFiltered) {
      const props = issueGeometryPropertiesForDisplay(row);
      for (const key of Object.keys(props)) {
        if (key === "_row_id") continue;
        set.add(key);
      }
    }
    const keys = [...set].sort((a, b) => a.localeCompare(b));
    return ["feature_key", ...keys.filter((k) => k !== "feature_key")];
  }, [issueGeometryRowsForTableViewFiltered]);

  const mapLayersForSelectedProject = useMemo((): MapFootprint[] => {
    const issueGeom: MapFootprint[] = issueGeometryVisibleForMap.map(
      (g) => ({
        id: `issuegeom:${g.id}`,
        label: overlapDisplayLabelForIssueGeometryRow(g),
        geojson: g.geojson,
        popupProperties: {
          ...(typeof g.properties === "object" && g.properties !== null
            ? (g.properties as Record<string, unknown>)
            : {}),
          feature_key: g.feature_key,
          _row_id: g.id,
        },
        layerKind: "issue_geometry",
        issueGeometryEdit: {
          projectId: g.project_id,
          issueId: g.issue_id,
          featureId: g.id,
        },
      })
    );
    return issueGeom;
  }, [
    issueGeometryVisibleForMap,
  ]);

  const visibleMapLayers = useMemo(() => {
    return mapLayersForSelectedProject.filter((layer) => {
      const k = layer.layerKind ?? "demo";
      if (k === "issue_geometry") return mapShowIssueGeometry;
      return true;
    });
  }, [
    mapLayersForSelectedProject,
    mapShowIssueGeometry,
  ]);

  const berkasForSelectedProject = useMemo(() => {
    if (!selectedProjectId) return [];
    return berkasPermohonan.filter((b) => b.project_id === selectedProjectId);
  }, [berkasPermohonan, selectedProjectId]);

  const projectMembersForSelectedProject = useMemo(() => {
    if (!selectedProjectId) return [];
    const roleRank = (role: string): number => {
      if (role === "owner") return 0;
      if (role === "admin") return 1;
      if (role === "member") return 2;
      return 3;
    };
    return projectMembers
      .filter((m) => m.project_id === selectedProjectId)
      .sort((a, b) => {
        const roleDiff = roleRank(a.role) - roleRank(b.role);
        if (roleDiff !== 0) return roleDiff;
        const nameA = (a.display_name ?? "").toLowerCase();
        const nameB = (b.display_name ?? "").toLowerCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        return a.user_id.localeCompare(b.user_id);
      });
  }, [projectMembers, selectedProjectId]);

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
      <div className="flex min-h-0 flex-1 p-3">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background">
      {!isSidebarCollapsed && (
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-sidebar-border/90 bg-sidebar/95 px-5 pt-0 pb-5 font-sans text-sidebar-foreground">
        <div className="-mx-5 mb-4 flex h-[68px] items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
            ◫
          </div>
          <div>
            <p className="text-[1rem] font-semibold leading-tight tracking-normal">Spatial PM</p>
            <p className="mt-1 text-xs text-muted-foreground">v1.0.0</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Organisasi
          </p>
          <div className="ml-2">
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
                  className={`mb-1 h-8 w-full justify-start rounded-md px-3 text-left text-[0.95rem] font-medium ${
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
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">Project</p>
            <div className="flex items-center gap-1">
              {selectedProjectId && (
                <Dialog
                  open={memberDialogOpen}
                  onOpenChange={(open) => {
                    setMemberDialogOpen(open);
                    if (open) setMemberMsg(null);
                  }}
                >
                  <DialogTrigger render={<Button size="sm" variant="outline" />}>
                    + Anggota
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Tambah anggota project</DialogTitle>
                      <DialogDescription>
                        Tambahkan user ke project{" "}
                        <span className="font-medium text-foreground">
                          {selectedProject?.name ?? "aktif"}
                        </span>{" "}
                        berdasarkan email. Hanya owner project yang bisa.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      className="grid gap-3"
                      action={(fd) => {
                        if (!selectedProjectId) return;
                        setMemberMsg(null);
                        fd.set("project_id", selectedProjectId);
                        startMemberTransition(async () => {
                          const r = await addProjectMemberByEmailAction(fd);
                          if (r.error) {
                            setMemberMsg(r.error);
                            return;
                          }
                          setMemberDialogOpen(false);
                          router.refresh();
                        });
                      }}
                    >
                      <div className="space-y-1">
                        <Label>Email user *</Label>
                        <Input
                          name="email"
                          type="email"
                          required
                          placeholder="contoh: user@domain.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Role</Label>
                        <select
                          name="role"
                          defaultValue="member"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          <option value="member">member</option>
                          <option value="owner">owner</option>
                        </select>
                      </div>
                      <Button type="submit" disabled={memberPending}>
                        Tambahkan ke project
                      </Button>
                      {memberMsg && (
                        <p className="text-xs text-red-600" role="alert">
                          {memberMsg}
                        </p>
                      )}
                    </form>
                  </DialogContent>
                </Dialog>
              )}
              {canonicalOrgId && (
                <Dialog
                  open={projectDialogOpen}
                  onOpenChange={(open) => {
                    setProjectDialogOpen(open);
                    if (open) setProjectMsg(null);
                  }}
                >
                  <DialogTrigger render={<Button size="sm" variant="outline" />}>
                    + Project
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Tambah project</DialogTitle>
                      <DialogDescription>
                        Buat project baru di organisasi aktif.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      className="grid gap-3"
                      action={(fd) => {
                        if (!canonicalOrgId) return;
                        setProjectMsg(null);
                        fd.set("organization_id", canonicalOrgId);
                        startTaskTransition(async () => {
                          const r = await createProjectInOrganizationAction(fd);
                          if (r.error) {
                            setProjectMsg(r.error);
                            return;
                          }
                          setProjectDialogOpen(false);
                          router.refresh();
                        });
                      }}
                    >
                      <div className="space-y-1">
                        <Label>Nama project *</Label>
                        <Input name="project_name" required placeholder="Contoh: PLM Cirebon 2028" />
                      </div>
                      <div className="space-y-1">
                        <Label>Kode project (opsional)</Label>
                        <Input name="project_key" placeholder="PLM28" />
                      </div>
                      <div className="space-y-1">
                        <Label>Deskripsi (opsional)</Label>
                        <Textarea
                          name="project_description"
                          rows={3}
                          placeholder="Catatan singkat project"
                        />
                      </div>
                      <Button type="submit" disabled={taskPending}>
                        Buat project
                      </Button>
                      {projectMsg && (
                        <p className="text-xs text-red-600" role="alert">
                          {projectMsg}
                        </p>
                      )}
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          {projectsInOrg.map((p) => {
            const treeRows = flattenIssuesWithDepth(p.id, issues);
            const projectIssues = issues.filter((i) => i.project_id === p.id);
            const parentByIssueId = new Map(
              projectIssues.map((i) => [i.id, i.parent_id])
            );
            const issueIdsWithChildren = new Set(
              projectIssues.filter((i) => i.parent_id).map((i) => i.parent_id as string)
            );
            const treeRowsForSidebar = treeRows.filter(({ issue, depth }) => {
              const hasChildren = issueIdsWithChildren.has(issue.id);
              if (hasChildren) return true;
              return depth < 2;
            });
            const sidebarParentIdsWithVisibleChildren = new Set(
              treeRowsForSidebar
                .map(({ issue }) => issue.parent_id)
                .filter((id): id is string => Boolean(id))
            );
            const visibleTreeRows = treeRowsForSidebar.filter(({ issue }) => {
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
              <div key={p.id} className="ml-2">
                <div className="flex items-center gap-1">
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
                    className={`h-8 flex-1 justify-start gap-2 rounded-md px-3 text-left text-[0.95rem] font-medium ${
                      isSelectedProject
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "bg-transparent text-sidebar-foreground hover:bg-sidebar-accent/70"
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="h-8 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setProjectMsg(null);
                      setProjectDeleteConfirm({ projectId: p.id, name: p.name });
                    }}
                    aria-label={`Hapus project ${p.name}`}
                    title="Hapus project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="h-8 w-7 text-muted-foreground hover:bg-sidebar-accent"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCollapsedProjectIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      });
                    }}
                    aria-label={collapsedProjectIds.has(p.id) ? "Expand project" : "Collapse project"}
                  >
                    {collapsedProjectIds.has(p.id) ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                {!collapsedProjectIds.has(p.id) && (
                <ul className="ml-3 mt-1 space-y-0.5 border-l border-sidebar-border/70 pl-2">
                  {visibleTreeRows.map(({ issue: t, depth }) => {
                    const isTask = selectedTaskId === t.id;
                    const showChevron = sidebarParentIdsWithVisibleChildren.has(t.id);
                    const isCollapsed = collapsedIssueIds.has(t.id);
                    return (
                      <li key={t.id} style={{ paddingLeft: depth * 12 }}>
                        <div className="flex items-center gap-1">
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
                            className={`h-7 flex-1 justify-start rounded-md px-2 text-left text-[0.95rem] font-normal ${
                              isTask
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/70"
                            }`}
                          >
                            <span className="truncate">{t.title}</span>
                          </Button>
                          {showChevron ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="h-7 w-7 text-muted-foreground hover:bg-sidebar-accent"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCollapsedIssueIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(t.id)) next.delete(t.id);
                                  else next.add(t.id);
                                  return next;
                                });
                              }}
                              aria-label={isCollapsed ? "Expand" : "Collapse"}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                )}
              </div>
            );
          })}
          <Dialog
            open={projectDeleteConfirm !== null}
            onOpenChange={(open) => {
              if (!open) setProjectDeleteConfirm(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Hapus project</DialogTitle>
                <DialogDescription>
                  Project "{projectDeleteConfirm?.name ?? "ini"}" akan dihapus
                  (soft delete) beserta unit kerja di dalamnya tidak lagi tampil.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProjectDeleteConfirm(null)}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={taskPending}
                  onClick={() => {
                    const current = projectDeleteConfirm;
                    if (!current) return;
                    setProjectMsg(null);
                    const fd = new FormData();
                    fd.set("project_id", current.projectId);
                    startTaskTransition(async () => {
                      const r = await deleteProjectAction(fd);
                      if (r.error) {
                        setProjectMsg(r.error);
                        return;
                      }
                      setProjectDeleteConfirm(null);
                      router.refresh();
                    });
                  }}
                >
                  Ya, hapus project
                </Button>
              </div>
              {projectMsg && (
                <p className="text-xs text-red-600" role="alert">
                  {projectMsg}
                </p>
              )}
            </DialogContent>
          </Dialog>
        </div>
        {canonicalOrgId && userEmail && (
          <OrganizationModuleToggles
            organizationId={canonicalOrgId}
            moduleRegistry={moduleRegistry}
            organizationModules={organizationModules}
          />
        )}
      </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-muted/30">
        <Tabs
          value={activeView}
          onValueChange={(value) => {
            const v = value as ViewId;
            replaceQuery((q) => {
              q.set("view", viewToParam(v));
              if (v !== "Berkas" && v !== "Map") {
                q.delete("berkas");
              }
            });
          }}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
        >
        <header className="border-b border-border bg-card/90 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center text-foreground transition-colors hover:opacity-80"
                onClick={() => setIsSidebarCollapsed((v) => !v)}
                title={isSidebarCollapsed ? "Buka sidebar" : "Tutup sidebar"}
                aria-label={isSidebarCollapsed ? "Buka sidebar" : "Tutup sidebar"}
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <div className="h-6 w-px bg-border" aria-hidden="true" />
              <div>
          <p className="text-sm text-muted-foreground">
            {selectedScopePath
              .split(" > ")
              .filter(Boolean)
              .map((segment, idx, arr) => (
                <span key={`${segment}-${idx}`}>
                  <span className={idx === arr.length - 1 ? "text-foreground" : ""}>
                    {segment}
                  </span>
                  {idx < arr.length - 1 ? <span className="mx-1">›</span> : null}
                </span>
              ))}
          </p>
              </div>
            </div>
            {userEmail && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <NotificationsBell notifications={userNotifications} />
                <ThemeToggle />
                <form action={signOut} className="flex shrink-0 items-center gap-2">
                  <p className="text-xs text-muted-foreground">{userEmail}</p>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="h-auto px-2 py-1 text-xs"
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
        </header>

        <section className="min-h-0 flex-1 overflow-auto p-6">
            <TabsList className="mb-4 h-auto min-h-9 w-full max-w-full flex-wrap justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground sm:flex-nowrap">
              {visibleViews.map((view) => (
                <TabsTrigger key={view} value={view} className="px-2.5 sm:px-3">
                  {view}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="Dashboard" className="block w-full min-w-0 outline-none">
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="shadow-none">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Unit kerja level atas:{" "}
                      <span className="font-semibold text-foreground">{topLevelCount}</span>
                    </CardContent>
                  </Card>
                  <Card className="shadow-none">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Total baris terurut (dengan unit turunan):{" "}
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
                        Tambah unit kerja cepat (core PM)
                      </p>
                      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                        <DialogTrigger render={<Button size="sm" />}>
                          + Unit Kerja
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Tambah unit kerja</DialogTitle>
                            <DialogDescription>
                              Buat unit kerja level project dengan data jadwal dan progres opsional.
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
                              <Label>Judul unit kerja *</Label>
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
                              Simpan unit kerja
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
                        Tambah unit turunan ke unit kerja terpilih
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
                          + Unit Turunan
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Tambah unit turunan</DialogTitle>
                            <DialogDescription>
                              Unit turunan akan ditambahkan di bawah unit kerja terpilih.
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
                              <Label>Judul unit turunan *</Label>
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
                              Simpan unit turunan
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
                              Ubah target, realisasi, dan bobot unit kerja terpilih.
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
            </TabsContent>
            <TabsContent value="Tabel" className="block w-full min-w-0 outline-none">
              <div className="mt-5 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-sm font-semibold text-foreground">Unit Kerja</p>
                </div>
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Judul</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Bobot</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Realisasi/Target</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Progress %</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Mulai</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Tenggat</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Unit Induk</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!selectedTaskId && selectedProject && (
                      <tr className="border-b border-border bg-primary/10">
                        <td className="px-4 py-3 align-middle font-semibold text-primary">
                          {selectedProject.name}
                        </td>
                        <td className="px-4 py-3 align-middle text-primary">Ringkasan</td>
                        <td className="px-4 py-3 align-middle text-primary">—</td>
                        <td className="px-4 py-3 align-middle text-primary whitespace-nowrap">— / —</td>
                        <td className="px-4 py-3 align-middle font-semibold text-primary whitespace-nowrap">
                          {projectProgressPercent.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 align-middle text-primary">—</td>
                        <td className="px-4 py-3 align-middle text-primary">—</td>
                        <td className="px-4 py-3 align-middle text-primary">—</td>
                        <td className="px-4 py-3 align-middle text-primary">—</td>
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
                            selectedTaskId === issue.id ? "bg-primary/10 font-semibold" : ""
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
                            className={`px-4 py-3 align-middle ${
                              isSelectedRootRow ? "font-semibold text-primary" : ""
                            }`}
                          >
                            <span className="block" style={{ paddingLeft: depth * 12 }}>
                              {issue.title}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Badge className={statusBadgeClass(st?.category)}>
                              {st?.name ?? "Tanpa status"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {issue.issue_weight ?? "1"}
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {issue.progress_actual ?? "—"} / {issue.progress_target ?? "—"}
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {progressPct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {formatShortDate(issue.starts_at)}
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {formatShortDate(issue.due_at)}
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {issue.parent_id
                              ? (issueTitleById.get(issue.parent_id) ?? "—")
                              : "—"}
                          </td>
                          <td className="px-4 py-3 align-middle whitespace-nowrap">
                            {selectedProjectId ? (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1">
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
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={taskPending}
                                    className="h-auto px-2 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setTaskDeleteConfirm({
                                        issueId: issue.id,
                                        title: issue.title,
                                      });
                                    }}
                                  >
                                    Hapus
                                  </Button>
                                </div>
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
                                          ? "Konfirmasi buka lagi unit kerja"
                                          : "Konfirmasi selesaikan unit kerja"}
                                      </DialogTitle>
                                      <DialogDescription>
                                        {taskConfirm?.mode === "reopen"
                                          ? `Unit kerja "${taskConfirm?.title ?? issue.title}" akan dibuka lagi.`
                                          : `Unit kerja "${taskConfirm?.title ?? issue.title}" dan seluruh turunan-nya akan ditandai selesai.`}
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
                                <Dialog
                                  open={taskDeleteConfirm?.issueId === issue.id}
                                  onOpenChange={(open) => {
                                    if (!open) setTaskDeleteConfirm(null);
                                  }}
                                >
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Hapus unit kerja</DialogTitle>
                                      <DialogDescription>
                                        Unit kerja "{taskDeleteConfirm?.title ?? issue.title}" akan
                                        dihapus (soft delete), termasuk seluruh unit turunannya.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setTaskDeleteConfirm(null)}
                                      >
                                        Batal
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        disabled={taskPending}
                                        onClick={() => {
                                          const current = taskDeleteConfirm;
                                          if (!current || !selectedProjectId) return;
                                          setTaskMsg(null);
                                          const fd = new FormData();
                                          fd.set("issue_id", current.issueId);
                                          fd.set("project_id", selectedProjectId);
                                          startTaskTransition(async () => {
                                            const r = await deleteTaskAction(fd);
                                            if (r.error) {
                                              setTaskMsg(r.error);
                                              return;
                                            }
                                            setTaskDeleteConfirm(null);
                                            router.refresh();
                                          });
                                        }}
                                      >
                                        Ya, hapus unit kerja
                                      </Button>
                                    </div>
                                    {taskMsg && (
                                      <p className="text-xs text-red-600" role="alert">
                                        {taskMsg}
                                      </p>
                                    )}
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
              <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-sm font-semibold text-foreground">Project Members</p>
                </div>
                <table className="w-full min-w-[26rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Nama</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Peran</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">User ID</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Bergabung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectMembersForSelectedProject.map((member) => (
                      <tr key={`${member.project_id}:${member.user_id}`} className="border-b border-border/70">
                        <td className="px-4 py-3 align-middle">
                          {member.display_name?.trim() || "Tanpa nama"}
                        </td>
                        <td className="px-4 py-3 align-middle text-muted-foreground">
                          {member.role}
                        </td>
                        <td className="px-4 py-3 align-middle font-mono text-xs text-muted-foreground">
                          {member.user_id}
                        </td>
                        <td className="px-4 py-3 align-middle text-muted-foreground">
                          {formatShortDate(member.joined_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {projectMembersForSelectedProject.length === 0 && (
                  <p className="m-4 text-sm text-muted-foreground">
                    Belum ada anggota pada project ini.
                  </p>
                )}
              </div>
              <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                <div className="flex min-w-0 flex-nowrap items-center gap-2 border-b border-border px-4 py-2.5">
                  <p className="shrink-0 text-sm font-semibold text-foreground">
                    Atribut Spasial
                  </p>
                  <Input
                    value={spatialSearchText}
                    onChange={(e) => setSpatialSearchText(e.target.value)}
                    placeholder="Cari unit kerja / atribut / nilai..."
                    className="h-8 min-w-[8rem] flex-1 text-xs sm:max-w-[14rem] md:max-w-xs"
                  />
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {spatialTableTotalRows.toLocaleString("id-ID")} baris
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={spatialTablePage <= 1}
                      onClick={() => setSpatialTablePage((p) => Math.max(1, p - 1))}
                    >
                      Sebelumnya
                    </Button>
                    <span className="whitespace-nowrap text-muted-foreground">
                      Halaman {spatialTablePage} / {spatialTableTotalPages}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={spatialTablePage >= spatialTableTotalPages}
                      onClick={() =>
                        setSpatialTablePage((p) => Math.min(spatialTableTotalPages, p + 1))
                      }
                    >
                      Berikutnya
                    </Button>
                  </div>
                </div>
                <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Unit Kerja</th>
                      {issueGeometryAttributeKeysForTableView.map((key) => (
                        <th key={key} className="px-3 py-2 font-medium">
                          {key}
                        </th>
                      ))}
                      <th className="w-24 px-3 py-2 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issueGeometryRowsForTableViewPaged.map((row) => {
                      const props = issueGeometryPropertiesForDisplay(row);
                      return (
                        <tr key={row.id} className="border-b border-border/70">
                          <td className="px-3 py-2">
                            {issueTitleById.get(row.issue_id) ?? row.issue_id}
                          </td>
                          {issueGeometryAttributeKeysForTableView.map((key) => (
                            <td
                              key={`${row.id}:${key}`}
                              className="max-w-[260px] truncate px-3 py-2 font-mono"
                              title={compactValuePreview(props[key], 500)}
                            >
                              {compactValuePreview(props[key])}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right align-middle">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setSpatialAttributeEditMsg(null);
                                setSpatialAttributeEditEntries(
                                  buildSpatialAttributeEditEntries(row)
                                );
                                setSpatialAttributeEditRow(row);
                              }}
                            >
                              Edit
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {issueGeometryRowsForTableViewFiltered.length === 0 && (
                  <p className="m-4 text-xs text-muted-foreground">
                    {spatialSearchQuery
                      ? "Tidak ada data yang cocok dengan kata kunci pencarian."
                      : selectedTaskId
                        ? "Belum ada data GeoJSON geometri untuk unit kerja terpilih."
                        : "Belum ada data GeoJSON geometri unit kerja pada project ini."}
                  </p>
                )}
                <Dialog
                  open={spatialAttributeEditRow !== null}
                  onOpenChange={(open) => {
                    if (!open) {
                      setSpatialAttributeEditRow(null);
                      setSpatialAttributeEditMsg(null);
                    }
                  }}
                >
                  <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit atribut</DialogTitle>
                    </DialogHeader>
                    {spatialAttributeEditRow ? (
                      <div className="space-y-3 text-sm">
                        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Unit kerja:</span>{" "}
                            <span className="font-medium text-foreground">
                              {issueTitleById.get(spatialAttributeEditRow.issue_id) ??
                                spatialAttributeEditRow.issue_id}
                            </span>
                          </div>
                          <div className="mt-1">
                            <span className="text-muted-foreground">feature_key:</span>{" "}
                            <span className="font-mono text-foreground">
                              {spatialAttributeEditRow.feature_key}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {spatialAttributeEditEntries.map((entry, idx) => (
                            <div
                              key={idx}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <Input
                                className="h-8 min-w-0 flex-1 font-mono text-xs"
                                placeholder="key"
                                value={entry.key}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setSpatialAttributeEditEntries((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, key: v } : p
                                    )
                                  );
                                }}
                              />
                              <Input
                                className="h-8 min-w-0 flex-[2] font-mono text-xs"
                                placeholder="value (JSON boleh)"
                                value={entry.value}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setSpatialAttributeEditEntries((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, value: v } : p
                                    )
                                  );
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  setSpatialAttributeEditEntries((prev) =>
                                    prev.length > 1
                                      ? prev.filter((_, i) => i !== idx)
                                      : prev
                                  )
                                }
                              >
                                Hapus
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 text-xs"
                          onClick={() =>
                            setSpatialAttributeEditEntries((prev) => [
                              ...prev,
                              { key: "", value: "" },
                            ])
                          }
                        >
                          Tambah atribut
                        </Button>
                        {spatialAttributeEditMsg && (
                          <p className="text-xs text-destructive" role="alert">
                            {spatialAttributeEditMsg}
                          </p>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSpatialAttributeEditRow(null);
                              setSpatialAttributeEditMsg(null);
                            }}
                          >
                            Batal
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={spatialAttributeEditPending}
                            onClick={() => {
                              if (!spatialAttributeEditRow) return;
                              setSpatialAttributeEditMsg(null);
                              const props: Record<string, unknown> = {};
                              for (const e of spatialAttributeEditEntries) {
                                const k = e.key.trim();
                                if (!k || k.startsWith("_")) continue;
                                if (NON_EDITABLE_SPATIAL_ATTR_KEYS.has(k)) continue;
                                props[k] = parseSpatialAttributeValue(e.value);
                              }
                              const fd = new FormData();
                              fd.set(
                                "project_id",
                                spatialAttributeEditRow.project_id
                              );
                              fd.set("issue_id", spatialAttributeEditRow.issue_id);
                              fd.set("feature_id", spatialAttributeEditRow.id);
                              fd.set("properties_json", JSON.stringify(props));
                              startSpatialAttributeEditTransition(async () => {
                                const r =
                                  await updateIssueGeometryFeaturePropertiesAction(
                                    fd
                                  );
                                if (r.error) {
                                  setSpatialAttributeEditMsg(r.error);
                                  return;
                                }
                                setSpatialAttributeEditRow(null);
                                setSpatialAttributeEditMsg(null);
                                router.refresh();
                              });
                            }}
                          >
                            Simpan
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </DialogContent>
                </Dialog>
              </div>
            </TabsContent>
            <TabsContent value="Berkas" className="block w-full min-w-0 outline-none">
              <div className="mt-4 space-y-3">
                {!selectedProjectId ? (
                  <p className="text-sm text-muted-foreground">
                    Pilih project untuk melihat daftar berkas.
                  </p>
                ) : (
                  <>
                    {selectedTaskId && (
                      <p className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
                        Scope <strong>unit kerja</strong> aktif — daftar berkas tetap
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
            </TabsContent>
            <TabsContent value="Laporan" className="block w-full min-w-0 outline-none">
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
            </TabsContent>
            <TabsContent value="Keuangan" className="block w-full min-w-0 outline-none">
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
            </TabsContent>
            <TabsContent value="Map" className="block w-full min-w-0 outline-none">
              <div className="mt-4 space-y-3">
                {!selectedProjectId ? (
                  <p className="text-sm text-muted-foreground">
                    Pilih project untuk melihat peta.
                  </p>
                ) : (
                  <>
                    {selectedTaskId && (
                        <Dialog
                          open={mapGeomDialogOpen}
                          onOpenChange={setMapGeomDialogOpen}
                        >
                          <DialogContent className="max-h-[85vh] max-w-[min(92vw,640px)] overflow-x-hidden overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>
                                {mapGeomInputMode === "manage"
                                  ? "Hapus geometri fitur unit kerja"
                                  : "Simpan geometri fitur unit kerja"}
                              </DialogTitle>
                              <DialogDescription>
                                {mapGeomInputMode === "manage" ? (
                                  <>
                                    Daftar fitur geometri untuk unit kerja aktif. Hapus per
                                    baris atau sekaligus sebelum batch ulang.
                                  </>
                                ) : (
                                  <>
                                    Pilih mode input per bidang atau batch FeatureCollection.
                                    Data tersimpan sebagai banyak fitur 1:N di unit kerja aktif.
                                  </>
                                )}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={mapGeomInputMode === "single" ? "default" : "outline"}
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setMapGeomDeleteMsg(null);
                                  setMapGeomInputMode("single");
                                }}
                              >
                                Per bidang
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={mapGeomInputMode === "batch" ? "default" : "outline"}
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setMapGeomDeleteMsg(null);
                                  setMapGeomInputMode("batch");
                                }}
                              >
                                Batch
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={mapGeomInputMode === "manage" ? "default" : "outline"}
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setMapGeomMsg(null);
                                  setMapGeomBatchMsg(null);
                                  setMapGeomDeleteMsg(null);
                                  setMapGeomInputMode("manage");
                                }}
                              >
                                Hapus
                              </Button>
                            </div>
                            {mapGeomInputMode === "manage" ? (
                              <div className="space-y-3">
                                {issueGeometriesForManageTask.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    Belum ada geometri fitur untuk task ini.
                                  </p>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs text-muted-foreground">
                                        Total{" "}
                                        <span className="font-semibold text-foreground">
                                          {issueGeometriesForManageTask.length}
                                        </span>{" "}
                                        fitur.
                                      </p>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        className="h-7 px-2 text-xs"
                                        disabled={mapGeomPending}
                                        onClick={() => {
                                          if (
                                            !selectedProjectId ||
                                            !selectedTaskId
                                          ) {
                                            return;
                                          }
                                          if (
                                            !window.confirm(
                                              `Hapus semua ${issueGeometriesForManageTask.length} geometri fitur unit kerja ini?`
                                            )
                                          ) {
                                            return;
                                          }
                                          setMapGeomDeleteMsg(null);
                                          startMapGeomTransition(async () => {
                                            const fd = new FormData();
                                            fd.set(
                                              "project_id",
                                              selectedProjectId
                                            );
                                            fd.set("issue_id", selectedTaskId);
                                            const r =
                                              await deleteAllIssueGeometryFeaturesForIssueAction(
                                                fd
                                              );
                                            if (r.error) {
                                              setMapGeomDeleteMsg(r.error);
                                              return;
                                            }
                                            setMapGeomDeleteMsg(
                                              `Terhapus ${r.deleted} fitur.`
                                            );
                                            router.refresh();
                                          });
                                        }}
                                      >
                                        Hapus semua
                                      </Button>
                                    </div>
                                    <div className="max-h-[36vh] overflow-y-auto rounded-md border border-border">
                                      <table className="w-full border-collapse text-left text-xs">
                                        <thead>
                                          <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                                            <th className="px-2 py-1.5 font-medium">
                                              feature_key
                                            </th>
                                            <th className="px-2 py-1.5 font-medium">
                                              label
                                            </th>
                                            <th className="w-20 px-2 py-1.5 text-right font-medium">
                                              Aksi
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {issueGeometriesForManageTask.map(
                                            (row) => (
                                              <tr
                                                key={row.id}
                                                className="border-b border-border/70"
                                              >
                                                <td className="px-2 py-1.5 font-mono text-[11px]">
                                                  {row.feature_key}
                                                </td>
                                                <td className="max-w-[200px] truncate px-2 py-1.5">
                                                  {row.label}
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                                                    disabled={mapGeomPending}
                                                    onClick={() => {
                                                      if (
                                                        !selectedProjectId ||
                                                        !selectedTaskId
                                                      ) {
                                                        return;
                                                      }
                                                      setMapGeomDeleteMsg(null);
                                                      startMapGeomTransition(
                                                        async () => {
                                                          const fd =
                                                            new FormData();
                                                          fd.set(
                                                            "project_id",
                                                            selectedProjectId
                                                          );
                                                          fd.set(
                                                            "issue_id",
                                                            selectedTaskId
                                                          );
                                                          fd.set(
                                                            "feature_id",
                                                            row.id
                                                          );
                                                          const r =
                                                            await deleteIssueGeometryFeatureByIdAction(
                                                              fd
                                                            );
                                                          if (r.error) {
                                                            setMapGeomDeleteMsg(
                                                              r.error
                                                            );
                                                            return;
                                                          }
                                                          setMapGeomDeleteMsg(
                                                            "Satu fitur dihapus."
                                                          );
                                                          router.refresh();
                                                        }
                                                      );
                                                    }}
                                                  >
                                                    Hapus
                                                  </Button>
                                                </td>
                                              </tr>
                                            )
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                )}
                                {mapGeomDeleteMsg && (
                                  <p
                                    className={`text-xs ${mapGeomDeleteMsg.includes("Terhapus") || mapGeomDeleteMsg.includes("Satu fitur") ? "text-emerald-700" : "text-red-600"}`}
                                    role="alert"
                                  >
                                    {mapGeomDeleteMsg}
                                  </p>
                                )}
                              </div>
                            ) : mapGeomInputMode === "single" ? (
                              <form
                                key={`geom-single-${mapGeomFormNonce}`}
                                className="grid gap-3"
                                action={(fd) => {
                                  if (!selectedProjectId || !selectedTaskId) return;
                                  setMapGeomMsg(null);
                                  fd.set("project_id", selectedProjectId);
                                  fd.set("issue_id", selectedTaskId);
                                  startMapGeomTransition(async () => {
                                    const r = await upsertIssueGeometryFeatureAction(fd);
                                    if (r.error) {
                                      setMapGeomMsg(r.error);
                                      return;
                                    }
                                    setMapGeomMsg("Berhasil simpan geometri per bidang.");
                                    router.refresh();
                                  });
                                }}
                              >
                                <div className="space-y-1">
                                  <Label>Feature key *</Label>
                                  <Input
                                    name="feature_key"
                                    required
                                    placeholder="contoh: sambeng-001 / bidang-12"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Label (opsional)</Label>
                                  <Input
                                    name="label"
                                    placeholder="contoh: Bidang Sambeng A1"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Properties JSON (opsional)</Label>
                                  <Textarea
                                    name="properties_json"
                                    rows={3}
                                    defaultValue='{}'
                                    placeholder='{"status":"ukur","luas_m2":1250}'
                                    className="font-mono text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>GeoJSON *</Label>
                                  <Textarea
                                    name="geojson_json"
                                    rows={9}
                                    required
                                    placeholder='{"type":"Polygon","coordinates":[[[108.53,-6.74],[108.54,-6.74],[108.54,-6.73],[108.53,-6.73],[108.53,-6.74]]]}'
                                    className="font-mono text-xs"
                                  />
                                </div>
                                <Button type="submit" disabled={mapGeomPending}>
                                  Simpan geometri
                                </Button>
                                {mapGeomMsg && (
                                  <p
                                    className={`text-xs ${mapGeomMsg.includes("Berhasil") ? "text-emerald-700" : "text-red-600"}`}
                                    role="alert"
                                  >
                                    {mapGeomMsg}
                                  </p>
                                )}
                              </form>
                            ) : (
                              <form
                                key={`geom-batch-${mapGeomFormNonce}`}
                                className="grid gap-3"
                                action={(fd) => {
                                  if (!selectedProjectId || !selectedTaskId) return;
                                  setMapGeomBatchMsg(null);
                                  fd.set("project_id", selectedProjectId);
                                  fd.set("issue_id", selectedTaskId);
                                  startMapGeomTransition(async () => {
                                    const r = await upsertIssueGeometryFeatureBatchAction(fd);
                                    if (r.error) {
                                      setMapGeomBatchMsg(r.error);
                                      return;
                                    }
                                    const failText =
                                      r.failed > 0
                                        ? `, gagal ${r.failed}`
                                        : "";
                                    const sampleText =
                                      r.failureSamples.length > 0
                                        ? ` (${r.failureSamples.slice(0, 3).join(" | ")})`
                                        : "";
                                    setMapGeomBatchMsg(
                                      `Batch selesai: berhasil ${r.insertedOrUpdated}${failText}.${sampleText}`
                                    );
                                    router.refresh();
                                  });
                                }}
                              >
                                <div className="space-y-1">
                                  <Label>Prefix feature key (opsional)</Label>
                                  <Input
                                    name="feature_key_prefix"
                                    placeholder="contoh: sambeng-"
                                  />
                                  <p className="text-[11px] text-muted-foreground">
                                    Key akan diambil dari properties.feature_key (fallback
                                    properties.id, lalu nomor urut feature).
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <Label>GeoJSON FeatureCollection *</Label>
                                  <p className="text-[11px] text-muted-foreground">
                                    Bisa upload file GeoJSON, atau tempel manual di textarea.
                                  </p>
                                  <Input
                                    type="file"
                                    accept=".geojson,.json,application/geo+json,application/json"
                                    className="w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-xs file:font-medium file:text-background hover:file:opacity-90"
                                    onChange={(e) => {
                                      const file = e.currentTarget.files?.[0];
                                      if (!file) return;
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const raw =
                                          typeof reader.result === "string"
                                            ? reader.result
                                            : "";
                                        try {
                                          const parsed = JSON.parse(raw);
                                          setMapGeomBatchText(
                                            JSON.stringify(parsed, null, 2)
                                          );
                                        } catch {
                                          setMapGeomBatchText(raw);
                                        }
                                      };
                                      reader.onerror = () => {
                                        setMapGeomBatchMsg(
                                          "Gagal membaca file. Coba file .geojson/.json lain."
                                        );
                                      };
                                      reader.readAsText(file);
                                    }}
                                  />
                                  <Textarea
                                    name="batch_geojson_json"
                                    rows={5}
                                    required
                                    value={mapGeomBatchText}
                                    onChange={(e) =>
                                      setMapGeomBatchText(e.target.value)
                                    }
                                    placeholder='{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"id":1,"Nama":"Bidang A"},"geometry":{"type":"MultiPolygon","coordinates":[...]}}]}'
                                    className="h-28 min-h-0 max-h-[45vh] w-full resize-y overflow-x-hidden [field-sizing:fixed] [overflow-wrap:anywhere] whitespace-pre-wrap break-all font-mono text-xs"
                                  />
                                </div>
                                {mapGeomBatchPreview && (
                                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                                    {!mapGeomBatchPreview.valid ? (
                                      <p className="text-red-700">
                                        Validasi awal: {mapGeomBatchPreview.reason}
                                      </p>
                                    ) : (
                                      <div className="space-y-1 text-muted-foreground">
                                        <p>
                                          Feature terdeteksi:{" "}
                                          <span className="font-semibold text-foreground">
                                            {mapGeomBatchPreview.featureCount}
                                          </span>
                                        </p>
                                        <p>
                                          Key siap pakai:{" "}
                                          <span className="font-semibold text-foreground">
                                            {mapGeomBatchPreview.withFeatureKey}
                                          </span>{" "}
                                          via <code>feature_key</code>,{" "}
                                          <span className="font-semibold text-foreground">
                                            {mapGeomBatchPreview.withIdFallback}
                                          </span>{" "}
                                          via fallback <code>id</code>.
                                        </p>
                                        <p>
                                          Tipe geometri:{" "}
                                          <span className="text-foreground">
                                            {Object.entries(
                                              mapGeomBatchPreview.geometryTypeCounts
                                            )
                                              .map(([k, v]) => `${k}=${v}`)
                                              .join(", ") || "—"}
                                          </span>
                                        </p>
                                        <p>
                                          Kolom/properti ({mapGeomBatchPreview.propertyKeys.length}):{" "}
                                          <span className="text-foreground">
                                            {mapGeomBatchPreview.propertyKeys.join(", ") || "—"}
                                          </span>
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <Button type="submit" disabled={mapGeomPending}>
                                  Proses batch
                                </Button>
                                {mapGeomBatchMsg && (
                                  <p
                                    className={`text-xs ${mapGeomBatchMsg.includes("Batch selesai") ? "text-emerald-700" : "text-red-600"}`}
                                    role="alert"
                                  >
                                    {mapGeomBatchMsg}
                                  </p>
                                )}
                              </form>
                            )}
                          </DialogContent>
                        </Dialog>
                    )}
                    {mapLayersForSelectedProject.length === 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Belum ada geometri unit kerja di peta untuk project ini.
                          Geometri unit kerja:{" "}
                          <code className="rounded bg-muted px-1">
                            0023_spatial_issue_geometry_features.sql
                          </code>{" "}
                          + view{" "}
                          <code className="rounded bg-muted px-1">
                            v_issue_geometry_feature_map
                          </code>
                          . Schema{" "}
                          <code className="rounded bg-muted px-1">spatial</code>{" "}
                          di Data API (
                          <code className="rounded bg-muted px-1">
                            docs/supabase-expose-schemas.md
                          </code>
                          ).
                        </p>
                        {selectedTaskId && (
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={openMapGeomDialog}
                            >
                              Tambah/Ubah geometri unit kerja
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleMapLayers.length === 0 && (
                          <p
                            className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
                            role="status"
                          >
                            Semua lapisan peta dimatikan. Buka tombol{" "}
                            <span className="font-semibold">Atur lapisan</span>{" "}
                            lalu centang minimal satu lapisan untuk
                            menampilkannya kembali di peta.
                          </p>
                        )}
                        {mapLayersForSelectedProject.length > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-muted-foreground">
                              Lapisan peta:
                            </span>
                            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                className="rounded border-border"
                                checked={mapShowIssueGeometry}
                                disabled={issueGeometryForSelectedProject.length === 0}
                                onChange={(e) =>
                                  setMapShowIssueGeometry(e.target.checked)
                                }
                              />
                              Geometri
                            </label>
                          </div>
                        )}
                        <WorkspaceMap
                          footprints={visibleMapLayers}
                          highlightBerkasId={null}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                          <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              <span
                                className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                                style={{ background: "#a78bfa" }}
                              />{" "}
                              Geometri
                            </span>
                          </p>
                          {selectedTaskId && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="shrink-0"
                              onClick={openMapGeomDialog}
                            >
                              Tambah/Ubah geometri unit kerja
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
            <TabsContent value="Kanban" className="block w-full min-w-0 outline-none">
              {selectedProjectId ? (
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
              ) : null}
            </TabsContent>
            <TabsContent value="Kalender" className="block w-full min-w-0 outline-none">
              {selectedProjectId ? (
              <div className="mt-4">
                <CalendarScheduleView
                  key={`cal-${selectedProjectId}-${selectedTaskId ?? "p"}`}
                  issues={issues}
                  projectId={selectedProjectId}
                  taskId={selectedTaskId}
                  onSelectIssue={selectIssueInScope}
                />
              </div>
              ) : null}
            </TabsContent>
            <TabsContent value="Gantt" className="block w-full min-w-0 outline-none">
              {selectedProjectId ? (
              <div className="mt-4">
                <GanttScheduleView
                  key={`gantt-${selectedProjectId}-${selectedTaskId ?? "p"}`}
                  issues={issues}
                  projectId={selectedProjectId}
                  taskId={selectedTaskId}
                  onSelectIssue={selectIssueInScope}
                />
              </div>
              ) : null}
            </TabsContent>
        </section>
        </Tabs>
      </main>
      </div>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ChevronRight, PanelLeft, Trash2 } from "lucide-react";
import {
  addProjectMemberByEmailAction,
  createOrganizationProjectInlineAction,
  createProjectInOrganizationAction,
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
import { ScrollArea } from "@/components/ui/scroll-area";
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
  cloneTaskChildrenAction,
  cycleTaskStatusAction,
  createProjectTaskAction,
  deleteProjectAction,
  deleteTaskAction,
  updateTaskBasicAction,
  updateTaskLastNoteAction,
} from "./core-task-actions";
import { updateProjectPropertiesAction } from "./project-properties-actions";
import {
  deleteAllIssueGeometryFeaturesForIssueAction,
  deleteIssueGeometryFeatureByIdAction,
  upsertIssueGeometryFeatureAction,
  upsertIssueGeometryFeatureBatchAction,
  upsertIssueGeometryFeaturesFromDxfAction,
} from "./issue-geometry-feature-actions";
import type { IDxf } from "dxf-parser";
import {
  extractClosedPolygonRingsFromDxfLayer,
  featureKeysForDxfPolygons,
  listDxfLayerNames,
  parseDxfDocument,
  type LinearRing,
} from "@/lib/dxf-import-utils";
import {
  dxfRingsToWgs84PreviewFeatureCollection,
  isPreviewSourceSridSupported,
} from "@/lib/crs-reproject";
import {
  MAX_SHAPEFILE_ZIP_BYTES,
  MAX_SPATIAL_GEOMETRY_TEXT_CHARS,
  MAX_SPATIAL_GEOMETRY_TEXT_MB,
  dxfKeyMappingTemplateCsv,
  shapefileZipTooLargeMessage,
  spatialGeometryTextTooLargeMessage,
} from "@/lib/spatial-import-limits";
import {
  applyGeoJsonBatchKeyLabelMapping,
  defaultGeoJsonBatchFeatureKey,
  defaultGeoJsonBatchLabel,
  listGeoJsonBatchPolygonRows,
  type GeoJsonFeatureCollectionForBatch,
} from "@/lib/geojson-batch-mapping-utils";
import {
  parseShapefileZipToPolygonLayers,
  type ShapefilePolygonLayer,
} from "@/lib/shapefile-import-utils";

const DxfMappingPreviewMap = dynamic(
  () => import("./dxf-mapping-preview-map").then((m) => m.DxfMappingPreviewMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-52 min-h-[13rem] w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground"
        role="status"
      >
        Memuat pratinjau peta…
      </div>
    ),
  }
);
import type {
  FinanceInvoiceItemRow,
  FinanceInvoiceRow,
  FinancePembayaranRow,
} from "./finance-types";
import { BerkasListPanel } from "./berkas-list-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
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
import { SpatialAttributesPanel } from "./spatial-attributes-panel";
import type {
  IssueGeometryFeatureMapRow,
  SpatialAttributeTableRow,
} from "./spatial-attribute-types";
import type { MapFootprint } from "./workspace-map";
import { type ViewId } from "./workspace-views";
import type { UserNotificationRow } from "./user-notification-types";

const WorkspaceMap = dynamic(
  () => import("./workspace-map").then((m) => m.WorkspaceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[12rem] w-full flex-1 items-center justify-center rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
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

export type { IssueGeometryFeatureMapRow } from "./spatial-attribute-types";

export type IssueFeatureAttributeRow = {
  id: string;
  project_id: string;
  issue_id: string;
  feature_key: string;
  payload: unknown;
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
  description?: string | null;
  /** Objek JSON label per depth (0–3); dari kolom `hierarchy_labels`. */
  hierarchy_labels?: unknown;
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
  last_note: string | null;
  last_note_at: string | null;
  last_note_by: string | null;
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
  issueFeatureAttributes: IssueFeatureAttributeRow[];
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
  /** Untuk cek owner saat edit properti project. */
  userId?: string | null;
  userNotifications?: UserNotificationRow[];
  joinError?: string | null;
};

type TableRow = { issue: IssueRow; depth: number };
type CompletionBarRow = {
  id: string;
  title: string;
  percent: number;
};
type SubtreeVillageProgressRow = {
  villageIssue: IssueRow;
  doneCount: number;
  totalCount: number;
  percent: number;
  milestoneMetaByTitle: Map<
    string,
    {
      issueId: string;
      category: string;
    }
  >;
};

/** Satu blok matriks monitoring di dashboard project (satu akar + baris anak). */
type ProjectMonitoringBlock = {
  rootId: string;
  rootTitle: string;
  parentHeader: string;
  rowHeader: string;
  leafHeader: string;
  milestoneTitles: string[];
  rows: SubtreeVillageProgressRow[];
};

type TaskDeleteConfirmState = { issueId: string; title: string };
type TaskNoteEditorState = {
  issueId: string;
  title: string;
  initialNote: string;
};
type TaskEditState = {
  issueId: string;
  title: string;
  startsAt: string;
  dueAt: string;
};
type TaskCloneDialogState = {
  targetIssueId: string;
  targetTitle: string;
  sourceIssueId: string;
};

type MonitoringAddChildContextState = {
  /** `null` = unit akar project (tanpa induk), selain itu = id issue induk. */
  parentId: string | null;
  parentTitle: string;
  parentHeader: string;
  rowHeader: string;
  leafHeader: string;
};

type ProjectDeleteConfirmState = { projectId: string; name: string };
type MapGeometryInputMode = "single" | "manage";

const STATUS_BADGE_CLASS: Record<string, string> = {
  done:
    "border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  in_progress:
    "border border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  todo:
    "border border-border bg-muted text-muted-foreground",
};
const SOURCE_SRID_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "4326", label: "EPSG:4326 - WGS84 (Lat/Lon)" },
  { value: "32748", label: "EPSG:32748 - UTM Zone 48S" },
  { value: "32749", label: "EPSG:32749 - UTM Zone 49S" },
  { value: "23833", label: "EPSG:23833 - TM-3 48.1" },
  { value: "23834", label: "EPSG:23834 - TM-3 48.2" },
  { value: "23835", label: "EPSG:23835 - TM-3 49.1" },
  { value: "23836", label: "EPSG:23836 - TM-3 49.2" },
];

function statusBadgeClass(category: string | null | undefined): string {
  if (!category) return STATUS_BADGE_CLASS.todo;
  return STATUS_BADGE_CLASS[category] ?? STATUS_BADGE_CLASS.todo;
}

function statusLabelEn(category: string | null | undefined): string {
  if (category === "done") return "Done";
  if (category === "in_progress") return "On Progress";
  return "To Do";
}

/** Kulit kartu dashboard: ringkasan hierarki & panel progress (sama ketebalan border dengan tabel monitoring; `ring-0` menimpa ring bawaan `Card`). */
const DASHBOARD_GRADIENT_CARD =
  "overflow-hidden rounded-xl border border-border bg-gradient-to-b from-background via-card to-muted/65 shadow-sm ring-0";

function completionBarClass(percent: number): string {
  if (percent >= 100) {
    return "bg-gradient-to-t from-sky-700 via-sky-500 to-sky-300 shadow-sm shadow-sky-900/10";
  }
  if (percent > 0) {
    return "bg-gradient-to-t from-sky-600 via-sky-400 to-sky-200 shadow-sm shadow-sky-900/10";
  }
  return "bg-gradient-to-t from-muted-foreground/35 via-muted-foreground/20 to-muted/50 shadow-sm";
}

function completionBadgeClass(percent: number): string {
  if (percent >= 80) {
    return "border border-emerald-500/25 bg-gradient-to-b from-emerald-500/20 to-emerald-500/8 text-emerald-700/95 dark:text-emerald-300";
  }
  if (percent >= 40) {
    return "border border-sky-500/25 bg-gradient-to-b from-sky-500/20 to-sky-500/8 text-sky-700/95 dark:text-sky-300";
  }
  return "border border-border/80 bg-gradient-to-b from-muted/85 to-muted/45 text-muted-foreground";
}

function pieSlicePath(
  cx: number,
  cy: number,
  r: number,
  startAngleRad: number,
  sweepRad: number
): string {
  const x1 = cx + r * Math.cos(startAngleRad);
  const y1 = cy + r * Math.sin(startAngleRad);
  const end = startAngleRad + sweepRad;
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const large = sweepRad > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Daun di pohon issue project — status di sini selaras dengan progres terbobot pada batang
 * (induk tanpa status / tanpa anak tidak membingungkan agregasi pie).
 */
function collectLeafIssuesForDashboardPie(
  projectIssues: IssueRow[],
  scopeRootId: string | null
): IssueRow[] {
  const idsWithChildren = new Set<string>();
  for (const i of projectIssues) {
    if (i.parent_id) idsWithChildren.add(i.parent_id);
  }
  const isLeaf = (id: string) => !idsWithChildren.has(id);

  if (scopeRootId == null) {
    return projectIssues.filter((i) => isLeaf(i.id));
  }

  const childrenByParent = new Map<string, IssueRow[]>();
  for (const i of projectIssues) {
    if (!i.parent_id) continue;
    const arr = childrenByParent.get(i.parent_id) ?? [];
    arr.push(i);
    childrenByParent.set(i.parent_id, arr);
  }
  const inSubtree = new Set<string>();
  const walk = (id: string) => {
    inSubtree.add(id);
    for (const ch of childrenByParent.get(id) ?? []) {
      walk(ch.id);
    }
  };
  walk(scopeRootId);
  return projectIssues.filter((i) => inSubtree.has(i.id) && isLeaf(i.id));
}

/** Pie status To Do / On Progress / Done — tiga slice tetap, ukuran mengikuti interpolasi halus. */
function DashboardStatusPieBlock({
  todo,
  inProgress,
  done,
}: {
  todo: number;
  inProgress: number;
  done: number;
}) {
  const rid = useId().replace(/:/g, "");
  const cx = 50;
  const cy = 50;
  const r = 44;
  const strokePie = "stroke-background/80 dark:stroke-background/40";

  const [display, setDisplay] = useState({ todo, inProgress, done });
  const latestRef = useRef(display);
  const rafRef = useRef(0);

  latestRef.current = display;

  useEffect(() => {
    if (
      latestRef.current.todo === todo &&
      latestRef.current.inProgress === inProgress &&
      latestRef.current.done === done
    ) {
      return;
    }
    const from = { ...latestRef.current };
    const start = performance.now();
    const durationMs = 480;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const u = Math.min(1, (now - start) / durationMs);
      const e = easeOutCubic(u);
      const next = {
        todo: from.todo + (todo - from.todo) * e,
        inProgress: from.inProgress + (inProgress - from.inProgress) * e,
        done: from.done + (done - from.done) * e,
      };
      latestRef.current = next;
      setDisplay(next);
      if (u < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [todo, inProgress, done]);

  const dTodo = display.todo;
  const dProg = display.inProgress;
  const dDone = display.done;
  const total = dTodo + dProg + dDone;

  const segments = [
    { key: "todo" as const, n: dTodo, label: "To Do", fill: `url(#${rid}-todo)` },
    { key: "progress" as const, n: dProg, label: "On Progress", fill: `url(#${rid}-progress)` },
    { key: "done" as const, n: dDone, label: "Done", fill: `url(#${rid}-done)` },
  ];

  const paths: ReactElement[] = [];
  if (total > 1e-9) {
    const tol = Math.max(1e-9, total * 1e-6);
    let dominant: (typeof segments)[number] | null = null;
    for (const s of segments) {
      if (s.n >= total - tol) {
        dominant = s;
        break;
      }
    }
    if (dominant) {
      paths.push(
        <circle
          key={dominant.key}
          cx={cx}
          cy={cy}
          r={r}
          fill={dominant.fill}
          className={strokePie}
          strokeWidth={0.75}
        />
      );
    } else {
      let angle = -Math.PI / 2;
      for (const s of segments) {
        const sweep = (s.n / total) * 2 * Math.PI;
        if (sweep < 1e-7) {
          angle += sweep;
          continue;
        }
        paths.push(
          <path
            key={s.key}
            d={pieSlicePath(cx, cy, r, angle, sweep)}
            fill={s.fill}
            className={strokePie}
            strokeWidth={0.75}
          />
        );
        angle += sweep;
      }
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <p className="shrink-0 text-center text-xs font-semibold text-foreground">Status</p>
      <div className="grid place-items-center py-1">
        <div className="relative aspect-square w-[min(100%,24rem)] max-w-full">
        <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-sm">
          <defs>
            <linearGradient id={`${rid}-todo`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#64748b" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.65} />
            </linearGradient>
            <linearGradient id={`${rid}-progress`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#bae6fd" />
            </linearGradient>
            <linearGradient id={`${rid}-done`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#047857" />
              <stop offset="100%" stopColor="#86efac" />
            </linearGradient>
          </defs>
          {total <= 1e-9 ? (
            <circle
              cx={cx}
              cy={cy}
              r={22}
              className="fill-muted/50 stroke-border/60"
              strokeWidth={1}
            />
          ) : (
            paths
          )}
        </svg>
        </div>
      </div>
      <ul className="flex w-full shrink-0 flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-foreground sm:gap-x-4">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-sm shadow-sm"
              style={{
                background:
                  s.key === "todo"
                    ? "linear-gradient(to top, rgb(100 116 139 / 0.7), rgb(203 213 225 / 0.6))"
                    : s.key === "progress"
                      ? "linear-gradient(to top, rgb(2 132 199), rgb(186 230 253))"
                      : "linear-gradient(to top, rgb(4 120 87), rgb(134 239 172))",
              }}
            />
            <span className="tabular-nums">
              {s.label}{" "}
              <span className="text-muted-foreground">
                ({total > 1e-9 ? ((s.n / total) * 100).toFixed(0) : "0"}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function defaultHierarchyLabel(depth: number): string {
  if (depth === 0) return "Unit kerja";
  if (depth === 1) return "Unit turunan";
  return `Level ${depth + 1}`;
}

/** Format baru per depth string, atau lama { singular, plural } (legacy localStorage). */
function parseHierarchyLabelsRecord(parsed: Record<string, unknown>): Record<number, string> {
  const next: Record<number, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const depth = Number(k);
    if (!Number.isFinite(depth)) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) next[depth] = t;
    } else if (v && typeof v === "object") {
      const o = v as { singular?: unknown; plural?: unknown };
      const singular = String(o.singular ?? "").trim();
      const plural = String(o.plural ?? "").trim();
      const label = singular || plural;
      if (label) next[depth] = label;
    }
  }
  return next;
}

function parseHierarchyLabelsFromDb(value: unknown): Record<number, string> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  return parseHierarchyLabelsRecord(value as Record<string, unknown>);
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

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function buildIssuesChildByParentForMonitoring(
  projectIssues: IssueRow[]
): Map<string, IssueRow[]> {
  const childByParent = new Map<string, IssueRow[]>();
  for (const i of projectIssues) {
    if (!i.parent_id) continue;
    const arr = childByParent.get(i.parent_id) ?? [];
    arr.push(i);
    childByParent.set(i.parent_id, arr);
  }
  for (const arr of childByParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }
  return childByParent;
}

/** Matriks monitoring: anak langsung `parentId` sebagai baris, cucu sebagai kolom milestone. */
function computeVillageProgressForParent(
  childByParent: Map<string, IssueRow[]>,
  parentId: string,
  statusById: Map<string, { category: string }>,
  milestoneColumnOrder: string[] | null
): { milestoneTitles: string[]; rows: SubtreeVillageProgressRow[] } {
  const villageIssues = childByParent.get(parentId) ?? [];
  const milestoneTitleSet = new Set<string>();
  const rows: SubtreeVillageProgressRow[] = [];

  for (const village of villageIssues) {
    const milestones = childByParent.get(village.id) ?? [];
    let doneCount = 0;
    const milestoneMetaByTitle = new Map<
      string,
      { issueId: string; category: string }
    >();
    for (const ms of milestones) {
      const st = ms.status_id ? statusById.get(ms.status_id) : undefined;
      const category = st?.category ?? "todo";
      if (category === "done") doneCount++;
      milestoneMetaByTitle.set(ms.title, {
        issueId: ms.id,
        category,
      });
      if (milestoneColumnOrder == null || milestoneColumnOrder.length === 0) {
        milestoneTitleSet.add(ms.title);
      }
    }
    const totalCount = milestones.length;
    const percent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
    rows.push({
      villageIssue: village,
      doneCount,
      totalCount,
      percent,
      milestoneMetaByTitle,
    });
  }

  const milestoneTitles =
    milestoneColumnOrder != null && milestoneColumnOrder.length > 0
      ? [...milestoneColumnOrder]
      : [...milestoneTitleSet];

  return { milestoneTitles, rows };
}

function formatRelativeAge(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (diffMs < hourMs) {
    const mins = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${mins} menit lalu`;
  }
  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours} jam lalu`;
  }
  const days = Math.floor(diffMs / dayMs);
  return `${days} hari lalu`;
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

/** True jika baris issue boleh tampak di sidebar (tidak di bawah cabang yang sedang collapsed). */
function isSidebarIssueRowExpanded(
  issue: IssueRow,
  parentByIssueId: Map<string, string | null>,
  collapsedIssueIds: Set<string>
): boolean {
  let parentId = issue.parent_id;
  while (parentId) {
    if (collapsedIssueIds.has(parentId)) return false;
    parentId = parentByIssueId.get(parentId) ?? null;
  }
  return true;
}

/** ID issue yang punya minimal satu turunan — dipakai default sidebar: semua cabang collapsed. */
function parentIssueIdsWithChildren(issues: IssueRow[]): Set<string> {
  const out = new Set<string>();
  for (const i of issues) {
    if (i.parent_id) out.add(i.parent_id);
  }
  return out;
}

function ProjectPropertiesDialog({
  open,
  onOpenChange,
  project,
  hierarchyLabels,
  canEditNameAndDescription,
  onSave,
  savePending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectRow | null;
  hierarchyLabels: Record<number, string>;
  canEditNameAndDescription: boolean;
  onSave: (payload: {
    name: string;
    description: string;
    hierarchyLabels: Record<number, string>;
  }) => Promise<{ error: string | null }>;
  savePending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labelDraft, setLabelDraft] = useState<Record<number, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !project) return;
    setSaveError(null);
    setName(project.name ?? "");
    setDescription(project.description != null ? String(project.description) : "");
    setLabelDraft(
      Object.fromEntries(
        [0, 1, 2, 3].map((d) => [d, hierarchyLabels[d] ?? defaultHierarchyLabel(d)])
      ) as Record<number, string>
    );
  }, [open, project, hierarchyLabels]);

  const handleSave = useCallback(async () => {
    if (!project) return;
    const nameTrim = name.trim();
    if (!nameTrim) {
      setSaveError("Nama project tidak boleh kosong.");
      return;
    }
    const nextLabels: Record<number, string> = {};
    for (let d = 0; d < 4; d++) {
      const t = (labelDraft[d] ?? "").trim();
      if (t !== "") nextLabels[d] = t;
    }
    setSaveError(null);
    const r = await onSave({
      name: nameTrim,
      description: description.trim(),
      hierarchyLabels: nextLabels,
    });
    if (r.error) {
      setSaveError(r.error);
      return;
    }
    onOpenChange(false);
  }, [description, labelDraft, name, onOpenChange, onSave, project]);

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,36rem)] overflow-y-auto sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Properti project</DialogTitle>
          <DialogDescription>
            Ubah nama, deskripsi, dan istilah level untuk dashboard. Istilah dapat diubah oleh
            anggota; nama dan deskripsi hanya owner.
          </DialogDescription>
        </DialogHeader>
        {!canEditNameAndDescription ? (
          <p className="text-xs text-muted-foreground">
            Anda bukan owner: nama dan deskripsi tidak dapat diubah di sini.
          </p>
        ) : null}
        {saveError ? (
          <p className="text-sm text-destructive" role="alert">
            {saveError}
          </p>
        ) : null}
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="project-prop-key">Kunci</Label>
            <p
              id="project-prop-key"
              className="rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-xs"
            >
              {project.key}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Kunci dipakai di referensi internal; hubungi admin jika perlu diubah.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="project-prop-name">Nama project</Label>
            <Input
              id="project-prop-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEditNameAndDescription || savePending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="project-prop-desc">Deskripsi</Label>
            <Textarea
              id="project-prop-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEditNameAndDescription || savePending}
              rows={3}
              className="min-h-[4.5rem] resize-y"
            />
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Istilah hierarki (dashboard)
            </p>
            <div className="grid gap-3">
              {[0, 1, 2, 3].map((depth) => (
                <div key={depth} className="grid gap-2 rounded-md border border-border p-2">
                  <p className="text-xs font-medium text-muted-foreground">Level {depth + 1}</p>
                  <Input
                    value={labelDraft[depth] ?? ""}
                    onChange={(e) =>
                      setLabelDraft((prev) => ({
                        ...prev,
                        [depth]: e.target.value,
                      }))
                    }
                    placeholder={defaultHierarchyLabel(depth)}
                    disabled={savePending}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={savePending}
          >
            Tutup
          </Button>
          <Button
            type="button"
            disabled={savePending}
            onClick={() => {
              void handleSave();
            }}
          >
            {savePending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MonitoringMatrixCard({
  blockTitle,
  rowHeader,
  leafHeader,
  milestoneTitles,
  rows,
  onAddChild,
  addChildDisabled,
  selectedProjectId,
  taskPending,
  memberNameByUserId,
  taskCloneDialog,
  setTaskCloneDialog,
  setTaskMsg,
  startTaskTransition,
  onAfterMutation,
  setTaskNoteEditor,
  rootClassName,
  taskMsg,
}: {
  blockTitle: string;
  rowHeader: string;
  leafHeader: string;
  milestoneTitles: string[];
  rows: SubtreeVillageProgressRow[];
  onAddChild: () => void;
  addChildDisabled?: boolean;
  selectedProjectId: string | null;
  taskPending: boolean;
  memberNameByUserId: Map<string, string>;
  taskCloneDialog: TaskCloneDialogState | null;
  setTaskCloneDialog: Dispatch<SetStateAction<TaskCloneDialogState | null>>;
  setTaskMsg: (msg: string | null) => void;
  startTaskTransition: (fn: () => void | Promise<void>) => void;
  onAfterMutation: () => void;
  setTaskNoteEditor: (s: TaskNoteEditorState | null) => void;
  /** Default `mt-8` agar jarak ke chart sama level project & level unit terpilih; kosongkan saat ditumpuk di dashboard project. */
  rootClassName?: string;
  taskMsg: string | null;
}) {
  const [optimisticMilestoneCategoryByIssueId, setOptimisticMilestoneCategoryByIssueId] =
    useState<Record<string, string>>({});
  const [pendingMilestoneIssueIds, setPendingMilestoneIssueIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    setOptimisticMilestoneCategoryByIssueId({});
    setPendingMilestoneIssueIds(new Set());
  }, [rows, milestoneTitles]);

  const cycleCategory = useCallback((current: string): string => {
    const order = ["todo", "in_progress", "done"] as const;
    const idx = order.indexOf(current as (typeof order)[number]);
    return order[(idx >= 0 ? idx + 1 : 0) % order.length];
  }, []);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-sm",
        rootClassName ?? "mt-8"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="min-w-0 text-sm font-semibold text-foreground">{blockTitle}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={addChildDisabled}
          onClick={onAddChild}
        >
          + {rowHeader}
        </Button>
      </div>
      <div className="overflow-x-auto px-4 py-3">
        <table className="w-full min-w-[min(64rem,100%)] table-auto border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 font-medium">{rowHeader}</th>
              {milestoneTitles.map((title) => (
                <th key={title} className="px-2 py-2 font-medium">
                  {title}
                </th>
              ))}
              <th className="px-2 py-2 font-medium">Catatan terakhir</th>
              <th className="px-2 py-2 font-medium">Oleh</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Kapan</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.villageIssue.id} className="border-b border-border/70">
                <td className="px-2 py-2 font-medium break-words text-foreground">
                  {row.villageIssue.title}
                </td>
                {milestoneTitles.map((title) => {
                  const meta = row.milestoneMetaByTitle.get(title);
                  const effectiveCategory =
                    meta == null
                      ? "todo"
                      : (optimisticMilestoneCategoryByIssueId[meta.issueId] ?? meta.category);
                  const isCellPending =
                    meta != null && pendingMilestoneIssueIds.has(meta.issueId);
                  return (
                    <td key={`${row.villageIssue.id}:${title}`} className="px-2 py-2">
                      {meta == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!selectedProjectId || isCellPending}
                          className="h-auto p-0 hover:bg-transparent"
                          onClick={(e) => {
                            e.preventDefault();
                            if (!selectedProjectId) return;
                            setTaskMsg(null);
                            const nextCategory = cycleCategory(effectiveCategory);
                            setOptimisticMilestoneCategoryByIssueId((prev) => ({
                              ...prev,
                              [meta.issueId]: nextCategory,
                            }));
                            setPendingMilestoneIssueIds((prev) => {
                              const next = new Set(prev);
                              next.add(meta.issueId);
                              return next;
                            });
                            const fd = new FormData();
                            fd.set("issue_id", meta.issueId);
                            fd.set("project_id", selectedProjectId);
                            fd.set("current_category", effectiveCategory);
                            startTaskTransition(async () => {
                              const r = await cycleTaskStatusAction(fd);
                              if (r.error) {
                                setOptimisticMilestoneCategoryByIssueId((prev) => {
                                  const next = { ...prev };
                                  delete next[meta.issueId];
                                  return next;
                                });
                                setPendingMilestoneIssueIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(meta.issueId);
                                  return next;
                                });
                                setTaskMsg(r.error);
                                return;
                              }
                              setPendingMilestoneIssueIds((prev) => {
                                const next = new Set(prev);
                                next.delete(meta.issueId);
                                return next;
                              });
                              onAfterMutation();
                            });
                          }}
                          title="Klik untuk ganti status"
                        >
                          <Badge className={statusBadgeClass(effectiveCategory)}>
                            {statusLabelEn(effectiveCategory)}
                          </Badge>
                        </Button>
                      )}
                    </td>
                  );
                })}
                <td className="max-w-[12rem] px-2 py-2 break-words text-muted-foreground">
                  <span className="line-clamp-2">
                    {row.villageIssue.last_note?.trim() || "—"}
                  </span>
                </td>
                <td className="px-2 py-2 break-words text-muted-foreground">
                  {row.villageIssue.last_note_by
                    ? (memberNameByUserId.get(row.villageIssue.last_note_by) ??
                      row.villageIssue.last_note_by)
                    : "—"}
                </td>
                <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                  {formatDateTime(row.villageIssue.last_note_at)}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={taskPending}
                      className="h-auto px-2 py-0.5 text-xs font-medium"
                      onClick={(e) => {
                        e.preventDefault();
                        setTaskNoteEditor({
                          issueId: row.villageIssue.id,
                          title: row.villageIssue.title,
                          initialNote: row.villageIssue.last_note ?? "",
                        });
                      }}
                    >
                      Catatan
                    </Button>
                    <Dialog
                      open={taskCloneDialog?.targetIssueId === row.villageIssue.id}
                      onOpenChange={(open) => {
                        if (!open) setTaskCloneDialog(null);
                      }}
                    >
                      <DialogTrigger
                        render={<Button type="button" size="sm" variant="outline" />}
                        disabled={taskPending}
                        onClick={() => {
                          const sourceOptions = rows.filter(
                            (r) =>
                              r.villageIssue.id !== row.villageIssue.id && r.totalCount > 0
                          );
                          setTaskCloneDialog({
                            targetIssueId: row.villageIssue.id,
                            targetTitle: row.villageIssue.title,
                            sourceIssueId: sourceOptions[0]?.villageIssue.id ?? "",
                          });
                        }}
                      >
                        Duplikasi
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Duplikasi {leafHeader}</DialogTitle>
                          <DialogDescription>
                            Salin daftar {leafHeader} ke {rowHeader} &quot;
                            {taskCloneDialog?.targetTitle ?? row.villageIssue.title}&quot;.
                          </DialogDescription>
                        </DialogHeader>
                        {rows.filter(
                          (r) =>
                            r.villageIssue.id !== row.villageIssue.id && r.totalCount > 0
                        ).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Belum ada {rowHeader} lain yang memiliki {leafHeader} untuk disalin.
                          </p>
                        ) : (
                          <form
                            className="grid gap-3"
                            action={() => {
                              if (!selectedProjectId || !taskCloneDialog) return;
                              if (!taskCloneDialog.sourceIssueId) {
                                setTaskMsg(`Pilih sumber ${rowHeader} terlebih dahulu.`);
                                return;
                              }
                              setTaskMsg(null);
                              const fd = new FormData();
                              fd.set("project_id", selectedProjectId);
                              fd.set("target_issue_id", taskCloneDialog.targetIssueId);
                              fd.set("source_issue_id", taskCloneDialog.sourceIssueId);
                              fd.set("copy_status", "0");
                              fd.set("skip_existing_titles", "1");
                              startTaskTransition(async () => {
                                const r = await cloneTaskChildrenAction(fd);
                                if (r.error) {
                                  setTaskMsg(r.error);
                                  return;
                                }
                                setTaskCloneDialog(null);
                                onAfterMutation();
                              });
                            }}
                          >
                            <div className="space-y-1">
                              <Label>Sumber {rowHeader}</Label>
                              <select
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={taskCloneDialog?.sourceIssueId ?? ""}
                                onChange={(e) =>
                                  setTaskCloneDialog((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          sourceIssueId: e.target.value,
                                        }
                                      : prev
                                  )
                                }
                              >
                                {rows
                                  .filter(
                                    (r) =>
                                      r.villageIssue.id !== row.villageIssue.id &&
                                      r.totalCount > 0
                                  )
                                  .map((opt) => (
                                    <option
                                      key={opt.villageIssue.id}
                                      value={opt.villageIssue.id}
                                    >
                                      {opt.villageIssue.title} ({opt.totalCount} {leafHeader})
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setTaskCloneDialog(null)}
                              >
                                Batal
                              </Button>
                              <Button type="submit" disabled={taskPending}>
                                Duplikasi {leafHeader}
                              </Button>
                            </div>
                            {taskMsg ? (
                              <p className="text-xs text-red-600" role="alert">
                                {taskMsg}
                              </p>
                            ) : null}
                          </form>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Baris mapping: apakah `feature_key` (setelah trim, banding huruf kecil) sudah punya geometri untuk unit kerja ini. */
function geometryKeyStatusCell(
  rawKey: string,
  existingGeometryKeysLower: Set<string>
): ReactNode {
  const t = rawKey.trim().toLowerCase();
  if (t.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (existingGeometryKeysLower.has(t)) {
    return (
      <Badge
        variant="outline"
        className="shrink-0 px-1.5 py-0 font-normal text-[10px] leading-tight"
      >
        Sudah ada
      </Badge>
    );
  }
  return <span className="text-muted-foreground">Belum</span>;
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
  issueFeatureAttributes = [],
  moduleRegistry: _moduleRegistry,
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
  userId = null,
  userNotifications = [],
  joinError,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  const [taskPending, startTaskTransition] = useTransition();
  const [projectPropertiesOpen, setProjectPropertiesOpen] = useState(false);
  const [projectPropertiesPending, setProjectPropertiesPending] = useState(false);
  const [tableTaskDialogOpen, setTableTaskDialogOpen] = useState(false);
  const [monitoringAddChildOpen, setMonitoringAddChildOpen] = useState(false);
  const [monitoringAddChildFormNonce, setMonitoringAddChildFormNonce] = useState(0);
  const [monitoringAddChildContext, setMonitoringAddChildContext] =
    useState<MonitoringAddChildContextState | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [organizationDialogOpen, setOrganizationDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [mapGeomDialogOpen, setMapGeomDialogOpen] = useState(false);
  const [mapGeomInputMode, setMapGeomInputMode] =
    useState<MapGeometryInputMode>("single");
  const [mapGeomFileMode, setMapGeomFileMode] = useState<"geojson" | "dxf">("geojson");
  const [mapGeomSourceSrid, setMapGeomSourceSrid] = useState("4326");
  const [mapDxfRawText, setMapDxfRawText] = useState("");
  const [mapDxfLayers, setMapDxfLayers] = useState<string[]>([]);
  const [mapDxfLayer, setMapDxfLayer] = useState("");
  const [mapDxfKeyPrefix, setMapDxfKeyPrefix] = useState("");
  const [mapDxfPolygonCount, setMapDxfPolygonCount] = useState(0);
  const [mapDxfFeatureKeys, setMapDxfFeatureKeys] = useState<string[]>([]);
  const [mapDxfFeatureLabels, setMapDxfFeatureLabels] = useState<string[]>([]);
  const [mapDxfBulkKeyText, setMapDxfBulkKeyText] = useState("");
  const [mapDxfBulkKeyHint, setMapDxfBulkKeyHint] = useState<string | null>(null);
  const [mapDxfPreviewRings, setMapDxfPreviewRings] = useState<LinearRing[]>([]);
  const [mapDxfHighlightRow, setMapDxfHighlightRow] = useState<number | null>(null);
  const [mapDxfError, setMapDxfError] = useState<string | null>(null);
  const mapDxfParsedRef = useRef<IDxf | null>(null);
  const [mapGeomMsg, setMapGeomMsg] = useState<string | null>(null);
  const [mapGeomBatchText, setMapGeomBatchText] = useState("");
  const [mapShpLayers, setMapShpLayers] = useState<ShapefilePolygonLayer[] | null>(
    null
  );
  const [mapShpSelectedFileName, setMapShpSelectedFileName] = useState("");
  const [mapShpLoadHint, setMapShpLoadHint] = useState<string | null>(null);
  const [mapGeomGeojsonBatchPrefix, setMapGeomGeojsonBatchPrefix] = useState("");
  const [mapGeojsonBatchKeys, setMapGeojsonBatchKeys] = useState<string[]>([]);
  const [mapGeojsonBatchLabels, setMapGeojsonBatchLabels] = useState<string[]>([]);
  const [mapGeomDeleteMsg, setMapGeomDeleteMsg] = useState<string | null>(null);
  const [mapGeomFormNonce, setMapGeomFormNonce] = useState(0);
  const [mapGeomPending, startMapGeomTransition] = useTransition();
  const mapGeomDetectedKind = useMemo<
    "none" | "single" | "batch" | "invalid" | "unsupported"
  >(() => {
    const text = mapGeomBatchText.trim();
    if (!text) return "none";
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object") return "invalid";
      const kind = String((parsed as { type?: unknown }).type ?? "");
      if (kind === "FeatureCollection") return "batch";
      if (kind === "Feature" || kind === "Polygon" || kind === "MultiPolygon") {
        return "single";
      }
      return "unsupported";
    } catch {
      return "invalid";
    }
  }, [mapGeomBatchText]);

  const mapGeomGeojsonPolygonRowCount = useMemo(() => {
    if (mapGeomDetectedKind !== "batch") return 0;
    const text = mapGeomBatchText.trim();
    if (!text) return 0;
    try {
      const p = JSON.parse(text) as unknown;
      if (
        !p ||
        typeof p !== "object" ||
        String((p as { type?: unknown }).type) !== "FeatureCollection"
      ) {
        return 0;
      }
      return listGeoJsonBatchPolygonRows(p as GeoJsonFeatureCollectionForBatch).length;
    } catch {
      return 0;
    }
  }, [mapGeomBatchText, mapGeomDetectedKind]);

  useEffect(() => {
    if (mapGeomDetectedKind !== "batch") {
      setMapGeojsonBatchKeys([]);
      setMapGeojsonBatchLabels([]);
      return;
    }
    const text = mapGeomBatchText.trim();
    if (!text) {
      setMapGeojsonBatchKeys([]);
      setMapGeojsonBatchLabels([]);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setMapGeojsonBatchKeys([]);
      setMapGeojsonBatchLabels([]);
      return;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      String((parsed as { type?: unknown }).type) !== "FeatureCollection"
    ) {
      setMapGeojsonBatchKeys([]);
      setMapGeojsonBatchLabels([]);
      return;
    }
    const rows = listGeoJsonBatchPolygonRows(parsed as GeoJsonFeatureCollectionForBatch);
    const keys = rows.map((row) =>
      defaultGeoJsonBatchFeatureKey(
        row.featureIndex,
        row.props,
        mapGeomGeojsonBatchPrefix
      )
    );
    const labels = rows.map((row) => defaultGeoJsonBatchLabel(row.props));
    setMapGeojsonBatchKeys(keys);
    setMapGeojsonBatchLabels(labels);
  }, [mapGeomBatchText, mapGeomDetectedKind, mapGeomGeojsonBatchPrefix]);

  const applyShapefileLayerToBatch = useCallback(
    (layers: ShapefilePolygonLayer[], fileName: string) => {
      const layer = layers.find((l) => l.fileName === fileName);
      if (!layer) {
        setMapGeomMsg("Layer shapefile tidak ditemukan.");
        setMapGeomBatchText("");
        return false;
      }
      const text = JSON.stringify(layer.featureCollection, null, 2);
      if (text.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
        setMapGeomMsg(spatialGeometryTextTooLargeMessage("Batch GeoJSON"));
        setMapGeomBatchText("");
        return false;
      }
      setMapGeomBatchText(text);
      setMapGeomMsg(null);
      setMapShpLoadHint(
        `Memuat ${layer.polygonFeatureCount} poligon dari layer “${layer.fileName}”. Atur prefix key (opsional) dan SRID, lalu simpan.`
      );
      return true;
    },
    []
  );

  useEffect(() => {
    if (mapDxfPolygonCount === 0 || !mapDxfLayer.trim()) {
      setMapDxfFeatureKeys([]);
      setMapDxfFeatureLabels([]);
      return;
    }
    setMapDxfFeatureKeys(
      featureKeysForDxfPolygons(
        mapDxfKeyPrefix.trim(),
        mapDxfLayer,
        mapDxfPolygonCount
      )
    );
    setMapDxfFeatureLabels(Array.from({ length: mapDxfPolygonCount }, () => ""));
    setMapDxfBulkKeyHint(null);
  }, [mapDxfPolygonCount, mapDxfLayer, mapDxfKeyPrefix]);

  const resetMapDxfState = useCallback(() => {
    setMapGeomFileMode("geojson");
    setMapGeomSourceSrid("4326");
    setMapGeomGeojsonBatchPrefix("");
    setMapGeojsonBatchKeys([]);
    setMapGeojsonBatchLabels([]);
    setMapShpLayers(null);
    setMapShpSelectedFileName("");
    setMapShpLoadHint(null);
    setMapDxfRawText("");
    setMapDxfLayers([]);
    setMapDxfLayer("");
    setMapDxfKeyPrefix("");
    setMapDxfPolygonCount(0);
    setMapDxfFeatureKeys([]);
    setMapDxfFeatureLabels([]);
    setMapDxfBulkKeyText("");
    setMapDxfBulkKeyHint(null);
    setMapDxfPreviewRings([]);
    setMapDxfHighlightRow(null);
    setMapDxfError(null);
    mapDxfParsedRef.current = null;
  }, []);
  const openMapGeomDialog = useCallback(() => {
    setMapGeomInputMode("single");
    setMapGeomMsg(null);
    setMapGeomDeleteMsg(null);
    setMapGeomBatchText("");
    resetMapDxfState();
    setMapGeomFormNonce((n) => n + 1);
    setMapGeomDialogOpen(true);
  }, [resetMapDxfState]);
  const openMapGeomManageDialog = useCallback(() => {
    setMapGeomInputMode("manage");
    setMapGeomMsg(null);
    setMapGeomDeleteMsg(null);
    setMapGeomBatchText("");
    resetMapDxfState();
    setMapGeomFormNonce((n) => n + 1);
    setMapGeomDialogOpen(true);
  }, [resetMapDxfState]);
  const [memberPending, startMemberTransition] = useTransition();
  const [taskDeleteConfirm, setTaskDeleteConfirm] =
    useState<TaskDeleteConfirmState | null>(null);
  const [taskNoteEditor, setTaskNoteEditor] = useState<TaskNoteEditorState | null>(null);
  const [taskEditState, setTaskEditState] = useState<TaskEditState | null>(null);
  const [taskCloneDialog, setTaskCloneDialog] = useState<TaskCloneDialogState | null>(
    null
  );
  const [hierarchyLabels, setHierarchyLabels] = useState<Record<number, string>>({});

  const taskNoteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] =
    useState<ProjectDeleteConfirmState | null>(null);
  const [projectMsg, setProjectMsg] = useState<string | null>(null);
  const [organizationMsg, setOrganizationMsg] = useState<string | null>(null);
  const [memberMsg, setMemberMsg] = useState<string | null>(null);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedIssueIds, setCollapsedIssueIds] = useState<Set<string>>(() =>
    parentIssueIdsWithChildren(issues)
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

  const taskIdFromSearchParams = useMemo(() => {
    const q = searchParams.get("task");
    if (!q || !selectedProjectId) return null;
    const ok = issues.some(
      (i) => i.id === q && i.project_id === selectedProjectId
    );
    return ok ? q : null;
  }, [searchParams, issues, selectedProjectId]);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    taskIdFromSearchParams
  );
  useEffect(() => {
    setSelectedTaskId(taskIdFromSearchParams);
  }, [taskIdFromSearchParams]);

  /** Jika `issues` kosong di render pertama, terapkan default collapse setelah data ada. */
  const issueTreeCollapseSeeded = useRef(false);
  useEffect(() => {
    if (issueTreeCollapseSeeded.current || issues.length === 0) return;
    issueTreeCollapseSeeded.current = true;
    setCollapsedIssueIds(parentIssueIdsWithChildren(issues));
  }, [issues]);

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

  const berkasIdsWithBidangInProject = useMemo(() => {
    const s = new Set<string>();
    if (!selectedProjectId) return s;
    for (const row of bidangHasilUkurMap) {
      if (row.project_id === selectedProjectId) s.add(row.berkas_id);
    }
    return s;
  }, [bidangHasilUkurMap, selectedProjectId]);

  const activeViewFromUrl = useMemo((): ViewId => {
    const raw = parseViewParam(searchParams.get("view")) ?? "Dashboard";
    const enabled = effectiveEnabledModuleCodes(
      canonicalOrgId,
      organizationModules
    );
    if (!isViewAllowedForModules(raw, enabled)) return "Dashboard";
    return raw;
  }, [searchParams, canonicalOrgId, organizationModules]);
  const [activeView, setActiveView] = useState<ViewId>(activeViewFromUrl);
  useEffect(() => {
    setActiveView(activeViewFromUrl);
  }, [activeViewFromUrl]);

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

  useEffect(() => {
    if (projects.length === 0 || !canonicalOrgId || !selectedProjectId) return;
    const p = new URLSearchParams(
      typeof window !== "undefined"
        ? window.location.search
        : searchParams.toString()
    );
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

  const isOwnerOfSelectedProject = useMemo(() => {
    if (!selectedProjectId || !userId) return false;
    return projectMembers.some(
      (m) =>
        m.project_id === selectedProjectId &&
        m.user_id === userId &&
        m.role === "owner"
    );
  }, [projectMembers, selectedProjectId, userId]);

  const selectedTask = useMemo(
    () => issues.find((i) => i.id === selectedTaskId) ?? null,
    [issues, selectedTaskId]
  );
  useEffect(() => {
    if (!selectedProjectId) {
      setHierarchyLabels({});
      return;
    }
    const p = projects.find((x) => x.id === selectedProjectId);
    setHierarchyLabels(parseHierarchyLabelsFromDb(p?.hierarchy_labels));
  }, [selectedProjectId, projects]);

  const handleProjectPropertiesSave = useCallback(
    async (payload: {
      name: string;
      description: string;
      hierarchyLabels: Record<number, string>;
    }): Promise<{ error: string | null }> => {
      if (!selectedProjectId) {
        return { error: "Project tidak dipilih" };
      }
      setProjectPropertiesPending(true);
      try {
        const r = await updateProjectPropertiesAction({
          projectId: selectedProjectId,
          name: payload.name,
          description: payload.description,
          hierarchyLabels: payload.hierarchyLabels,
        });
        if (!r.error) {
          setHierarchyLabels(payload.hierarchyLabels);
          router.refresh();
        }
        return r;
      } finally {
        setProjectPropertiesPending(false);
      }
    },
    [selectedProjectId, router]
  );
  const labelForDepth = useCallback(
    (depth: number): string => {
      const custom = hierarchyLabels[depth]?.trim();
      if (custom) return custom;
      return defaultHierarchyLabel(depth);
    },
    [hierarchyLabels]
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

  const projectIssueDepthById = useMemo(() => {
    const out = new Map<string, number>();
    if (!selectedProjectId) return out;
    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    const childByParent = new Map<string, IssueRow[]>();
    for (const issue of projectIssues) {
      if (!issue.parent_id) continue;
      const arr = childByParent.get(issue.parent_id) ?? [];
      arr.push(issue);
      childByParent.set(issue.parent_id, arr);
    }
    const roots = projectIssues
      .filter((i) => !i.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const queue: Array<{ id: string; depth: number }> = roots.map((r) => ({
      id: r.id,
      depth: 0,
    }));
    while (queue.length > 0) {
      const current = queue.shift() as { id: string; depth: number };
      if (out.has(current.id)) continue;
      out.set(current.id, current.depth);
      const children = (childByParent.get(current.id) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order
      );
      for (const child of children) {
        queue.push({ id: child.id, depth: current.depth + 1 });
      }
    }
    return out;
  }, [issues, selectedProjectId]);
  const hierarchySummaryRows = useMemo(() => {
    if (!selectedProjectId)
      return [] as Array<{
        depth: number;
        count: number;
        doneCount: number;
        completionPct: number;
        title: string;
        countLabel: string;
      }>;
    const categoryByStatusId = new Map(
      statusesForProject.map((s) => [s.id, s.category])
    );
    const summaryByDepth = new Map<number, { count: number; doneCount: number }>();
    for (const issue of issues) {
      if (issue.project_id !== selectedProjectId) continue;
      const depth = projectIssueDepthById.get(issue.id);
      if (depth == null) continue;
      const current = summaryByDepth.get(depth) ?? { count: 0, doneCount: 0 };
      current.count += 1;
      const category = issue.status_id
        ? categoryByStatusId.get(issue.status_id)
        : "todo";
      if (category === "done") current.doneCount += 1;
      summaryByDepth.set(depth, current);
    }
    return [...summaryByDepth.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, v]) => ({
        depth,
        count: v.count,
        doneCount: v.doneCount,
        completionPct: v.count > 0 ? (v.doneCount / v.count) * 100 : 0,
        title: labelForDepth(depth),
        countLabel: labelForDepth(depth),
      }));
  }, [
    issues,
    labelForDepth,
    projectIssueDepthById,
    selectedProjectId,
    statusesForProject,
  ]);

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

  /** `feature_key` geometri yang sudah tersimpan untuk unit kerja aktif (perbandingan case-insensitive). */
  const geometryKeysLowerForSelectedTask = useMemo(() => {
    if (!selectedProjectId || !selectedTaskId) return new Set<string>();
    return new Set(
      issueGeometryFeatureMap
        .filter(
          (g) =>
            g.project_id === selectedProjectId && g.issue_id === selectedTaskId
        )
        .map((g) => g.feature_key.trim().toLowerCase())
        .filter((k) => k.length > 0)
    );
  }, [issueGeometryFeatureMap, selectedProjectId, selectedTaskId]);

  /** `feature_key` dari atribut unit kerja ini yang belum punya geometri — saran impor DXF. */
  const mapDxfAttributeKeysWithoutGeometry = useMemo(() => {
    if (!selectedTaskId || !selectedProjectId) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of issueFeatureAttributes) {
      if (a.issue_id !== selectedTaskId || a.project_id !== selectedProjectId) {
        continue;
      }
      const low = a.feature_key.toLowerCase();
      if (geometryKeysLowerForSelectedTask.has(low)) continue;
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(a.feature_key);
    }
    out.sort((x, y) => x.localeCompare(y));
    return out;
  }, [
    geometryKeysLowerForSelectedTask,
    issueFeatureAttributes,
    selectedProjectId,
    selectedTaskId,
  ]);

  const mapDxfPreviewFeatureCollection = useMemo(() => {
    if (mapDxfPreviewRings.length === 0) {
      return { fc: null as GeoJSON.FeatureCollection | null, err: null as string | null };
    }
    const srid = Number.parseInt(mapGeomSourceSrid.trim(), 10);
    if (!Number.isFinite(srid) || !isPreviewSourceSridSupported(srid)) {
      return {
        fc: null,
        err: "SRID sumber tidak didukung untuk pratinjau peta.",
      };
    }
    try {
      const fc = dxfRingsToWgs84PreviewFeatureCollection(mapDxfPreviewRings, srid);
      return { fc, err: null };
    } catch (e) {
      return {
        fc: null,
        err:
          e instanceof Error
            ? e.message
            : "Gagal memproyeksikan koordinat untuk pratinjau.",
      };
    }
  }, [mapDxfPreviewRings, mapGeomSourceSrid]);

  const dxfMappingRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const handleDxfPreviewPolygonClick = useCallback((idx: number) => {
    setMapDxfHighlightRow(idx);
  }, []);

  useEffect(() => {
    setMapDxfHighlightRow(null);
  }, [mapDxfPolygonCount, mapDxfLayer]);

  useEffect(() => {
    if (mapDxfHighlightRow == null) return;
    const el = dxfMappingRowRefs.current[mapDxfHighlightRow];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mapDxfHighlightRow]);

  const issueGeometryVisibleForMap = useMemo(() => {
    if (!issueIdsInSelectedTaskSubtree) return issueGeometryForSelectedProject;
    return issueGeometryForSelectedProject.filter((g) =>
      issueIdsInSelectedTaskSubtree.has(g.issue_id)
    );
  }, [issueGeometryForSelectedProject, issueIdsInSelectedTaskSubtree]);

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
      const geoRows = issueGeometryForSelectedProject
        .filter((g) =>
          issueIdsInSelectedTaskSubtree
            ? issueIdsInSelectedTaskSubtree.has(g.issue_id)
            : true
        )
        .map(
          (g): SpatialAttributeTableRow => ({
            id: `geom:${g.id}`,
            issue_id: g.issue_id,
            feature_key: g.feature_key,
            properties: g.properties,
            geometryFeatureId: g.id,
          })
        );

      const existingKey = new Set(
        geoRows.map((r) => `${r.issue_id}::${r.feature_key.toLowerCase()}`)
      );
      const attrRows = issueFeatureAttributes
        .filter((a) => a.project_id === selectedProjectId)
        .filter((a) =>
          issueIdsInSelectedTaskSubtree
            ? issueIdsInSelectedTaskSubtree.has(a.issue_id)
            : true
        )
        .filter((a) => {
          const k = `${a.issue_id}::${a.feature_key.toLowerCase()}`;
          return !existingKey.has(k);
        })
        .map(
          (a): SpatialAttributeTableRow => ({
            id: `attr:${a.id}`,
            issue_id: a.issue_id,
            feature_key: a.feature_key,
            properties: a.payload,
            geometryFeatureId: null,
          })
        );

      return [...geoRows, ...attrRows]
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
      issueFeatureAttributes,
      issueIdsInSelectedTaskSubtree,
      selectedProjectId,
      issueTitleById,
    ]
  );

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

  const memberNameByUserId = useMemo(() => {
    const out = new Map<string, string>();
    for (const member of projectMembersForSelectedProject) {
      out.set(member.user_id, member.display_name?.trim() || member.user_id);
    }
    return out;
  }, [projectMembersForSelectedProject]);

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
      const children = issues
        .filter((i) => i.parent_id === selectedTaskId)
        .sort((a, b) => a.sort_order - b.sort_order);
      /** Baris unit terpilih tidak ditampilkan; hanya turunan langsungnya. */
      return children.map((issue) => ({ issue, depth: 0 }));
    }
    return issues
      .filter((i) => i.project_id === selectedProjectId && !i.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((issue) => ({ issue, depth: 0 }));
  }, [selectedProjectId, selectedTaskId, issues]);

  /** Label tab Tabel mengikuti properti project & kedalaman scope. */
  const tabelViewUi = useMemo(() => {
    if (!selectedProjectId) {
      return {
        panelTitle: labelForDepth(0),
        addTargetLabel: labelForDepth(0),
        indukFieldLabel: "Project",
        indukDisplay: "—",
        parentColumnHeader: "Project",
      };
    }
    if (!selectedTaskId) {
      return {
        panelTitle: labelForDepth(0),
        addTargetLabel: labelForDepth(0),
        indukFieldLabel: "Project",
        indukDisplay: selectedProject?.name ?? "—",
        parentColumnHeader: "Project",
      };
    }
    const pd = projectIssueDepthById.get(selectedTaskId) ?? 0;
    return {
      panelTitle: labelForDepth(pd + 1),
      addTargetLabel: labelForDepth(pd + 1),
      indukFieldLabel: labelForDepth(pd),
      indukDisplay: selectedTask?.title ?? "—",
      parentColumnHeader: labelForDepth(pd),
    };
  }, [
    selectedProjectId,
    selectedTaskId,
    selectedProject?.name,
    selectedTask?.title,
    labelForDepth,
    projectIssueDepthById,
  ]);
  const statusById = useMemo(
    () => new Map(statusesForProject.map((s) => [s.id, s])),
    [statusesForProject]
  );
  const issueProgressById = useMemo(() => {
    if (!selectedProjectId) return new Map<string, number>();
    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    return computeWeightedProgressByIssue(projectIssues, statusById);
  }, [issues, selectedProjectId, statusById]);
  const completionBars = useMemo(() => {
    const empty = {
      title: "Progres penyelesaian",
      subtitle: "Pilih project untuk melihat progres.",
      rows: [] as CompletionBarRow[],
    };
    if (!selectedProjectId) return empty;

    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    const rowsBase = selectedTaskId
      ? projectIssues.filter((i) => i.parent_id === selectedTaskId)
      : projectIssues.filter((i) => !i.parent_id);
    const sorted = rowsBase.sort((a, b) => a.sort_order - b.sort_order);
    const rows = sorted.map((i) => ({
      id: i.id,
      title: i.title,
      percent: Math.max(0, Math.min(100, issueProgressById.get(i.id) ?? 0)),
    }));

    return {
      title: "Progres penyelesaian",
      subtitle: selectedTaskId
        ? (selectedTask?.title ?? "—")
        : (selectedProject?.name ?? "—"),
      rows,
    };
  }, [issueProgressById, issues, selectedProject?.name, selectedProjectId, selectedTask?.title, selectedTaskId]);

  /**
   * Distribusi status (To Do / On Progress / Done) pada **issue daun** dalam scope yang sama
   * dengan batang (seluruh project jika akar; subtree unit jika `selectedTaskId`).
   */
  const completionStatusPie = useMemo(() => {
    const empty = { todo: 0, inProgress: 0, done: 0 };
    if (!selectedProjectId) return empty;
    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    const leaves = collectLeafIssuesForDashboardPie(
      projectIssues,
      selectedTaskId ?? null
    );
    let todo = 0;
    let inProgress = 0;
    let done = 0;
    for (const issue of leaves) {
      const cat = issue.status_id
        ? (statusById.get(issue.status_id)?.category ?? null)
        : null;
      if (cat === "done") done += 1;
      else if (cat === "in_progress") inProgress += 1;
      else todo += 1;
    }
    return { todo, inProgress, done };
  }, [issues, selectedProjectId, selectedTaskId, statusById]);

  const subtreeVillageProgress = useMemo(() => {
    if (!selectedProjectId || !selectedTaskId) {
      return { milestoneTitles: [] as string[], rows: [] as SubtreeVillageProgressRow[] };
    }
    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    const childByParent = buildIssuesChildByParentForMonitoring(projectIssues);
    return computeVillageProgressForParent(
      childByParent,
      selectedTaskId,
      statusById,
      null
    );
  }, [issues, selectedProjectId, selectedTaskId, statusById]);

  const monitoringView = useMemo(() => {
    if (!selectedProjectId) return null;
    /** Matriks monitoring hanya saat unit kerja dipilih; di akar project tidak ditampilkan. */
    if (selectedTaskId && selectedTask && subtreeVillageProgress.rows.length > 0) {
      const parentDepth = projectIssueDepthById.get(selectedTask.id) ?? 0;
      return {
        title: selectedTask.title,
        parentHeader: labelForDepth(parentDepth),
        rowHeader: labelForDepth(parentDepth + 1),
        /** Anak dari baris matriks (mis. tugas di bawah desa); dipakai dialog duplikasi & salin. */
        leafHeader: labelForDepth(parentDepth + 2),
        milestoneTitles: subtreeVillageProgress.milestoneTitles,
        rows: subtreeVillageProgress.rows,
      };
    }
    return null;
  }, [
    selectedProjectId,
    selectedTaskId,
    selectedTask,
    subtreeVillageProgress,
    labelForDepth,
    projectIssueDepthById,
  ]);

  const projectWideMilestoneTitles = useMemo(() => {
    if (!selectedProjectId) return [] as string[];
    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    const childByParent = buildIssuesChildByParentForMonitoring(projectIssues);
    const roots = projectIssues
      .filter((i) => !i.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const order: string[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
      for (const v of childByParent.get(root.id) ?? []) {
        for (const m of childByParent.get(v.id) ?? []) {
          if (!seen.has(m.title)) {
            seen.add(m.title);
            order.push(m.title);
          }
        }
      }
    }
    return order;
  }, [issues, selectedProjectId]);

  const projectMonitoringBlocks = useMemo((): ProjectMonitoringBlock[] => {
    if (!selectedProjectId || selectedTaskId) return [];
    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    const childByParent = buildIssuesChildByParentForMonitoring(projectIssues);
    const roots = projectIssues
      .filter((i) => !i.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const columns =
      projectWideMilestoneTitles.length > 0 ? projectWideMilestoneTitles : null;
    const blocks: ProjectMonitoringBlock[] = [];
    for (const root of roots) {
      const { rows, milestoneTitles } = computeVillageProgressForParent(
        childByParent,
        root.id,
        statusById,
        columns
      );
      if (rows.length === 0) continue;
      blocks.push({
        rootId: root.id,
        rootTitle: root.title,
        parentHeader: labelForDepth(0),
        rowHeader: labelForDepth(1),
        leafHeader: labelForDepth(2),
        milestoneTitles,
        rows,
      });
    }
    return blocks;
  }, [
    selectedProjectId,
    selectedTaskId,
    issues,
    statusById,
    labelForDepth,
    projectWideMilestoneTitles,
  ]);

  const replaceQuery = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.replace(`/?${p.toString()}`, { scroll: false });
  };

  /** Hanya mengubah `task` — tidak memicu RSC; data server tidak bergantung pada query `task`. */
  const commitTaskSelection = useCallback(
    (issueId: string | null) => {
      if (!selectedProjectId) return;
      const proj = projects.find((p) => p.id === selectedProjectId);
      setSelectedTaskId(issueId);
      const q = new URLSearchParams(
        typeof window !== "undefined"
          ? window.location.search
          : searchParams.toString()
      );
      if (proj) q.set("org", proj.organization_id);
      q.set("project", selectedProjectId);
      if (issueId) q.set("task", issueId);
      else q.delete("task");
      if (typeof window !== "undefined") {
        window.history.replaceState(
          window.history.state,
          "",
          `/?${q.toString()}`
        );
      }
    },
    [selectedProjectId, projects, searchParams]
  );

  const selectIssueInScope = (issueId: string) => {
    commitTaskSelection(issueId);
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

    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="max-w-lg rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">
          <p className="font-semibold">Gagal memuat data workspace</p>
          <p className="mt-2 text-red-700">
            Aplikasi belum dapat mengambil data. Coba muat ulang halaman.
          </p>
          <p className="mt-4 text-muted-foreground">
            Jika masalah berlanjut, hubungi admin sistem untuk memeriksa
            konfigurasi layanan data dan akses akun.
          </p>
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
            Anda belum memiliki akses ke project mana pun. Minta pemilik project
            menambahkan email Anda sebagai anggota, lalu muat ulang halaman.
          </p>
          {userEmail && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium text-foreground dark:text-amber-50">
                Sudah punya akun tapi daftar project kosong?
              </p>
              <p className="mt-2">
                Anda masuk sebagai <span className="font-mono">{userEmail}</span>.
                Owner harus mengetik email <strong>yang sama</strong> di tombol +{" "}
                Anggota (setelah Anda punya akun). Setelah mereka menambahkan,
                tekan{" "}
                <a
                  className="font-medium text-primary underline underline-offset-2"
                  href="/"
                >
                  muat ulang halaman
                </a>{" "}
                atau keluar lalu masuk lagi. Minta owner memastikan tidak ada
                pesan error merah setelah klik &quot;Tambahkan ke project&quot;.
              </p>
            </div>
          )}
          {joinError && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-red-900">
              {joinError}
            </p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Jika akun tetap belum mendapat akses, minta admin memeriksa data
            keanggotaan project Anda di sistem.
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
    <div className="flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      {pilotBannerOn ? (
        <div
          role="status"
          className="shrink-0 border-b border-primary/25 bg-primary/10 px-4 py-2 text-center text-xs font-medium text-foreground"
        >
          {pilotBannerText}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background">
      <div
        className={`relative flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden bg-sidebar/95 transition-[width] duration-300 ease-in-out motion-reduce:transition-none ${
          isSidebarCollapsed ? "w-0 border-transparent" : "w-80 border-r border-sidebar-border/90"
        }`}
      >
      <aside
        className="flex min-h-0 h-full min-w-0 w-80 flex-1 basis-0 flex-col overflow-hidden font-sans text-sidebar-foreground"
        aria-hidden={isSidebarCollapsed}
        inert={isSidebarCollapsed ? true : undefined}
      >
        <ScrollArea className="min-h-0 flex-1" type="scroll">
          <div className="px-5 pt-0 pb-5">
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Organisasi
            </p>
            <Dialog
              open={organizationDialogOpen}
              onOpenChange={(open) => {
                setOrganizationDialogOpen(open);
                if (open) setOrganizationMsg(null);
              }}
            >
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                + Organisasi
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tambah organisasi baru</DialogTitle>
                  <DialogDescription>
                    Buat organisasi baru beserta project pertamanya. Anda akan
                    otomatis menjadi owner di project tersebut.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="grid gap-3"
                  action={(fd) => {
                    setOrganizationMsg(null);
                    startTaskTransition(async () => {
                      const r = await createOrganizationProjectInlineAction(fd);
                      if (r.error) {
                        setOrganizationMsg(r.error);
                        return;
                      }
                      if (r.organizationId && r.projectId) {
                        replaceQuery((q) => {
                          q.set("org", r.organizationId as string);
                          q.set("project", r.projectId as string);
                          q.delete("task");
                        });
                      }
                      setOrganizationDialogOpen(false);
                      router.refresh();
                    });
                  }}
                >
                  <div className="space-y-1">
                    <Label>Nama organisasi *</Label>
                    <Input
                      name="organization_name"
                      required
                      placeholder="Contoh: KJSB Cirebon"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Slug organisasi (opsional)</Label>
                    <Input name="organization_slug" placeholder="kjsb-cirebon" />
                  </div>
                  <div className="space-y-1">
                    <Label>Nama project pertama *</Label>
                    <Input
                      name="project_name"
                      required
                      placeholder="Contoh: PLM Cirebon 2028"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Kode project (opsional)</Label>
                    <Input name="project_key" placeholder="PLM28" />
                  </div>
                  <div className="space-y-1">
                    <Label>Deskripsi project (opsional)</Label>
                    <Textarea
                      name="project_description"
                      rows={3}
                      placeholder="Catatan singkat project"
                    />
                  </div>
                  <Button type="submit" disabled={taskPending}>
                    Buat organisasi & project
                  </Button>
                  {organizationMsg && (
                    <p className="text-xs text-red-600" role="alert">
                      {organizationMsg}
                    </p>
                  )}
                </form>
              </DialogContent>
            </Dialog>
          </div>
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
                        berdasarkan email. Hanya owner project yang bisa. Email
                        harus sudah punya akun di aplikasi (sudah daftar /
                        login minimal sekali); undangan ke email yang belum
                        terdaftar akan ditolak sampai user itu mendaftar.
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
                        Buat project baru di organisasi aktif (Anda jadi owner).
                        Ini bukan mengundang user: orang lain tidak otomatis
                        masuk. Untuk menambahkan rekan ke project yang sudah ada,
                        pilih project di sidebar lalu gunakan tombol + Anggota.
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
                      if (p.id === selectedProjectId) {
                        commitTaskSelection(null);
                        return;
                      }
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
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                        collapsedProjectIds.has(p.id) ? "" : "rotate-90"
                      }`}
                    />
                  </Button>
                </div>
                <div
                  className={`overflow-hidden transition-[max-height] duration-300 ease-in-out motion-reduce:transition-none ${
                    collapsedProjectIds.has(p.id) ? "max-h-0" : "max-h-[min(80vh,4000px)]"
                  }`}
                >
                <ul className="ml-3 mt-1 flex flex-col gap-0 border-l border-sidebar-border/70 pl-2">
                  {treeRowsForSidebar.map(({ issue: t, depth }) => {
                    const isTask = selectedTaskId === t.id;
                    const showChevron = sidebarParentIdsWithVisibleChildren.has(t.id);
                    const isCollapsed = collapsedIssueIds.has(t.id);
                    const rowExpanded = isSidebarIssueRowExpanded(
                      t,
                      parentByIssueId,
                      collapsedIssueIds
                    );
                    return (
                      <li
                        key={t.id}
                        style={{ paddingLeft: depth * 12 }}
                        aria-hidden={!rowExpanded}
                        className={`min-h-0 overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none ${
                          rowExpanded
                            ? "mb-0.5 max-h-40 opacity-100"
                            : "pointer-events-none mb-0 max-h-0 opacity-0"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (p.id !== selectedProjectId) {
                                replaceQuery((q) => {
                                  q.set("org", p.organization_id);
                                  q.set("project", p.id);
                                  q.set("task", t.id);
                                });
                              } else {
                                commitTaskSelection(t.id);
                              }
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
                              <ChevronRight
                                className={`h-3.5 w-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                                  isCollapsed ? "" : "rotate-90"
                                }`}
                              />
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                </div>
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
        {/* Panel pengaturan modul organisasi disembunyikan sementara saat fase pilot. */}
          </div>
        </ScrollArea>
      </aside>
      </div>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/30">
        <Tabs
          value={activeView}
          onValueChange={(value) => {
            const v = value as ViewId;
            setActiveView(v);
            const q = new URLSearchParams(searchParams.toString());
            q.set("view", viewToParam(v));
            if (v !== "Berkas" && v !== "Map") {
              q.delete("berkas");
            }
            const next = `/?${q.toString()}`;
            window.history.replaceState(window.history.state, "", next);
          }}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
        >
        <header className="shrink-0 border-b border-border bg-card/90 px-6 py-4">
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

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScrollArea
            className="min-h-0 flex-1"
            type="scroll"
            fillAvailableHeight={activeView === "Map"}
          >
            <div
              className={cn(
                "flex w-full flex-col p-6",
                activeView === "Map"
                  ? "box-border h-full min-h-0 flex-1 basis-0 overflow-hidden"
                  : "min-h-full"
              )}
            >
            <TabsList className="mb-4 h-auto min-h-9 w-full max-w-full shrink-0 flex-wrap justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground sm:flex-nowrap">
              {visibleViews.map((view) => (
                <TabsTrigger key={view} value={view} className="px-2.5 sm:px-3">
                  {view}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="Dashboard" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <>
                {selectedProjectId && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-semibold tracking-tight text-foreground">
                        {selectedProject?.name ?? "—"}
                      </h2>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!selectedTaskId && selectedProject ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={taskPending}
                            onClick={() => {
                              setTaskMsg(null);
                              setMonitoringAddChildContext({
                                parentId: null,
                                parentTitle: selectedProject.name,
                                parentHeader: "Project",
                                rowHeader: labelForDepth(0),
                                leafHeader: labelForDepth(1),
                              });
                              setMonitoringAddChildFormNonce((n) => n + 1);
                              setMonitoringAddChildOpen(true);
                            }}
                          >
                            + {labelForDepth(0)}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setProjectPropertiesOpen(true)}
                          disabled={!selectedProject}
                        >
                          Properti project
                        </Button>
                      </div>
                    </div>
                    <ProjectPropertiesDialog
                      open={projectPropertiesOpen}
                      onOpenChange={setProjectPropertiesOpen}
                      project={selectedProject}
                      hierarchyLabels={hierarchyLabels}
                      canEditNameAndDescription={isOwnerOfSelectedProject}
                      onSave={handleProjectPropertiesSave}
                      savePending={projectPropertiesPending}
                    />
                    {hierarchySummaryRows.length === 0 ? (
                      <>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Belum ada data unit kerja pada project ini.
                        </p>
                        <div className="mt-6 flex min-h-0 min-w-0 flex-col gap-4 lg:min-w-0 lg:flex-row lg:items-stretch lg:gap-4">
                          <div
                            className={`${DASHBOARD_GRADIENT_CARD} flex min-h-0 min-w-0 flex-1 flex-col p-5 lg:min-w-0 lg:basis-0`}
                          >
                            <div className="mb-3 shrink-0">
                              <p className="text-sm font-semibold text-foreground">
                                {completionBars.title}
                              </p>
                              <p className="text-xs text-muted-foreground">{completionBars.subtitle}</p>
                            </div>
                            {completionBars.rows.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Belum ada unit kerja pada scope terpilih.
                              </p>
                            ) : (
                              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden lg:min-h-0">
                                <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col lg:min-h-0">
                                  <div className="relative flex min-h-0 flex-1 flex-col px-3 pt-3 pb-2 lg:min-h-0">
                                    <div className="relative flex min-h-48 flex-1 flex-col">
                                      <div className="pointer-events-none absolute inset-x-3 top-0 bottom-0">
                                        <div className="flex h-full flex-col justify-between">
                                          <div className="border-b border-border/60" />
                                          <div className="border-b border-border/40" />
                                          <div className="border-b border-border/40" />
                                          <div className="border-b border-border/40" />
                                        </div>
                                      </div>
                                      <div className="relative z-[1] flex flex-1 min-h-0 w-full min-w-0 items-stretch gap-1.5 sm:gap-2 md:gap-3">
                                        {completionBars.rows.map((row, idx) => (
                                          <div
                                            key={`completion-slot-${idx}`}
                                            className="relative flex h-full min-w-0 flex-1 basis-0 flex-col items-center"
                                          >
                                            <div className="flex min-h-0 w-full max-w-[64px] flex-1 flex-col justify-end">
                                              <div className="flex min-h-0 w-full flex-1 flex-col justify-end">
                                                <div
                                                  className={`w-full max-w-[64px] rounded-md transition-[height,opacity,box-shadow] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[height] motion-reduce:transition-none ${completionBarClass(row.percent)}`}
                                                  style={{ height: `${Math.max(6, row.percent)}%` }}
                                                />
                                              </div>
                                            </div>
                                            <span
                                              className="pointer-events-none absolute left-1/2 z-[2] max-w-[calc(100%-4px)] -translate-x-1/2 truncate text-center text-[11px] text-foreground tabular-nums transition-[color,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                                              style={{
                                                bottom: `calc(${Math.max(6, row.percent)}% + 0.125rem)`,
                                              }}
                                            >
                                              {row.percent.toFixed(1)}%
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="mt-2 flex min-w-0 shrink-0 gap-1.5 sm:gap-2 md:gap-3">
                                      {completionBars.rows.map((row, idx) => (
                                        <span
                                          key={`completion-slot-${idx}-label`}
                                          className="min-w-0 flex-1 basis-0 truncate text-center text-[11px] text-foreground sm:text-xs"
                                        >
                                          {row.title}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div
                            className={`${DASHBOARD_GRADIENT_CARD} flex min-h-0 min-w-0 flex-1 flex-col p-5 lg:min-w-0 lg:basis-0`}
                          >
                            <div className="flex min-h-0 flex-1 flex-col justify-center">
                              <DashboardStatusPieBlock
                                todo={completionStatusPie.todo}
                                inProgress={completionStatusPie.inProgress}
                                done={completionStatusPie.done}
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 flex min-h-0 flex-col gap-4 lg:flex-row lg:items-stretch">
                        <div className="flex w-full flex-col gap-2 lg:w-72 lg:max-w-xs lg:shrink-0">
                          {hierarchySummaryRows.map((row) => (
                            <Card key={`h:${row.depth}`} className={DASHBOARD_GRADIENT_CARD}>
                              <CardContent className="p-5">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-sans text-sm font-medium leading-none tracking-normal text-muted-foreground/90">
                                    {row.title}
                                  </p>
                                  <Badge className={`rounded-full px-2 py-0 font-sans text-[10px] font-semibold leading-5 ${completionBadgeClass(row.completionPct)}`}>
                                    {row.completionPct.toFixed(1)}% selesai
                                  </Badge>
                                </div>
                                <p className="mt-2 font-sans text-4xl font-bold leading-none tracking-normal text-foreground tabular-nums">
                                  {row.count.toLocaleString("id-ID")}
                                </p>
                                <p className="mt-5 font-sans text-base font-semibold leading-snug tracking-normal text-foreground">
                                  {row.doneCount.toLocaleString("id-ID")} dari{" "}
                                  {row.count.toLocaleString("id-ID")}{" "}
                                  {row.countLabel.toLowerCase()} selesai
                                </p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:min-w-0 lg:flex-row lg:items-stretch lg:gap-4">
                          <div
                            className={`${DASHBOARD_GRADIENT_CARD} flex min-h-0 min-w-0 flex-1 flex-col p-5 lg:min-w-0 lg:basis-0`}
                          >
                            <div className="mb-3 shrink-0">
                              <p className="text-sm font-semibold text-foreground">
                                {completionBars.title}
                              </p>
                              <p className="text-xs text-muted-foreground">{completionBars.subtitle}</p>
                            </div>
                            {completionBars.rows.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Belum ada unit kerja pada scope terpilih.
                              </p>
                            ) : (
                              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
                                <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden lg:min-h-0">
                                  <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col lg:min-h-0">
                                    <div className="relative flex min-h-0 flex-1 flex-col px-3 pt-1 lg:min-h-0">
                                      <div className="relative flex min-h-48 flex-1 flex-col">
                                        <div className="pointer-events-none absolute inset-x-3 top-0 bottom-0">
                                          <div className="flex h-full flex-col justify-between">
                                            <div className="border-b border-border/60" />
                                            <div className="border-b border-border/40" />
                                            <div className="border-b border-border/40" />
                                            <div className="border-b border-border/40" />
                                          </div>
                                        </div>
                                        <div className="relative z-[1] flex flex-1 min-h-0 w-full min-w-0 items-stretch gap-1.5 sm:gap-2 md:gap-3">
                                          {completionBars.rows.map((row, idx) => (
                                            <div
                                              key={`completion-slot-${idx}`}
                                              className="relative flex h-full min-w-0 flex-1 basis-0 flex-col items-center"
                                            >
                                              <div className="flex min-h-0 w-full max-w-[64px] flex-1 flex-col justify-end">
                                                <div className="flex min-h-0 w-full flex-1 flex-col justify-end">
                                                  <div
                                                    className={`w-full max-w-[64px] rounded-md transition-[height,opacity,box-shadow] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[height] motion-reduce:transition-none ${completionBarClass(row.percent)}`}
                                                    style={{ height: `${Math.max(6, row.percent)}%` }}
                                                  />
                                                </div>
                                              </div>
                                              <span
                                                className="pointer-events-none absolute left-1/2 z-[2] max-w-[calc(100%-4px)] -translate-x-1/2 truncate text-center text-[11px] text-foreground tabular-nums transition-[color,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                                                style={{
                                                  bottom: `calc(${Math.max(6, row.percent)}% + 0.125rem)`,
                                                }}
                                              >
                                                {row.percent.toFixed(1)}%
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="mt-2 flex min-w-0 shrink-0 gap-1.5 pb-1 sm:gap-2 md:gap-3">
                                        {completionBars.rows.map((row, idx) => (
                                          <span
                                            key={`completion-slot-${idx}-label`}
                                            className="min-w-0 flex-1 basis-0 truncate text-center text-[11px] text-foreground sm:text-xs"
                                          >
                                            {row.title}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div
                            className={`${DASHBOARD_GRADIENT_CARD} flex min-h-0 min-w-0 flex-1 flex-col p-5 lg:min-w-0 lg:basis-0`}
                          >
                            <div className="flex min-h-0 flex-1 flex-col justify-center">
                              <DashboardStatusPieBlock
                                todo={completionStatusPie.todo}
                                inProgress={completionStatusPie.inProgress}
                                done={completionStatusPie.done}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {monitoringView && (
                  <MonitoringMatrixCard
                    blockTitle={monitoringView.title}
                    rowHeader={monitoringView.rowHeader}
                    leafHeader={monitoringView.leafHeader}
                    milestoneTitles={monitoringView.milestoneTitles}
                    rows={monitoringView.rows}
                    onAddChild={() => {
                      if (!selectedTaskId) return;
                      setTaskMsg(null);
                      setMonitoringAddChildContext({
                        parentId: selectedTaskId,
                        parentTitle: monitoringView.title,
                        parentHeader: monitoringView.parentHeader,
                        rowHeader: monitoringView.rowHeader,
                        leafHeader: monitoringView.leafHeader,
                      });
                      setMonitoringAddChildFormNonce((n) => n + 1);
                      setMonitoringAddChildOpen(true);
                    }}
                    addChildDisabled={
                      taskPending || !selectedProjectId || !selectedTaskId
                    }
                    selectedProjectId={selectedProjectId}
                    taskPending={taskPending}
                    memberNameByUserId={memberNameByUserId}
                    taskCloneDialog={taskCloneDialog}
                    setTaskCloneDialog={setTaskCloneDialog}
                    setTaskMsg={setTaskMsg}
                    startTaskTransition={startTaskTransition}
                    onAfterMutation={() => router.refresh()}
                    setTaskNoteEditor={setTaskNoteEditor}
                    taskMsg={taskMsg}
                  />
                )}
                {!selectedTaskId &&
                  selectedProjectId &&
                  projectMonitoringBlocks.length > 0 && (
                    <div className="mt-8 space-y-8">
                      {projectMonitoringBlocks.map((block) => (
                        <MonitoringMatrixCard
                          key={block.rootId}
                          rootClassName=""
                          blockTitle={block.rootTitle}
                          rowHeader={block.rowHeader}
                          leafHeader={block.leafHeader}
                          milestoneTitles={block.milestoneTitles}
                          rows={block.rows}
                          onAddChild={() => {
                            setTaskMsg(null);
                            setMonitoringAddChildContext({
                              parentId: block.rootId,
                              parentTitle: block.rootTitle,
                              parentHeader: block.parentHeader,
                              rowHeader: block.rowHeader,
                              leafHeader: block.leafHeader,
                            });
                            setMonitoringAddChildFormNonce((n) => n + 1);
                            setMonitoringAddChildOpen(true);
                          }}
                          addChildDisabled={taskPending || !selectedProjectId}
                          selectedProjectId={selectedProjectId}
                          taskPending={taskPending}
                          memberNameByUserId={memberNameByUserId}
                          taskCloneDialog={taskCloneDialog}
                          setTaskCloneDialog={setTaskCloneDialog}
                          setTaskMsg={setTaskMsg}
                          startTaskTransition={startTaskTransition}
                          onAfterMutation={() => router.refresh()}
                          setTaskNoteEditor={setTaskNoteEditor}
                          taskMsg={taskMsg}
                        />
                      ))}
                    </div>
                  )}
                <Dialog
                  open={monitoringAddChildOpen && monitoringAddChildContext != null}
                  onOpenChange={(open) => {
                    setMonitoringAddChildOpen(open);
                    if (!open) setMonitoringAddChildContext(null);
                  }}
                >
                  {monitoringAddChildContext ? (
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>
                          Tambah {monitoringAddChildContext.rowHeader}
                        </DialogTitle>
                        <DialogDescription>
                          {monitoringAddChildContext.parentId == null ? (
                            <>
                              {monitoringAddChildContext.rowHeader} baru ditambahkan sebagai unit kerja
                              tingkat atas pada project{" "}
                              <span className="font-medium text-foreground">
                                {monitoringAddChildContext.parentTitle}
                              </span>
                              . Turunan ({monitoringAddChildContext.leafHeader}) dapat ditambahkan lewat
                              tabel di bawah atau tab Tabel.
                            </>
                          ) : (
                            <>
                              {monitoringAddChildContext.rowHeader} baru menjadi turunan langsung dari{" "}
                              <span className="font-medium text-foreground">
                                {monitoringAddChildContext.parentTitle}
                              </span>{" "}
                              ({monitoringAddChildContext.parentHeader}). Kolom{" "}
                              {monitoringAddChildContext.leafHeader} mengikuti data yang sudah ada.
                            </>
                          )}
                        </DialogDescription>
                      </DialogHeader>
                      <form
                        key={monitoringAddChildFormNonce}
                        className="grid gap-3"
                        action={(fd) => {
                          if (!selectedProjectId || !monitoringAddChildContext) return;
                          setTaskMsg(null);
                          fd.set("project_id", selectedProjectId);
                          if (monitoringAddChildContext.parentId) {
                            fd.set("parent_id", monitoringAddChildContext.parentId);
                          }
                          if (defaultStatusId) fd.set("status_id", defaultStatusId);
                          startTaskTransition(async () => {
                            const r = await createProjectTaskAction(fd);
                            if (r.error) {
                              setTaskMsg(r.error);
                              return;
                            }
                            setMonitoringAddChildOpen(false);
                            setMonitoringAddChildContext(null);
                            router.refresh();
                          });
                        }}
                      >
                        <div className="space-y-1">
                          <Label>{monitoringAddChildContext.parentHeader}</Label>
                          <Input value={monitoringAddChildContext.parentTitle} disabled />
                        </div>
                        <div className="space-y-1">
                          <Label>Judul {monitoringAddChildContext.rowHeader} *</Label>
                          <Input
                            name="title"
                            required
                            placeholder={`Nama ${monitoringAddChildContext.rowHeader}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Mulai</Label>
                          <Input name="starts_at" type="date" />
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
                          Simpan
                        </Button>
                        {taskMsg ? (
                          <p className="text-xs text-red-600" role="alert">
                            {taskMsg}
                          </p>
                        ) : null}
                      </form>
                    </DialogContent>
                  ) : null}
                </Dialog>
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
            <TabsContent value="Tabel" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <div className="mt-5 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <p className="text-sm font-semibold text-foreground">{tabelViewUi.panelTitle}</p>
                  {selectedProjectId && (
                    <div className="flex items-center gap-2">
                      <Dialog open={tableTaskDialogOpen} onOpenChange={setTableTaskDialogOpen}>
                        <DialogTrigger render={<Button size="sm" variant="outline" />}>
                          + {tabelViewUi.addTargetLabel}
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Tambah {tabelViewUi.addTargetLabel}</DialogTitle>
                            <DialogDescription>
                              Tambahkan {tabelViewUi.addTargetLabel} baru dari view tabel. Data baru
                              menjadi turunan langsung dari {tabelViewUi.indukFieldLabel}{" "}
                              <span className="font-medium text-foreground">
                                {tabelViewUi.indukDisplay}
                              </span>
                              .
                            </DialogDescription>
                          </DialogHeader>
                          <form
                            className="grid gap-3"
                            action={(fd) => {
                              setTaskMsg(null);
                              fd.set("project_id", selectedProjectId);
                              if (selectedTaskId) fd.set("parent_id", selectedTaskId);
                              if (defaultStatusId) fd.set("status_id", defaultStatusId);
                              startTaskTransition(async () => {
                                const r = await createProjectTaskAction(fd);
                                if (r.error) {
                                  setTaskMsg(r.error);
                                  return;
                                }
                                setTableTaskDialogOpen(false);
                                router.refresh();
                              });
                            }}
                          >
                            <div className="space-y-1">
                              <Label>{tabelViewUi.indukFieldLabel}</Label>
                              <Input value={tabelViewUi.indukDisplay} disabled />
                            </div>
                            <div className="space-y-1">
                              <Label>Judul {tabelViewUi.addTargetLabel} *</Label>
                              <Input
                                name="title"
                                required
                                placeholder={`Nama ${tabelViewUi.addTargetLabel}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Mulai</Label>
                              <Input name="starts_at" type="date" />
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
                              Simpan {tabelViewUi.addTargetLabel}
                            </Button>
                            {taskMsg && (
                              <p className="text-xs text-red-600" role="alert">
                                {taskMsg}
                              </p>
                            )}
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Judul</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Mulai</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Tenggat</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">
                        {tabelViewUi.parentColumnHeader}
                      </th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Catatan Terakhir</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Oleh</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Kapan</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Umur</th>
                      <th className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(({ issue, depth }) => {
                      const rowLevelLabel = labelForDepth(
                        projectIssueDepthById.get(issue.id) ?? 0
                      );
                      const st = issue.status_id ? statusById.get(issue.status_id) : null;
                      const isSelectedRootRow =
                        selectedTaskId != null && issue.id === selectedTaskId;
                      return (
                        <tr
                          key={issue.id}
                          className={`border-b border-border/70 ${
                            selectedTaskId === issue.id ? "bg-primary/10 font-semibold" : ""
                          }`}
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
                            {selectedProjectId ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={taskPending}
                                className="h-auto p-0 hover:bg-transparent"
                                title="Klik untuk rotasi status"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (!selectedProjectId) return;
                                  setTaskMsg(null);
                                  const fd = new FormData();
                                  fd.set("issue_id", issue.id);
                                  fd.set("project_id", selectedProjectId);
                                  fd.set("current_category", st?.category ?? "todo");
                                  startTaskTransition(async () => {
                                    const r = await cycleTaskStatusAction(fd);
                                    if (r.error) {
                                      setTaskMsg(r.error);
                                      return;
                                    }
                                    router.refresh();
                                  });
                                }}
                              >
                                <Badge className={statusBadgeClass(st?.category)}>
                                  {statusLabelEn(st?.category)}
                                </Badge>
                              </Button>
                            ) : (
                              <Badge className={statusBadgeClass(st?.category)}>
                                {statusLabelEn(st?.category)}
                              </Badge>
                            )}
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
                          <td className="max-w-[20rem] px-4 py-3 align-middle text-muted-foreground">
                            <span className="line-clamp-2">{issue.last_note?.trim() || "—"}</span>
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {issue.last_note_by
                              ? (memberNameByUserId.get(issue.last_note_by) ?? issue.last_note_by)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {formatDateTime(issue.last_note_at)}
                          </td>
                          <td className="px-4 py-3 align-middle text-muted-foreground whitespace-nowrap">
                            {formatRelativeAge(issue.last_note_at)}
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
                                    variant="outline"
                                    disabled={taskPending}
                                    className="h-auto px-2 py-0.5 text-xs font-medium"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setTaskEditState({
                                        issueId: issue.id,
                                        title: issue.title,
                                        startsAt: issue.starts_at
                                          ? issue.starts_at.slice(0, 10)
                                          : "",
                                        dueAt: issue.due_at ? issue.due_at.slice(0, 10) : "",
                                      });
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={taskPending}
                                    className="h-auto px-2 py-0.5 text-xs font-medium"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setTaskNoteEditor({
                                        issueId: issue.id,
                                        title: issue.title,
                                        initialNote: issue.last_note ?? "",
                                      });
                                    }}
                                  >
                                    Catatan
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
                                  open={taskEditState?.issueId === issue.id}
                                  onOpenChange={(open) => {
                                    if (!open) setTaskEditState(null);
                                  }}
                                >
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Edit {rowLevelLabel}</DialogTitle>
                                      <DialogDescription>
                                        Perbarui judul dan jadwal untuk {rowLevelLabel} ini.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <form
                                      className="grid gap-3"
                                      action={(fd) => {
                                        const current = taskEditState;
                                        if (!current || !selectedProjectId) return;
                                        setTaskMsg(null);
                                        fd.set("issue_id", current.issueId);
                                        fd.set("project_id", selectedProjectId);
                                        startTaskTransition(async () => {
                                          const r = await updateTaskBasicAction(fd);
                                          if (r.error) {
                                            setTaskMsg(r.error);
                                            return;
                                          }
                                          setTaskEditState(null);
                                          router.refresh();
                                        });
                                      }}
                                    >
                                      <div className="space-y-1">
                                        <Label>Judul {rowLevelLabel} *</Label>
                                        <Input
                                          name="title"
                                          required
                                          value={taskEditState?.title ?? ""}
                                          onChange={(e) =>
                                            setTaskEditState((prev) =>
                                              prev && prev.issueId === issue.id
                                                ? { ...prev, title: e.target.value }
                                                : prev
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                          <Label>Mulai</Label>
                                          <Input
                                            name="starts_at"
                                            type="date"
                                            value={taskEditState?.startsAt ?? ""}
                                            onChange={(e) =>
                                              setTaskEditState((prev) =>
                                                prev && prev.issueId === issue.id
                                                  ? { ...prev, startsAt: e.target.value }
                                                  : prev
                                              )
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label>Tenggat</Label>
                                          <Input
                                            name="due_at"
                                            type="date"
                                            value={taskEditState?.dueAt ?? ""}
                                            onChange={(e) =>
                                              setTaskEditState((prev) =>
                                                prev && prev.issueId === issue.id
                                                  ? { ...prev, dueAt: e.target.value }
                                                  : prev
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => setTaskEditState(null)}
                                        >
                                          Batal
                                        </Button>
                                        <Button type="submit" disabled={taskPending}>
                                          Simpan perubahan
                                        </Button>
                                      </div>
                                      {taskMsg && (
                                        <p className="text-xs text-red-600" role="alert">
                                          {taskMsg}
                                        </p>
                                      )}
                                    </form>
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
                                      <DialogTitle>Hapus {rowLevelLabel}</DialogTitle>
                                      <DialogDescription>
                                        {rowLevelLabel} &quot;{taskDeleteConfirm?.title ?? issue.title}
                                        &quot; akan dihapus (soft delete), termasuk seluruh turunannya.
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
                                        Ya, hapus
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
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <p className="text-sm font-semibold text-foreground">Project Members</p>
                  {selectedProjectId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        setMemberMsg(null);
                        setMemberDialogOpen(true);
                      }}
                    >
                      + Anggota
                    </Button>
                  ) : null}
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
              <SpatialAttributesPanel
                rows={issueGeometryRowsForTableView}
                issueTitleById={issueTitleById}
                issueGeometryFeatureMap={issueGeometryFeatureMap}
                selectedProjectId={selectedProjectId}
                selectedTaskId={selectedTaskId}
                selectedTaskTitle={selectedTask?.title ?? null}
                unitKerjaColumnLabel={labelForDepth(0)}
              />
            </TabsContent>
            <TabsContent value="Berkas" className="min-h-0 w-full min-w-0 flex-none outline-none">
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
            <TabsContent value="Laporan" className="min-h-0 w-full min-w-0 flex-none outline-none">
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
            <TabsContent value="Keuangan" className="min-h-0 w-full min-w-0 flex-none outline-none">
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
            <TabsContent
              value="Map"
              className="flex min-h-0 w-full min-w-0 flex-1 basis-0 flex-col overflow-hidden outline-none"
            >
              <div className="flex h-0 min-h-0 flex-1 basis-0 flex-col">
                {!selectedProjectId ? (
                  <p className="text-sm text-muted-foreground">
                    Pilih project untuk melihat peta.
                  </p>
                ) : (
                  <div className="flex h-0 min-h-0 min-w-0 flex-1 basis-0 flex-col">
                    {selectedTaskId && (
                        <Dialog
                          open={mapGeomDialogOpen}
                          onOpenChange={setMapGeomDialogOpen}
                        >
                          <DialogContent className="max-h-[90vh] max-w-[min(96vw,760px)] overflow-x-hidden overflow-y-auto">
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
                                    Simpan geometri unit kerja dari GeoJSON, ZIP shapefile
                                    (poligon), atau DXF (poligon tertutup per layer).
                                  </>
                                )}
                              </DialogDescription>
                            </DialogHeader>
                            <p
                              className="mb-3 rounded-md border border-border bg-muted/45 px-3 py-2 text-sm text-foreground"
                              role="status"
                            >
                              <span className="block text-xs font-medium text-muted-foreground">
                                Unit kerja
                              </span>
                              <span className="mt-1 block font-semibold leading-snug">
                                {selectedScopePath}
                              </span>
                            </p>
                            {mapGeomInputMode !== "manage" && (
                              <details className="mb-3 rounded-md border border-border bg-muted/30 text-xs text-foreground">
                                <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted-foreground hover:text-foreground">
                                  Petunjuk impor geometri & CRS
                                </summary>
                                <div className="space-y-2 border-t border-border/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                                  <p>
                                    <span className="font-medium text-foreground">
                                      feature_key:
                                    </span>{" "}
                                    kunci yang sama menghubungkan geometri (Map) dan atribut
                                    (Tabel); huruf besar/kecil harus konsisten.
                                  </p>
                                  <p>
                                    <span className="font-medium text-foreground">
                                      SRID:
                                    </span>{" "}
                                    pilih EPSG yang sesuai koordinat file. GeoJSON lon/lat →
                                    4326. Shapefile dengan .prj yang dikenali parser sering sudah
                                    lon/lat → 4326; tanpa .prj pilih SRID koordinat mentah DXF/SHP.
                                  </p>
                                  <p>
                                    <span className="font-medium text-foreground">
                                      Batas:
                                    </span>{" "}
                                    teks GeoJSON/DXF/batch ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB;
                                    ZIP shapefile ~{Math.round(MAX_SHAPEFILE_ZIP_BYTES / (1024 * 1024))}{" "}
                                    MB.
                                  </p>
                                  <p className="text-[10px]">
                                    <Link
                                      href="/help/spatial-import"
                                      className="font-medium text-primary underline-offset-2 hover:underline"
                                    >
                                      Buka halaman bantuan impor spasial
                                    </Link>
                                    <span className="text-muted-foreground">
                                      {" "}
                                      · Dokumen repo:{" "}
                                      <span className="font-mono text-foreground">
                                        docs/spatial-import-user-guide.md
                                      </span>
                                    </span>
                                  </p>
                                </div>
                              </details>
                            )}
                            {mapGeomInputMode === "manage" ? (
                              <div className="space-y-3">
                                {issueGeometriesForManageTask.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    Belum ada geometri fitur untuk unit kerja ini.
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
                            ) : (
                              <div className="space-y-4">
                                <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                                  <button
                                    type="button"
                                    className={cn(
                                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                                      mapGeomFileMode === "geojson"
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => {
                                      setMapGeomFileMode("geojson");
                                      setMapDxfError(null);
                                      setMapGeomMsg(null);
                                    }}
                                  >
                                    GeoJSON
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                                      mapGeomFileMode === "dxf"
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => {
                                      setMapGeomFileMode("dxf");
                                      setMapGeomMsg(null);
                                      setMapGeomBatchText("");
                                      setMapGeomGeojsonBatchPrefix("");
                                      setMapGeojsonBatchKeys([]);
                                      setMapGeojsonBatchLabels([]);
                                      setMapShpLayers(null);
                                      setMapShpSelectedFileName("");
                                      setMapShpLoadHint(null);
                                      setMapDxfError(null);
                                    }}
                                  >
                                    DXF
                                  </button>
                                </div>

                                {mapGeomFileMode === "geojson" ? (
                                  <form
                                    key={`geom-single-${mapGeomFormNonce}`}
                                    className="grid gap-3"
                                    action={(fd) => {
                                      if (!selectedProjectId || !selectedTaskId) return;
                                      setMapGeomMsg(null);
                                      fd.set("project_id", selectedProjectId);
                                      fd.set("issue_id", selectedTaskId);
                                      fd.set("source_srid", mapGeomSourceSrid);
                                      startMapGeomTransition(async () => {
                                        const rawGeojson = String(
                                          fd.get("geojson_json") ?? ""
                                        ).trim();
                                        if (!rawGeojson) {
                                          setMapGeomMsg("GeoJSON wajib diisi.");
                                          return;
                                        }
                                        let parsed: unknown;
                                        try {
                                          parsed = JSON.parse(rawGeojson);
                                        } catch {
                                          setMapGeomMsg("GeoJSON tidak valid.");
                                          return;
                                        }

                                        const geoType =
                                          parsed && typeof parsed === "object"
                                            ? String((parsed as { type?: unknown }).type ?? "")
                                            : "";

                                        if (geoType === "FeatureCollection") {
                                          const rowCount = listGeoJsonBatchPolygonRows(
                                            parsed as GeoJsonFeatureCollectionForBatch
                                          ).length;
                                          if (
                                            rowCount > 0 &&
                                            (mapGeojsonBatchKeys.length !== rowCount ||
                                              mapGeojsonBatchLabels.length !== rowCount)
                                          ) {
                                            setMapGeomMsg(
                                              "Pemetaan key belum siap — tunggu sebentar atau ubah prefix/file lalu coba lagi."
                                            );
                                            return;
                                          }
                                          let batchJson = rawGeojson;
                                          let prefixForBatch = mapGeomGeojsonBatchPrefix;
                                          if (
                                            rowCount > 0 &&
                                            mapGeojsonBatchKeys.length === rowCount &&
                                            mapGeojsonBatchLabels.length === rowCount
                                          ) {
                                            const mapped = applyGeoJsonBatchKeyLabelMapping(
                                              rawGeojson,
                                              mapGeojsonBatchKeys,
                                              mapGeojsonBatchLabels
                                            );
                                            if (!mapped.ok) {
                                              setMapGeomMsg(mapped.error);
                                              return;
                                            }
                                            if (
                                              mapped.json.length >
                                              MAX_SPATIAL_GEOMETRY_TEXT_CHARS
                                            ) {
                                              setMapGeomMsg(
                                                spatialGeometryTextTooLargeMessage(
                                                  "Batch GeoJSON"
                                                )
                                              );
                                              return;
                                            }
                                            batchJson = mapped.json;
                                            prefixForBatch = "";
                                          }
                                          const batchFd = new FormData();
                                          batchFd.set("project_id", selectedProjectId);
                                          batchFd.set("issue_id", selectedTaskId);
                                          batchFd.set("batch_geojson_json", batchJson);
                                          batchFd.set(
                                            "feature_key_prefix",
                                            prefixForBatch
                                          );
                                          batchFd.set("source_srid", mapGeomSourceSrid);
                                          const r =
                                            await upsertIssueGeometryFeatureBatchAction(
                                              batchFd
                                            );
                                          if (r.error) {
                                            setMapGeomMsg(r.error);
                                            return;
                                          }
                                          const failText =
                                            r.failed > 0 ? `, gagal ${r.failed}` : "";
                                          const sampleText =
                                            r.failureSamples.length > 0
                                              ? ` (${r.failureSamples
                                                  .slice(0, 3)
                                                  .join(" | ")})`
                                              : "";
                                          setMapGeomMsg(
                                            `Batch selesai: berhasil ${r.insertedOrUpdated}${failText}.${sampleText}`
                                          );
                                          setMapGeomDialogOpen(false);
                                          router.refresh();
                                          return;
                                        }

                                        const featureKey = String(
                                          fd.get("feature_key") ?? ""
                                        ).trim();
                                        if (!featureKey) {
                                          setMapGeomMsg(
                                            "Feature key wajib diisi jika GeoJSON bukan FeatureCollection."
                                          );
                                          return;
                                        }

                                        const r = await upsertIssueGeometryFeatureAction(fd);
                                        if (r.error) {
                                          setMapGeomMsg(r.error);
                                          return;
                                        }
                                        setMapGeomMsg("Berhasil simpan geometri.");
                                        setMapGeomDialogOpen(false);
                                        router.refresh();
                                      });
                                    }}
                                  >
                                    <div className="space-y-1">
                                      <Label>GeoJSON *</Label>
                                      <Input
                                        type="file"
                                        accept=".geojson,.json,application/geo+json,application/json"
                                        className="w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-xs file:font-medium file:text-background hover:file:opacity-90"
                                        onChange={(e) => {
                                          const file = e.currentTarget.files?.[0];
                                          if (!file) {
                                            setMapGeomBatchText("");
                                            setMapGeomGeojsonBatchPrefix("");
                                            setMapShpLayers(null);
                                            setMapShpSelectedFileName("");
                                            setMapShpLoadHint(null);
                                            return;
                                          }
                                          setMapGeomMsg(null);
                                          setMapShpLayers(null);
                                          setMapShpSelectedFileName("");
                                          setMapShpLoadHint(null);
                                          const reader = new FileReader();
                                          reader.onload = () => {
                                            const raw =
                                              typeof reader.result === "string"
                                                ? reader.result
                                                : "";
                                            if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
                                              setMapGeomBatchText("");
                                              setMapGeomMsg(
                                                spatialGeometryTextTooLargeMessage(
                                                  "GeoJSON"
                                                )
                                              );
                                              return;
                                            }
                                            try {
                                              const parsed = JSON.parse(raw);
                                              setMapGeomGeojsonBatchPrefix("");
                                              setMapGeomBatchText(
                                                JSON.stringify(parsed, null, 2)
                                              );
                                            } catch {
                                              setMapGeomGeojsonBatchPrefix("");
                                              setMapGeomBatchText(raw);
                                            }
                                          };
                                          reader.onerror = () => {
                                            setMapGeomMsg(
                                              "Gagal membaca file. Coba file .geojson/.json lain."
                                            );
                                          };
                                          reader.readAsText(file);
                                        }}
                                      />
                                      <p className="text-[11px] text-muted-foreground">
                                        Batas isi file teks ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB
                                        (sama untuk GeoJSON dan DXF).
                                      </p>
                                      <div className="space-y-2 rounded-md border border-dashed border-border/80 bg-muted/25 px-3 py-2">
                                        <p className="text-[11px] font-medium text-foreground">
                                          Atau ZIP shapefile (.shp + .dbf, idealnya .shx + .prj)
                                        </p>
                                        <Input
                                          type="file"
                                          accept=".zip,application/zip"
                                          className="w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-xs file:font-medium file:text-background hover:file:opacity-90"
                                          onChange={(e) => {
                                            const file = e.currentTarget.files?.[0];
                                            if (!file) {
                                              setMapShpLayers(null);
                                              setMapShpSelectedFileName("");
                                              setMapShpLoadHint(null);
                                              return;
                                            }
                                            setMapGeomMsg(null);
                                            setMapShpLoadHint(null);
                                            const reader = new FileReader();
                                            reader.onload = async () => {
                                              const buf = reader.result;
                                              if (!(buf instanceof ArrayBuffer)) {
                                                setMapGeomMsg(
                                                  "Gagal membaca ZIP shapefile."
                                                );
                                                return;
                                              }
                                              if (buf.byteLength > MAX_SHAPEFILE_ZIP_BYTES) {
                                                setMapShpLayers(null);
                                                setMapShpSelectedFileName("");
                                                setMapGeomBatchText("");
                                                setMapGeomMsg(shapefileZipTooLargeMessage());
                                                return;
                                              }
                                              const parsed =
                                                await parseShapefileZipToPolygonLayers(buf);
                                              if (!parsed.ok) {
                                                setMapShpLayers(null);
                                                setMapShpSelectedFileName("");
                                                setMapGeomBatchText("");
                                                setMapGeomMsg(parsed.error);
                                                return;
                                              }
                                              const layers = parsed.layers;
                                              setMapShpLayers(layers);
                                              const first = layers[0]!;
                                              setMapShpSelectedFileName(first.fileName);
                                              setMapGeomGeojsonBatchPrefix("");
                                              const ok = applyShapefileLayerToBatch(
                                                layers,
                                                first.fileName
                                              );
                                              if (!ok) {
                                                setMapShpLayers(null);
                                                setMapShpSelectedFileName("");
                                              }
                                            };
                                            reader.onerror = () => {
                                              setMapGeomMsg(
                                                "Gagal membaca ZIP. Coba file lain."
                                              );
                                            };
                                            reader.readAsArrayBuffer(file);
                                          }}
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                          Batas ZIP ~{Math.round(MAX_SHAPEFILE_ZIP_BYTES / (1024 * 1024))} MB.
                                          Hasil konversi ke GeoJSON batch tidak boleh melebihi
                                          ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB teks. Jika ada{" "}
                                          <span className="font-mono">.prj</span> yang dikenali
                                          parser, koordinat biasanya sudah lon/lat — pilih{" "}
                                          <span className="font-mono">EPSG:4326</span>. Tanpa{" "}
                                          <span className="font-mono">.prj</span>, pilih SRID
                                          sesuai koordinat di berkas .shp.
                                        </p>
                                        {mapShpLayers && mapShpLayers.length > 1 && (
                                          <div className="space-y-1">
                                            <Label className="text-xs">Layer di ZIP</Label>
                                            <select
                                              value={mapShpSelectedFileName}
                                              onChange={(ev) => {
                                                const name = ev.target.value;
                                                setMapShpSelectedFileName(name);
                                                applyShapefileLayerToBatch(mapShpLayers, name);
                                              }}
                                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                            >
                                              {mapShpLayers.map((ly) => (
                                                <option key={ly.fileName} value={ly.fileName}>
                                                  {ly.fileName} ({ly.polygonFeatureCount} poligon)
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        )}
                                        {mapShpLoadHint && (
                                          <p
                                            className="text-[11px] text-muted-foreground"
                                            role="status"
                                          >
                                            {mapShpLoadHint}
                                          </p>
                                        )}
                                      </div>
                                      <input
                                        type="hidden"
                                        name="geojson_json"
                                        value={mapGeomBatchText}
                                      />
                                    </div>
                                    {mapGeomDetectedKind === "single" && (
                                      <>
                                        <div className="space-y-1">
                                          <Label>Feature key *</Label>
                                          <Input
                                            name="feature_key"
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
                                      </>
                                    )}
                                    {mapGeomDetectedKind === "batch" && (
                                      <>
                                        <div className="space-y-1">
                                          <Label>Prefix key (opsional)</Label>
                                          <Input
                                            value={mapGeomGeojsonBatchPrefix}
                                            onChange={(e) =>
                                              setMapGeomGeojsonBatchPrefix(e.target.value)
                                            }
                                            placeholder="contoh: sambeng-"
                                            autoComplete="off"
                                          />
                                          <p className="text-[11px] text-muted-foreground">
                                            Mengubah prefix mengatur ulang kolom Feature key dari
                                            properti file (atur manual di tabel bila perlu).
                                          </p>
                                        </div>
                                        {mapGeojsonBatchKeys.length > 0 && (
                                          <div className="space-y-2">
                                            <Label className="text-xs">
                                              Feature key & label per poligon (
                                              {mapGeojsonBatchKeys.length})
                                            </Label>
                                            <p className="text-[11px] text-muted-foreground">
                                              Kolom <span className="font-medium text-foreground">Geometri</span>:{" "}
                                              <span className="font-medium">Sudah ada</span> = key ini sudah punya
                                              geometri untuk unit kerja ini (simpan akan menimpa);{" "}
                                              <span className="font-medium">Belum</span> = belum ada.
                                            </p>
                                            <div className="max-h-[38vh] overflow-y-auto rounded-md border border-border">
                                              <table className="w-full border-collapse text-left text-[11px]">
                                                <thead>
                                                  <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                                                    <th className="w-8 px-1.5 py-1 font-medium">
                                                      #
                                                    </th>
                                                    <th className="w-[5.5rem] shrink-0 px-1.5 py-1 font-medium">
                                                      Geometri
                                                    </th>
                                                    <th className="px-1.5 py-1 font-medium">
                                                      Feature key
                                                    </th>
                                                    <th className="px-1.5 py-1 font-medium">
                                                      Label
                                                    </th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {mapGeojsonBatchKeys.map((keyVal, i) => (
                                                    <tr
                                                      key={i}
                                                      className="border-b border-border/60 align-top"
                                                    >
                                                      <td className="px-1.5 py-1 text-muted-foreground">
                                                        {i + 1}
                                                      </td>
                                                      <td className="px-1 py-1 align-middle">
                                                        {geometryKeyStatusCell(
                                                          keyVal,
                                                          geometryKeysLowerForSelectedTask
                                                        )}
                                                      </td>
                                                      <td className="px-1 py-0.5">
                                                        <Input
                                                          value={keyVal}
                                                          onChange={(e) => {
                                                            const v = e.target.value;
                                                            setMapGeojsonBatchKeys((prev) => {
                                                              const next = [...prev];
                                                              next[i] = v;
                                                              return next;
                                                            });
                                                          }}
                                                          className="h-7 px-1.5 font-mono text-[11px]"
                                                          autoComplete="off"
                                                        />
                                                      </td>
                                                      <td className="px-1 py-0.5">
                                                        <Input
                                                          value={
                                                            mapGeojsonBatchLabels[i] ?? ""
                                                          }
                                                          onChange={(e) => {
                                                            const v = e.target.value;
                                                            setMapGeojsonBatchLabels((prev) => {
                                                              const next = [...prev];
                                                              next[i] = v;
                                                              return next;
                                                            });
                                                          }}
                                                          className="h-7 px-1.5 text-[11px]"
                                                          autoComplete="off"
                                                        />
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground">
                                              Hanya fitur Polygon/MultiPolygon; urutan sama proses
                                              batch server.
                                            </p>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    <div className="space-y-1">
                                      <Label>EPSG/SRID sumber</Label>
                                      <select
                                        name="source_srid"
                                        value={mapGeomSourceSrid}
                                        onChange={(e) =>
                                          setMapGeomSourceSrid(e.target.value)
                                        }
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                      >
                                        {SOURCE_SRID_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                      <p className="text-[11px] text-muted-foreground">
                                        Koordinat dari CRS ini otomatis ditransform ke
                                        WGS84 (EPSG:4326) saat disimpan.
                                      </p>
                                    </div>
                                    {mapGeomDetectedKind === "none" && (
                                      <p className="text-xs text-muted-foreground">
                                        Pilih file GeoJSON dulu untuk menampilkan form sesuai
                                        tipe data (single atau batch).
                                      </p>
                                    )}
                                    {mapGeomDetectedKind === "invalid" && (
                                      <p className="text-xs text-red-600" role="alert">
                                        File/isi GeoJSON tidak valid.
                                      </p>
                                    )}
                                    {mapGeomDetectedKind === "unsupported" && (
                                      <p className="text-xs text-red-600" role="alert">
                                        Tipe GeoJSON belum didukung. Gunakan Polygon,
                                        MultiPolygon, Feature, atau FeatureCollection.
                                      </p>
                                    )}
                                    <Button
                                      type="submit"
                                      disabled={
                                        mapGeomPending ||
                                        mapGeomDetectedKind === "none" ||
                                        mapGeomDetectedKind === "invalid" ||
                                        mapGeomDetectedKind === "unsupported" ||
                                        (mapGeomDetectedKind === "batch" &&
                                          mapGeomGeojsonPolygonRowCount > 0 &&
                                          mapGeojsonBatchKeys.length !==
                                            mapGeomGeojsonPolygonRowCount)
                                      }
                                    >
                                      Simpan geometri
                                    </Button>
                                  </form>
                                ) : (
                                  <div className="grid gap-3">
                                    <div className="space-y-1">
                                      <Label>File DXF *</Label>
                                      <Input
                                        type="file"
                                        accept=".dxf,text/plain,application/dxf,application/x-dxf"
                                        className="w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1 file:text-xs file:font-medium file:text-background hover:file:opacity-90"
                                        onChange={(e) => {
                                          const file = e.currentTarget.files?.[0];
                                          if (!file) {
                                            setMapDxfRawText("");
                                            setMapDxfLayers([]);
                                            setMapDxfLayer("");
                                            setMapDxfPolygonCount(0);
                                            setMapDxfPreviewRings([]);
                                            mapDxfParsedRef.current = null;
                                            setMapDxfError(null);
                                            return;
                                          }
                                          setMapGeomMsg(null);
                                          setMapDxfError(null);
                                          const reader = new FileReader();
                                          reader.onload = () => {
                                            const raw =
                                              typeof reader.result === "string"
                                                ? reader.result
                                                : "";
                                            if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
                                              setMapDxfRawText("");
                                              setMapDxfLayers([]);
                                              setMapDxfLayer("");
                                              setMapDxfPolygonCount(0);
                                              setMapDxfPreviewRings([]);
                                              mapDxfParsedRef.current = null;
                                              setMapDxfError(
                                                spatialGeometryTextTooLargeMessage("DXF")
                                              );
                                              return;
                                            }
                                            setMapDxfRawText(raw);
                                            try {
                                              const dxf = parseDxfDocument(raw);
                                              mapDxfParsedRef.current = dxf;
                                              const layers = listDxfLayerNames(dxf, raw);
                                              setMapDxfLayers(layers);
                                              const first = layers[0] ?? "";
                                              setMapDxfLayer(first);
                                              const rings = first
                                                ? extractClosedPolygonRingsFromDxfLayer(
                                                    dxf,
                                                    first,
                                                    raw
                                                  )
                                                : [];
                                              setMapDxfPolygonCount(rings.length);
                                              setMapDxfPreviewRings(rings);
                                            } catch (err) {
                                              mapDxfParsedRef.current = null;
                                              setMapDxfLayers([]);
                                              setMapDxfLayer("");
                                              setMapDxfPolygonCount(0);
                                              setMapDxfPreviewRings([]);
                                              setMapDxfError(
                                                err instanceof Error
                                                  ? err.message
                                                  : "Gagal membaca DXF."
                                              );
                                            }
                                          };
                                          reader.onerror = () => {
                                            setMapDxfError("Gagal membaca file DXF.");
                                          };
                                          reader.readAsText(file);
                                        }}
                                      />
                                      <p className="text-[11px] text-muted-foreground">
                                        <span className="font-medium text-foreground">
                                          LWPOLYLINE
                                        </span>
                                        ,{" "}
                                        <span className="font-medium text-foreground">
                                          POLYLINE
                                        </span>{" "}
                                        tertutup,{" "}
                                        <span className="font-medium text-foreground">
                                          INSERT
                                        </span>{" "}
                                        blok (LW/PL tertutup di blok) pada layer yang dipilih, atau{" "}
                                        <span className="font-medium text-foreground">
                                          HATCH
                                        </span>{" "}
                                        (boundary poliline / garis+busur); bulge diraster. Koordinat Z
                                        diabaikan.
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        Batas isi file teks ~{MAX_SPATIAL_GEOMETRY_TEXT_MB} MB
                                        (sama untuk GeoJSON dan DXF).
                                      </p>
                                    </div>
                                    {mapDxfError && (
                                      <p className="text-xs text-red-600" role="alert">
                                        {mapDxfError}
                                      </p>
                                    )}
                                    {mapDxfLayers.length > 0 && (
                                      <div className="space-y-1">
                                        <Label>Layer</Label>
                                        <select
                                          value={mapDxfLayer}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setMapDxfLayer(v);
                                            const dxf = mapDxfParsedRef.current;
                                            if (!dxf) return;
                                            try {
                                              const rings =
                                                extractClosedPolygonRingsFromDxfLayer(
                                                  dxf,
                                                  v,
                                                  mapDxfRawText
                                                );
                                              setMapDxfPolygonCount(rings.length);
                                              setMapDxfPreviewRings(rings);
                                              setMapDxfError(null);
                                            } catch (err) {
                                              setMapDxfPolygonCount(0);
                                              setMapDxfPreviewRings([]);
                                              setMapDxfError(
                                                err instanceof Error
                                                  ? err.message
                                                  : "Gagal menganalisis layer."
                                              );
                                            }
                                          }}
                                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                        >
                                          {mapDxfLayers.map((ly) => (
                                            <option key={ly} value={ly}>
                                              {ly}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                    <div className="space-y-1">
                                      <Label>Prefix feature_key (opsional)</Label>
                                      <Input
                                        value={mapDxfKeyPrefix}
                                        onChange={(e) => setMapDxfKeyPrefix(e.target.value)}
                                        placeholder="contoh: bidang- — mengisi ulang key di tabel"
                                        autoComplete="off"
                                      />
                                      <p className="text-[11px] text-muted-foreground">
                                        Default key per baris:{" "}
                                        <span className="font-mono text-[10px]">
                                          {"{prefix}{layer-slug}-{nomor}"}
                                        </span>
                                        . Mengubah prefix/layer mengatur ulang tabel; edit manual
                                        per baris agar cocok dengan CSV atribut.
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <Label>EPSG/SRID sumber</Label>
                                      <select
                                        value={mapGeomSourceSrid}
                                        onChange={(e) =>
                                          setMapGeomSourceSrid(e.target.value)
                                        }
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                      >
                                        {SOURCE_SRID_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                      <p className="text-[11px] text-muted-foreground">
                                        Koordinat dari CRS ini otomatis ditransform ke WGS84
                                        (EPSG:4326) saat disimpan.
                                      </p>
                                    </div>
                                    {mapDxfPolygonCount > 0 && mapDxfLayer && (
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-foreground">
                                          Mapping feature_key & label ({mapDxfPolygonCount}{" "}
                                          poligon)
                                        </p>
                                        <div className="space-y-1">
                                          <Label className="text-xs font-medium text-foreground">
                                            Pratinjau poligon (WGS84 / peta dasar)
                                          </Label>
                                          <p className="text-[11px] text-muted-foreground">
                                            Klik poligon di peta untuk menyorot baris di bawah;
                                            klik baris tabel (di luar kotak isian) untuk
                                            menyorot poligon. Proyeksi mengikuti SRID sumber yang
                                            dipilih.
                                          </p>
                                          {mapDxfPreviewFeatureCollection.err ? (
                                            <p
                                              className="text-xs text-amber-700 dark:text-amber-500/95"
                                              role="status"
                                            >
                                              {mapDxfPreviewFeatureCollection.err} Tabel mapping
                                              tetap bisa dipakai.
                                            </p>
                                          ) : null}
                                          <DxfMappingPreviewMap
                                            featureCollection={
                                              mapDxfPreviewFeatureCollection.fc
                                            }
                                            highlightIndex={mapDxfHighlightRow}
                                            onSelectPolygon={handleDxfPreviewPolygonClick}
                                          />
                                        </div>
                                        <div className="rounded-md border border-border bg-muted/25 px-3 py-2">
                                          <Label className="text-xs font-medium text-foreground">
                                            Saran dari atribut (belum ada geometri di unit kerja
                                            ini)
                                          </Label>
                                          {mapDxfAttributeKeysWithoutGeometry.length === 0 ? (
                                            <p className="mt-1 text-[11px] text-muted-foreground">
                                              Tidak ada baris atribut tanpa geometri untuk unit
                                              kerja ini.
                                            </p>
                                          ) : (
                                            <>
                                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                Klik key untuk menambahkannya ke textarea tempel;
                                                atau isi tabel langsung dari daftar terurut.
                                              </p>
                                              <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                                                {mapDxfAttributeKeysWithoutGeometry.map((k) => (
                                                  <Button
                                                    key={k}
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 max-w-full shrink-0 px-2 font-mono text-[10px]"
                                                    title={`Tambahkan "${k}" ke daftar tempel`}
                                                    onClick={() => {
                                                      setMapDxfBulkKeyText((prev) => {
                                                        const t = prev.trim();
                                                        return t ? `${t}\n${k}` : k;
                                                      });
                                                      setMapDxfBulkKeyHint(null);
                                                    }}
                                                  >
                                                    {k}
                                                  </Button>
                                                ))}
                                              </div>
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="secondary"
                                                  className="h-8 text-xs"
                                                  onClick={() => {
                                                    setMapDxfBulkKeyText(
                                                      mapDxfAttributeKeysWithoutGeometry.join(
                                                        "\n"
                                                      )
                                                    );
                                                    setMapDxfBulkKeyHint(null);
                                                  }}
                                                >
                                                  Salin semua ke textarea tempel
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="secondary"
                                                  className="h-8 text-xs"
                                                  onClick={() => {
                                                    const sug = mapDxfAttributeKeysWithoutGeometry;
                                                    const n = mapDxfPolygonCount;
                                                    setMapDxfFeatureKeys((prev) => {
                                                      const next = [...prev];
                                                      const take = Math.min(sug.length, next.length);
                                                      for (let i = 0; i < take; i++) {
                                                        next[i] = sug[i]!;
                                                      }
                                                      return next;
                                                    });
                                                    if (sug.length > n) {
                                                      setMapDxfBulkKeyHint(
                                                        `Mengisi ${n} baris pertama dari ${sug.length} key atribut; sisanya edit manual atau tempel.`
                                                      );
                                                    } else if (sug.length < n) {
                                                      setMapDxfBulkKeyHint(
                                                        `Mengisi ${sug.length} baris pertama; ${n - sug.length} baris di bawah tidak diubah.`
                                                      );
                                                    } else {
                                                      setMapDxfBulkKeyHint(
                                                        `Semua ${sug.length} baris diisi dari daftar atribut (urutan alfabet).`
                                                      );
                                                    }
                                                  }}
                                                >
                                                  Terapkan ke tabel (urutan terurut)
                                                </Button>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 shrink-0 text-xs"
                                            onClick={() => {
                                              const csv = dxfKeyMappingTemplateCsv();
                                              const blob = new Blob([csv], {
                                                type: "text/csv;charset=utf-8",
                                              });
                                              const url = URL.createObjectURL(blob);
                                              const a = document.createElement("a");
                                              a.href = url;
                                              a.download = "template-mapping-dxf-feature_key.csv";
                                              a.rel = "noopener";
                                              document.body.appendChild(a);
                                              a.click();
                                              a.remove();
                                              URL.revokeObjectURL(url);
                                            }}
                                          >
                                            Unduh template CSV (feature_key + label)
                                          </Button>
                                          <p className="min-w-0 max-w-xl text-[11px] text-muted-foreground">
                                            Untuk spreadsheet lapangan: baris setelah header = urutan poligon #1,
                                            #2, …; salin kolom feature_key ke textarea tempel di bawah. Kolom
                                            label opsional selaras dengan tabel.
                                          </p>
                                        </div>
                                        <div className="rounded-md border border-border bg-muted/25 px-3 py-2">
                                          <Label className="text-xs font-medium text-foreground">
                                            Tempel daftar feature_key (satu per baris)
                                          </Label>
                                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                                            Salin satu kolom dari spreadsheet / CSV: baris ke-1
                                            → poligon #1, dst. Kosongkan baris diabaikan.
                                          </p>
                                          <Textarea
                                            value={mapDxfBulkKeyText}
                                            onChange={(e) => {
                                              setMapDxfBulkKeyText(e.target.value);
                                              setMapDxfBulkKeyHint(null);
                                            }}
                                            placeholder={"key-a\nkey-b\nkey-c"}
                                            rows={3}
                                            className="mt-2 min-h-[4.5rem] resize-y font-mono text-[11px]"
                                            aria-label="Daftar feature_key untuk ditempel"
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            className="mt-2 h-8 text-xs"
                                            onClick={() => {
                                              const lines = mapDxfBulkKeyText
                                                .split(/\r?\n/)
                                                .map((s) => s.trim())
                                                .filter((s) => s.length > 0);
                                              if (lines.length === 0) {
                                                setMapDxfBulkKeyHint(
                                                  "Tidak ada baris non-kosong untuk diterapkan."
                                                );
                                                return;
                                              }
                                              const n = mapDxfPolygonCount;
                                              setMapDxfFeatureKeys((prev) => {
                                                const next = [...prev];
                                                const take = Math.min(lines.length, next.length);
                                                for (let i = 0; i < take; i++) {
                                                  next[i] = lines[i]!;
                                                }
                                                return next;
                                              });
                                              if (lines.length > n) {
                                                setMapDxfBulkKeyHint(
                                                  `Memakai ${n} baris pertama; ${lines.length - n} baris ekstra diabaikan.`
                                                );
                                              } else if (lines.length < n) {
                                                setMapDxfBulkKeyHint(
                                                  `Mengisi ${lines.length} baris pertama; ${n - lines.length} baris di bawah tidak diubah.`
                                                );
                                              } else {
                                                setMapDxfBulkKeyHint(
                                                  `Semua ${lines.length} baris diterapkan ke tabel.`
                                                );
                                              }
                                            }}
                                          >
                                            Terapkan ke kolom Feature key
                                          </Button>
                                          {mapDxfBulkKeyHint ? (
                                            <p
                                              className="mt-2 text-[11px] text-muted-foreground"
                                              role="status"
                                            >
                                              {mapDxfBulkKeyHint}
                                            </p>
                                          ) : null}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                          Kolom <span className="font-medium text-foreground">Geometri</span>:{" "}
                                          <span className="font-medium">Sudah ada</span> = key ini sudah punya
                                          geometri untuk unit kerja ini (simpan akan menimpa);{" "}
                                          <span className="font-medium">Belum</span> = belum ada.
                                        </p>
                                        <div className="max-h-52 overflow-y-auto rounded-md border border-border">
                                          <table className="w-full border-collapse text-left text-xs">
                                            <thead>
                                              <tr className="sticky top-0 border-b border-border bg-muted/80 text-muted-foreground">
                                                <th className="w-10 px-2 py-1.5 font-medium">#</th>
                                                <th className="w-[5.5rem] shrink-0 px-2 py-1.5 font-medium">
                                                  Geometri
                                                </th>
                                                <th className="min-w-[8rem] px-2 py-1.5 font-medium">
                                                  Feature key
                                                </th>
                                                <th className="min-w-[7rem] px-2 py-1.5 font-medium">
                                                  Label (opsional)
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {mapDxfFeatureKeys.map((key, idx) => (
                                                <tr
                                                  key={`dxf-key-${idx}`}
                                                  ref={(el) => {
                                                    dxfMappingRowRefs.current[idx] = el;
                                                  }}
                                                  onClick={(e) => {
                                                    if (
                                                      (e.target as HTMLElement).closest(
                                                        "input, textarea, button, select, a"
                                                      )
                                                    ) {
                                                      return;
                                                    }
                                                    setMapDxfHighlightRow(idx);
                                                  }}
                                                  className={cn(
                                                    "border-b border-border/60 last:border-0",
                                                    mapDxfHighlightRow === idx
                                                      ? "bg-orange-500/12 ring-1 ring-orange-500/35 ring-inset"
                                                      : "cursor-pointer hover:bg-muted/45"
                                                  )}
                                                >
                                                  <td className="px-2 py-1.5 text-muted-foreground">
                                                    {idx + 1}
                                                  </td>
                                                  <td className="px-1 py-1.5 align-middle">
                                                    {geometryKeyStatusCell(
                                                      key,
                                                      geometryKeysLowerForSelectedTask
                                                    )}
                                                  </td>
                                                  <td className="px-1 py-0.5">
                                                    <Input
                                                      value={key}
                                                      onChange={(e) => {
                                                        const v = e.target.value;
                                                        setMapDxfFeatureKeys((prev) => {
                                                          const next = [...prev];
                                                          next[idx] = v;
                                                          return next;
                                                        });
                                                      }}
                                                      className="h-8 font-mono text-[11px]"
                                                      autoComplete="off"
                                                      aria-label={`Feature key poligon ${idx + 1}`}
                                                    />
                                                  </td>
                                                  <td className="px-1 py-0.5">
                                                    <Input
                                                      value={mapDxfFeatureLabels[idx] ?? ""}
                                                      onChange={(e) => {
                                                        const v = e.target.value;
                                                        setMapDxfFeatureLabels((prev) => {
                                                          const next = [...prev];
                                                          next[idx] = v;
                                                          return next;
                                                        });
                                                      }}
                                                      className="h-8 text-[11px]"
                                                      placeholder={`DXF ${mapDxfLayer} #${idx + 1}`}
                                                      autoComplete="off"
                                                      aria-label={`Label poligon ${idx + 1}`}
                                                    />
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                    <Button
                                      type="button"
                                      disabled={
                                        mapGeomPending ||
                                        !!mapDxfError ||
                                        !mapDxfRawText.trim() ||
                                        !mapDxfLayer.trim() ||
                                        mapDxfPolygonCount === 0 ||
                                        mapDxfFeatureKeys.length !== mapDxfPolygonCount ||
                                        mapDxfFeatureLabels.length !== mapDxfPolygonCount ||
                                        !mapDxfFeatureKeys.every((k) => k.trim())
                                      }
                                      onClick={() => {
                                        if (!selectedProjectId || !selectedTaskId) return;
                                        setMapGeomMsg(null);
                                        startMapGeomTransition(async () => {
                                          const fd = new FormData();
                                          fd.set("project_id", selectedProjectId);
                                          fd.set("issue_id", selectedTaskId);
                                          fd.set("dxf_text", mapDxfRawText);
                                          fd.set("layer_name", mapDxfLayer);
                                          fd.set(
                                            "feature_key_prefix",
                                            mapDxfKeyPrefix.trim()
                                          );
                                          fd.set(
                                            "feature_keys_json",
                                            JSON.stringify(mapDxfFeatureKeys.map((k) => k.trim()))
                                          );
                                          fd.set(
                                            "feature_labels_json",
                                            JSON.stringify(
                                              mapDxfFeatureLabels.map((lb) => lb.trim())
                                            )
                                          );
                                          fd.set("source_srid", mapGeomSourceSrid);
                                          const r =
                                            await upsertIssueGeometryFeaturesFromDxfAction(
                                              fd
                                            );
                                          if (r.error) {
                                            setMapGeomMsg(r.error);
                                            return;
                                          }
                                          const failText =
                                            r.failed > 0 ? `, gagal ${r.failed}` : "";
                                          const sampleText =
                                            r.failureSamples.length > 0
                                              ? ` (${r.failureSamples
                                                  .slice(0, 3)
                                                  .join(" | ")})`
                                              : "";
                                          setMapGeomMsg(
                                            `Impor DXF selesai: berhasil ${r.insertedOrUpdated}${failText}.${sampleText}`
                                          );
                                          setMapGeomDialogOpen(false);
                                          router.refresh();
                                        });
                                      }}
                                    >
                                      Simpan geometri dari DXF
                                    </Button>
                                  </div>
                                )}

                                {mapGeomMsg && (
                                  <p
                                    className={`text-xs ${mapGeomMsg.includes("Berhasil") || mapGeomMsg.includes("Batch selesai") || mapGeomMsg.includes("Impor DXF selesai") ? "text-emerald-700" : "text-red-600"}`}
                                    role="alert"
                                  >
                                    {mapGeomMsg}
                                  </p>
                                )}
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                    )}
                    <div className="grid min-h-0 min-w-0 flex-1 basis-0 grid-rows-[auto_minmax(0,1fr)] gap-y-3">
                      <div className="flex min-w-0 shrink-0 flex-col gap-2">
                        {mapLayersForSelectedProject.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            Belum ada geometri unit kerja di peta untuk project ini.
                          </p>
                        )}
                        {mapLayersForSelectedProject.length > 0 &&
                          visibleMapLayers.length === 0 && (
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
                      </div>
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-y-2 overflow-hidden">
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                          <WorkspaceMap
                            footprints={visibleMapLayers}
                            highlightBerkasId={null}
                          />
                        </div>
                        <div className="flex shrink-0 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                          <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              <span
                                className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                                style={{ background: "#a78bfa" }}
                              />{" "}
                              Geometri
                            </span>
                          </p>
                          {selectedTaskId ? (
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={openMapGeomDialog}
                              >
                                Tambah/Ubah geometri unit kerja
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                                onClick={openMapGeomManageDialog}
                              >
                                Hapus geometri
                              </Button>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Pilih unit kerja di sidebar/tabel untuk menambah geometri.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="Kanban" className="min-h-0 w-full min-w-0 flex-none outline-none">
              {selectedProjectId ? (
              <div className="mt-4">
                {selectedTaskId && (
                  <p className="mb-3 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
                    Scope <strong>unit kerja</strong> aktif — board tetap menampilkan
                    semua unit kerja level atas project ini. Klik nama project di kiri
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
            <TabsContent value="Kalender" className="min-h-0 w-full min-w-0 flex-none outline-none">
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
            <TabsContent value="Gantt" className="min-h-0 w-full min-w-0 flex-none outline-none">
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
            <Dialog
              open={Boolean(taskNoteEditor)}
              onOpenChange={(open) => {
                if (!open) setTaskNoteEditor(null);
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Update catatan terakhir</DialogTitle>
                  <DialogDescription>
                    Isi ringkas aktivitas terakhir, hambatan, atau pihak yang sedang ditunggu untuk{" "}
                    {labelForDepth(
                      projectIssueDepthById.get(taskNoteEditor?.issueId ?? "") ?? 0
                    )}{" "}
                    &quot;{taskNoteEditor?.title ?? "—"}&quot;.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="last-note-editor">Catatan</Label>
                  <Textarea
                    id="last-note-editor"
                    key={taskNoteEditor?.issueId ?? "none"}
                    defaultValue={taskNoteEditor?.initialNote ?? ""}
                    ref={taskNoteInputRef}
                    placeholder="Contoh: 14 Apr sudah chat PIC lapangan, menunggu konfirmasi jadwal ukur."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Kosongkan lalu simpan jika ingin menghapus catatan.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTaskNoteEditor(null)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    disabled={taskPending}
                    onClick={() => {
                      const current = taskNoteEditor;
                      if (!current || !selectedProjectId) return;
                      setTaskMsg(null);
                      const fd = new FormData();
                      fd.set("issue_id", current.issueId);
                      fd.set("project_id", selectedProjectId);
                      fd.set("last_note", taskNoteInputRef.current?.value ?? "");
                      startTaskTransition(async () => {
                        const r = await updateTaskLastNoteAction(fd);
                        if (r.error) {
                          setTaskMsg(r.error);
                          return;
                        }
                        setTaskNoteEditor(null);
                        router.refresh();
                      });
                    }}
                  >
                    Simpan catatan
                  </Button>
                </div>
                {taskMsg ? (
                  <p className="text-xs text-red-600" role="alert">
                    {taskMsg}
                  </p>
                ) : null}
              </DialogContent>
            </Dialog>
            </div>
          </ScrollArea>
        </section>
        </Tabs>
      </main>
      </div>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ChevronRight,
  MapPin,
  PanelLeft,
  Trash2,
  Upload,
} from "lucide-react";
import {
  addOrganizationStaffByEmailAction,
  addProjectMemberByEmailAction,
  createOrganizationProjectInlineAction,
  createProjectInOrganizationAction,
  signOut,
} from "@/app/auth/actions";
import { toast } from "sonner";
import { WorkspaceActivityTab } from "./workspace-activity-tab";
import { fetchActivityLogsAction } from "./fetch-activity-logs-action";
import { useWorkspaceDeferredPayload } from "./use-workspace-deferred-payload";
import { viewNeedsDeferredPayload } from "./workspace-deferred-payload";
import { WorkspaceMobileListSkeleton } from "./workspace-mobile-list-skeleton";
import type { ActivityLogRow } from "./activity-log-types";
import {
  buildActivityLogsCacheKey,
  getActivityLogsCache,
  hydrateActivityLogsCache,
  setActivityLogsCache,
} from "@/lib/activity-logs-cache";
import { startWorkspaceWarmup } from "@/lib/workspace-warmup";
export type { ActivityLogRow } from "./activity-log-types";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  createProjectTaskAction,
  deleteProjectAction,
  deleteTaskAction,
  setTaskStatusAction,
  updateTaskBasicAction,
  updateTaskLastNoteAction,
} from "./core-task-actions";
import { updateProjectPropertiesAction } from "./project-properties-actions";
import { heartbeatUserPresenceAction } from "./user-presence-actions";
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
      <div className="flex h-52 min-h-[13rem] w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          <span>Harap tunggu, memuat pratinjau peta…</span>
        </div>
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
import { useIsBelowMd } from "@/lib/use-media-query";
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
import type {
  IssueGeometryFeatureMapRow,
  SpatialAttributeTableRow,
} from "./spatial-attribute-types";
import type { MapFootprint } from "./workspace-map";
import { type ViewId } from "./workspace-views";
import type {
  VirtualTableRow,
  VirtualColumnRow,
  VirtualDataRow,
} from "./virtual-table-types";
import {
  VirtualTableCreateDialog,
  VirtualTableDxfImportDialog,
  VirtualTableGeoJsonImportDialog,
  VirtualTableLayerUploadDialog,
  type LayerUploadCreated,
} from "./virtual-table-view";
import {
  fetchVirtualRowsAction,
  resolveRelationLabelsAction,
} from "./virtual-table-actions";
import { VirtualDashboardView } from "./virtual-dashboard-view";

const EMPTY_VIRTUAL_COLUMNS: VirtualColumnRow[] = [];
import {
  buildVirtualTableMapPopupProperties,
  collectRelationIdsFromVirtualPayloads,
  pickMapRowTitle,
  type VirtualColumnForMapPopup,
} from "@/lib/virtual-table-map-popup";
import { mapPreviewLayersSignature } from "@/lib/virtual-table-map-preview";
import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import { fileAttachmentOptionsFromRowPayload } from "@/lib/chat-row-panel";
import { resolveVirtualRowChatContextAction } from "./chat-actions";
import {
  WorkspaceRightPanelProvider,
  WorkspaceRightPanelCloser,
  WorkspaceRightPanelTableSync,
  WorkspaceRightPanelOrgSync,
  WorkspaceRightPanelProjectSync,
  type WorkspaceRightPanelApi,
} from "./workspace-right-panel-context";
import { WorkspaceRightPanel } from "./workspace-right-panel";
import {
  WorkspaceMobileTabBar,
  WORKSPACE_MOBILE_TAB_BAR_PADDING,
} from "./workspace-mobile-tabs";
import { WorkspaceMobileOrgPicker } from "./workspace-mobile-org-picker";
import { WorkspaceMobileProjectPicker } from "./workspace-mobile-project-picker";
import { WorkspaceMobileVirtualTableOverlay } from "./workspace-mobile-virtual-table-overlay";
import { WorkspaceMobileCompactHeader } from "./workspace-mobile-compact-header";
import { WorkspaceChatInbox } from "./workspace-chat-inbox";
import {
  type MobileScopePhase,
  clearMobileScopeSession,
  readMobileScopeSession,
  writeMobileScopeSession,
} from "./workspace-mobile-scope";
import { WorkspaceMobileSwipeBack } from "./workspace-mobile-swipe-back";
import { WorkspaceRightPanelMobileChatGuard } from "./workspace-right-panel-mobile-guard";
import { VirtualTableMobileList } from "./workspace-virtual-table-list";
import {
  SidebarOrganizationChatButton,
  SidebarProjectChatButton,
} from "./workspace-sidebar-chat";
import { SidebarVirtualTableItem } from "./workspace-sidebar-vtable-item";
import type { ChatMentionOption } from "./chat-types";
import {
  ProjectChatUnreadBadge,
  VirtualTableChatUnreadBadge,
  VirtualTableChatUnreadProvider,
  ChatTabLabel,
} from "./virtual-table-chat-unread-context";
import { NotificationSoundListener } from "@/components/notification-sound-listener";
import { PwaPushSubscription } from "@/components/pwa-push-subscription";
import { listenForNotificationClickNavigate } from "@/lib/pwa-push-subscription";

function TabViewLoading({ label }: { label: string }) {
  return (
    <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-4" />
      <span>{label}</span>
    </div>
  );
}

const VirtualTableView = dynamic(
  () => import("./virtual-table-view").then((m) => m.VirtualTableView),
  {
    loading: () => <TabViewLoading label="Memuat tabel…" />,
  }
);

const KanbanBoard = dynamic(
  () => import("./kanban-board").then((m) => m.KanbanBoard),
  {
    loading: () => <TabViewLoading label="Memuat kanban…" />,
  }
);

const CalendarScheduleView = dynamic(
  () => import("./schedule-views").then((m) => m.CalendarScheduleView),
  {
    loading: () => <TabViewLoading label="Memuat kalender…" />,
  }
);

const GanttScheduleView = dynamic(
  () => import("./schedule-views").then((m) => m.GanttScheduleView),
  {
    loading: () => <TabViewLoading label="Memuat gantt…" />,
  }
);

/** Mount tab body on first visit; keep mounted (hidden) for fast tab switches. */
function TabPanelKeepAlive({
  view,
  activeView,
  children,
  className,
}: {
  view: ViewId;
  activeView: ViewId;
  children: ReactNode;
  className?: string;
}) {
  const active = activeView === view;
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      className={cn(active ? className : "hidden", !active && "pointer-events-none")}
      hidden={!active}
      aria-hidden={!active}
      inert={!active ? true : undefined}
    >
      {children}
    </div>
  );
}

function urlScopeKey(p: URLSearchParams): string {
  return [
    p.get("org") ?? "",
    p.get("project") ?? "",
    p.get("task") ?? "",
    p.get("berkas") ?? "",
  ].join("|");
}

/** URL aktual di browser + state org/project (hindari searchParams Next.js tertinggal). */
function workspaceUrlParamsBaseline(
  searchParams: { toString(): string },
  canonicalOrgId: string | null,
  selectedProjectId: string | null,
  projects: ProjectRow[]
): URLSearchParams {
  const p = new URLSearchParams(
    typeof window !== "undefined"
      ? window.location.search
      : searchParams.toString()
  );
  if (
    canonicalOrgId &&
    projects.some((proj) => proj.organization_id === canonicalOrgId)
  ) {
    p.set("org", canonicalOrgId);
  }
  const org = p.get("org");
  if (selectedProjectId && org) {
    const inOrg = projects.some(
      (x) => x.id === selectedProjectId && x.organization_id === org
    );
    if (inOrg) p.set("project", selectedProjectId);
  }
  return p;
}

const WorkspaceMap = dynamic(
  () => import("./workspace-map").then((m) => m.WorkspaceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[12rem] w-full flex-1 items-center justify-center rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
        <div className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          <span>Harap tunggu, memuat peta…</span>
        </div>
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

export type OrganizationMemberRow = {
  organization_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

const ORG_STAFF_ROLES = new Set(["owner", "admin", "staff"]);
const ORG_ADMIN_ROLES = new Set(["owner", "admin"]);

export type UserPresenceRow = {
  user_id: string;
  project_id: string;
  last_seen_at: string;
  updated_at: string;
};

type Props = {
  organizations: OrganizationRow[];
  projects: ProjectRow[];
  statuses: StatusRow[];
  issues: IssueRow[];
  projectMembers: ProjectMemberRow[];
  organizationMembers?: OrganizationMemberRow[];
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
  activityLogs?: ActivityLogRow[];
  userPresence?: UserPresenceRow[];
  fetchError: string | null;
  userEmail: string | null;
  /** Untuk cek owner saat edit properti project. */
  userId?: string | null;
  virtualTables?: VirtualTableRow[];
  virtualColumns?: VirtualColumnRow[];
  virtualDashboardsByProjectId?: Record<
    string,
    import("./virtual-dashboard-types").VirtualDashboardRow
  >;
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

function normalizeMilestoneTitleKey(title: string): string {
  return title.trim().toLocaleLowerCase();
}

const STANDARD_TASK_TITLE_ORDER = [
  "koordinasi",
  "daftar tkad",
  "invoice/pembayaran",
  "pemasangan patok",
  "penjadwalan pengukuran",
  "pengukuran",
  "pemetaan",
  "pembuatan laporan",
] as const;

const STANDARD_TASK_TITLE_RANK: Map<string, number> = new Map(
  STANDARD_TASK_TITLE_ORDER.map((k, idx) => [k, idx] as const)
);

function compareIssueByStandardTaskOrder(a: IssueRow, b: IssueRow): number {
  const ak = normalizeMilestoneTitleKey(a.title);
  const bk = normalizeMilestoneTitleKey(b.title);
  const ar = STANDARD_TASK_TITLE_RANK.get(ak);
  const br = STANDARD_TASK_TITLE_RANK.get(bk);
  if (ar != null && br != null && ar !== br) return ar - br;
  if (ar != null && br == null) return -1;
  if (ar == null && br != null) return 1;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  const titleCmp = a.title.localeCompare(b.title, "id", { sensitivity: "base" });
  if (titleCmp !== 0) return titleCmp;
  return a.id.localeCompare(b.id);
}

function compareFeatureKeyNatural(a: string, b: string): number {
  return a.localeCompare(b, "id", { numeric: true, sensitivity: "base" });
}

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function formatAuditActionLabel(action: string): string {
  const map: Record<string, string> = {
    task_created: "Buat tugas",
    task_progress_updated: "Ubah progres tugas",
    task_basic_updated: "Ubah detail tugas",
    task_deleted: "Hapus tugas",
    task_note_updated: "Ubah catatan tugas",
    task_note_cleared: "Hapus catatan tugas",
    task_status_set: "Set status tugas",
    task_status_cycled: "Rotasi status tugas",
    task_marked_done: "Tandai tugas selesai",
    task_reopened: "Buka ulang tugas",
    task_children_cloned: "Duplikasi turunan tugas",
    project_deleted: "Hapus project",
    project_created: "Buat project",
    project_member_added: "Tambah anggota project",
    project_properties_updated: "Ubah properti project",
    geometry_feature_upserted: "Simpan geometri",
    geometry_feature_batch_upserted: "Impor geometri batch",
    geometry_feature_dxf_imported: "Impor geometri DXF",
    geometry_feature_properties_updated: "Ubah properti geometri",
    geometry_feature_deleted: "Hapus geometri",
    geometry_feature_deleted_all: "Hapus semua geometri unit",
    feature_attribute_csv_upserted: "Impor atribut CSV",
    feature_attribute_upserted: "Simpan atribut fitur",
    feature_attribute_deleted: "Hapus atribut fitur",
    user_logged_in: "Login",
    user_logged_out: "Logout",
  };
  return map[action] ?? action.replaceAll("_", " ");
}

function compareIssueTitleAsc(a: IssueRow, b: IssueRow): number {
  const titleCmp = a.title.localeCompare(b.title, "id", { sensitivity: "base" });
  if (titleCmp !== 0) return titleCmp;
  return a.id.localeCompare(b.id);
}

function buildIssuesChildByParentForMonitoring(
  projectIssues: IssueRow[]
): Map<string, IssueRow[]> {
  const childByParent = new Map<string, IssueRow[]>();
  const issueById = new Map(projectIssues.map((i) => [i.id, i] as const));
  for (const i of projectIssues) {
    if (!i.parent_id) continue;
    const arr = childByParent.get(i.parent_id) ?? [];
    arr.push(i);
    childByParent.set(i.parent_id, arr);
  }
  for (const [parentId, arr] of childByParent.entries()) {
    const parent = issueById.get(parentId);
    const isVillageLevel = parent != null && !parent.parent_id;
    if (isVillageLevel) {
      arr.sort(compareIssueTitleAsc);
      continue;
    }
    arr.sort(compareIssueByStandardTaskOrder);
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
  const milestoneTitleByKey = new Map<string, string>();
  const orderedMilestoneTitles =
    milestoneColumnOrder != null && milestoneColumnOrder.length > 0
      ? milestoneColumnOrder
      : null;
  const orderedTitleByKey = new Map<string, string>();
  if (orderedMilestoneTitles) {
    for (const title of orderedMilestoneTitles) {
      const key = normalizeMilestoneTitleKey(title);
      if (!key || orderedTitleByKey.has(key)) continue;
      orderedTitleByKey.set(key, title.trim() || title);
    }
  }
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
      const titleKey = normalizeMilestoneTitleKey(ms.title);
      if (!titleKey) continue;
      milestoneMetaByTitle.set(titleKey, {
        issueId: ms.id,
        category,
      });
      if (!orderedMilestoneTitles) {
        if (!milestoneTitleByKey.has(titleKey)) {
          milestoneTitleByKey.set(titleKey, ms.title.trim() || ms.title);
        }
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
    orderedMilestoneTitles != null
      ? [...orderedTitleByKey.values()]
      : [...milestoneTitleByKey.values()];

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
  const issueById = new Map(list.map((i) => [i.id, i] as const));
  const byParent = new Map<string | null, IssueRow[]>();
  for (const i of list) {
    const k = i.parent_id;
    const arr = byParent.get(k) ?? [];
    arr.push(i);
    byParent.set(k, arr);
  }
  for (const [parentId, arr] of byParent.entries()) {
    const parent = parentId ? issueById.get(parentId) : null;
    const isVillageLevel = parent != null && !parent.parent_id;
    if (isVillageLevel) {
      arr.sort(compareIssueTitleAsc);
      continue;
    }
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
  firstStatusIdByCategory,
  queueStatusCommit,
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
  firstStatusIdByCategory: Map<string, string>;
  queueStatusCommit: (issueId: string, statusId: string | null) => void;
  onAfterMutation: () => void;
  setTaskNoteEditor: (s: TaskNoteEditorState | null) => void;
  /** Default `mt-8` agar jarak ke chart sama level project & level unit terpilih; kosongkan saat ditumpuk di dashboard project. */
  rootClassName?: string;
  taskMsg: string | null;
}) {
  const [optimisticMilestoneCategoryByIssueId, setOptimisticMilestoneCategoryByIssueId] =
    useState<Record<string, string>>({});

  useEffect(() => {
    setOptimisticMilestoneCategoryByIssueId({});
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
                  const meta = row.milestoneMetaByTitle.get(
                    normalizeMilestoneTitleKey(title)
                  );
                  const effectiveCategory =
                    meta == null
                      ? "todo"
                      : (optimisticMilestoneCategoryByIssueId[meta.issueId] ?? meta.category);
                  return (
                    <td key={`${row.villageIssue.id}:${title}`} className="px-2 py-2">
                      {meta == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!selectedProjectId}
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
                            const nextStatusId = firstStatusIdByCategory.get(nextCategory);
                            if (!nextStatusId) {
                              setTaskMsg(
                                `Status ${nextCategory} belum tersedia di project ini`
                              );
                              return;
                            }
                            queueStatusCommit(meta.issueId, nextStatusId);
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
  statuses: shellStatuses,
  issues: shellIssues,
  projectMembers: shellProjectMembers,
  organizationMembers = [],
  footprints: shellFootprints,
  bidangHasilUkurMap: shellBidangHasilUkurMap,
  issueGeometryFeatureMap: shellIssueGeometryFeatureMap = [],
  issueFeatureAttributes: shellIssueFeatureAttributes = [],
  moduleRegistry: _moduleRegistry,
  organizationModules,
  berkasPermohonan: shellBerkasPermohonan,
  legalisasiGu: shellLegalisasiGu,
  legalisasiGuFiles: shellLegalisasiGuFiles,
  legalisasiGuHistory: shellLegalisasiGuHistory,
  permohonanInfoSpasial: shellPermohonanInfoSpasial,
  pengukuranLapangan: shellPengukuranLapangan,
  pengukuranSurveyor: shellPengukuranSurveyor,
  pengukuranAlat: shellPengukuranAlat,
  pengukuranDokumen: shellPengukuranDokumen,
  alatUkur: shellAlatUkur,
  plmBerkasStatusSummary: shellPlmBerkasStatusSummary = [],
  plmLegalisasiTahapSummary: shellPlmLegalisasiTahapSummary = [],
  plmPengukuranStatusSummary: shellPlmPengukuranStatusSummary = [],
  financeInvoices: shellFinanceInvoices = [],
  financeInvoiceItems: shellFinanceInvoiceItems = [],
  financePembayaran: shellFinancePembayaran = [],
  activityLogs = [],
  userPresence: shellUserPresence = [],
  fetchError: shellFetchError,
  userEmail,
  userId = null,
  virtualTables = [],
  virtualColumns = [],
  virtualDashboardsByProjectId: shellVirtualDashboardsByProjectId = {},
  joinError,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientNavReadyRef = useRef(false);
  /** Tab yang dipilih user — sumber kebenaran saat URL/searchParams tertinggal. */
  const committedViewRef = useRef<ViewId>("Dashboard");
  /** Cegah efek sinkron URL menimpa tab yang baru dipilih (race replaceState vs searchParams). */
  const viewChangeLockUntilRef = useRef(0);
  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  const [taskPending, startTaskTransition] = useTransition();
  const [, startStatusTransition] = useTransition();
  const [, startStatusRefreshTransition] = useTransition();
  const [projectPropertiesOpen, setProjectPropertiesOpen] = useState(false);
  const [projectPropertiesPending, setProjectPropertiesPending] = useState(false);
  const [liveUserPresence, setLiveUserPresence] = useState<UserPresenceRow[]>(shellUserPresence);
  const [liveActivityLogs, setLiveActivityLogs] = useState<ActivityLogRow[]>(activityLogs);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);
  const [tableTaskDialogOpen, setTableTaskDialogOpen] = useState(false);
  const [monitoringAddChildOpen, setMonitoringAddChildOpen] = useState(false);
  const [monitoringAddChildFormNonce, setMonitoringAddChildFormNonce] = useState(0);
  const [monitoringAddChildContext, setMonitoringAddChildContext] =
    useState<MonitoringAddChildContextState | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [organizationDialogOpen, setOrganizationDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [orgStaffDialogOpen, setOrgStaffDialogOpen] = useState(false);
  const [orgStaffMsg, setOrgStaffMsg] = useState<string | null>(null);
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

  // --- Virtual tables ---
  const [activeVirtualTableSlug, setActiveVirtualTableSlug] = useState<string | null>(null);
  const workspaceRightPanelApiRef = useRef<WorkspaceRightPanelApi | null>(null);
  const [vtableCreateDialogOpen, setVtableCreateDialogOpen] = useState(false);
  const [vtableCreateScope, setVtableCreateScope] = useState<"project" | "organization">("project");
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
  const [, startScopeNavTransition] = useTransition();
  const [scopeRoutePending, setScopeRoutePending] = useState(false);

  useEffect(() => {
    clientNavReadyRef.current = true;
  }, []);

  const workspaceActionPending =
    taskPending ||
    mapGeomPending ||
    memberPending ||
    projectPropertiesPending;
  const [taskDeleteConfirm, setTaskDeleteConfirm] =
    useState<TaskDeleteConfirmState | null>(null);
  const [taskNoteEditor, setTaskNoteEditor] = useState<TaskNoteEditorState | null>(null);
  const [taskEditState, setTaskEditState] = useState<TaskEditState | null>(null);
  const [taskCloneDialog, setTaskCloneDialog] = useState<TaskCloneDialogState | null>(
    null
  );
  const [optimisticStatusByIssueId, setOptimisticStatusByIssueId] = useState<
    Record<string, string | null>
  >({});
  const statusCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedStatusCommitByIssueRef = useRef<Map<string, string | null>>(new Map());
  const [hierarchyLabels, setHierarchyLabels] = useState<Record<number, string>>({});
  const statusRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    parentIssueIdsWithChildren(shellIssues)
  );
  const isBelowMd = useIsBelowMd();
  const [mobileChatKeyboardOpen, setMobileChatKeyboardOpen] = useState(false);
  const [mobileChatConversationOpen, setMobileChatConversationOpen] =
    useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [mobileScopePhase, setMobileScopePhase] = useState<MobileScopePhase | null>(
    null
  );
  const mobileScopeInitializedRef = useRef(false);

  useEffect(() => {
    setIsSidebarCollapsed(isBelowMd);
  }, [isBelowMd]);

  useEffect(() => {
    setLiveUserPresence(shellUserPresence);
  }, [shellUserPresence]);

  const orgsWithProjects = useMemo(() => {
    const ids = new Set(projects.map((p) => p.organization_id));
    return organizations
      .filter((o) => ids.has(o.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations, projects]);

  const orgIdFromSearchParams = useMemo(() => {
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

  /** State + URL: org di sidebar harus langsung ikut saat klik, tidak menunggu searchParams/RSC. */
  const [canonicalOrgId, setCanonicalOrgId] = useState<string | null>(
    orgIdFromSearchParams
  );
  const projectsInOrg = useMemo(() => {
    if (!canonicalOrgId) return [];
    return projects
      .filter((p) => p.organization_id === canonicalOrgId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, canonicalOrgId]);

  const activityLogsCacheKey = useMemo(() => {
    if (!canonicalOrgId) return null;
    return buildActivityLogsCacheKey(
      canonicalOrgId,
      projectsInOrg.map((p) => p.id)
    );
  }, [canonicalOrgId, projectsInOrg]);

  useLayoutEffect(() => {
    if (!activityLogsCacheKey) return;
    const cached = getActivityLogsCache(activityLogsCacheKey);
    if (cached?.logs.length) {
      setLiveActivityLogs(cached.logs);
      return;
    }
    let cancelled = false;
    void hydrateActivityLogsCache(activityLogsCacheKey).then((fromIdb) => {
      if (cancelled || !fromIdb?.logs.length) return;
      setLiveActivityLogs(fromIdb.logs);
    });
    return () => {
      cancelled = true;
    };
  }, [activityLogsCacheKey]);

  useEffect(() => {
    if (!activityLogsCacheKey) {
      setLiveActivityLogs(activityLogs);
      return;
    }
    setLiveActivityLogs(activityLogs);
    if (activityLogs.length > 0) {
      setActivityLogsCache(activityLogsCacheKey, { logs: activityLogs });
    }
  }, [activityLogs, activityLogsCacheKey]);

  const projectIdFromSearchParams = useMemo(() => {
    const q = searchParams.get("project");
    if (q && projectsInOrg.some((p) => p.id === q)) return q;
    return projectsInOrg[0]?.id ?? null;
  }, [searchParams, projectsInOrg]);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdFromSearchParams
  );

  const activeViewFromUrl = useMemo((): ViewId => {
    const viewParam = searchParams.get("view");
    const raw = parseViewParam(viewParam) ?? "Dashboard";
    const enabled = effectiveEnabledModuleCodes(
      canonicalOrgId,
      organizationModules
    );
    if (!isViewAllowedForModules(raw, enabled)) return "Dashboard";
    return raw;
  }, [searchParams, canonicalOrgId, organizationModules]);
  const [activeView, setActiveView] = useState<ViewId>(activeViewFromUrl);
  committedViewRef.current = activeViewFromUrl;

  useEffect(() => {
    return listenForNotificationClickNavigate((url) => {
      const path = url.startsWith("/") ? url : `/${url}`;
      router.push(path);
    });
  }, [router]);

  const deferredWorkspace = useWorkspaceDeferredPayload({
    issues: shellIssues,
    statuses: shellStatuses,
    projectMembers: shellProjectMembers,
    footprints: shellFootprints,
    bidangHasilUkurMap: shellBidangHasilUkurMap,
    issueGeometryFeatureMap: shellIssueGeometryFeatureMap,
    issueFeatureAttributes: shellIssueFeatureAttributes,
    berkasPermohonan: shellBerkasPermohonan,
    legalisasiGu: shellLegalisasiGu,
    legalisasiGuFiles: shellLegalisasiGuFiles,
    legalisasiGuHistory: shellLegalisasiGuHistory,
    permohonanInfoSpasial: shellPermohonanInfoSpasial,
    pengukuranLapangan: shellPengukuranLapangan,
    pengukuranSurveyor: shellPengukuranSurveyor,
    pengukuranAlat: shellPengukuranAlat,
    pengukuranDokumen: shellPengukuranDokumen,
    alatUkur: shellAlatUkur,
    plmBerkasStatusSummary: shellPlmBerkasStatusSummary,
    plmLegalisasiTahapSummary: shellPlmLegalisasiTahapSummary,
    plmPengukuranStatusSummary: shellPlmPengukuranStatusSummary,
    financeInvoices: shellFinanceInvoices,
    financeInvoiceItems: shellFinanceInvoiceItems,
    financePembayaran: shellFinancePembayaran,
    userPresence: shellUserPresence,
    virtualDashboardsByProjectId: shellVirtualDashboardsByProjectId,
    activeView,
    canonicalOrgId,
    selectedProjectId,
    projectsInOrg,
    organizationMembers,
    organizationModules,
    shellFetchError,
  });

  const {
    issues,
    statuses,
    projectMembers,
    footprints,
    bidangHasilUkurMap,
    issueGeometryFeatureMap,
    issueFeatureAttributes,
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
    plmBerkasStatusSummary,
    plmLegalisasiTahapSummary,
    plmPengukuranStatusSummary,
    financeInvoices,
    financeInvoiceItems,
    financePembayaran,
    userPresence,
    virtualDashboardsByProjectId,
    fetchError,
    loading: deferredPayloadLoading,
  } = deferredWorkspace;

  useEffect(() => {
    setLiveUserPresence(userPresence);
  }, [userPresence]);

  useEffect(() => {
    setCollapsedIssueIds(parentIssueIdsWithChildren(issues));
  }, [issues, selectedProjectId]);

  const showMobileScopeWizard = isBelowMd && mobileScopePhase !== "workspace";

  useEffect(() => {
    if (!isBelowMd) {
      setMobileScopePhase(null);
      mobileScopeInitializedRef.current = false;
      return;
    }

    const urlOrg = searchParams.get("org");
    const urlProject = searchParams.get("project");
    const orgValid =
      Boolean(urlOrg) && orgsWithProjects.some((o) => o.id === urlOrg);
    const projectValid =
      orgValid &&
      Boolean(urlProject) &&
      projects.some(
        (p) => p.id === urlProject && p.organization_id === urlOrg
      );

    if (orgValid && projectValid) {
      setMobileScopePhase("workspace");
      mobileScopeInitializedRef.current = true;
      return;
    }

    if (!mobileScopeInitializedRef.current) {
      const saved = readMobileScopeSession();
      const savedOrgValid =
        Boolean(saved?.orgId) &&
        orgsWithProjects.some((o) => o.id === saved!.orgId);
      const savedProjectValid =
        savedOrgValid &&
        Boolean(saved?.projectId) &&
        projects.some(
          (p) =>
            p.id === saved!.projectId &&
            p.organization_id === saved!.orgId
        );

      if (
        saved?.phase === "workspace" &&
        savedOrgValid &&
        savedProjectValid &&
        saved.orgId &&
        saved.projectId
      ) {
        setCanonicalOrgId(saved.orgId);
        setSelectedProjectId(saved.projectId);
        setSelectedTaskId(null);
        setMobileScopePhase("workspace");
        const p = new URLSearchParams(searchParams.toString());
        p.set("org", saved.orgId);
        p.set("project", saved.projectId);
        p.delete("task");
        if (!p.get("view")) {
          const view = saved.lastView ?? "Dashboard";
          p.set("view", viewToParam(view));
        }
        const qs = p.toString();
        window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
        mobileScopeInitializedRef.current = true;
        return;
      }

      if (
        saved?.phase === "project" &&
        savedOrgValid &&
        saved.orgId &&
        !projectValid
      ) {
        setCanonicalOrgId(saved.orgId);
        setSelectedProjectId(null);
        setSelectedTaskId(null);
        setMobileScopePhase("project");
        const p = new URLSearchParams(searchParams.toString());
        p.set("org", saved.orgId);
        p.delete("project");
        p.delete("task");
        if (!p.get("view")) {
          const view = saved.lastView ?? "Dashboard";
          p.set("view", viewToParam(view));
        }
        const qs = p.toString();
        window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
        mobileScopeInitializedRef.current = true;
        return;
      }

      if (orgsWithProjects.length === 1) {
        const onlyOrgId = orgsWithProjects[0]!.id;
        setCanonicalOrgId(onlyOrgId);
        setSelectedProjectId(null);
        setSelectedTaskId(null);
        setMobileScopePhase("project");
      } else if (orgValid && urlOrg) {
        setCanonicalOrgId(urlOrg);
        setSelectedProjectId(null);
        setSelectedTaskId(null);
        setMobileScopePhase("project");
      } else {
        setCanonicalOrgId(null);
        setSelectedProjectId(null);
        setSelectedTaskId(null);
        setMobileScopePhase("org");
      }
      mobileScopeInitializedRef.current = true;
    }
  }, [
    isBelowMd,
    searchParams,
    orgsWithProjects,
    projects,
  ]);

  useEffect(() => {
    if (!isBelowMd || mobileScopePhase == null) {
      clearMobileScopeSession();
      return;
    }
    writeMobileScopeSession({
      phase: mobileScopePhase,
      orgId: canonicalOrgId,
      projectId: selectedProjectId,
      lastView: mobileScopePhase === "workspace" ? activeView : null,
    });
  }, [isBelowMd, mobileScopePhase, canonicalOrgId, selectedProjectId, activeView]);

  useEffect(() => {
    if (isBelowMd) setIsSidebarCollapsed(true);
  }, [canonicalOrgId, selectedProjectId, isBelowMd]);

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
    setOptimisticStatusByIssueId({});
    queuedStatusCommitByIssueRef.current.clear();
    if (statusCommitTimerRef.current) {
      clearTimeout(statusCommitTimerRef.current);
      statusCommitTimerRef.current = null;
    }
  }, [issues, selectedProjectId]);

  useEffect(() => {
    return () => {
      if (statusCommitTimerRef.current) {
        clearTimeout(statusCommitTimerRef.current);
        statusCommitTimerRef.current = null;
      }
      if (statusRefreshTimerRef.current) {
        clearTimeout(statusRefreshTimerRef.current);
        statusRefreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedProjectId || !userId) return;
    let stopped = false;
    const beat = async () => {
      if (stopped) return;
      const fd = new FormData();
      fd.set("project_id", selectedProjectId);
      const r = await heartbeatUserPresenceAction(fd);
      if (stopped || r.error) return;
      const nowIso = new Date().toISOString();
      setLiveUserPresence((prev) => {
        const next = prev.filter(
          (p) => !(p.user_id === userId && p.project_id === selectedProjectId)
        );
        next.push({
          user_id: userId,
          project_id: selectedProjectId,
          last_seen_at: nowIso,
          updated_at: nowIso,
        });
        return next;
      });
    };
    void beat();
    const timer = setInterval(() => {
      void beat();
    }, 30_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [selectedProjectId, userId]);

  /** Saat pindah organisasi saja — jangan reset tiap router.refresh (issues array baru). */
  useEffect(() => {
    if (!canonicalOrgId) return;
    const projectIdsInOrg = new Set(
      projects
        .filter((p) => p.organization_id === canonicalOrgId)
        .map((p) => p.id)
    );
    setCollapsedProjectIds(new Set(projectIdsInOrg));
    const issuesInOrg = issues.filter((i) => projectIdsInOrg.has(i.project_id));
    setCollapsedIssueIds(parentIssueIdsWithChildren(issuesInOrg));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya saat ganti org
  }, [canonicalOrgId]);

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

  const applyActiveView = useCallback((v: ViewId) => {
    committedViewRef.current = v;
    setActiveView(v);
  }, []);

  const refreshActivityLogs = useCallback(async () => {
    if (!canonicalOrgId || !activityLogsCacheKey) return;
    const scopedIds = projectsInOrg.map((p) => p.id);
    const res = await fetchActivityLogsAction(canonicalOrgId, scopedIds);
    if (!res.error) {
      setLiveActivityLogs(res.logs);
      setActivityLogsCache(activityLogsCacheKey, { logs: res.logs });
    }
  }, [canonicalOrgId, projectsInOrg, activityLogsCacheKey]);

  useEffect(() => {
    if (activeView !== "Aktivitas") {
      setActivityLogsLoading(false);
      return;
    }
    const cached =
      activityLogsCacheKey != null
        ? getActivityLogsCache(activityLogsCacheKey)
        : null;
    if (cached?.logs.length) {
      setLiveActivityLogs(cached.logs);
    }
    const showSkeleton =
      !cached?.logs.length &&
      activityLogs.length === 0 &&
      liveActivityLogs.length === 0;
    if (showSkeleton) setActivityLogsLoading(true);

    let cancelled = false;
    void refreshActivityLogs().finally(() => {
      if (!cancelled) setActivityLogsLoading(false);
    });
    const timer = setInterval(() => void refreshActivityLogs(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      setActivityLogsLoading(false);
    };
  }, [activeView, refreshActivityLogs, activityLogsCacheKey, activityLogs.length, liveActivityLogs.length]);

  /** Sinkron dari URL hanya saat navigasi eksternal (back/forward, notifikasi, RSC). */
  useEffect(() => {
    if (Date.now() < viewChangeLockUntilRef.current) return;

    const enabled = effectiveEnabledModuleCodes(
      canonicalOrgId,
      organizationModules
    );
    const committed = committedViewRef.current;
    if (!isViewAllowedForModules(committed, enabled)) return;

    const winView =
      typeof window !== "undefined"
        ? parseViewParam(
            new URLSearchParams(window.location.search).get("view")
          )
        : null;

    if (winView === committed) {
      setActiveView((current) => (current === committed ? current : committed));
      return;
    }

    if (activeViewFromUrl === committed) {
      setActiveView((current) => (current === committed ? current : committed));
      return;
    }

    // URL/searchParams masih view lama — pertahankan tab committed, jangan revert.
    if (winView && winView !== committed) {
      setActiveView((current) => (current === committed ? current : committed));
    }
  }, [activeViewFromUrl, canonicalOrgId, organizationModules]);

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

  const issueIdsInSelectedProjectKey = useMemo(() => {
    if (!selectedProjectId) return "";
    return issues
      .filter((i) => i.project_id === selectedProjectId)
      .map((i) => i.id)
      .sort()
      .join(",");
  }, [issues, selectedProjectId]);

  useEffect(() => {
    if (!clientNavReadyRef.current) return;
    if (Date.now() < viewChangeLockUntilRef.current) return;
    if (projects.length === 0 || !canonicalOrgId || !selectedProjectId) return;
    if (scopeRoutePending) return;
    const p = workspaceUrlParamsBaseline(
      searchParams,
      canonicalOrgId,
      selectedProjectId,
      projects
    );
    let dirty = false;

    const projectPool = projects.filter(
      (x) => x.organization_id === canonicalOrgId
    );

    const urlProject = p.get("project");
    const projectValid =
      Boolean(urlProject) && projectPool.some((x) => x.id === urlProject);

    if (!projectValid && selectedProjectId) {
      if (projectPool.some((x) => x.id === selectedProjectId)) {
        p.set("project", selectedProjectId);
        dirty = true;
      }
    }
    if (!p.get("view")) {
      p.set("view", viewToParam("Dashboard"));
      dirty = true;
    }
    const tid = p.get("task");
    if (tid && selectedProjectId) {
      const ids = issueIdsInSelectedProjectKey
        ? issueIdsInSelectedProjectKey.split(",")
        : [];
      if (!ids.includes(tid)) {
        p.delete("task");
        dirty = true;
      }
    }
    const enabled = effectiveEnabledModuleCodes(
      canonicalOrgId,
      organizationModules
    );
    const committed = committedViewRef.current;
    if (isViewAllowedForModules(committed, enabled)) {
      const viewInP = parseViewParam(p.get("view"));
      if (viewInP !== committed) {
        p.set("view", viewToParam(committed));
        dirty = true;
      }
    }
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
    if (viewParsed && !isViewAllowedForModules(viewParsed, enabled)) {
      p.set("view", viewToParam("Dashboard"));
      dirty = true;
    }
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
    issueIdsInSelectedProjectKey,
    organizationModules,
    berkasPermohonan,
    scopeRoutePending,
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

  const projectIdsWithOwner = useMemo(() => {
    return new Set(
      projectMembers.filter((m) => m.role === "owner").map((m) => m.project_id)
    );
  }, [projectMembers]);

  const isMemberOfSelectedProject = useMemo(() => {
    if (!selectedProjectId || !userId) return false;
    return projectMembers.some(
      (m) => m.project_id === selectedProjectId && m.user_id === userId
    );
  }, [projectMembers, selectedProjectId, userId]);

  const selectedProjectHasNoOwner = useMemo(() => {
    if (!selectedProjectId) return false;
    return !projectIdsWithOwner.has(selectedProjectId);
  }, [projectIdsWithOwner, selectedProjectId]);

  /** Owner, atau anggota saat project belum punya owner (recovery seed demo). */
  const isOrgAdminOfCanonicalOrg = useMemo(() => {
    if (!canonicalOrgId || !userId) return false;
    return organizationMembers.some(
      (m) =>
        m.organization_id === canonicalOrgId &&
        m.user_id === userId &&
        (m.role === "owner" || m.role === "admin")
    );
  }, [organizationMembers, canonicalOrgId, userId]);

  const canManageSelectedProject = useMemo(
    () =>
      isOwnerOfSelectedProject ||
      isOrgAdminOfCanonicalOrg ||
      (selectedProjectHasNoOwner && isMemberOfSelectedProject),
    [
      isOwnerOfSelectedProject,
      isOrgAdminOfCanonicalOrg,
      selectedProjectHasNoOwner,
      isMemberOfSelectedProject,
    ]
  );

  const canDeleteProject = useCallback(
    (projectId: string) => {
      if (!userId) return false;
      const projectOrgId = projects.find((p) => p.id === projectId)?.organization_id;
      if (
        projectOrgId &&
        organizationMembers.some(
          (m) =>
            m.organization_id === projectOrgId &&
            m.user_id === userId &&
            (m.role === "owner" || m.role === "admin")
        )
      ) {
        return true;
      }
      if (
        projectMembers.some(
          (m) =>
            m.project_id === projectId &&
            m.user_id === userId &&
            m.role === "owner"
        )
      ) {
        return true;
      }
      if (!projectIdsWithOwner.has(projectId)) {
        return projectMembers.some(
          (m) => m.project_id === projectId && m.user_id === userId
        );
      }
      return false;
    },
    [projectMembers, projectIdsWithOwner, userId, projects, organizationMembers]
  );

  const hasOrgStaffAccess = useMemo(() => {
    if (!canonicalOrgId || !userId) return false;
    return organizationMembers.some(
      (m) =>
        m.organization_id === canonicalOrgId &&
        m.user_id === userId &&
        ORG_STAFF_ROLES.has(m.role)
    );
  }, [organizationMembers, canonicalOrgId, userId]);

  const canManageOrgStaff = useMemo(() => {
    if (!canonicalOrgId || !userId) return false;
    return organizationMembers.some(
      (m) =>
        m.organization_id === canonicalOrgId &&
        m.user_id === userId &&
        ORG_ADMIN_ROLES.has(m.role)
    );
  }, [organizationMembers, canonicalOrgId, userId]);

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
  const firstStatusIdByCategory = useMemo(() => {
    const out = new Map<string, string>();
    for (const s of statusesForProject) {
      if (!out.has(s.category)) out.set(s.category, s.id);
    }
    return out;
  }, [statusesForProject]);
  const defaultStatusId = statusesForProject[0]?.id ?? null;
  const issueStatusIdById = useMemo(() => {
    const out = new Map<string, string | null>();
    for (const i of issues) out.set(i.id, i.status_id ?? null);
    return out;
  }, [issues]);

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
    const projectIssues = issues.filter((i) => i.project_id === selectedProjectId);
    const childByParent = new Map<string, IssueRow[]>();
    for (const issue of projectIssues) {
      if (!issue.parent_id) continue;
      const arr = childByParent.get(issue.parent_id) ?? [];
      arr.push(issue);
      childByParent.set(issue.parent_id, arr);
    }
    const issueCategory = (issue: IssueRow): string =>
      issue.status_id ? (categoryByStatusId.get(issue.status_id) ?? "todo") : "todo";
    const summaryByDepth = new Map<number, { count: number; doneCount: number }>();
    for (const issue of projectIssues) {
      const depth = projectIssueDepthById.get(issue.id);
      if (depth == null) continue;
      const current = summaryByDepth.get(depth) ?? { count: 0, doneCount: 0 };
      current.count += 1;
      if (depth === 1) {
        const children = childByParent.get(issue.id) ?? [];
        const doneByChildren =
          children.length > 0 && children.every((child) => issueCategory(child) === "done");
        if (doneByChildren) current.doneCount += 1;
      } else if (issueCategory(issue) === "done") {
        current.doneCount += 1;
      }
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
  const geometrySummary = useMemo(() => {
    const geometryCount = issueGeometryForSelectedProject.length;
    const uniqueIssueIds = [
      ...new Set(issueGeometryForSelectedProject.map((g) => g.issue_id)),
    ];
    const issueCountWithGeometry = uniqueIssueIds.length;
    const depthFrequency = new Map<number, number>();
    for (const issueId of uniqueIssueIds) {
      const depth = projectIssueDepthById.get(issueId);
      if (depth == null) continue;
      depthFrequency.set(depth, (depthFrequency.get(depth) ?? 0) + 1);
    }
    let dominantDepth: number | null = null;
    let dominantCount = -1;
    for (const [depth, count] of depthFrequency.entries()) {
      if (count > dominantCount) {
        dominantDepth = depth;
        dominantCount = count;
      }
    }
    const attachedLevelLabel =
      dominantDepth != null ? labelForDepth(dominantDepth).toLowerCase() : "unit";
    return { geometryCount, issueCountWithGeometry, attachedLevelLabel };
  }, [issueGeometryForSelectedProject, labelForDepth, projectIssueDepthById]);

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
            compareFeatureKeyNatural(a.feature_key, b.feature_key) ||
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

  // --- Virtual table geometry for map ---
  const [mapShowVirtualTableGeometry, setMapShowVirtualTableGeometry] = useState(true);
  const [vtableGeometryLayers, setVtableGeometryLayers] = useState<MapFootprint[]>([]);
  const [mapTabEpoch, setMapTabEpoch] = useState(0);
  const [mapImportTableId, setMapImportTableId] = useState<string>("");
  const [mapGeoImportOpen, setMapGeoImportOpen] = useState(false);
  const [mapDxfImportOpen, setMapDxfImportOpen] = useState(false);
  const [mapLayerUploadOpen, setMapLayerUploadOpen] = useState(false);
  const [mapImportTableRows, setMapImportTableRows] = useState<VirtualDataRow[]>(
    []
  );
  const [mapImportPreviewLayers, setMapImportPreviewLayers] = useState<
    MapFootprint[]
  >([]);

  useEffect(() => {
    if (activeView !== "Map") {
      setMapImportPreviewLayers([]);
      setMapGeoImportOpen(false);
      setMapDxfImportOpen(false);
      setMapLayerUploadOpen(false);
    }
  }, [activeView]);

  /** Muat ulang geometri virtual table di peta saat ganti project (bukan tiap buka tab Map). */
  useEffect(() => {
    setMapTabEpoch((n) => n + 1);
  }, [selectedProjectId]);

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
    return [...issueGeom, ...vtableGeometryLayers];
  }, [
    issueGeometryVisibleForMap,
    vtableGeometryLayers,
  ]);

  const visibleMapLayers = useMemo(() => {
    const combined = [...mapImportPreviewLayers, ...mapLayersForSelectedProject];
    return combined.filter((layer) => {
      const k = layer.layerKind ?? "demo";
      if (k === "import_preview") return true;
      if (k === "issue_geometry") return mapShowIssueGeometry;
      if (k === "virtual_table") return mapShowVirtualTableGeometry;
      return true;
    });
  }, [
    mapImportPreviewLayers,
    mapLayersForSelectedProject,
    mapShowIssueGeometry,
    mapShowVirtualTableGeometry,
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

  const projectsForMention = useMemo(() => {
    if (!canonicalOrgId) return [];
    return projects
      .filter(
        (p) => p.organization_id === canonicalOrgId
      )
      .map((p) => ({ id: p.id, name: p.name, key: p.key }));
  }, [projects, canonicalOrgId]);

  const workspaceChatMentionOptions = useMemo((): ChatMentionOption[] => {
    const opts: ChatMentionOption[] = [];
    for (const m of projectMembersForSelectedProject) {
      const label = m.display_name?.trim() || m.user_id.slice(0, 8);
      opts.push({
        id: m.user_id,
        label,
        kind: "user",
        searchText: label.toLowerCase(),
      });
    }
    for (const p of projectsForMention) {
      opts.push({
        id: p.id,
        label: p.name,
        kind: "project",
        searchText: `${p.name} ${p.key}`.toLowerCase(),
      });
    }
    return opts;
  }, [projectMembersForSelectedProject, projectsForMention]);

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

  // --- Virtual tables: org-level + project-level ---
  const vtablesForOrg = useMemo(
    () =>
      canonicalOrgId && hasOrgStaffAccess
        ? virtualTables.filter((vt) => vt.organization_id === canonicalOrgId && !vt.project_id)
        : [],
    [virtualTables, canonicalOrgId, hasOrgStaffAccess]
  );

  const vtablesForProject = useMemo(
    () =>
      selectedProjectId
        ? virtualTables.filter((vt) => vt.project_id === selectedProjectId)
        : [],
    [virtualTables, selectedProjectId]
  );

  const allAccessibleVtables = useMemo(
    () => [...vtablesForOrg, ...vtablesForProject],
    [vtablesForOrg, vtablesForProject]
  );

  useEffect(() => {
    if (!canonicalOrgId || !userId) return;
    if (projectsInOrg.length === 0 && !hasOrgStaffAccess) return;

    return startWorkspaceWarmup({
      organizationId: canonicalOrgId,
      selectedProjectId,
      projects,
      organizations,
      organizationMembers,
      organizationModules,
      virtualTables,
      hasOrgStaffAccess,
      userId,
    });
  }, [
    canonicalOrgId,
    selectedProjectId,
    userId,
    projectsInOrg,
    projects,
    organizations,
    organizationMembers,
    organizationModules,
    virtualTables,
    hasOrgStaffAccess,
  ]);

  const vtablesAllProjectsInOrg = useMemo(() => {
    if (!canonicalOrgId) return [];
    const projectIds = new Set(projectsInOrg.map((p) => p.id));
    return virtualTables.filter(
      (vt) => vt.project_id != null && projectIds.has(vt.project_id)
    );
  }, [virtualTables, canonicalOrgId, projectsInOrg]);

  const virtualTableIdsForChatUnread = useMemo(() => {
    const ids = new Set<string>();
    for (const vt of vtablesForOrg) ids.add(vt.id);
    for (const vt of vtablesAllProjectsInOrg) ids.add(vt.id);
    return [...ids];
  }, [vtablesForOrg, vtablesAllProjectsInOrg]);

  const tablesForProjectChatBadge = useMemo(
    () =>
      vtablesAllProjectsInOrg.map((vt) => ({
        id: vt.id,
        projectId: vt.project_id,
      })),
    [vtablesAllProjectsInOrg]
  );

  const scopeTableIdsForChatBadge = useMemo(
    () => allAccessibleVtables.map((vt) => vt.id),
    [allAccessibleVtables]
  );

  const activeVirtualTable = useMemo(
    () =>
      activeVirtualTableSlug
        ? allAccessibleVtables.find((vt) => vt.slug === activeVirtualTableSlug) ?? null
        : null,
    [allAccessibleVtables, activeVirtualTableSlug]
  );

  /** Header: Organisasi › Project › Tabel (overlay). */
  const workspaceHeaderBreadcrumb = useMemo((): string[] => {
    const segments: string[] = [];
    const orgName = selectedOrganization?.name?.trim();
    if (orgName) segments.push(orgName);
    const projectName = selectedProject?.name?.trim();
    if (projectName) segments.push(projectName);
    const tableName = activeVirtualTable?.display_name?.trim();
    if (tableName) segments.push(tableName);
    return segments.length > 0 ? segments : ["—"];
  }, [selectedOrganization, selectedProject, activeVirtualTable]);

  const workspaceHeaderBreadcrumbTitle = useMemo(
    () => workspaceHeaderBreadcrumb.join(" › "),
    [workspaceHeaderBreadcrumb]
  );

  const virtualColumnsByTableId = useMemo(() => {
    const map = new Map<string, typeof virtualColumns>();
    for (const col of virtualColumns) {
      const list = map.get(col.table_id);
      if (list) list.push(col);
      else map.set(col.table_id, [col]);
    }
    return map;
  }, [virtualColumns]);

  const activeVirtualTableColumns = useMemo(
    () =>
      activeVirtualTable
        ? (virtualColumnsByTableId.get(activeVirtualTable.id) ?? [])
        : [],
    [virtualColumnsByTableId, activeVirtualTable]
  );

  // Identify virtual tables with geometry columns (org + project)
  const vtablesWithGeometry = useMemo(() => {
    const geoCols = virtualColumns.filter((c) => c.data_type === "geometry");
    if (geoCols.length === 0) return [];
    const tableIdsWithGeo = new Set(geoCols.map((c) => c.table_id));
    return allAccessibleVtables.filter((vt) => tableIdsWithGeo.has(vt.id));
  }, [virtualColumns, allAccessibleVtables]);

  const vtablesWithGeometrySig = useMemo(
    () => vtablesWithGeometry.map((vt) => vt.id).join(","),
    [vtablesWithGeometry]
  );

  const virtualColumnsGeomSig = useMemo(
    () =>
      virtualColumns
        .filter((c) => c.data_type === "geometry")
        .map((c) => `${c.id}:${c.table_id}:${c.slug}`)
        .join("|"),
    [virtualColumns]
  );

  useEffect(() => {
    if (vtablesWithGeometry.length === 0) {
      setMapImportTableId("");
      return;
    }
    setMapImportTableId((prev) => {
      if (prev && vtablesWithGeometry.some((vt) => vt.id === prev)) return prev;
      const preferred =
        vtablesWithGeometry.find((vt) => {
          const name = `${vt.display_name} ${vt.slug}`.toLowerCase();
          return (
            name.includes("daftar bidang") ||
            name.includes("bidang tanah") ||
            name.includes("bidang")
          );
        }) ?? vtablesWithGeometry[0];
      return preferred?.id ?? "";
    });
  }, [vtablesWithGeometry]);

  const mapImportTable = useMemo(
    () =>
      mapImportTableId
        ? allAccessibleVtables.find((vt) => vt.id === mapImportTableId) ?? null
        : null,
    [mapImportTableId, allAccessibleVtables]
  );

  const mapImportTableColumns = useMemo(
    () =>
      mapImportTableId
        ? virtualColumns.filter((c) => c.table_id === mapImportTableId)
        : [],
    [mapImportTableId, virtualColumns]
  );

  const handleMapImportPreviewChange = useCallback(
    (layers: MapFootprint[] | null) => {
      setMapImportPreviewLayers((prev) => {
        const nextSig = mapPreviewLayersSignature(layers);
        const prevSig = mapPreviewLayersSignature(prev);
        if (nextSig === prevSig) return prev;
        return layers ?? [];
      });
    },
    []
  );

  const handleMapGeoImportOpenChange = useCallback((open: boolean) => {
    setMapGeoImportOpen(open);
    if (!open) setMapImportPreviewLayers([]);
  }, []);

  const handleMapGeoImported = useCallback(() => {
    setMapImportPreviewLayers([]);
    setMapGeoImportOpen(false);
    setMapTabEpoch((n) => n + 1);
    router.refresh();
  }, [router]);

  const handleMapDxfImportOpenChange = useCallback((open: boolean) => {
    setMapDxfImportOpen(open);
  }, []);

  const handleMapDxfImported = useCallback(() => {
    setMapDxfImportOpen(false);
    setMapTabEpoch((n) => n + 1);
    router.refresh();
  }, [router]);

  const handleMapLayerUploadOpenChange = useCallback((open: boolean) => {
    setMapLayerUploadOpen(open);
    if (!open) setMapImportPreviewLayers([]);
  }, []);

  const handleMapLayerCreated = useCallback(
    (result: LayerUploadCreated) => {
      setMapImportPreviewLayers([]);
      setMapLayerUploadOpen(false);
      setMapImportTableId(result.tableId);
      setActiveVirtualTableSlug(result.tableSlug);
      setMapTabEpoch((n) => n + 1);
      router.refresh();
    },
    [router]
  );

  useEffect(() => {
    if (!mapDxfImportOpen || !mapImportTableId) {
      setMapImportTableRows([]);
      return;
    }
    let cancelled = false;
    void fetchVirtualRowsAction(mapImportTableId).then((result) => {
      if (cancelled) return;
      setMapImportTableRows(
        result.error ? [] : (result.rows as VirtualDataRow[])
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mapDxfImportOpen, mapImportTableId]);

  useEffect(() => {
    if (vtablesWithGeometry.length === 0) {
      setVtableGeometryLayers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const layers: MapFootprint[] = [];
      for (const vt of vtablesWithGeometry) {
        const result = await fetchVirtualRowsAction(vt.id);
        if (cancelled) return;
        if (result.error || !result.rows) continue;

        const tableCols: VirtualColumnForMapPopup[] = virtualColumns
          .filter((c) => c.table_id === vt.id)
          .map((c) => ({
            slug: c.slug,
            display_name: c.display_name,
            data_type: c.data_type,
            position: c.position,
          }));

        const geoCols = tableCols.filter((c) => c.data_type === "geometry");

        const rowPayloads = result.rows.map((row) => ({
          payload:
            ((row as Record<string, unknown>).payload as Record<string, unknown> | null) ??
            {},
        }));
        const relationIds = collectRelationIdsFromVirtualPayloads(
          rowPayloads,
          tableCols
        );
        let relationLabels: Record<string, string> = {};
        if (relationIds.length > 0) {
          const resolved = await resolveRelationLabelsAction(relationIds);
          if (cancelled) return;
          if (!resolved.error) relationLabels = resolved.labels;
        }

        for (const row of result.rows) {
          const payload = (row as Record<string, unknown>).payload as Record<
            string,
            unknown
          > | null;
          if (!payload) continue;
          const rowId = (row as Record<string, unknown>).id as string;
          const rowTitle = pickMapRowTitle(
            payload,
            tableCols,
            relationLabels,
            rowId
          );
          const chatPathSegments = buildChatRowPathSegments({
            projectName: selectedProject?.name ?? null,
            tableDisplayName: vt.display_name,
            rowLabel: rowTitle,
          });

          for (const gc of geoCols) {
            const geo = payload[gc.slug];
            if (!geo || typeof geo !== "object") continue;
            layers.push({
              id: `vtable:${rowId}:${gc.slug}`,
              label: `${vt.display_name}: ${rowTitle}`,
              geojson: geo,
              popupProperties: buildVirtualTableMapPopupProperties(
                vt.display_name,
                tableCols,
                payload,
                relationLabels,
                memberNameByUserId,
                {
                  skipGeometrySlug: gc.slug,
                  rowTitle,
                  virtualRowId: rowId,
                  virtualTableId: vt.id,
                  projectName: selectedProject?.name ?? null,
                  chatPathSegments,
                }
              ),
              layerKind: "virtual_table",
              virtualTableId: vt.id,
            });
          }
        }
      }
      if (!cancelled) setVtableGeometryLayers(layers);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mapTabEpoch,
    vtablesWithGeometry,
    vtablesWithGeometrySig,
    virtualColumnsGeomSig,
    memberNameByUserId,
  ]);

  const tableRows = useMemo((): TableRow[] => {
    if (!selectedProjectId) return [];
    if (selectedTaskId) {
      const children = issues
        .filter((i) => i.parent_id === selectedTaskId)
        .sort(compareIssueByStandardTaskOrder);
      /** Baris unit terpilih tidak ditampilkan; hanya turunan langsungnya. */
      return children.map((issue) => ({ issue, depth: 0 }));
    }
    return issues
      .filter((i) => i.project_id === selectedProjectId && !i.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((issue) => ({ issue, depth: 0 }));
  }, [selectedProjectId, selectedTaskId, issues]);

  const onlineUsersForSelectedProject = useMemo(() => {
    if (!selectedProjectId) return [] as Array<{ userId: string; name: string; at: string }>;
    const timeoutMs = 90_000;
    const nowMs = Date.now();
    const online = liveUserPresence
      .filter((p) => p.project_id === selectedProjectId)
      .filter((p) => {
        const seenMs = Date.parse(p.last_seen_at);
        if (!Number.isFinite(seenMs)) return false;
        return nowMs - seenMs <= timeoutMs;
      })
      .map((p) => ({
        userId: p.user_id,
        name: memberNameByUserId.get(p.user_id) ?? p.user_id,
        at: p.last_seen_at,
      }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return online;
  }, [liveUserPresence, memberNameByUserId, selectedProjectId]);

  const memberPresenceRowsForSelectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return [] as Array<{ userId: string; name: string; isOnline: boolean; lastSeenAt: string | null }>;
    }
    const timeoutMs = 90_000;
    const nowMs = Date.now();
    const seenByUser = new Map<string, string>();
    for (const p of liveUserPresence) {
      if (p.project_id !== selectedProjectId) continue;
      const prev = seenByUser.get(p.user_id);
      if (!prev || Date.parse(p.last_seen_at) > Date.parse(prev)) {
        seenByUser.set(p.user_id, p.last_seen_at);
      }
    }
    return projectMembersForSelectedProject
      .map((m) => {
        const lastSeenAt = seenByUser.get(m.user_id) ?? null;
        const seenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
        const isOnline = Number.isFinite(seenMs) && nowMs - seenMs <= timeoutMs;
        return {
          userId: m.user_id,
          name: m.display_name?.trim() || m.user_id,
          isOnline,
          lastSeenAt,
        };
      })
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        const aSeen = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
        const bSeen = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
        if (aSeen !== bSeen) return bSeen - aSeen;
        return a.name.localeCompare(b.name);
      });
  }, [liveUserPresence, projectMembersForSelectedProject, selectedProjectId]);

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
    /** Matriks monitoring tetap tampil saat unit kerja dipilih, meski belum punya turunan. */
    if (selectedTaskId && selectedTask) {
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
          const key = normalizeMilestoneTitleKey(m.title);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          order.push(m.title.trim() || m.title);
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

  const addChildSiblingOptions = useMemo(() => {
    if (!selectedProjectId || !monitoringAddChildContext) return [] as IssueRow[];
    return issues
      .filter(
        (i) =>
          i.project_id === selectedProjectId &&
          i.parent_id === (monitoringAddChildContext.parentId ?? null)
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [issues, selectedProjectId, monitoringAddChildContext]);

  const tableAddSiblingOptions = useMemo(() => {
    if (!selectedProjectId) return [] as IssueRow[];
    return issues
      .filter(
        (i) => i.project_id === selectedProjectId && i.parent_id === (selectedTaskId ?? null)
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [issues, selectedProjectId, selectedTaskId]);

  const sidebarProjectTrees = useMemo(() => {
    const result = new Map<
      string,
      {
        treeRowsForSidebar: { issue: IssueRow; depth: number }[];
        parentByIssueId: Map<string, string | null>;
        sidebarParentIdsWithVisibleChildren: Set<string>;
      }
    >();
    for (const p of projectsInOrg) {
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
      result.set(p.id, {
        treeRowsForSidebar,
        parentByIssueId,
        sidebarParentIdsWithVisibleChildren,
      });
    }
    return result;
  }, [projectsInOrg, issues]);

  const resolveProjectIdInParams = useCallback(
    (p: URLSearchParams) => {
      const orgParam = p.get("org");
      const pool =
        orgParam && orgsWithProjects.some((o) => o.id === orgParam)
          ? projects.filter((x) => x.organization_id === orgParam)
          : projectsInOrg;
      const q = p.get("project");
      if (q && pool.some((x) => x.id === q)) return q;
      return [...pool].sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null;
    },
    [orgsWithProjects, projects, projectsInOrg]
  );

  const resolveTaskIdInParams = useCallback(
    (p: URLSearchParams, projectId: string | null) => {
      const q = p.get("task");
      if (!q || !projectId) return null;
      return issues.some((i) => i.id === q && i.project_id === projectId) ? q : null;
    },
    [issues]
  );

  /**
   * Perbarui scope di URL + state lokal. Semua navigasi client memakai router.replace
   * agar searchParams Next.js tetap selaras (hindari loop replaceState vs RSC).
   * `refresh: true` setelah buat org+project (tetap router.replace + refresh RSC).
   */
  const commitScopeInUrl = useCallback(
    (
      mutate: (p: URLSearchParams) => void,
      options?: { refresh?: boolean; syncView?: boolean }
    ) => {
      const prevParams = workspaceUrlParamsBaseline(
        searchParams,
        canonicalOrgId,
        selectedProjectId,
        projects
      );
      const p = new URLSearchParams(prevParams.toString());
      mutate(p);
      const prevQuery = prevParams.toString();
      const nextQuery = p.toString();
      if (nextQuery === prevQuery && !options?.refresh) return;

      const viewOnlyNav =
        !options?.refresh && urlScopeKey(prevParams) === urlScopeKey(p);

      if (viewOnlyNav) {
        startScopeNavTransition(() => {
          void router.replace(`/?${nextQuery}`, { scroll: false });
        });
        return;
      }

      if (options?.syncView !== false) {
        const orgForModules = canonicalOrgId;
        const viewParsed = parseViewParam(p.get("view"));
        if (
          viewParsed &&
          isViewAllowedForModules(
            viewParsed,
            effectiveEnabledModuleCodes(orgForModules, organizationModules)
          )
        ) {
          committedViewRef.current = viewParsed;
          setActiveView(viewParsed);
        }
      }

      const orgParam = p.get("org");
      if (
        orgParam &&
        orgsWithProjects.some((o) => o.id === orgParam) &&
        projects.some((proj) => proj.organization_id === orgParam)
      ) {
        setCanonicalOrgId(orgParam);
      }

      const nextProjectId = resolveProjectIdInParams(p);
      const nextTaskId = resolveTaskIdInParams(p, nextProjectId);
      setSelectedProjectId(nextProjectId);
      setSelectedTaskId(nextTaskId);

      if (options?.refresh) {
        setScopeRoutePending(true);
      }
      startScopeNavTransition(() => {
        void router.replace(`/?${nextQuery}`, { scroll: false });
      });
      if (options?.refresh) {
        router.refresh();
      }
    },
    [
      canonicalOrgId,
      selectedProjectId,
      organizationModules,
      resolveProjectIdInParams,
      resolveTaskIdInParams,
      router,
      searchParams,
      orgsWithProjects,
      projects,
      startScopeNavTransition,
    ]
  );

  const handleActiveViewChange = useCallback(
    (v: ViewId) => {
      if (!isViewAllowedForModules(v, enabledModulesForOrg)) return;
      viewChangeLockUntilRef.current = Date.now() + 1500;
      committedViewRef.current = v;
      setActiveView(v);
      commitScopeInUrl(
        (q) => {
          q.set("view", viewToParam(v));
          if (v !== "Berkas" && v !== "Map") {
            q.delete("berkas");
          }
        },
        { syncView: false }
      );
    },
    [enabledModulesForOrg, commitScopeInUrl]
  );

  useEffect(() => {
    if (Date.now() < viewChangeLockUntilRef.current) return;
    if (visibleViews.includes(activeView)) return;
    handleActiveViewChange("Dashboard");
  }, [visibleViews, activeView, handleActiveViewChange]);

  useEffect(() => {
    if (activeView === "Chat" && !isBelowMd) {
      workspaceRightPanelApiRef.current?.closePanel();
    }
  }, [activeView, isBelowMd]);

  const handleMobileSelectOrg = useCallback(
    (orgId: string) => {
      setCanonicalOrgId(orgId);
      setSelectedProjectId(null);
      setSelectedTaskId(null);
      setMobileScopePhase("project");
      const p = new URLSearchParams(searchParams.toString());
      p.set("org", orgId);
      p.delete("project");
      p.delete("task");
      if (!p.get("view")) p.set("view", viewToParam("Dashboard"));
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
    },
    [searchParams]
  );

  const handleMobileBackToOrg = useCallback(() => {
    setCanonicalOrgId(null);
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setMobileScopePhase("org");
    const p = new URLSearchParams(searchParams.toString());
    p.delete("org");
    p.delete("project");
    p.delete("task");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [searchParams]);

  const handleMobileSelectProject = useCallback(
    (projectId: string) => {
      if (!canonicalOrgId) return;
      setMobileScopePhase("workspace");
      commitScopeInUrl(
        (q) => {
          q.set("org", canonicalOrgId);
          q.set("project", projectId);
          q.delete("task");
          if (!q.get("view")) q.set("view", viewToParam("Dashboard"));
        },
        { syncView: false }
      );
    },
    [canonicalOrgId, commitScopeInUrl]
  );

  const resetMobileWorkspaceOverlays = useCallback(() => {
    setActiveVirtualTableSlug(null);
    workspaceRightPanelApiRef.current?.closePanel();
    setIsSidebarCollapsed(true);
  }, []);

  const handleMobileHeaderSelectOrg = useCallback(
    (orgId: string) => {
      resetMobileWorkspaceOverlays();
      setCanonicalOrgId(orgId);
      setSelectedProjectId(null);
      setSelectedTaskId(null);
      const p = new URLSearchParams(searchParams.toString());
      p.set("org", orgId);
      p.delete("project");
      p.delete("task");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
    },
    [searchParams, resetMobileWorkspaceOverlays]
  );

  const handleMobileHeaderSelectProject = useCallback(
    (projectId: string) => {
      if (!canonicalOrgId) return;
      resetMobileWorkspaceOverlays();
      setMobileScopePhase("workspace");
      commitScopeInUrl(
        (q) => {
          q.set("org", canonicalOrgId);
          q.set("project", projectId);
          q.delete("task");
          if (!q.get("view")) q.set("view", viewToParam("Dashboard"));
        },
        { syncView: false }
      );
    },
    [canonicalOrgId, commitScopeInUrl, resetMobileWorkspaceOverlays]
  );

  useEffect(() => {
    if (!scopeRoutePending) return;
    setScopeRoutePending(false);
  }, [searchParams, scopeRoutePending]);

  /** Back/forward browser: baca scope dari URL tanpa timpa navigasi commitScopeInUrl. */
  useEffect(() => {
    const syncScopeFromWindowUrl = () => {
      const p = new URLSearchParams(window.location.search);
      const orgParam = p.get("org");
      if (
        orgParam &&
        orgsWithProjects.some((o) => o.id === orgParam) &&
        projects.some((proj) => proj.organization_id === orgParam)
      ) {
        setCanonicalOrgId(orgParam);
      }
      const nextProjectId = resolveProjectIdInParams(p);
      setSelectedProjectId(nextProjectId);
      setSelectedTaskId(resolveTaskIdInParams(p, nextProjectId));
      const orgForModules =
        orgParam && orgsWithProjects.some((o) => o.id === orgParam)
          ? orgParam
          : canonicalOrgId;
      const viewParsed = parseViewParam(p.get("view"));
      if (
        viewParsed &&
        isViewAllowedForModules(
          viewParsed,
          effectiveEnabledModuleCodes(orgForModules, organizationModules)
        )
      ) {
        committedViewRef.current = viewParsed;
        applyActiveView(viewParsed);
      }
    };
    window.addEventListener("popstate", syncScopeFromWindowUrl);
    return () => window.removeEventListener("popstate", syncScopeFromWindowUrl);
  }, [
    canonicalOrgId,
    organizationModules,
    orgsWithProjects,
    projects,
    resolveProjectIdInParams,
    resolveTaskIdInParams,
    applyActiveView,
  ]);

  const openVirtualRowChatPanel = useCallback(
    (
      rowId: string,
      options?: {
        projectName?: string | null;
        tableDisplayName?: string;
        rowLabel?: string;
        tableIdHint?: string;
        switchToMapTab?: boolean;
      }
    ) => {
      const switchToMap = options?.switchToMapTab !== false;
      if (
        switchToMap &&
        isViewAllowedForModules("Map", enabledModulesForOrg)
      ) {
        viewChangeLockUntilRef.current = Date.now() + 1500;
        applyActiveView("Map");
        commitScopeInUrl(
          (q) => {
            q.set("view", viewToParam("Map"));
            q.delete("berkas");
          },
          { syncView: false }
        );
      }

      const fallbackSegments = buildChatRowPathSegments({
        projectName: options?.projectName ?? selectedProject?.name ?? null,
        tableDisplayName: options?.tableDisplayName ?? "Tabel",
        rowLabel: options?.rowLabel ?? "Baris",
      });

      void resolveVirtualRowChatContextAction(rowId).then((res) => {
        const api = workspaceRightPanelApiRef.current;
        if (!api) return;

        const rowMention = (label: string) => ({
          id: rowId,
          label,
          kind: "row" as const,
        });

        if (res.error || !res.data) {
          api.openRowPanel({
            tableId: options?.tableIdHint ?? activeVirtualTable?.id ?? "",
            rowId,
            pathSegments: fallbackSegments,
            tab: "chat",
            closeWhenOverlayCloses: false,
            mentionOptions: [
              ...workspaceChatMentionOptions,
              rowMention(
                fallbackSegments[fallbackSegments.length - 1] ?? "Baris"
              ),
            ],
          });
          return;
        }

        const { tableId, pathSegments, rowPayload, relationLabels } = res.data;
        const tableCols = virtualColumns.filter((c) => c.table_id === tableId);
        api.openRowPanel({
          tableId,
          rowId,
          pathSegments,
          tab: "chat",
          closeWhenOverlayCloses: false,
          rowPayload,
          relationLabels,
          mentionOptions: [
            ...workspaceChatMentionOptions,
            rowMention(pathSegments[pathSegments.length - 1] ?? "Baris"),
          ],
          fileAttachmentOptions: fileAttachmentOptionsFromRowPayload(
            rowPayload,
            tableCols
          ),
        });
      });
    },
    [
      enabledModulesForOrg,
      commitScopeInUrl,
      selectedProject?.name,
      activeVirtualTable?.id,
      workspaceChatMentionOptions,
      virtualColumns,
      applyActiveView,
    ]
  );

  const userHasOrgStaffFor = useCallback(
    (orgId: string | null | undefined) => {
      if (!orgId || !userId) return false;
      return organizationMembers.some(
        (m) =>
          m.organization_id === orgId &&
          m.user_id === userId &&
          ORG_STAFF_ROLES.has(m.role)
      );
    },
    [organizationMembers, userId]
  );

  const openActivityVirtualTable = useCallback(
    (tableId: string) => {
      const vt = virtualTables.find((t) => t.id === tableId);
      if (!vt) return;
      if (isBelowMd) setMobileScopePhase("workspace");
      if (activeView !== "Tabel") {
        viewChangeLockUntilRef.current = Date.now() + 1500;
        applyActiveView("Tabel");
      }
      commitScopeInUrl(
        (q) => {
          if (vt.organization_id) q.set("org", vt.organization_id);
          if (vt.project_id) q.set("project", vt.project_id);
          q.set("view", viewToParam("Tabel"));
        },
        { syncView: false }
      );
      setActiveVirtualTableSlug(vt.slug);
    },
    [virtualTables, isBelowMd, activeView, applyActiveView, commitScopeInUrl]
  );

  const openActivityVirtualRow = useCallback(
    (rowId: string, tableIdHint: string | null) => {
      if (tableIdHint) openActivityVirtualTable(tableIdHint);
      void resolveVirtualRowChatContextAction(rowId).then((res) => {
        const api = workspaceRightPanelApiRef.current;
        if (!api) return;
        if (res.error || !res.data) {
          if (tableIdHint) {
            api.openRowPanel({
              tableId: tableIdHint,
              rowId,
              pathSegments: ["Baris"],
              tab: "detail",
              closeWhenOverlayCloses: true,
              mentionOptions: workspaceChatMentionOptions,
            });
          }
          return;
        }
        if (!tableIdHint) {
          const vt = virtualTables.find((t) => t.id === res.data!.tableId);
          if (vt) setActiveVirtualTableSlug(vt.slug);
        }
        api.openRowPanel({
          tableId: res.data.tableId,
          rowId,
          pathSegments: res.data.pathSegments,
          tab: "detail",
          closeWhenOverlayCloses: true,
          rowPayload: res.data.rowPayload,
          relationLabels: res.data.relationLabels,
          mentionOptions: workspaceChatMentionOptions,
        });
      });
    },
    [
      openActivityVirtualTable,
      virtualTables,
      workspaceChatMentionOptions,
    ]
  );

  const openActivityProject = useCallback(
    (projectId: string) => {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) return;
      if (isBelowMd) setMobileScopePhase("workspace");
      commitScopeInUrl((q) => {
        q.set("org", proj.organization_id);
        q.set("project", projectId);
        q.delete("task");
        q.delete("berkas");
      }, { syncView: false });
    },
    [projects, isBelowMd, commitScopeInUrl]
  );

  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const virtualTableIds = useMemo(
    () => new Set(virtualTables.map((t) => t.id)),
    [virtualTables]
  );

  const virtualTableNameById = useMemo(
    () => new Map(virtualTables.map((t) => [t.id, t.display_name])),
    [virtualTables]
  );

  /** Ganti project/task dalam org — tidak memicu RSC. */
  const commitTaskSelection = useCallback(
    (issueId: string | null) => {
      if (!selectedProjectId) return;
      const proj = projects.find((p) => p.id === selectedProjectId);
      commitScopeInUrl((q) => {
        if (proj) q.set("org", proj.organization_id);
        q.set("project", selectedProjectId);
        if (issueId) q.set("task", issueId);
        else q.delete("task");
      }, { syncView: false });
    },
    [commitScopeInUrl, projects, selectedProjectId]
  );

  const selectIssueInScope = (issueId: string) => {
    commitTaskSelection(issueId);
  };

  const triggerBackgroundRefresh = useCallback(() => {
    if (statusRefreshTimerRef.current) {
      clearTimeout(statusRefreshTimerRef.current);
    }
    statusRefreshTimerRef.current = setTimeout(() => {
      startStatusRefreshTransition(() => {
        router.refresh();
      });
      statusRefreshTimerRef.current = null;
    }, 450);
  }, [router, startStatusRefreshTransition]);

  const queueStatusCommit = useCallback(
    (issueId: string, statusId: string | null) => {
      if (!selectedProjectId) return;
      queuedStatusCommitByIssueRef.current.set(issueId, statusId);
      if (statusCommitTimerRef.current) {
        clearTimeout(statusCommitTimerRef.current);
      }
      statusCommitTimerRef.current = setTimeout(() => {
        const entries = Array.from(queuedStatusCommitByIssueRef.current.entries());
        queuedStatusCommitByIssueRef.current.clear();
        statusCommitTimerRef.current = null;
        startStatusTransition(async () => {
          for (const [id, nextStatusId] of entries) {
            const fd = new FormData();
            fd.set("issue_id", id);
            fd.set("project_id", selectedProjectId);
            fd.set("status_id", nextStatusId ?? "");
            const r = await setTaskStatusAction(fd);
            if (r.error) {
              setTaskMsg(r.error);
              setOptimisticStatusByIssueId((prev) => ({
                ...prev,
                [id]: issueStatusIdById.get(id) ?? null,
              }));
            }
          }
          triggerBackgroundRefresh();
        });
      }, 260);
    },
    [
      issueStatusIdById,
      selectedProjectId,
      startStatusTransition,
      triggerBackgroundRefresh,
    ]
  );

  const openBerkasDetail = (berkasId: string) => {
    if (!selectedProjectId) return;
    const proj = projects.find((p) => p.id === selectedProjectId);
    commitScopeInUrl((q) => {
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
    commitScopeInUrl((q) => {
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
    <VirtualTableChatUnreadProvider
      userId={userId}
      tableIds={virtualTableIdsForChatUnread}
      tablesForProjectBadge={tablesForProjectChatBadge}
      scopeTableIds={scopeTableIdsForChatBadge}
      scopeOrganizationId={canonicalOrgId}
      scopeProjectId={selectedProjectId}
      includeOrgRoomUnread={hasOrgStaffAccess}
    >
    <NotificationSoundListener userId={userId} />
    <PwaPushSubscription userId={userId} />
    <WorkspaceRightPanelProvider apiRef={workspaceRightPanelApiRef}>
    <WorkspaceRightPanelCloser activeVirtualTableSlug={activeVirtualTableSlug} />
    <WorkspaceRightPanelTableSync activeTableId={activeVirtualTable?.id ?? null} />
    <WorkspaceRightPanelOrgSync organizationId={canonicalOrgId} />
    <WorkspaceRightPanelProjectSync
      selectedProjectId={selectedProjectId}
      mentionOptions={workspaceChatMentionOptions}
    />
    <WorkspaceRightPanelMobileChatGuard
      isBelowMd={isBelowMd}
      mobileScopePhase={mobileScopePhase}
      hasOrgStaffAccess={hasOrgStaffAccess}
    />
    <div className="flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground max-md:min-h-[100dvh] max-md:max-h-[100dvh] max-md:pt-[env(safe-area-inset-top)] max-md:pl-[env(safe-area-inset-left)] max-md:pr-[env(safe-area-inset-right)]">
      {pilotBannerOn ? (
        <div
          role="status"
          className="shrink-0 border-b border-primary/25 bg-primary/10 px-4 py-2 text-center text-xs font-medium text-foreground"
        >
          {pilotBannerText}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-3">
      {showMobileScopeWizard ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background">
          {mobileScopePhase === "org" ? (
            <WorkspaceMobileOrgPicker
              organizations={orgsWithProjects}
              onSelectOrg={handleMobileSelectOrg}
              userEmail={userEmail}
            />
          ) : mobileScopePhase === "project" ? (
            <WorkspaceMobileSwipeBack
              enabled={orgsWithProjects.length > 1}
              onSwipeBack={handleMobileBackToOrg}
              className="flex min-h-0 flex-1 flex-col"
            >
              <WorkspaceMobileProjectPicker
                organization={selectedOrganization}
                projects={projectsInOrg}
                onSelectProject={handleMobileSelectProject}
                onBackToOrganizations={handleMobileBackToOrg}
                showBackToOrg={orgsWithProjects.length > 1}
              />
            </WorkspaceMobileSwipeBack>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
              <Spinner className="mr-2 size-4" />
              Memuat…
            </div>
          )}
        </div>
      ) : (
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background">
      {!isBelowMd ? (
      <div
        className={cn(
          "relative flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden bg-sidebar/95 transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
          isSidebarCollapsed
            ? "w-0 border-transparent"
            : "w-80 border-r border-sidebar-border/90"
        )}
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
            <div className="flex items-center gap-1">
              {canonicalOrgId &&
              hasOrgStaffAccess &&
              userId &&
              !isBelowMd ? (
                <SidebarOrganizationChatButton
                  mentionOptions={workspaceChatMentionOptions}
                  disabled={workspaceActionPending}
                />
              ) : null}
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
                        commitScopeInUrl(
                          (q) => {
                            q.set("org", r.organizationId as string);
                            q.set("project", r.projectId as string);
                            q.delete("task");
                          },
                          { refresh: true, syncView: false }
                        );
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
                  disabled={workspaceActionPending}
                  onClick={() => {
                    commitScopeInUrl(
                      (q) => {
                        q.set("org", o.id);
                        const first = projects
                          .filter((p) => p.organization_id === o.id)
                          .sort((a, b) => a.name.localeCompare(b.name))[0];
                        if (first) q.set("project", first.id);
                        q.delete("task");
                      },
                      { refresh: true, syncView: false }
                    );
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
              {canonicalOrgId && canManageOrgStaff ? (
                <Dialog
                  open={orgStaffDialogOpen}
                  onOpenChange={(open) => {
                    setOrgStaffDialogOpen(open);
                    if (open) setOrgStaffMsg(null);
                  }}
                >
                  <DialogTrigger render={<Button size="sm" variant="outline" />}>
                    + Tim inti
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Tambah tim inti organisasi</DialogTitle>
                      <DialogDescription>
                        Karyawan inti otomatis menjadi anggota{" "}
                        <strong>member</strong> di semua project organisasi ini
                        (bukan owner). Hire per project tetap lewat + Anggota
                        pada project yang dipilih.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      className="grid gap-3"
                      action={(fd) => {
                        if (!canonicalOrgId) return;
                        setOrgStaffMsg(null);
                        fd.set("organization_id", canonicalOrgId);
                        startMemberTransition(async () => {
                          const r = await addOrganizationStaffByEmailAction(fd);
                          if (r.error) {
                            setOrgStaffMsg(r.error);
                            return;
                          }
                          setOrgStaffDialogOpen(false);
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
                          placeholder="contoh: staff@domain.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Role organisasi</Label>
                        <select
                          name="role"
                          defaultValue="staff"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          <option value="staff">staff</option>
                          <option value="admin">admin</option>
                          <option value="owner">owner</option>
                        </select>
                      </div>
                      <Button type="submit" disabled={memberPending}>
                        Tambahkan ke organisasi
                      </Button>
                      {orgStaffMsg ? (
                        <p className="text-xs text-red-600" role="alert">
                          {orgStaffMsg}
                        </p>
                      ) : null}
                    </form>
                  </DialogContent>
                </Dialog>
              ) : null}
              {selectedProjectId && canManageSelectedProject && (
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
                        berdasarkan email.{" "}
                        {selectedProjectHasNoOwner ? (
                          <>
                            Project ini belum punya owner — Anda (anggota)
                            dapat menambah anggota dan menetapkan role owner.
                          </>
                        ) : isOrgAdminOfCanonicalOrg ? (
                          <>
                            Sebagai admin organisasi Anda dapat mengelola anggota
                            project ini.
                          </>
                        ) : (
                          <>Hanya owner project atau admin organisasi yang dapat mengelola anggota.</>
                        )}{" "}
                        Email harus sudah punya akun di aplikasi (sudah daftar
                        / login minimal sekali).
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
              {canonicalOrgId && hasOrgStaffAccess ? (
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
              ) : null}
            </div>
          </div>
          {projectsInOrg.map((p) => {
            const sidebarTree = sidebarProjectTrees.get(p.id);
            if (!sidebarTree) return null;
            const {
              treeRowsForSidebar,
              parentByIssueId,
              sidebarParentIdsWithVisibleChildren,
            } = sidebarTree;
            const isSelectedProject =
              selectedProjectId === p.id && !selectedTaskId;

            return (
              <div key={p.id} className="ml-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={workspaceActionPending}
                    onClick={() => {
                      if (p.id === selectedProjectId) {
                        commitTaskSelection(null);
                        return;
                      }
                      commitScopeInUrl((q) => {
                        q.set("org", p.organization_id);
                        q.set("project", p.id);
                        q.delete("task");
                      }, { syncView: false });
                    }}
                    className={`h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-3 text-left text-[0.95rem] font-medium ${
                      isSelectedProject
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "bg-transparent text-sidebar-foreground hover:bg-sidebar-accent/70"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <ProjectChatUnreadBadge projectId={p.id} />
                  </Button>
                  {userId && !isBelowMd ? (
                    <SidebarProjectChatButton
                      projectId={p.id}
                      mentionOptions={workspaceChatMentionOptions}
                      disabled={workspaceActionPending}
                      onBeforeOpen={() => {
                        if (p.id !== selectedProjectId) {
                          commitScopeInUrl((q) => {
                            q.set("org", p.organization_id);
                            q.set("project", p.id);
                            q.delete("task");
                          }, { syncView: false });
                        }
                      }}
                    />
                  ) : null}
                  {canDeleteProject(p.id) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="h-8 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProjectMsg(null);
                        setProjectDeleteConfirm({
                          projectId: p.id,
                          name: p.name,
                        });
                      }}
                      aria-label={`Hapus project ${p.name}`}
                      title={
                        projectIdsWithOwner.has(p.id)
                          ? "Hapus project (owner)"
                          : "Hapus project (belum ada owner)"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
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
                            disabled={workspaceActionPending}
                            onClick={() => {
                              if (p.id !== selectedProjectId) {
                                commitScopeInUrl((q) => {
                                  q.set("org", p.organization_id);
                                  q.set("project", p.id);
                                  q.set("task", t.id);
                                }, { syncView: false });
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
                  {projectDeleteConfirm &&
                  !projectIdsWithOwner.has(projectDeleteConfirm.projectId)
                    ? " Project ini belum punya owner — penghapusan diizinkan untuk anggota sebagai pemulihan data demo."
                    : null}
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

        {/* --- Virtual (Custom) Tables: Organization Level --- */}
        {canonicalOrgId && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tabel Organisasi
              </p>
              <button
                type="button"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => { setVtableCreateScope("organization"); setVtableCreateDialogOpen(true); }}
                title="Buat tabel organisasi baru"
              >
                + Baru
              </button>
            </div>
            {vtablesForOrg.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground italic">
                Belum ada tabel organisasi.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {vtablesForOrg.map((vt) => (
                  <li key={vt.id}>
                    <SidebarVirtualTableItem
                      table={vt}
                      activeVirtualTableSlug={activeVirtualTableSlug}
                      onSelect={() => {
                        setActiveVirtualTableSlug(
                          activeVirtualTableSlug === vt.slug ? null : vt.slug
                        );
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* --- Virtual (Custom) Tables: Project Level --- */}
        {selectedProjectId && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tabel Project
              </p>
              <button
                type="button"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => { setVtableCreateScope("project"); setVtableCreateDialogOpen(true); }}
                title="Buat tabel project baru"
              >
                + Baru
              </button>
            </div>
            {vtablesForProject.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground italic">
                Belum ada tabel project.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {vtablesForProject.map((vt) => (
                  <li key={vt.id}>
                    <SidebarVirtualTableItem
                      table={vt}
                      activeVirtualTableSlug={activeVirtualTableSlug}
                      onSelect={() => {
                        setActiveVirtualTableSlug(
                          activeVirtualTableSlug === vt.slug ? null : vt.slug
                        );
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
          </div>
        </ScrollArea>
      </aside>
      </div>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1">
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/30">
        <Tabs
          value={activeView}
          onValueChange={(value) => handleActiveViewChange(value as ViewId)}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
        >
        <header className="shrink-0 border-b border-border bg-card/90 px-4 py-3 md:px-6 md:py-4">
          {isBelowMd && !showMobileScopeWizard && userEmail ? (
            <WorkspaceMobileCompactHeader
              scopeTitle={workspaceHeaderBreadcrumbTitle}
              showOrgSwitcher={orgsWithProjects.length > 1}
              organizations={orgsWithProjects}
              projects={projectsInOrg}
              selectedOrganizationId={canonicalOrgId}
              selectedProjectId={selectedProjectId}
              onSelectOrg={handleMobileHeaderSelectOrg}
              onSelectProject={handleMobileHeaderSelectProject}
              userEmail={userEmail}
              userId={userId}
              memberPresenceRows={memberPresenceRowsForSelectedProject}
              formatDateTime={formatDateTime}
              signOutAction={signOut}
              disabled={workspaceActionPending}
            />
          ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted hover:opacity-100",
                  isBelowMd ? "h-11 w-11" : "h-5 w-5 hover:opacity-80"
                )}
                onClick={() => setIsSidebarCollapsed((v) => !v)}
                title={isSidebarCollapsed ? "Buka sidebar" : "Tutup sidebar"}
                aria-label={isSidebarCollapsed ? "Buka sidebar" : "Tutup sidebar"}
                aria-expanded={!isSidebarCollapsed}
              >
                <PanelLeft className={isBelowMd ? "h-5 w-5" : "h-4 w-4"} />
              </button>
              <div className="h-6 w-px bg-border" aria-hidden="true" />
              <nav aria-label="Lokasi workspace" className="min-w-0 flex-1">
                <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
                  {workspaceHeaderBreadcrumb.map((segment, idx) => (
                    <li
                      key={`${segment}-${idx}`}
                      className="flex min-w-0 max-w-full items-center gap-x-1.5"
                    >
                      {idx > 0 ? (
                        <span
                          className="shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        >
                          &gt;
                        </span>
                      ) : null}
                      <span
                        className={
                          idx === workspaceHeaderBreadcrumb.length - 1
                            ? "truncate font-medium text-foreground"
                            : "truncate text-muted-foreground"
                        }
                        title={segment}
                      >
                        {segment}
                      </span>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
            {userEmail && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {selectedProjectId && (
                  <Popover>
                    <PopoverTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto gap-1.5 px-2 py-1 text-xs leading-none"
                        >
                          <div className="flex -space-x-1">
                            {onlineUsersForSelectedProject.slice(0, 3).map((u) => (
                              <span
                                key={u.userId}
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-background bg-emerald-100 text-[9px] font-medium text-emerald-700"
                                title={u.name}
                              >
                                {initialsFromName(u.name)}
                              </span>
                            ))}
                            {onlineUsersForSelectedProject.length === 0 ? (
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-background bg-muted text-[9px] text-muted-foreground">
                                0
                              </span>
                            ) : null}
                          </div>
                          <span className="text-xs leading-none">
                            Online {onlineUsersForSelectedProject.length}
                          </span>
                        </Button>
                      }
                    />
                    <PopoverContent align="end" className="w-72">
                      <PopoverHeader>
                        <PopoverTitle>Online sekarang</PopoverTitle>
                        <p className="text-xs text-muted-foreground">
                          {onlineUsersForSelectedProject.length} online dari{" "}
                          {memberPresenceRowsForSelectedProject.length} anggota
                        </p>
                      </PopoverHeader>
                      {memberPresenceRowsForSelectedProject.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Belum ada anggota project.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {memberPresenceRowsForSelectedProject.slice(0, 16).map((u) => (
                            <li key={u.userId} className="flex items-center justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{u.name}</p>
                                <p className="truncate text-muted-foreground">
                                  {u.lastSeenAt
                                    ? `terakhir aktif ${formatDateTime(u.lastSeenAt)}`
                                    : "belum terdeteksi aktif"}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "h-2 w-2 shrink-0 rounded-full",
                                  u.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                                )}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
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
          )}
          {joinError && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              {joinError}
            </p>
          )}
        </header>

        <section
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            isBelowMd &&
              !mobileChatKeyboardOpen &&
              !(
                activeView === "Chat" && mobileChatConversationOpen
              ) &&
              WORKSPACE_MOBILE_TAB_BAR_PADDING
          )}
          aria-busy={workspaceActionPending}
        >
          {workspaceActionPending ? (
            <div
              className="absolute inset-0 z-40 bg-background/70 px-6 py-6 backdrop-blur-[2px]"
              role="status"
              aria-live="polite"
              aria-label="Memproses permintaan"
            >
              <div className="flex h-full items-center justify-center">
                <div className="inline-flex items-center gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                  <Spinner className="size-4" />
                  <span>Harap tunggu, data sedang dimuat…</span>
                </div>
              </div>
            </div>
          ) : null}
          <ScrollArea
            className="min-h-0 flex-1"
            type="scroll"
            fillAvailableHeight={
              activeView === "Map" ||
              (isBelowMd &&
                (activeView === "Chat" ||
                  activeView === "Aktivitas" ||
                  activeView === "Tabel"))
            }
            hideVerticalScrollbar={
              isBelowMd &&
              (activeView === "Chat" ||
                activeView === "Aktivitas" ||
                activeView === "Tabel")
            }
          >
            <div
              className={cn(
                "flex w-full flex-col",
                activeView === "Map" ||
                (isBelowMd &&
                  (activeView === "Chat" ||
                    activeView === "Aktivitas" ||
                    activeView === "Tabel"))
                  ? "box-border h-full min-h-0 flex-1 basis-0 overflow-hidden p-0"
                  : "min-h-full p-6"
              )}
            >
            <TabsList className="mb-4 hidden h-auto min-h-9 w-full max-w-full shrink-0 flex-wrap justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground md:flex md:flex-nowrap">
              {visibleViews.map((view) => (
                <TabsTrigger key={view} value={view} className="px-2.5 sm:px-3">
                  {view === "Chat" ? <ChatTabLabel /> : view}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="Dashboard" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <TabPanelKeepAlive view="Dashboard" activeView={activeView}>
              {!selectedProjectId ? (
                <p className="mt-5 text-sm text-muted-foreground">
                  {isBelowMd
                    ? "Pilih project dari menu scope di header untuk melihat dashboard."
                    : "Pilih project di sidebar untuk melihat dashboard."}
                </p>
              ) : deferredPayloadLoading &&
                viewNeedsDeferredPayload("Dashboard") ? (
                <div className="mt-5 px-1" aria-busy aria-label="Memuat dashboard">
                  <WorkspaceMobileListSkeleton count={5} variant="activity" />
                </div>
              ) : (
                <VirtualDashboardView
                  key={selectedProjectId}
                  projectId={selectedProjectId}
                  projectName={selectedProject?.name ?? "Project"}
                  virtualTables={allAccessibleVtables}
                  virtualColumns={virtualColumns}
                  initialDashboard={
                    virtualDashboardsByProjectId[selectedProjectId] ?? null
                  }
                />
              )}
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent
              value="Chat"
              className={cn(
                "min-h-0 w-full min-w-0 outline-none",
                isBelowMd
                  ? "flex flex-1 basis-0 flex-col overflow-hidden"
                  : "flex-none"
              )}
            >
              <TabPanelKeepAlive
                view="Chat"
                activeView={activeView}
                className={cn(
                  isBelowMd
                    ? "flex h-0 min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden"
                    : "flex h-full min-h-0 flex-1 flex-col"
                )}
              >
              <div
                className={cn(
                  "min-h-0 w-full",
                  isBelowMd
                    ? "flex h-0 min-h-0 flex-1 basis-0 flex-col overflow-hidden"
                    : "mt-2"
                )}
              >
                <WorkspaceChatInbox
                  organizationId={canonicalOrgId}
                  organizationName={selectedOrganization?.name ?? null}
                  projectId={selectedProjectId}
                  hasOrgStaffAccess={hasOrgStaffAccess}
                  userId={userId}
                  userEmail={userEmail}
                  isOrgAdmin={isOrgAdminOfCanonicalOrg}
                  projectsForMention={projectsForMention}
                  memberNameByUserId={memberNameByUserId}
                  virtualTables={allAccessibleVtables}
                  virtualColumns={virtualColumns}
                  mentionOptions={workspaceChatMentionOptions}
                  isBelowMd={isBelowMd}
                  onMobileChatKeyboardOpenChange={setMobileChatKeyboardOpen}
                  onMobileConversationOpenChange={setMobileChatConversationOpen}
                />
              </div>
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent
              value="Aktivitas"
              className={cn(
                "min-h-0 w-full min-w-0 outline-none",
                isBelowMd
                  ? "flex flex-1 basis-0 flex-col overflow-hidden"
                  : "flex-none"
              )}
            >
              <TabPanelKeepAlive
                view="Aktivitas"
                activeView={activeView}
                className={cn(
                  isBelowMd
                    ? "flex h-0 min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden"
                    : undefined
                )}
              >
                <WorkspaceActivityTab
                  activityLogs={liveActivityLogs}
                  organizationId={canonicalOrgId}
                  organizationName={selectedOrganization?.name ?? null}
                  selectedProjectId={selectedProjectId}
                  hasOrgStaffAccess={hasOrgStaffAccess}
                  projectNameById={projectNameById}
                  virtualTableIds={virtualTableIds}
                  virtualTableNameById={virtualTableNameById}
                  isBelowMd={isBelowMd}
                  isLoading={activityLogsLoading}
                  onOpenTable={openActivityVirtualTable}
                  onOpenRow={openActivityVirtualRow}
                  onOpenProject={openActivityProject}
                />
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent
              value="Tabel"
              className={cn(
                "min-h-0 w-full min-w-0 outline-none",
                isBelowMd
                  ? "flex flex-1 basis-0 flex-col overflow-hidden"
                  : "flex-none"
              )}
            >
              <TabPanelKeepAlive
                view="Tabel"
                activeView={activeView}
                className={cn(
                  isBelowMd
                    ? "flex h-0 min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden"
                    : undefined
                )}
              >
              {canonicalOrgId && !hasOrgStaffAccess && !isBelowMd ? (
                <p className="mt-5 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Tabel organisasi hanya untuk <strong>tim inti</strong>. Anda
                  hanya melihat tabel pada project yang di-assign.
                </p>
              ) : null}
              {!isBelowMd ? (
                <p className="mt-5 text-sm text-muted-foreground">
                  Preview <strong className="text-foreground">50 baris per halaman</strong>{" "}
                  per tabel. Untuk seluruh data dan edit penuh, gunakan{" "}
                  <strong className="text-foreground">Tabel lengkap</strong> (tombol di
                  header tabel atau sidebar).
                </p>
              ) : null}
              <div
                className={cn(
                  isBelowMd
                    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pm-mobile-scroll"
                    : undefined
                )}
              >
              {canonicalOrgId && hasOrgStaffAccess && vtablesForOrg.length > 0 ? (
                isBelowMd ? (
                  <VirtualTableMobileList
                    sectionTitle="Tabel Organisasi"
                    tables={vtablesForOrg}
                    virtualColumnsByTableId={virtualColumnsByTableId}
                    onOpenTable={(slug) => setActiveVirtualTableSlug(slug)}
                  />
                ) : (
                  <div className="mt-5 space-y-4">
                    <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Tabel Organisasi
                    </p>
                    {vtablesForOrg.map((vt) => (
                      <div
                        key={vt.id}
                        id={`vtable-${vt.slug}`}
                        className="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm"
                      >
                        <VirtualTableView
                          key={vt.id}
                          table={vt}
                          columns={
                            virtualColumnsByTableId.get(vt.id) ?? EMPTY_VIRTUAL_COLUMNS
                          }
                          projectId={selectedProjectId}
                          organizationId={canonicalOrgId}
                          organizationName={selectedOrganization?.name ?? null}
                          userId={userId}
                          isOrgAdmin={isOrgAdminOfCanonicalOrg}
                          projectsForMention={projectsForMention}
                          memberNameByUserId={memberNameByUserId}
                          allVirtualTables={allAccessibleVtables}
                          onOpenInOverlay={() => setActiveVirtualTableSlug(vt.slug)}
                          onActivityChange={refreshActivityLogs}
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : null}

              {selectedProjectId && vtablesForProject.length > 0 ? (
                isBelowMd ? (
                  <VirtualTableMobileList
                    sectionTitle="Tabel Project"
                    tables={vtablesForProject}
                    virtualColumnsByTableId={virtualColumnsByTableId}
                    onOpenTable={(slug) => setActiveVirtualTableSlug(slug)}
                  />
                ) : (
                  <div className="mt-6 space-y-4">
                    <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Tabel Project
                    </p>
                    {vtablesForProject.map((vt) => (
                      <div
                        key={vt.id}
                        id={`vtable-${vt.slug}`}
                        className="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm"
                      >
                        <VirtualTableView
                          key={vt.id}
                          table={vt}
                          columns={
                            virtualColumnsByTableId.get(vt.id) ?? EMPTY_VIRTUAL_COLUMNS
                          }
                          projectId={selectedProjectId}
                          organizationId={canonicalOrgId}
                          organizationName={selectedOrganization?.name ?? null}
                          userId={userId}
                          isOrgAdmin={isOrgAdminOfCanonicalOrg}
                          projectsForMention={projectsForMention}
                          memberNameByUserId={memberNameByUserId}
                          allVirtualTables={allAccessibleVtables}
                          onOpenInOverlay={() => setActiveVirtualTableSlug(vt.slug)}
                          onActivityChange={refreshActivityLogs}
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : null}

              {allAccessibleVtables.length === 0 ? (
                <p
                  className={cn(
                    "text-sm text-muted-foreground",
                    isBelowMd ? "p-3" : "mt-5"
                  )}
                >
                  {!selectedProjectId && !canonicalOrgId
                    ? "Pilih organisasi dan project untuk melihat tabel custom."
                    : "Belum ada tabel custom pada scope ini."}
                </p>
              ) : null}
              </div>
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent value="Berkas" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <TabPanelKeepAlive view="Berkas" activeView={activeView}>
              <div className="mt-4 space-y-3">
                {!selectedProjectId ? (
                  <p className="text-sm text-muted-foreground">
                    Pilih project untuk melihat daftar berkas.
                  </p>
                ) : (
                  <>
                    {!hasOrgStaffAccess ? (
                      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        Hire project: daftar berkas hanya untuk project aktif (
                        <strong>{selectedProject?.name ?? "—"}</strong>).
                      </p>
                    ) : null}
                    {selectedTaskId && hasOrgStaffAccess ? (
                      <p className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
                        Scope <strong>unit kerja</strong> aktif — daftar berkas tetap
                        untuk seluruh <strong>project</strong> ini.
                      </p>
                    ) : null}
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
                          commitScopeInUrl((q) => {
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
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent value="Laporan" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <TabPanelKeepAlive view="Laporan" activeView={activeView}>
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
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent value="Keuangan" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <TabPanelKeepAlive view="Keuangan" activeView={activeView}>
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
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent
              value="Map"
              className="flex min-h-0 w-full min-w-0 flex-1 basis-0 flex-col overflow-hidden outline-none"
            >
              <TabPanelKeepAlive
                view="Map"
                activeView={activeView}
                className="flex h-0 min-h-0 min-w-0 flex-1 basis-0 flex-col"
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
                    {selectedProjectId ? (
                      <VirtualTableLayerUploadDialog
                        open={mapLayerUploadOpen}
                        onOpenChange={handleMapLayerUploadOpenChange}
                        projectId={selectedProjectId}
                        mapPreviewEnabled
                        onPreviewChange={handleMapImportPreviewChange}
                        onCreated={handleMapLayerCreated}
                      />
                    ) : null}
                    {mapImportTable ? (
                      <>
                        <VirtualTableGeoJsonImportDialog
                          open={mapGeoImportOpen}
                          onOpenChange={handleMapGeoImportOpenChange}
                          table={mapImportTable}
                          columns={mapImportTableColumns}
                          allVirtualTables={allAccessibleVtables}
                          mapPreviewEnabled
                          onPreviewChange={handleMapImportPreviewChange}
                          onImported={handleMapGeoImported}
                        />
                        <VirtualTableDxfImportDialog
                          open={mapDxfImportOpen}
                          onOpenChange={handleMapDxfImportOpenChange}
                          table={mapImportTable}
                          columns={mapImportTableColumns}
                          allVirtualTables={allAccessibleVtables}
                          rows={mapImportTableRows}
                          onImported={handleMapDxfImported}
                        />
                      </>
                    ) : null}
                    <div className="grid min-h-0 min-w-0 flex-1 basis-0 grid-rows-[auto_minmax(0,1fr)] gap-y-3">
                      <div className="flex min-w-0 shrink-0 flex-col gap-2">
                        {selectedProjectId || vtablesWithGeometry.length > 0 ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                            {selectedProjectId ? (
                              <div className="flex min-w-0 shrink-0 flex-col justify-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 sm:w-[min(100%,14rem)]">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-fit shrink-0"
                                  disabled={!selectedProjectId}
                                  onClick={() => setMapLayerUploadOpen(true)}
                                >
                                  <Upload className="mr-1 size-3.5" />
                                  Layer baru dari file
                                </Button>
                                <p className="text-[11px] leading-snug text-muted-foreground">
                                  Tabel baru (no_bidang + geom) dari GeoJSON/DXF —
                                  untuk surveyor.
                                </p>
                              </div>
                            ) : null}
                            {vtablesWithGeometry.length > 0 ? (
                              <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                            <div className="min-w-[10rem] flex-1 sm:max-w-[14rem]">
                              <label
                                htmlFor="map-vtable-import-select"
                                className="text-xs font-medium text-muted-foreground"
                              >
                                Tabel impor
                              </label>
                              <select
                                id="map-vtable-import-select"
                                value={mapImportTableId}
                                onChange={(e) => {
                                  setMapImportTableId(e.target.value);
                                  setMapImportPreviewLayers([]);
                                }}
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                              >
                                {vtablesWithGeometry.map((vt) => (
                                  <option key={vt.id} value={vt.id}>
                                    {vt.display_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={!mapImportTableId}
                              onClick={() => setMapGeoImportOpen(true)}
                            >
                              <Upload className="mr-1 size-3.5" />
                              Impor GeoJSON ke tabel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={!mapImportTableId}
                              onClick={() => setMapDxfImportOpen(true)}
                            >
                              <Upload className="mr-1 size-3.5" />
                              Impor DXF ke tabel
                            </Button>
                            {mapImportPreviewLayers.length > 0 ? (
                              <p
                                className="flex items-center gap-1 text-xs text-teal-800 dark:text-teal-300"
                                role="status"
                              >
                                <MapPin className="size-3.5 shrink-0" />
                                Pratinjau {mapImportPreviewLayers.length} poligon di
                                peta
                              </p>
                            ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {mapLayersForSelectedProject.length === 0 &&
                          mapImportPreviewLayers.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            Belum ada geometri di peta untuk project ini. Impor
                            GeoJSON atau DXF ke tabel virtual di atas, atau pilih
                            unit kerja untuk geometri issue (legacy).
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
                          <div
                            className={cn(
                              "flex flex-wrap items-center gap-2 text-sm",
                              isBelowMd && "gap-3"
                            )}
                          >
                            <span className="w-full font-medium text-muted-foreground md:w-auto">
                              Lapisan peta:
                            </span>
                            <label
                              className={cn(
                                "inline-flex cursor-pointer items-center gap-2 text-sm text-foreground",
                                isBelowMd && "min-h-11 rounded-md border border-border/60 px-3 py-2"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="size-4 rounded border-border"
                                checked={mapShowIssueGeometry}
                                disabled={issueGeometryForSelectedProject.length === 0}
                                onChange={(e) =>
                                  setMapShowIssueGeometry(e.target.checked)
                                }
                              />
                              Geometri
                            </label>
                            {vtableGeometryLayers.length > 0 && (
                              <label
                                className={cn(
                                  "inline-flex cursor-pointer items-center gap-2 text-sm text-foreground",
                                  isBelowMd &&
                                    "min-h-11 rounded-md border border-border/60 px-3 py-2"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-border"
                                  checked={mapShowVirtualTableGeometry}
                                  onChange={(e) =>
                                    setMapShowVirtualTableGeometry(e.target.checked)
                                  }
                                />
                                Tabel Custom ({vtableGeometryLayers.length})
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-y-2 overflow-hidden">
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                          <WorkspaceMap
                            footprints={visibleMapLayers}
                            highlightBerkasId={null}
                            onVirtualRowChat={(rowId) => {
                              openVirtualRowChatPanel(rowId, {
                                switchToMapTab: false,
                              });
                            }}
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
                            {vtableGeometryLayers.length > 0 && (
                              <span>
                                <span
                                  className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                                  style={{ background: "#fbbf24" }}
                                />{" "}
                                Tabel Custom
                              </span>
                            )}
                            {mapImportPreviewLayers.length > 0 && (
                              <span>
                                <span
                                  className="mr-1 inline-block h-2 w-2 rounded-sm align-middle border border-teal-700"
                                  style={{
                                    background: "#5eead4",
                                    borderStyle: "dashed",
                                  }}
                                />{" "}
                                Pratinjau impor
                              </span>
                            )}
                          </p>
                          {selectedTaskId ? (
                            <div
                              className={cn(
                                "flex shrink-0 flex-wrap items-center gap-2",
                                isBelowMd && "[&_button]:min-h-11"
                              )}
                            >
                              <Button
                                type="button"
                                size={isBelowMd ? "default" : "sm"}
                                variant="secondary"
                                onClick={openMapGeomDialog}
                              >
                                Tambah/Ubah geometri unit kerja
                              </Button>
                              <Button
                                type="button"
                                size={isBelowMd ? "default" : "sm"}
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
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent value="Kanban" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <TabPanelKeepAlive view="Kanban" activeView={activeView}>
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
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent value="Kalender" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <TabPanelKeepAlive view="Kalender" activeView={activeView}>
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
              </TabPanelKeepAlive>
            </TabsContent>
            <TabsContent value="Gantt" className="min-h-0 w-full min-w-0 flex-none outline-none">
              <TabPanelKeepAlive view="Gantt" activeView={activeView}>
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
              </TabPanelKeepAlive>
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

        {/* Overlay tabel — hanya menutup area konten tab, bukan header workspace */}
        {activeVirtualTable && (
          isBelowMd ? (
            <WorkspaceMobileVirtualTableOverlay
              table={activeVirtualTable}
              columns={activeVirtualTableColumns}
              organizationId={canonicalOrgId}
              organizationName={selectedOrganization?.name ?? null}
              userId={userId}
              projectsForMention={projectsForMention}
              memberNameByUserId={memberNameByUserId}
              onBack={() => setActiveVirtualTableSlug(null)}
            />
          ) : (
          <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-background max-md:pb-[env(safe-area-inset-bottom)]">
            <div className="shrink-0 border-b border-border bg-card/90 px-4 py-2 max-md:pt-[env(safe-area-inset-top)]">
              <button
                type="button"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setActiveVirtualTableSlug(null)}
              >
                ← Kembali
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <VirtualTableView
                key={activeVirtualTable.id}
                layout="overlay"
                table={activeVirtualTable}
                columns={activeVirtualTableColumns}
                projectId={selectedProjectId}
                organizationId={canonicalOrgId}
                organizationName={selectedOrganization?.name ?? null}
                userId={userId}
                isOrgAdmin={isOrgAdminOfCanonicalOrg}
                projectsForMention={projectsForMention}
                memberNameByUserId={memberNameByUserId}
                allVirtualTables={allAccessibleVtables}
                onTableDeleted={() => setActiveVirtualTableSlug(null)}
                onLayerCreated={(result) => {
                  setActiveVirtualTableSlug(result.tableSlug);
                  setMapImportTableId(result.tableId);
                  router.refresh();
                  void refreshActivityLogs();
                }}
                onActivityChange={refreshActivityLogs}
              />
            </div>
          </div>
          )
        )}
        </section>
        </Tabs>
        {isBelowMd && !mobileChatKeyboardOpen ? (
          <WorkspaceMobileTabBar
            activeView={activeView}
            visibleViews={visibleViews}
            onViewChange={handleActiveViewChange}
            className="absolute inset-x-0 bottom-0 z-20 md:hidden"
          />
        ) : null}
      </main>

      {activeView !== "Chat" || isBelowMd ? (
        <WorkspaceRightPanel
          organizationId={canonicalOrgId}
          organizationName={selectedOrganization?.name ?? null}
          projectId={selectedProjectId}
          userId={userId}
          userEmail={userEmail}
          isOrgAdmin={isOrgAdminOfCanonicalOrg}
          projectsForMention={projectsForMention}
          memberNameByUserId={memberNameByUserId}
          allVirtualTables={allAccessibleVtables}
          virtualColumns={virtualColumns}
        />
      ) : null}
      </div>

      {/* Create virtual table dialog */}
      <VirtualTableCreateDialog
        projectId={selectedProjectId}
        organizationId={canonicalOrgId}
        scope={vtableCreateScope}
        open={vtableCreateDialogOpen}
        onOpenChange={setVtableCreateDialogOpen}
        onCreated={(tableId) => {
          const created = virtualTables.find((vt) => vt.id === tableId);
          if (created) setActiveVirtualTableSlug(created.slug);
        }}
      />
      </div>
      )}
      </div>
    </div>
    </WorkspaceRightPanelProvider>
    </VirtualTableChatUnreadProvider>
  );
}

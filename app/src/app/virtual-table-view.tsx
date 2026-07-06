"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Trash2,
  GripVertical,
  Copy,
  Type,
  Hash,
  Calendar,
  List,
  CheckSquare,
  Link,
  User,
  Paperclip,
  GitBranch,
  MapPin,
  Map as MapIcon,
  Upload,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { RelationTargetPickerDialog } from "@/components/relation-target-picker-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsBelowMd } from "@/lib/use-media-query";
import { readTableLayoutPreference } from "@/lib/virtual-table-layout-preference";
import { TableViewSwitcher } from "./table-view-switcher";
import { VirtualTableKanbanView } from "./virtual-table-kanban-view";
import { VirtualTableCalendarView } from "./virtual-table-calendar-view";
import { VirtualTableGalleryView } from "./virtual-table-gallery-view";
import { VirtualTableTimelineView } from "./virtual-table-timeline-view";
import { VirtualTableFormView } from "./virtual-table-form-view";
import { VirtualTableMapView } from "./virtual-table-map-view";
import { VirtualTableChartView } from "./virtual-table-chart-view";
import { TableLayoutSchemaPrompt } from "./table-layout-schema-prompt";
import { TableLayoutOptionsToolbar } from "./table-layout-options-toolbar";
import { VirtualTableViewToolbar } from "./virtual-table-view-toolbar";
import type { VirtualTableLayoutType } from "@/lib/virtual-table-layout-types";
import {
  isLayoutReady,
  resolveLayoutOptions,
} from "@/lib/virtual-table-layout-availability";
import {
  emptyVirtualViewConfig,
  normalizeVirtualViewConfig,
} from "@/lib/virtual-view-config";
import {
  layoutMetaFor,
} from "@/lib/virtual-table-layout-types";
import { virtualRowDisplayLabel } from "@/lib/virtual-table-row-label";
import { matchesVirtualRowFilter } from "@/lib/virtual-table-row-filters";
import type { VirtualViewLayoutOptions } from "./virtual-table-types";
import type {
  VirtualTableRow,
  VirtualColumnRow,
  VirtualDataRow,
  VirtualColumnDataType,
  VirtualViewRow,
  VirtualViewFilter,
  VirtualViewSort,
  VirtualViewConfig,
} from "./virtual-table-types";
import { VIRTUAL_COLUMN_DATA_TYPES, VIEW_FILTER_OPERATORS } from "./virtual-table-types";
import {
  createVirtualRowAction,
  updateVirtualRowCellAction,
  deleteVirtualRowAction,
  deleteVirtualRowsBulkAction,
  addVirtualColumnAction,
  updateVirtualColumnAction,
  deleteVirtualColumnAction,
  reorderVirtualColumnsAction,
  updateVirtualTableAction,
  deleteVirtualTableAction,
  fetchRelationTargetRowsAction,
  resolveRelationLabelsAction,
  createVirtualViewAction,
  updateVirtualViewAction,
  deleteVirtualViewAction,
  fetchVirtualViewsAction,
  duplicateVirtualViewAction,
  setDefaultVirtualViewAction,
  importVirtualRowsCsvAction,
  importVirtualRowsGeoJsonBatchAction,
  fetchVirtualTableImportContextAction,
  fetchRelationLookupColumnOptionsAction,
  type VirtualTableImportRelationHint,
  type RelationLookupColumnOption,
} from "./virtual-table-actions";
import { parseSimpleCsv } from "@/lib/csv-parse";
import {
  MAX_VIRTUAL_TABLE_BULK_DELETE_ROWS,
  MAX_VIRTUAL_TABLE_CSV_CHARS,
  MAX_VIRTUAL_TABLE_CSV_ROWS,
  VIRTUAL_TABLE_CSV_IMPORTABLE_TYPES,
  VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
  virtualTableCsvTooLargeMessage,
  virtualTableImportTemplateCsv,
  type VirtualTableImportColumnHint,
} from "@/lib/virtual-table-import-limits";
import { relationLookupSlugFromConfig } from "@/lib/virtual-table-relation-import";
import {
  fetchVirtualTableRowsWithCache,
  peekStaleVirtualTableRowsCache,
  peekVirtualTableRowsCache,
  virtualTableFullRowsCacheKey,
  type FetchVirtualTableRowsWithCacheOptions,
} from "@/lib/virtual-table-rows-fetch";
import {
  hydrateVirtualTableRowsCache,
  setVirtualTableRowsCache,
  virtualTableRowsCacheKey,
} from "@/lib/virtual-table-rows-cache";
import {
  VIRTUAL_TABLE_ROWS_MUTATED,
  type VirtualTableRowsMutatedDetail,
} from "@/lib/workspace-virtual-table-mutations";
import {
  parseFeatureCollectionForVirtualImport,
  pickDefaultVirtualTableMatchColumn,
} from "@/lib/virtual-table-geojson-import";
import { buildInboundGeomRelationSpecs } from "@/lib/virtual-table-geom-inbound-link";
import { VirtualTableDxfImportDialog } from "./virtual-table-dxf-import-dialog";
import { ImportDialogShell } from "./import-dialog-shell";
import {
  VirtualTableLayerUploadDialog,
  type LayerUploadCreated,
} from "./virtual-table-layer-upload-dialog";
import {
  buildVirtualTableImportPreviewFootprints,
  mapPreviewLayersSignature,
} from "@/lib/virtual-table-map-preview";
import type { MapFootprint } from "./workspace-map";
import { pickMapRowTitle } from "@/lib/virtual-table-map-popup";
import {
  buildChatRowPathSegments,
  buildChatTablePathSegments,
} from "@/lib/chat-row-context";
import { fetchVirtualTableChatUnreadRowsClient } from "@/lib/chat-client";
import {
  useVirtualTableChatUnread,
  VirtualTableRoomChatUnreadBadge,
} from "./virtual-table-chat-unread-context";
import type { VirtualRowMapSelect } from "./workspace-map";
import { useWorkspaceSpatialDataSync } from "./workspace-spatial-data-sync-context";
import {
  pickFindOnMapRelationPath,
  resolveFindOnMapTarget,
  tableHasGeometryColumn,
} from "@/lib/virtual-table-find-on-map";
import type { ProjectEntity360Profile } from "@/lib/project-entity-360-profile";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";
import { ruangKerjaLc } from "@/lib/product-labels";
import type { ChatAttachmentRef, ChatMentionOption } from "./chat-types";
import {
  MAX_SPATIAL_GEOMETRY_TEXT_CHARS,
  spatialGeometryTextTooLargeMessage,
} from "@/lib/spatial-import-limits";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  table: VirtualTableRow;
  columns: VirtualColumnRow[];
  projectId: string | null;
  organizationId: string | null;
  organizationName?: string | null;
  userId?: string | null;
  isOrgAdmin?: boolean;
  projectsForMention?: { id: string; name: string; key?: string }[];
  /** Member display names keyed by user_id. */
  memberNameByUserId: Map<string, string>;
  /** All accessible virtual tables (org + project) — needed for relation column target picker. */
  allVirtualTables: VirtualTableRow[];
  /** Kolom semua tabel virtual — untuk find-on-map lewat relasi (G-H2). */
  virtualColumnsByTableId?: Map<string, VirtualColumnRow[]>;
  /** Profil entitas 360° project (G-H4 / GQ-H5 find-on-map eksplisit). */
  entity360Profile?: ProjectEntity360Profile;
  onTableDeleted?: () => void | Promise<void>;
  /** Setelah layer baru dari file (pindah ke tabel yang dibuat). */
  onLayerCreated?: (result: LayerUploadCreated) => void;
  /** `overlay` = sidebar full-screen; grid mengisi tinggi tanpa kotak max-h. */
  layout?: "embedded" | "overlay";
  /**
   * Isi tinggi induk (flex-fill) + seamless tanpa kotak max-h, namun tetap
   * mode paginated seperti `embedded`. Dipakai tab Tabel (master–detail).
   */
  fillHeight?: boolean;
  /** Setelah mutasi yang menulis audit_log — refresh tab Aktivitas. */
  onActivityChange?: () => void;
  /**
   * Ditanam DI DALAM panel kanan (tab Obrolan "Buka berdampingan"). Menonaktifkan
   * semua aksi yang menyetir panel kanan (auto-closePanel, tombol chat tabel/baris)
   * agar tabel tidak menutup panelnya sendiri / menimpa percakapan utama.
   */
  embeddedInRightPanel?: boolean;
  /** Konten di kiri header (mis. toggle rail tab Data). */
  headerLeading?: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCellValue(
  value: unknown,
  dataType: VirtualColumnDataType,
  memberNameByUserId: Map<string, string>
): string {
  if (value == null || value === "") return "";
  switch (dataType) {
    case "checkbox":
      return value === true ? "Ya" : "Tidak";
    case "number":
      return String(value);
    case "date":
      return String(value).slice(0, 10);
    case "user": {
      const name = memberNameByUserId.get(String(value));
      return name ?? String(value).slice(0, 8);
    }
    default:
      return String(value);
  }
}

const DATA_TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: List,
  checkbox: CheckSquare,
  url: Link,
  user: User,
  file: Paperclip,
  relation: GitBranch,
  geometry: MapPin,
};

type SelectTone = { bg: string; text: string; dot: string; ring: string };

const SELECT_TONES = {
  gray: {
    bg: "bg-gray-100 dark:bg-gray-800/60",
    text: "text-gray-700 dark:text-gray-300",
    dot: "bg-gray-400 dark:bg-gray-500",
    ring: "ring-gray-200/70 dark:ring-gray-700/60",
  },
  amber: {
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-800 dark:text-amber-200",
    dot: "bg-amber-500",
    ring: "ring-amber-200/70 dark:ring-amber-800/60",
  },
  blue: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-800 dark:text-blue-200",
    dot: "bg-blue-500",
    ring: "ring-blue-200/70 dark:ring-blue-800/60",
  },
  green: {
    bg: "bg-green-100 dark:bg-green-900/40",
    text: "text-green-800 dark:text-green-200",
    dot: "bg-green-500",
    ring: "ring-green-200/70 dark:ring-green-800/60",
  },
  red: {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-800 dark:text-red-200",
    dot: "bg-red-500",
    ring: "ring-red-200/70 dark:ring-red-800/60",
  },
} satisfies Record<string, SelectTone>;

const SELECT_TONE_BY_VALUE: Record<string, keyof typeof SELECT_TONES> = {
  "to do": "gray",
  todo: "gray",
  belum: "gray",
  pending: "gray",
  backlog: "gray",
  "on progress": "amber",
  "in progress": "amber",
  sedang: "amber",
  proses: "amber",
  review: "blue",
  done: "green",
  selesai: "green",
  complete: "green",
  completed: "green",
  approved: "green",
  cancelled: "red",
  batal: "red",
  rejected: "red",
  ditolak: "red",
  blocked: "red",
};

/** Tone status; nilai tak dikenal memakai tone netral (gray). */
function getSelectTone(value: string): SelectTone {
  const key = SELECT_TONE_BY_VALUE[value.toLowerCase().trim()];
  return SELECT_TONES[key ?? "gray"];
}

/** Pill status seragam: ring halus + dot berwarna + label. */
function SelectPill({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const tone = getSelectTone(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tone.bg,
        tone.text,
        tone.ring,
        className
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", tone.dot)}
        aria-hidden
      />
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Client-side filter & sort
// ---------------------------------------------------------------------------

function compareRows(
  a: VirtualDataRow,
  b: VirtualDataRow,
  sorts: VirtualViewSort[]
): number {
  for (const sort of sorts) {
    const av = a.payload[sort.column];
    const bv = b.payload[sort.column];
    const sa = av != null ? String(av) : "";
    const sb = bv != null ? String(bv) : "";
    const numA = Number(av);
    const numB = Number(bv);
    let cmp: number;
    if (Number.isFinite(numA) && Number.isFinite(numB)) {
      cmp = numA - numB;
    } else {
      cmp = sa.localeCompare(sb);
    }
    if (cmp !== 0) return sort.direction === "desc" ? -cmp : cmp;
  }
  return 0;
}

const EMPTY_VIEW_CONFIG: VirtualViewConfig = emptyVirtualViewConfig();

type StoredViewSession = {
  activeViewId: string | null;
  config: VirtualViewConfig;
};

function viewSessionStorageKey(tableId: string) {
  return `vtable-view-session:${tableId}`;
}

function loadViewSession(tableId: string): StoredViewSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(viewSessionStorageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredViewSession;
    if (!parsed || typeof parsed !== "object" || !parsed.config) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveViewSession(tableId: string, session: StoredViewSession) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(viewSessionStorageKey(tableId), JSON.stringify(session));
  } catch {
    // ignore quota / private mode
  }
}

function clearViewSession(tableId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(viewSessionStorageKey(tableId));
  } catch {
    // ignore
  }
}

/** Width of frozen # column — must match `left-10` on second frozen column. */
const STICKY_ROW_NUM_CLASS = "w-10 min-w-10 max-w-10";

const STICKY_SHADOW =
  "shadow-[4px_0_6px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_6px_-4px_rgba(0,0,0,0.35)]";

function bodyStickyClass(frozen: "rowNum" | "first" | false, extra?: string) {
  return cn(
    extra,
    frozen === "rowNum" &&
      cn(
        "sticky left-0 z-10 bg-card group-hover:bg-muted/30",
        STICKY_SHADOW
      ),
    frozen === "first" &&
      cn(
        "sticky left-10 z-10 bg-card group-hover:bg-muted/30 min-w-[120px]",
        STICKY_SHADOW
      )
  );
}

function groupRowStickyClass(frozen: "rowNum" | "first", extra?: string) {
  return cn(
    extra,
    "z-[15] bg-muted",
    frozen === "rowNum" &&
      cn("sticky left-0", STICKY_ROW_NUM_CLASS, STICKY_SHADOW),
    frozen === "first" &&
      cn(
        "sticky left-10 min-w-[120px] overflow-visible",
        STICKY_SHADOW
      )
  );
}

/** Label baris grup: nama kolom (uppercase, muted) + nilai + chip jumlah baris. */
function GroupRowLabel({
  label,
  value,
  count,
}: {
  label?: string;
  value: string;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}:
      </span>
      <span className="text-xs font-medium text-foreground">{value}</span>
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/10 px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
        {count}
      </span>
    </span>
  );
}

function headStickyClass(
  kind: "rowNum" | "first" | "scroll" | "actions",
  extra?: string
) {
  // Opaque bg — semi-transparent header lets body cells show through when scrolling
  const base = cn("bg-muted", extra);
  if (kind === "rowNum") {
    return cn(
      base,
      "sticky left-0 z-40",
      STICKY_ROW_NUM_CLASS,
      STICKY_SHADOW
    );
  }
  if (kind === "first") {
    return cn(base, "sticky left-10 z-40 min-w-[120px]", STICKY_SHADOW);
  }
  return base;
}

// ---------------------------------------------------------------------------
// DataRow — extracted to avoid duplication between grouped/ungrouped render
// ---------------------------------------------------------------------------

type DataRowProps = {
  row: VirtualDataRow;
  idx: number;
  visibleColumns: VirtualColumnRow[];
  editingCell: { rowId: string; colSlug: string } | null;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  selectOptionsBySlug: Map<string, string[]>;
  relationLabels: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  saveCell: (rowId: string, colSlug: string, value: string) => void;
  toggleCheckbox: (rowId: string, colSlug: string, currentValue: unknown) => void;
  setEditingCell: (v: { rowId: string; colSlug: string } | null) => void;
  setDeleteRowConfirm: (v: string | null) => void;
  setRelationPicker: (v: {
    rowId: string;
    colSlug: string;
    targetTableId: string;
    isMulti: boolean;
    currentValue: string | string[] | null;
  } | null) => void;
  setGeometryEditor: (v: { rowId: string; colSlug: string; currentGeoJSON: string } | null) => void;
  setUserPicker: (v: { rowId: string; colSlug: string; currentUserId: string | null } | null) => void;
  onOpenRowChat: (rowId: string, rowTitle: string) => void;
  onOpenRowDetail?: (rowId: string) => void;
  onShowRowOnMap?: (rowId: string) => void;
  isRowChatOpen?: boolean;
  isRowDetailOpen?: boolean;
  hasUnreadChat?: boolean;
  /** Tampilkan tombol peta per baris (G-H2 / tabel ber-geometry). */
  showRowMapAction?: boolean;
  /** Sembunyikan tombol chat baris (dipakai saat tabel ditanam di panel kanan). */
  hideRowChat?: boolean;
  showSpatialSelection?: boolean;
  isSpatialRowSelected?: boolean;
  onToggleSpatialSelection?: () => void;
};

function MultiSelectCell({
  options,
  selected,
  onChange,
  className,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  };

  return (
    <td className={cn("px-3 py-1.5", className)}>
      <div
        ref={triggerRef}
        className="flex flex-wrap gap-1 min-h-[20px] cursor-pointer"
        onClick={handleOpen}
      >
        {selected.length > 0 ? (
          selected.map((s) => <SelectPill key={s} value={s} />)
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        )}
      </div>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] min-w-[160px] rounded-md border border-border bg-background p-1 shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          {options.map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-muted/50 ${
                  active ? "font-medium" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = active
                    ? selected.filter((s) => s !== opt)
                    : [...selected, opt];
                  onChange(next);
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  readOnly
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <SelectPill value={opt} />
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">Belum ada opsi</p>
          )}
        </div>,
        document.body
      )}
    </td>
  );
}

function DataRow({
  row,
  idx,
  visibleColumns,
  editingCell,
  editInputRef,
  selectOptionsBySlug,
  relationLabels,
  memberNameByUserId,
  saveCell,
  toggleCheckbox,
  setEditingCell,
  setDeleteRowConfirm,
  setRelationPicker,
  setGeometryEditor,
  setUserPicker,
  onOpenRowChat,
  onOpenRowDetail,
  onShowRowOnMap,
  isRowChatOpen = false,
  isRowDetailOpen = false,
  hasUnreadChat = false,
  showRowMapAction = false,
  hideRowChat = false,
  showSpatialSelection = false,
  isSpatialRowSelected = false,
  onToggleSpatialSelection,
}: DataRowProps) {
  return (
    <tr
      data-vrow-id={row.id}
      className={cn(
        "group border-b border-border last:border-b-0 transition-colors",
        hasUnreadChat
          ? "bg-amber-50/80 hover:bg-amber-50 border-l-4 border-l-amber-500"
          : "hover:bg-muted/30",
        isSpatialRowSelected && "bg-orange-50/70 dark:bg-orange-950/20",
        isRowDetailOpen && "bg-primary/5"
      )}
    >
      {showSpatialSelection ? (
        <td className="px-2 py-1.5 text-center">
          <input
            type="checkbox"
            checked={isSpatialRowSelected}
            onChange={() => onToggleSpatialSelection?.()}
            className="h-4 w-4 rounded border-border"
            aria-label="Seleksi untuk peta Spasial"
          />
        </td>
      ) : null}
      <td
        className={bodyStickyClass(
          "rowNum",
          cn(
            "px-2 py-1.5 text-center text-xs text-muted-foreground tabular-nums",
            onOpenRowDetail &&
              "cursor-pointer hover:bg-muted/60 hover:text-foreground"
          )
        )}
        onClick={
          onOpenRowDetail
            ? (e) => {
                e.stopPropagation();
                onOpenRowDetail(row.id);
              }
            : undefined
        }
        title={onOpenRowDetail ? "Buka detail baris" : undefined}
      >
        {idx + 1}
      </td>
      {visibleColumns.map((col, colIndex) => {
        const val = row.payload[col.slug];
        const isEditing =
          editingCell?.rowId === row.id && editingCell?.colSlug === col.slug;
        const frozen = colIndex === 0 ? ("first" as const) : false;
        const cellClass = (extra: string) => bodyStickyClass(frozen, extra);

        if (col.data_type === "checkbox") {
          return (
            <td key={col.id} className={cellClass("px-3 py-1.5")}>
              <input
                type="checkbox"
                checked={val === true}
                onChange={() => toggleCheckbox(row.id, col.slug, val)}
                className="h-4 w-4 rounded border-border"
              />
            </td>
          );
        }

        if (col.data_type === "select") {
          const options = selectOptionsBySlug.get(col.slug) ?? [];
          const isMulti = col.config?.is_multi === true;

          if (isMulti) {
            const selected: string[] = Array.isArray(val)
              ? (val as string[])
              : typeof val === "string" && val
                ? [val]
                : [];
            return (
              <MultiSelectCell
                key={col.id}
                options={options}
                selected={selected}
                onChange={(next) => saveCell(row.id, col.slug, JSON.stringify(next))}
                className={cellClass("px-3 py-1.5")}
              />
            );
          }

          const currentVal = val != null ? String(val) : "";

          return (
            <td key={col.id} className={cellClass("px-3 py-1.5 relative")}>
              <div className="inline-flex">
                <select
                  value={currentVal}
                  onChange={(e) => saveCell(row.id, col.slug, e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  <option value="">—</option>
                  {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {currentVal ? (
                  <SelectPill value={currentVal} className="pointer-events-none" />
                ) : (
                  <span className="text-muted-foreground/40 text-xs pointer-events-none">—</span>
                )}
              </div>
            </td>
          );
        }

        if (col.data_type === "relation") {
          const targetTableId = col.config?.target_table_id as string | undefined;
          const isMulti = col.config?.is_multi === true;
          const ids: string[] = Array.isArray(val)
            ? (val as string[])
            : typeof val === "string" && val
              ? [val]
              : [];
          return (
            <td
              key={col.id}
              className={cellClass(
                "px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
              )}
              onClick={() => {
                if (!targetTableId) {
                  toast.error(`Kolom "${col.display_name}" belum dikonfigurasi target tabel.`);
                  return;
                }
                setRelationPicker({
                  rowId: row.id,
                  colSlug: col.slug,
                  targetTableId,
                  isMulti,
                  currentValue: isMulti ? ids : ids[0] ?? null,
                });
              }}
              title="Klik untuk pilih relasi"
            >
              {ids.length === 0 ? (
                <span className="italic text-muted-foreground/60 text-sm">kosong</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {ids.map((id) => (
                    <Badge key={id} variant="secondary" className="text-xs font-normal">
                      {relationLabels[id] ?? id.slice(0, 8)}
                    </Badge>
                  ))}
                </div>
              )}
            </td>
          );
        }

        if (col.data_type === "user") {
          const userId = typeof val === "string" && val ? val : null;
          return (
            <td
              key={col.id}
              className={cellClass(
                "px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
              )}
              onClick={() =>
                setUserPicker({
                  rowId: row.id,
                  colSlug: col.slug,
                  currentUserId: userId,
                })
              }
              title="Klik untuk pilih pengguna"
            >
              {userId ? (
                <Badge variant="secondary" className="text-xs font-normal gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                  {memberNameByUserId.get(userId) ?? userId.slice(0, 8)}
                </Badge>
              ) : (
                <span className="italic text-muted-foreground/60 text-sm">kosong</span>
              )}
            </td>
          );
        }

        if (col.data_type === "geometry") {
          const hasGeo = val != null && val !== "" && typeof val === "object";
          return (
            <td
              key={col.id}
              className={cellClass(
                "px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
              )}
              onClick={() =>
                setGeometryEditor({
                  rowId: row.id,
                  colSlug: col.slug,
                  currentGeoJSON: hasGeo ? JSON.stringify(val, null, 2) : "",
                })
              }
              title="Klik untuk edit geometri"
            >
              {hasGeo ? (
                <Badge variant="secondary" className="text-xs font-normal gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />
                  Geometri
                </Badge>
              ) : (
                <span className="italic text-muted-foreground/60 text-sm">kosong</span>
              )}
            </td>
          );
        }

        if (col.data_type === "url" && val && !isEditing) {
          return (
            <td
              key={col.id}
              className={cellClass("px-3 py-1.5 cursor-pointer")}
              onDoubleClick={() => setEditingCell({ rowId: row.id, colSlug: col.slug })}
            >
              <a
                href={String(val)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline dark:text-blue-400 text-xs break-all"
              >
                {String(val)}
              </a>
            </td>
          );
        }

        if (isEditing) {
          return (
            <td key={col.id} className={cellClass("px-3 py-1")}>
              <input
                ref={editInputRef}
                type={
                  col.data_type === "number"
                    ? "number"
                    : col.data_type === "date"
                      ? "date"
                      : "text"
                }
                className="h-7 w-full rounded border border-ring bg-transparent px-1.5 text-sm text-foreground focus:outline-none"
                defaultValue={val != null ? String(val) : ""}
                onBlur={(e) => saveCell(row.id, col.slug, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    saveCell(row.id, col.slug, (e.target as HTMLInputElement).value);
                  }
                  if (e.key === "Escape") setEditingCell(null);
                }}
              />
            </td>
          );
        }

        return (
          <td
            key={col.id}
            className={cellClass(
              "px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
            )}
            onClick={() => setEditingCell({ rowId: row.id, colSlug: col.slug })}
            title="Klik untuk edit"
          >
            <span
              className={`text-sm ${
                col.data_type === "number" ? "tabular-nums text-right block" : ""
              } ${!val ? "text-muted-foreground" : "text-foreground"}`}
            >
              {formatCellValue(val, col.data_type, memberNameByUserId) || (
                <span className="italic text-muted-foreground/60">kosong</span>
              )}
            </span>
          </td>
        );
      })}
      <td className="px-1 py-1 text-center">
        <div className="flex items-center justify-center gap-0.5">
          {showRowMapAction && onShowRowOnMap ? (
            <button
              type="button"
              className="inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-colors group-hover:bg-muted/80 group-hover:text-primary group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onShowRowOnMap(row.id);
              }}
              title="Tunjukkan di peta"
            >
              <MapIcon className="size-4" />
            </button>
          ) : null}
          {!hideRowChat && (
            <button
              type="button"
              className={cn(
                "inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-md transition-colors",
                isRowChatOpen
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground opacity-70 group-hover:bg-muted/80 group-hover:text-primary group-hover:opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                const title = pickMapRowTitle(
                  row.payload ?? {},
                  visibleColumns.map((c) => ({
                    slug: c.slug,
                    display_name: c.display_name,
                    data_type: c.data_type,
                    position: c.position,
                  })),
                  relationLabels,
                  row.id
                );
                onOpenRowChat(row.id, title);
              }}
              title="Chat baris"
              aria-pressed={isRowChatOpen}
            >
              <MessageSquare className="size-4" />
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded p-1 opacity-20 group-hover:opacity-100"
            style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--destructive)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.2"; e.currentTarget.style.color = "var(--muted-foreground)"; }}
            onClick={(e) => { e.stopPropagation(); setDeleteRowConfirm(row.id); }}
            title="Hapus baris"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VirtualTableView({
  table,
  columns,
  projectId,
  organizationId,
  organizationName = null,
  userId = null,
  isOrgAdmin = false,
  projectsForMention = [],
  memberNameByUserId,
  allVirtualTables,
  virtualColumnsByTableId,
  entity360Profile,
  onTableDeleted,
  onLayerCreated,
  layout = "embedded",
  fillHeight = false,
  onActivityChange,
  embeddedInRightPanel = false,
  headerLeading,
}: Props) {
  const isOverlayLayout = layout === "overlay";
  const isPaginatedEmbedded = layout === "embedded";
  /** Grid mengisi tinggi induk + seamless (overlay, atau embedded fillHeight). */
  const shouldFillHeight = isOverlayLayout || fillHeight;
  /**
   * Header dijadikan bar setinggi 3.75rem (selaras tinggi header pane lain di tab
   * Tabel master–detail), tanpa garis bawah. Tidak untuk overlay/panel kanan yang
   * punya header/breadcrumb sendiri.
   */
  const paneHeader = fillHeight && !isOverlayLayout && !embeddedInRightPanel;
  const isBelowMd = useIsBelowMd();
  const overlayTouchToolbar = isOverlayLayout && isBelowMd;
  const router = useRouter();
  const bumpActivity = useCallback(() => {
    onActivityChange?.();
  }, [onActivityChange]);
  const { refreshEpoch } = useVirtualTableChatUnread();
  const spatialSync = useWorkspaceSpatialDataSync();
  const findOnMapProfile = useMemo(
    () =>
      entity360Profile?.geometry_holder
        ? {
            sourceTableId: table.id,
            geometryHolder: entity360Profile.geometry_holder,
          }
        : { sourceTableId: table.id },
    [entity360Profile, table.id]
  );
  const allVirtualColumnsForImport = useMemo(() => {
    if (!virtualColumnsByTableId) return columns;
    const out: VirtualColumnRow[] = [];
    for (const cols of virtualColumnsByTableId.values()) {
      out.push(...cols);
    }
    return out.length > 0 ? out : columns;
  }, [virtualColumnsByTableId, columns]);
  const {
    panel,
    openTableChat,
    openRowPanel,
    openRowDetail: openGlobalRowDetail,
    closePanel,
    isTableChatOpen,
    isRowPanelOpen,
  } = useWorkspaceRightPanel();
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [unreadChatRowIds, setUnreadChatRowIds] = useState<Set<string>>(
    () => new Set()
  );
  /** `${tableId}:${rowId}` setelah scroll berhasil — cegah scroll ulang. */
  const scrolledUnreadLockRef = useRef<string | null>(null);
  const unreadScrollInProgressRef = useRef<string | null>(null);
  const [pinnedUnreadScrollRowId, setPinnedUnreadScrollRowId] = useState<
    string | null
  >(null);
  const [layoutType, setLayoutType] =
    useState<VirtualTableLayoutType>("grid");
  const [layoutOptions, setLayoutOptions] = useState<VirtualViewLayoutOptions>(
    {}
  );

  const scrollUnreadRowIntoView = useCallback((rowId: string) => {
    const container = tableScrollRef.current;
    if (!container) return false;
    const rowEl = container.querySelector(
      `[data-vrow-id="${rowId}"]`
    ) as HTMLElement | null;
    if (!rowEl) return false;

    const containerRect = container.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const targetTop =
      rowRect.top -
      containerRect.top +
      container.scrollTop -
      (container.clientHeight - rowRect.height) / 2;

    container.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
    return true;
  }, []);

  // --- Row data (lazy-loaded + cache agar tab Tabel tidak reload penuh) ---
  // Pola "muat lebih banyak": baris dimuat bertahap per VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE
  // lalu di-append. `loadedCountRef` menyimpan ukuran jendela baris yang sedang dimuat
  // supaya refresh (loadRows) tidak menyusutkannya kembali ke satu halaman.
  const rowsCacheKey = useMemo(
    () =>
      virtualTableRowsCacheKey(
        table.id,
        0,
        isPaginatedEmbedded ? VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE : null
      ),
    [table.id, isPaginatedEmbedded]
  );

  const rowsCacheFetchOptions = useMemo(
    () =>
      isPaginatedEmbedded
        ? {
            limit: VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
            offset: 0,
            cachePageSize: VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
          }
        : undefined,
    [isPaginatedEmbedded]
  );

  const [rows, setRows] = useState<VirtualDataRow[]>([]);
  const [totalRowCount, setTotalRowCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedCountRef = useRef(VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE);

  useLayoutEffect(() => {
    let cancelled = false;
    const cached = peekVirtualTableRowsCache(table.id, rowsCacheFetchOptions);
    if (cached && cached.rows.length > 0) {
      setRows(cached.rows);
      setTotalRowCount(cached.totalCount);
      loadedCountRef.current = Math.max(
        VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
        cached.rows.length
      );
      setInitialLoading(false);
      return;
    }
    loadedCountRef.current = VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE;
    void (async () => {
      let fromIdb = await hydrateVirtualTableRowsCache(rowsCacheKey);
      if (
        (!fromIdb?.rows.length || cancelled) &&
        isPaginatedEmbedded
      ) {
        fromIdb = await hydrateVirtualTableRowsCache(
          virtualTableFullRowsCacheKey(table.id)
        );
      }
      if (cancelled || !fromIdb?.rows.length) return;
      const peeked = peekVirtualTableRowsCache(table.id, rowsCacheFetchOptions);
      const next = peeked ?? fromIdb;
      setRows(next.rows);
      setTotalRowCount(next.totalCount);
      loadedCountRef.current = Math.max(
        VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
        next.rows.length
      );
      setInitialLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [table.id, rowsCacheKey, rowsCacheFetchOptions, isPaginatedEmbedded]);

  const buildRowsFetchOptions = useCallback(():
    | FetchVirtualTableRowsWithCacheOptions
    | undefined => {
    if (!isPaginatedEmbedded) return undefined;
    return {
      limit: loadedCountRef.current,
      offset: 0,
      cachePageSize: VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
    };
  }, [isPaginatedEmbedded]);

  const applyRowsPayload = useCallback(
    (nextRows: VirtualDataRow[], totalCount: number) => {
      if (isPaginatedEmbedded) {
        loadedCountRef.current = Math.max(
          VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
          nextRows.length
        );
      }
      setRows(nextRows);
      setTotalRowCount(totalCount);
    },
    [isPaginatedEmbedded]
  );

  const loadRows = useCallback(
    async (opts?: { forceNetwork?: boolean }) => {
      const fetchOptions = buildRowsFetchOptions();
      const forceNetwork = opts?.forceNetwork === true;
      let hadCachedRows = false;

      if (!forceNetwork) {
        const fresh = peekVirtualTableRowsCache(table.id, fetchOptions);
        if (fresh?.rows.length) {
          applyRowsPayload(fresh.rows, fresh.totalCount);
          setInitialLoading(false);
          return;
        }

        const stale = peekStaleVirtualTableRowsCache(table.id, fetchOptions);
        if (stale?.rows.length) {
          hadCachedRows = true;
          applyRowsPayload(stale.rows, stale.totalCount);
          setInitialLoading(false);
        } else {
          setInitialLoading(true);
        }
      } else {
        setInitialLoading(true);
      }

      const result = await fetchVirtualTableRowsWithCache(table.id, {
        ...fetchOptions,
        forceNetwork: true,
      });
      if (result.error) {
        toast.error(result.error);
        if (!hadCachedRows) {
          setRows([]);
          setTotalRowCount(0);
        }
      } else {
        applyRowsPayload(result.rows, result.totalCount);
      }
      setInitialLoading(false);
    },
    [table.id, buildRowsFetchOptions, applyRowsPayload]
  );

  const loadedRowCount = rows.length;
  const hasMoreRows = isPaginatedEmbedded && loadedRowCount < totalRowCount;
  const remainingRowCount = Math.max(0, totalRowCount - loadedRowCount);

  const loadMoreRows = useCallback(async () => {
    if (!isPaginatedEmbedded || loadingMore || initialLoading) return;
    setLoadingMore(true);
    const result = await fetchVirtualTableRowsWithCache(table.id, {
      limit: VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
      offset: rows.length,
      cachePageSize: VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      const more = result.rows;
      const seen = new Set(rows.map((r) => r.id));
      const merged = [...rows, ...more.filter((r) => !seen.has(r.id))];
      loadedCountRef.current = Math.max(
        VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
        merged.length
      );
      setVirtualTableRowsCache(rowsCacheKey, {
        rows: merged,
        totalCount: result.totalCount,
      });
      setRows(merged);
      setTotalRowCount(result.totalCount);
    }
    setLoadingMore(false);
  }, [
    isPaginatedEmbedded,
    loadingMore,
    initialLoading,
    table.id,
    rows,
    rowsCacheKey,
  ]);

  useEffect(() => {
    if (isOverlayLayout) {
      setIsInView(true);
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsInView(true);
      },
      { rootMargin: "120px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isOverlayLayout]);

  useEffect(() => {
    if (!isInView) return;
    void loadRows();
  }, [isInView, loadRows]);

  useEffect(() => {
    const onMutated = (e: Event) => {
      const detail = (e as CustomEvent<VirtualTableRowsMutatedDetail>).detail;
      if (detail?.tableId === table.id) void loadRows();
    };
    window.addEventListener(VIRTUAL_TABLE_ROWS_MUTATED, onMutated);
    return () =>
      window.removeEventListener(VIRTUAL_TABLE_ROWS_MUTATED, onMutated);
  }, [table.id, loadRows]);

  // --- Inline editing ---
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colSlug: string;
  } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell) {
      setTimeout(() => editInputRef.current?.focus(), 0);
    }
  }, [editingCell]);

  const saveCell = useCallback(
    (rowId: string, colSlug: string, value: string) => {
      setEditingCell(null);
      const fd = new FormData();
      fd.set("row_id", rowId);
      fd.set("column_slug", colSlug);
      fd.set("value", value);
      startTransition(async () => {
        const r = await updateVirtualRowCellAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        await loadRows();
      });
    },
    [loadRows, bumpActivity]
  );

  const toggleCheckbox = useCallback(
    (rowId: string, colSlug: string, currentValue: unknown) => {
      const next = currentValue === true ? "false" : "true";
      const fd = new FormData();
      fd.set("row_id", rowId);
      fd.set("column_slug", colSlug);
      fd.set("value", next);
      startTransition(async () => {
        const r = await updateVirtualRowCellAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        await loadRows();
      });
    },
    [loadRows, bumpActivity]
  );

  // --- Add row ---
  const addRow = useCallback(() => {
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("payload", "{}");
    startTransition(async () => {
      const r = await createVirtualRowAction(fd);
      if (r.error) toast.error(r.error);
      else bumpActivity();
      await loadRows();
    });
  }, [table.id, loadRows, bumpActivity]);

  // --- Delete row ---
  const [deleteRowConfirm, setDeleteRowConfirm] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showGeoJsonImport, setShowGeoJsonImport] = useState(false);
  const [showDxfImport, setShowDxfImport] = useState(false);
  const [showLayerUpload, setShowLayerUpload] = useState(false);

  const geometryColumns = useMemo(
    () => columns.filter((c) => c.data_type === "geometry"),
    [columns]
  );

  const resolvedOrganizationId =
    organizationId ?? table.organization_id ?? null;

  const refreshUnreadChatRows = useCallback(async () => {
    if (!userId) {
      setUnreadChatRowIds(new Set());
      return;
    }
    const res = await fetchVirtualTableChatUnreadRowsClient(table.id);
    if (res.error || !res.data) return;
    setUnreadChatRowIds(new Set(res.data.map((r) => r.virtualRowId)));
  }, [table.id, userId]);

  const buildBaseMentionOptions = useCallback((): ChatMentionOption[] => {
    const opts: ChatMentionOption[] = [];
    for (const [uid, name] of memberNameByUserId) {
      opts.push({
        id: uid,
        label: name,
        kind: "user",
        searchText: name.toLowerCase(),
      });
    }
    for (const p of projectsForMention) {
      opts.push({
        id: p.id,
        label: p.name,
        kind: "project",
        searchText: `${p.name} ${p.key ?? ""}`.toLowerCase(),
      });
    }
    return opts;
  }, [memberNameByUserId, projectsForMention]);

  const buildRowFileOptions = useCallback(
    (rowId: string): ChatAttachmentRef[] => {
      const row = rows.find((r) => r.id === rowId);
      if (!row?.payload) return [];
      const out: ChatAttachmentRef[] = [];
      for (const col of columns) {
        if (col.data_type !== "file") continue;
        const val = row.payload[col.slug];
        if (typeof val === "string" && val.trim()) {
          out.push({ label: col.display_name, url: val.trim() });
        } else if (val && typeof val === "object" && "url" in val) {
          const url = String((val as { url?: unknown }).url ?? "").trim();
          if (url) out.push({ label: col.display_name, url });
        }
      }
      return out;
    },
    [rows, columns]
  );

  const openRowChat = useCallback(
    (rowId: string, rowTitle: string) => {
      const pathSegments = buildChatRowPathSegments({
        projectName: table.project_id
          ? (projectsForMention.find((p) => p.id === table.project_id)?.name ??
            null)
          : null,
        organizationName: table.project_id ? null : organizationName,
        tableDisplayName: table.display_name,
        rowLabel: rowTitle,
      });
      const row = rows.find((r) => r.id === rowId);
      openRowPanel({
        tableId: table.id,
        rowId,
        pathSegments,
        tab: "chat",
        closeWhenOverlayCloses: isOverlayLayout,
        mentionOptions: [
          ...buildBaseMentionOptions(),
          { id: rowId, label: rowTitle, kind: "row" },
        ],
        fileAttachmentOptions: buildRowFileOptions(rowId),
        rowPayload: row?.payload as Record<string, unknown> | undefined,
      });
    },
    [
      projectsForMention,
      table.project_id,
      table.display_name,
      table.id,
      organizationName,
      rows,
      isOverlayLayout,
      openRowPanel,
      buildBaseMentionOptions,
      buildRowFileOptions,
    ]
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      setDeleteRowConfirm(null);
      const fd = new FormData();
      fd.set("row_id", rowId);
      startTransition(async () => {
        const r = await deleteVirtualRowAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        await loadRows();
      });
    },
    [loadRows, bumpActivity]
  );

  // --- Column management ---
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<VirtualColumnDataType>("text");
  const [newColTargetTable, setNewColTargetTable] = useState("");
  const [newColLookupSlug, setNewColLookupSlug] = useState("");
  const [newColIsMulti, setNewColIsMulti] = useState(false);
  const [lookupColumnOptions, setLookupColumnOptions] = useState<
    RelationLookupColumnOption[]
  >([]);
  const [lookupColumnsLoading, setLookupColumnsLoading] = useState(false);

  function pickDefaultRelationLookupSlug(
    options: RelationLookupColumnOption[]
  ): string {
    if (options.length === 0) return "";
    const prefer = ["nama_desa", "title", "kode_desa", "name", "nama"];
    for (const slug of prefer) {
      const hit = options.find((c) => c.slug === slug);
      if (hit) return hit.slug;
    }
    return options[0]!.slug;
  }

  useEffect(() => {
    if (!showAddColumn || newColType !== "relation" || !newColTargetTable) {
      if (!newColTargetTable) {
        setLookupColumnOptions([]);
        setNewColLookupSlug("");
      }
      return;
    }
    let cancelled = false;
    setLookupColumnsLoading(true);
    void fetchRelationLookupColumnOptionsAction(newColTargetTable).then((r) => {
      if (cancelled) return;
      setLookupColumnsLoading(false);
      if (r.error) {
        toast.error(r.error);
        setLookupColumnOptions([]);
        setNewColLookupSlug("");
        return;
      }
      setLookupColumnOptions(r.columns);
      setNewColLookupSlug((prev) => {
        if (r.columns.some((c) => c.slug === prev)) return prev;
        return pickDefaultRelationLookupSlug(r.columns);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [showAddColumn, newColType, newColTargetTable]);

  const addColumn = useCallback(() => {
    if (!newColName.trim()) return;
    if (newColType === "relation" && !newColTargetTable) {
      toast.error("Pilih tabel target untuk kolom relasi.");
      return;
    }
    if (newColType === "relation" && !newColLookupSlug.trim()) {
      toast.error("Pilih kolom lookup di tabel target.");
      return;
    }
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("display_name", newColName.trim());
    fd.set("data_type", newColType);
    const columnConfig: Record<string, unknown> = {};
    if (newColType === "relation") {
      const lookupSlug = newColLookupSlug.trim() || "title";
      columnConfig.target_table_id = newColTargetTable;
      columnConfig.is_multi = newColIsMulti;
      columnConfig.lookup_slug = lookupSlug;
    }
    if (newColType === "select" && newColIsMulti) {
      columnConfig.is_multi = true;
    }
    if (Object.keys(columnConfig).length > 0) {
      fd.set("config", JSON.stringify(columnConfig));
    }
    startTransition(async () => {
      const r = await addVirtualColumnAction(fd);
      if (r.error) {
        toast.error(r.error);
      } else {
        setNewColName("");
        setNewColType("text");
        setNewColTargetTable("");
        setNewColLookupSlug("");
        setLookupColumnOptions([]);
        setNewColIsMulti(false);
        setShowAddColumn(false);
        bumpActivity();
      }
      router.refresh();
    });
  }, [
    table.id,
    newColName,
    newColType,
    newColTargetTable,
    newColLookupSlug,
    newColIsMulti,
    router,
    bumpActivity,
  ]);

  const removeColumn = useCallback(
    (columnId: string) => {
      const fd = new FormData();
      fd.set("column_id", columnId);
      startTransition(async () => {
        const r = await deleteVirtualColumnAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        router.refresh();
        await loadRows();
      });
    },
    [router, loadRows, bumpActivity]
  );

  const duplicateColumn = useCallback(
    (col: VirtualColumnRow) => {
      const fd = new FormData();
      fd.set("table_id", table.id);
      fd.set("display_name", `${col.display_name} (copy)`);
      fd.set("data_type", col.data_type);
      fd.set("config", JSON.stringify(col.config ?? {}));
      if (col.is_required) fd.set("is_required", "true");
      startTransition(async () => {
        const r = await addVirtualColumnAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        router.refresh();
      });
    },
    [table.id, router, bumpActivity]
  );

  // --- Drag-and-drop column reorder ---
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dropTargetColId, setDropTargetColId] = useState<string | null>(null);

  const handleColDragStart = useCallback(
    (e: React.DragEvent<HTMLElement>, colId: string) => {
      setDragColId(colId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", colId);
    },
    []
  );

  const handleColDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>, colId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (colId !== dropTargetColId) setDropTargetColId(colId);
    },
    [dropTargetColId]
  );

  const handleColDragEnd = useCallback(() => {
    setDragColId(null);
    setDropTargetColId(null);
  }, []);

  const handleColDrop = useCallback(
    (e: React.DragEvent<HTMLElement>, targetColId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === targetColId) {
        handleColDragEnd();
        return;
      }
      const ordered = [...columns].sort((a, b) => a.position - b.position);
      const ids = ordered.map((c) => c.id);
      const fromIdx = ids.indexOf(sourceId);
      const toIdx = ids.indexOf(targetColId);
      if (fromIdx === -1 || toIdx === -1) {
        handleColDragEnd();
        return;
      }
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, sourceId);

      const fd = new FormData();
      fd.set("column_ids", JSON.stringify(ids));
      startTransition(async () => {
        const r = await reorderVirtualColumnsAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        router.refresh();
      });
      handleColDragEnd();
    },
    [columns, router, handleColDragEnd, bumpActivity]
  );

  // --- Rename column (inline) ---
  const [renamingCol, setRenamingCol] = useState<{ id: string; name: string } | null>(null);
  const renameColInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingCol) setTimeout(() => renameColInputRef.current?.select(), 0);
  }, [renamingCol?.id]);

  const saveColRename = useCallback(() => {
    if (!renamingCol) return;
    const newName = renamingCol.name.trim();
    if (!newName) {
      setRenamingCol(null);
      return;
    }
    setRenamingCol(null);
    const fd = new FormData();
    fd.set("column_id", renamingCol.id);
    fd.set("display_name", newName);
    startTransition(async () => {
      const r = await updateVirtualColumnAction(fd);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (r.slugChanged && r.oldSlug && r.newSlug) {
        const from = r.oldSlug;
        const to = r.newSlug;
        setFilters((prev) =>
          prev.map((f) => (f.column === from ? { ...f, column: to } : f))
        );
        setSorts((prev) =>
          prev.map((s) => (s.column === from ? { ...s, column: to } : s))
        );
        setGroupBy((g) => (g === from ? to : g));
        setHiddenColumns((prev) => {
          const next = new Set(prev);
          if (next.has(from)) {
            next.delete(from);
            next.add(to);
          }
          return next;
        });
        toast.success(
          `Slug kolom diperbarui (${from} → ${to})` +
            (r.rowsUpdated != null && r.rowsUpdated > 0
              ? ` · ${r.rowsUpdated} baris`
              : "")
        );
      }
      await loadRows();
      bumpActivity();
      router.refresh();
    });
  }, [renamingCol, loadRows, router, bumpActivity]);

  // --- Table settings ---
  const [showTableSettings, setShowTableSettings] = useState(false);
  const [editTableName, setEditTableName] = useState(table.display_name);
  const [editTableDesc, setEditTableDesc] = useState(table.description ?? "");

  const saveTableSettings = useCallback(() => {
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("display_name", editTableName);
    fd.set("description", editTableDesc);
    startTransition(async () => {
      const r = await updateVirtualTableAction(fd);
      if (r.error) {
        toast.error(r.error);
      } else {
        setShowTableSettings(false);
        bumpActivity();
      }
      router.refresh();
    });
  }, [table.id, editTableName, editTableDesc, router, bumpActivity]);

  // --- Delete table ---
  const [showDeleteTable, setShowDeleteTable] = useState(false);

  const deleteTable = useCallback(() => {
    const fd = new FormData();
    fd.set("table_id", table.id);
    startTransition(async () => {
      const r = await deleteVirtualTableAction(fd);
      if (r.error) {
        toast.error(r.error);
      } else {
        setShowDeleteTable(false);
        await onTableDeleted?.();
        bumpActivity();
      }
      router.refresh();
    });
  }, [table.id, router, onTableDeleted, bumpActivity]);

  // --- Select options ---
  const selectOptionsBySlug = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const col of columns) {
      if (col.data_type === "select" && col.config?.options) {
        m.set(col.slug, col.config.options as string[]);
      }
    }
    return m;
  }, [columns]);

  // --- Select editor ---
  const [editingSelect, setEditingSelect] = useState<{
    rowId: string;
    colSlug: string;
    options: string[];
    current: string;
  } | null>(null);

  // --- Select config editor (for column options) ---
  const [editingColOptions, setEditingColOptions] = useState<{
    columnId: string;
    options: string[];
  } | null>(null);
  const [newOption, setNewOption] = useState("");

  const saveColOptions = useCallback(() => {
    if (!editingColOptions) return;
    const col = columns.find((c) => c.id === editingColOptions.columnId);
    const existingConfig = { ...(col?.config ?? {}) };
    delete existingConfig.notify_on_change;
    const fd = new FormData();
    fd.set("column_id", editingColOptions.columnId);
    fd.set(
      "config",
      JSON.stringify({
        ...existingConfig,
        options: editingColOptions.options,
      })
    );
    startTransition(async () => {
      const r = await updateVirtualColumnAction(fd);
      if (r.error) toast.error(r.error);
      else {
        setEditingColOptions(null);
        bumpActivity();
      }
      router.refresh();
    });
  }, [editingColOptions, columns, router, bumpActivity]);

  // --- Relation labels (resolved display names for related rows) ---
  const [relationLabels, setRelationLabels] = useState<Record<string, string>>({});
  /** Hindari loop: ID yang sudah dicoba resolve (termasuk yang tidak ketemu di DB). */
  const relationResolveAttemptedRef = useRef<Set<string>>(new Set());

  const relationIdsInRowsSig = useMemo(() => {
    const relationCols = columns.filter((c) => c.data_type === "relation");
    if (relationCols.length === 0 || rows.length === 0) return "";
    const ids = new Set<string>();
    for (const row of rows) {
      for (const col of relationCols) {
        const val = row.payload[col.slug];
        if (typeof val === "string" && val) ids.add(val);
        if (Array.isArray(val)) {
          for (const v of val) {
            if (typeof v === "string" && v) ids.add(v);
          }
        }
      }
    }
    return [...ids].sort().join(",");
  }, [rows, columns]);

  useEffect(() => {
    if (!relationIdsInRowsSig) return;

    const ids = relationIdsInRowsSig.split(",").filter(Boolean);
    const toResolve = ids.filter(
      (id) => !relationResolveAttemptedRef.current.has(id)
    );
    if (toResolve.length === 0) return;

    for (const id of toResolve) {
      relationResolveAttemptedRef.current.add(id);
    }

    let cancelled = false;
    resolveRelationLabelsAction(toResolve).then((result) => {
      if (cancelled) return;
      setRelationLabels((prev) => {
        const next = { ...prev };
        for (const id of toResolve) {
          if (result.labels?.[id]) {
            next[id] = result.labels[id]!;
          } else {
            next[id] = id.slice(0, 8);
          }
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [relationIdsInRowsSig]);

  useEffect(() => {
    relationResolveAttemptedRef.current = new Set();
    setRelationLabels({});
  }, [table.id]);

  // --- Relation picker state ---
  const [relationPicker, setRelationPicker] = useState<{
    rowId: string;
    colSlug: string;
    targetTableId: string;
    isMulti: boolean;
    currentValue: string | string[] | null;
  } | null>(null);
  const [relationPickerRows, setRelationPickerRows] = useState<
    { id: string; label: string }[]
  >([]);
  const [relationPickerLoading, setRelationPickerLoading] = useState(false);
  const [relationPickerSearch, setRelationPickerSearch] = useState("");

  // Load target rows when picker opens
  useEffect(() => {
    if (!relationPicker) return;
    setRelationPickerLoading(true);
    setRelationPickerSearch("");
    fetchRelationTargetRowsAction(relationPicker.targetTableId).then((res) => {
      if (!res.error) setRelationPickerRows(res.rows);
      setRelationPickerLoading(false);
    });
  }, [relationPicker?.targetTableId, relationPicker !== null]);

  const filteredRelationPickerRows = useMemo(() => {
    if (!relationPickerSearch.trim()) return relationPickerRows;
    const q = relationPickerSearch.toLowerCase();
    return relationPickerRows.filter((r) => r.label.toLowerCase().includes(q));
  }, [relationPickerRows, relationPickerSearch]);

  const saveRelation = useCallback(
    (rowId: string, colSlug: string, value: string | string[]) => {
      setRelationPicker(null);
      const fd = new FormData();
      fd.set("row_id", rowId);
      fd.set("column_slug", colSlug);
      fd.set("value", JSON.stringify(value));
      startTransition(async () => {
        const r = await updateVirtualRowCellAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        await loadRows();
      });
    },
    [loadRows, bumpActivity]
  );

  // --- User picker state ---
  const [userPicker, setUserPicker] = useState<{
    rowId: string;
    colSlug: string;
    currentUserId: string | null;
  } | null>(null);
  const [userPickerMembers, setUserPickerMembers] = useState<
    { id: string; label: string }[]
  >([]);
  const [userPickerLoading, setUserPickerLoading] = useState(false);
  const [userPickerSearch, setUserPickerSearch] = useState("");

  const memberNamesKey = useMemo(
    () =>
      [...memberNameByUserId.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, name]) => `${id}:${name}`)
        .join("|"),
    [memberNameByUserId]
  );

  useEffect(() => {
    if (!userPicker) return;
    const orgId = table.organization_id;
    if (!orgId) {
      const members = [...memberNameByUserId.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setUserPickerMembers(members);
      return;
    }
    setUserPickerLoading(true);
    setUserPickerSearch("");
    import("./virtual-table-actions").then((mod) =>
      mod.fetchOrgMembersAction(orgId).then((res) => {
        if (!res.error) setUserPickerMembers(res.members);
        setUserPickerLoading(false);
      })
    );
  }, [userPicker, table.organization_id, memberNamesKey]);

  const filteredUserPickerMembers = useMemo(() => {
    if (!userPickerSearch.trim()) return userPickerMembers;
    const q = userPickerSearch.toLowerCase();
    return userPickerMembers.filter((m) => m.label.toLowerCase().includes(q));
  }, [userPickerMembers, userPickerSearch]);

  const saveUser = useCallback(
    (rowId: string, colSlug: string, userId: string) => {
      setUserPicker(null);
      const fd = new FormData();
      fd.set("row_id", rowId);
      fd.set("column_slug", colSlug);
      fd.set("value", userId);
      startTransition(async () => {
        const r = await updateVirtualRowCellAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        await loadRows();
      });
    },
    [loadRows, bumpActivity]
  );

  const clearUser = useCallback(
    (rowId: string, colSlug: string) => {
      setUserPicker(null);
      const fd = new FormData();
      fd.set("row_id", rowId);
      fd.set("column_slug", colSlug);
      fd.set("value", "");
      startTransition(async () => {
        const r = await updateVirtualRowCellAction(fd);
        if (r.error) toast.error(r.error);
        else bumpActivity();
        await loadRows();
      });
    },
    [loadRows, bumpActivity]
  );

  const openRowDetail = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      const rowTitle = row
        ? virtualRowDisplayLabel(row, columns)
        : "Baris";
      const pathSegments = buildChatRowPathSegments({
        projectName: table.project_id
          ? (projectsForMention.find((p) => p.id === table.project_id)?.name ??
            null)
          : null,
        organizationName: table.project_id ? null : organizationName,
        tableDisplayName: table.display_name,
        rowLabel: rowTitle,
      });
      openRowPanel({
        tableId: table.id,
        rowId,
        pathSegments,
        tab: "detail",
        closeWhenOverlayCloses: isOverlayLayout,
        mentionOptions: [
          ...buildBaseMentionOptions(),
          { id: rowId, label: rowTitle, kind: "row" },
        ],
        fileAttachmentOptions: buildRowFileOptions(rowId),
        rowPayload: row?.payload as Record<string, unknown> | undefined,
        relationLabels,
      });
    },
    [
      rows,
      columns,
      projectsForMention,
      table.project_id,
      table.display_name,
      table.id,
      organizationName,
      isOverlayLayout,
      openRowPanel,
      buildBaseMentionOptions,
      buildRowFileOptions,
      relationLabels,
    ]
  );

  const isRowDetailVisible = useCallback(
    (rowId: string) => {
      if (!panel) return false;
      if (panel.kind === "row-detail" && panel.rowId === rowId) return true;
      return (
        panel.kind === "row" && panel.rowId === rowId && panel.tab === "detail"
      );
    },
    [panel]
  );

  const handleShowRowOnMap = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;

      const target = resolveFindOnMapTarget({
        sourceTableId: table.id,
        sourceColumns: columns,
        sourceRows: [row],
        columnsByTableId:
          virtualColumnsByTableId ?? new Map([[table.id, columns]]),
        findOnMapProfile,
      });

      if (!target) {
        toast.error("Baris ini tidak punya poligon terkait.");
        return;
      }

      spatialSync.openInSpatial({
        tableId: target.tableId,
        rowIds: target.rowIds,
        zoomToSelection: true,
      });
    },
    [
      rows,
      table.id,
      columns,
      virtualColumnsByTableId,
      findOnMapProfile,
      spatialSync,
    ]
  );

  const handleKanbanStatusChange = useCallback(
    (rowId: string, newStatus: string | null) => {
      const slug = layoutOptions.statusColumn;
      if (!slug) return;
      saveCell(rowId, slug, newStatus ?? "");
    },
    [layoutOptions.statusColumn, saveCell]
  );

  const openGeometryForForm = useCallback(
    (rowId: string, colSlug: string) => {
      const row = rows.find((r) => r.id === rowId);
      const val = row?.payload[colSlug];
      const hasGeo = val != null && val !== "" && typeof val === "object";
      setGeometryEditor({
        rowId,
        colSlug,
        currentGeoJSON: hasGeo ? JSON.stringify(val, null, 2) : "",
      });
    },
    [rows]
  );

  const handleMapVirtualRowSelect = useCallback(
    (select: VirtualRowMapSelect) => {
      if (select.tableId !== table.id) return;
      if (spatialSync.selectionSyncEnabled) {
        spatialSync.setRowSelection(table.id, [select.rowId]);
      }
      const row = rows.find((r) => r.id === select.rowId);
      openGlobalRowDetail({
        tableId: table.id,
        rowId: select.rowId,
        pathSegments: select.pathSegments,
        rowPayload:
          (row?.payload as Record<string, unknown> | undefined) ??
          select.rowPayload,
        relationLabels: select.relationLabels ?? relationLabels,
      });
    },
    [table.id, rows, openGlobalRowDetail, relationLabels, spatialSync]
  );

  const highlightVirtualRowId =
    panel?.kind === "row-detail" && panel.tableId === table.id
      ? panel.rowId
      : null;

  const handleMapBackgroundClick = useCallback(() => {
    if (panel?.kind === "row-detail" && panel.tableId === table.id) {
      closePanel();
    }
    if (spatialSync.selectionSyncEnabled) {
      spatialSync.clearRowSelection(table.id);
    }
  }, [panel, table.id, closePanel, spatialSync]);

  // --- Sorted columns ---
  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.position - b.position),
    [columns]
  );

  // --- Views, Filters, Sorts ---
  const [savedViews, setSavedViews] = useState<VirtualViewRow[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Local (working) view config
  const [filters, setFilters] = useState<VirtualViewFilter[]>([]);
  const [sorts, setSorts] = useState<VirtualViewSort[]>([]);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showViewToolbar, setShowViewToolbar] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const viewSessionHydratedRef = useRef(false);

  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const applyViewConfig = useCallback((config: VirtualViewConfig) => {
    const normalized = normalizeVirtualViewConfig(config);
    setFilters(normalized.filters ?? []);
    setSorts(normalized.sorts ?? []);
    setGroupBy(normalized.groupBy ?? null);
    setLayoutType(normalized.layoutType ?? "grid");
    setLayoutOptions(normalized.layoutOptions ?? {});
    const allSlugs = columnsRef.current.map((c) => c.slug);
    if (normalized.visibleColumns && normalized.visibleColumns.length > 0) {
      const visible = new Set(normalized.visibleColumns);
      setHiddenColumns(new Set(allSlugs.filter((s) => !visible.has(s))));
    } else {
      setHiddenColumns(new Set());
    }
  }, []);

  // Restore last session from localStorage, else DB default view (sekali per table.id, saat terlihat)
  useEffect(() => {
    if (!isInView) return;
    viewSessionHydratedRef.current = false;
    let cancelled = false;

    fetchVirtualViewsAction(table.id).then((res) => {
      if (cancelled || res.error) {
        viewSessionHydratedRef.current = true;
        return;
      }

      const views = res.views as VirtualViewRow[];
      setSavedViews(views);

      const session = loadViewSession(table.id);
      if (session) {
        applyViewConfig(session.config);
        const viewStillExists =
          session.activeViewId != null &&
          views.some((v) => v.id === session.activeViewId);
        setActiveViewId(viewStillExists ? session.activeViewId : null);
        viewSessionHydratedRef.current = true;
        return;
      }

      const defaultView = views.find((v) => v.is_default);
      if (defaultView) {
        applyViewConfig(defaultView.config as VirtualViewConfig);
        setActiveViewId(defaultView.id);
      } else {
        const prefLayout = readTableLayoutPreference(table.id);
        setLayoutType(prefLayout);
        setLayoutOptions(
          resolveLayoutOptions(prefLayout, {}, columnsRef.current)
        );
      }
      viewSessionHydratedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [table.id, isInView]);

  const currentViewConfig = useMemo((): VirtualViewConfig => ({
    filters,
    sorts,
    groupBy,
    visibleColumns: sortedColumns
      .map((c) => c.slug)
      .filter((s) => !hiddenColumns.has(s)),
    columnWidths: {},
    layoutType,
    layoutOptions,
  }), [filters, sorts, groupBy, sortedColumns, hiddenColumns, layoutType, layoutOptions]);

  const handleLayoutChange = useCallback(
    (next: VirtualTableLayoutType, options: VirtualViewLayoutOptions) => {
      setLayoutType(next);
      setLayoutOptions(options);
    },
    []
  );

  const handleLayoutOptionsChange = useCallback(
    (patch: Partial<VirtualViewLayoutOptions>) => {
      setLayoutOptions((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  useEffect(() => {
    if (layoutType === "grid" || layoutType === "form") return;
    setLayoutOptions((prev) =>
      resolveLayoutOptions(layoutType, prev, columns)
    );
  }, [columns, layoutType]);

  const effectiveLayout = useMemo(() => {
    if (
      isLayoutReady(layoutType, layoutOptions, columns) &&
      (layoutType === "grid" ||
        layoutType === "kanban" ||
        layoutType === "calendar" ||
        layoutType === "timeline" ||
        layoutType === "gallery" ||
        layoutType === "form" ||
        layoutType === "map" ||
        layoutType === "chart")
    ) {
      return layoutType;
    }
    return "grid" as const;
  }, [layoutType, layoutOptions, columns]);

  const openAddColumnForLayout = useCallback(
    (dataType: VirtualColumnDataType, suggestedName: string) => {
      setNewColType(dataType);
      setNewColName(suggestedName);
      setShowAddColumn(true);
    },
    []
  );

  const layoutSchemaMismatch =
    layoutType !== effectiveLayout && layoutType !== "grid";

  const altLayoutShellClass = cn(
    "flex min-h-0 min-w-0 flex-col bg-card",
    shouldFillHeight ? "flex-1" : "rounded-xl border border-border shadow-sm"
  );

  const loadMoreFooter =
    hasMoreRows ? (
      <div className="flex shrink-0 justify-center border-t border-border/60 px-3 py-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loadingMore || initialLoading}
          onClick={() => void loadMoreRows()}
        >
          {loadingMore ? (
            <>
              <Spinner className="size-4" /> Memuat…
            </>
          ) : (
            `Muat ${Math.min(
              VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
              remainingRowCount
            )} baris lagi · sisa ${remainingRowCount}`
          )}
        </Button>
      </div>
    ) : null;

  // Persist filter/sort/group/columns to localStorage (survives refresh & tab switch)
  useEffect(() => {
    if (!viewSessionHydratedRef.current) return;
    saveViewSession(table.id, {
      activeViewId,
      config: currentViewConfig,
    });
  }, [table.id, activeViewId, currentViewConfig]);

  const saveCurrentView = useCallback(() => {
    if (!saveViewName.trim()) return;
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("name", saveViewName.trim());
    fd.set("config", JSON.stringify(currentViewConfig));
    startTransition(async () => {
      const r = await createVirtualViewAction(fd);
      if (r.error) {
        toast.error(r.error);
      } else {
        setSaveViewName("");
        setShowSaveViewDialog(false);
        if (r.viewId) setActiveViewId(r.viewId);
        const updated = await fetchVirtualViewsAction(table.id);
        if (!updated.error) setSavedViews(updated.views as VirtualViewRow[]);
      }
    });
  }, [saveViewName, currentViewConfig, table.id]);

  const updateActiveView = useCallback(() => {
    if (!activeViewId) return;
    const fd = new FormData();
    fd.set("view_id", activeViewId);
    fd.set("config", JSON.stringify(currentViewConfig));
    startTransition(async () => {
      const r = await updateVirtualViewAction(fd);
      if (r.error) toast.error(r.error);
      const updated = await fetchVirtualViewsAction(table.id);
      if (!updated.error) setSavedViews(updated.views as VirtualViewRow[]);
    });
  }, [activeViewId, currentViewConfig, table.id]);

  const deleteView = useCallback((viewId: string) => {
    const fd = new FormData();
    fd.set("view_id", viewId);
    startTransition(async () => {
      const r = await deleteVirtualViewAction(fd);
      if (r.error) toast.error(r.error);
      if (activeViewId === viewId) {
        setActiveViewId(null);
        applyViewConfig(emptyVirtualViewConfig());
      }
      const updated = await fetchVirtualViewsAction(table.id);
      if (!updated.error) setSavedViews(updated.views as VirtualViewRow[]);
    });
  }, [activeViewId, table.id, applyViewConfig]);

  const duplicateView = useCallback(
    (viewId: string) => {
      const fd = new FormData();
      fd.set("view_id", viewId);
      startTransition(async () => {
        const r = await duplicateVirtualViewAction(fd);
        if (r.error) toast.error(r.error);
        const updated = await fetchVirtualViewsAction(table.id);
        if (!updated.error) {
          const views = updated.views as VirtualViewRow[];
          setSavedViews(views);
          if (r.viewId) {
            setActiveViewId(r.viewId);
            const copied = views.find((v) => v.id === r.viewId);
            if (copied) applyViewConfig(copied.config);
          }
        }
      });
    },
    [table.id, applyViewConfig]
  );

  const setDefaultView = useCallback(
    (viewId: string) => {
      const fd = new FormData();
      fd.set("view_id", viewId);
      fd.set("table_id", table.id);
      startTransition(async () => {
        const r = await setDefaultVirtualViewAction(fd);
        if (r.error) toast.error(r.error);
        const updated = await fetchVirtualViewsAction(table.id);
        if (!updated.error) setSavedViews(updated.views as VirtualViewRow[]);
      });
    },
    [table.id]
  );

  // Toggle column sort (click header)
  const toggleSort = useCallback((colSlug: string) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.column === colSlug);
      if (!existing) return [...prev, { column: colSlug, direction: "asc" as const }];
      if (existing.direction === "asc")
        return prev.map((s) => s.column === colSlug ? { ...s, direction: "desc" as const } : s);
      return prev.filter((s) => s.column !== colSlug);
    });
  }, []);

  // Visible columns for rendering
  const visibleColumns = useMemo(
    () => sortedColumns.filter((c) => !hiddenColumns.has(c.slug)),
    [sortedColumns, hiddenColumns]
  );

  // Build label resolvers per column for filter/sort on relation & user columns
  const labelResolvers = useMemo(() => {
    const map = new Map<string, (val: unknown) => string>();
    for (const col of columns) {
      if (col.data_type === "relation") {
        map.set(col.slug, (val) => {
          if (val == null || val === "") return "";
          const ids = Array.isArray(val) ? (val as string[]) : [String(val)];
          return ids.map((id) => relationLabels[id] ?? id).join(", ");
        });
      } else if (col.data_type === "user") {
        map.set(col.slug, (val) => {
          if (val == null || val === "") return "";
          return memberNameByUserId.get(String(val)) ?? String(val);
        });
      }
    }
    return map;
  }, [columns, relationLabels, memberNameByUserId]);

  // Apply filters and sorts client-side
  const processedRows = useMemo(() => {
    let result = [...rows];
    for (const filter of filters) {
      const resolver = labelResolvers.get(filter.column);
      result = result.filter((row) =>
        matchesVirtualRowFilter(row, filter, resolver)
      );
    }
    if (sorts.length > 0) {
      result.sort((a, b) => compareRows(a, b, sorts));
    }
    return result;
  }, [rows, filters, sorts, labelResolvers]);

  const hasGeometryColumn = useMemo(
    () => tableHasGeometryColumn(columns),
    [columns]
  );
  const findOnMapRelationPath = useMemo(() => {
    if (!virtualColumnsByTableId || hasGeometryColumn) return null;
    return pickFindOnMapRelationPath(
      columns,
      virtualColumnsByTableId,
      findOnMapProfile
    );
  }, [columns, virtualColumnsByTableId, hasGeometryColumn, findOnMapProfile]);
  const canOpenInSpatial =
    hasGeometryColumn || findOnMapRelationPath != null;
  const openInSpatialLabel = hasGeometryColumn
    ? "Buka di Spasial"
    : "Tunjukkan di peta";
  const showSpatialSelection =
    hasGeometryColumn && spatialSync.selectionSyncEnabled;
  const selectedSpatialRowIds = spatialSync.getSelectedRowIds(table.id);
  const highlightVirtualRowIds = useMemo(
    () =>
      showSpatialSelection && selectedSpatialRowIds.length > 0
        ? new Set(selectedSpatialRowIds)
        : undefined,
    [showSpatialSelection, selectedSpatialRowIds]
  );

  const handleOpenInSpatialTab = useCallback(() => {
    if (!virtualColumnsByTableId && !hasGeometryColumn) return;

    const sourceRows =
      selectedSpatialRowIds.length > 0
        ? processedRows.filter((row) => selectedSpatialRowIds.includes(row.id))
        : processedRows;

    const target = resolveFindOnMapTarget({
      sourceTableId: table.id,
      sourceColumns: columns,
      sourceRows,
      columnsByTableId: virtualColumnsByTableId ?? new Map([[table.id, columns]]),
      findOnMapProfile,
    });

    if (!target) {
      toast.error(
        findOnMapRelationPath
          ? "Tidak ada baris dengan poligon terkait (relasi kosong)."
          : "Tidak ada geometri untuk ditampilkan di peta."
      );
      return;
    }

    spatialSync.openInSpatial({
      tableId: target.tableId,
      rowIds: target.rowIds,
      zoomToSelection: true,
    });
  }, [
    columns,
    findOnMapRelationPath,
    hasGeometryColumn,
    processedRows,
    selectedSpatialRowIds,
    spatialSync,
    table.id,
    virtualColumnsByTableId,
  ]);

  useEffect(() => {
    scrolledUnreadLockRef.current = null;
    unreadScrollInProgressRef.current = null;
    setPinnedUnreadScrollRowId(null);
    // Jangan tutup panel bila tabel ini justru dirender DI DALAM panel kanan.
    if (!embeddedInRightPanel) closePanel();
  }, [table.id, closePanel, embeddedInRightPanel]);

  useEffect(() => {
    if (!isInView) return;
    void refreshUnreadChatRows();
  }, [isInView, refreshUnreadChatRows, refreshEpoch]);


  const relationLabelsReady = useMemo(() => {
    if (!relationIdsInRowsSig) return true;
    const ids = relationIdsInRowsSig.split(",").filter(Boolean);
    if (ids.length === 0) return true;
    return ids.every((id) =>
      Object.prototype.hasOwnProperty.call(relationLabels, id)
    );
  }, [relationIdsInRowsSig, relationLabels]);

  // Kunci baris target sekali (urutan processedRows bisa berubah setelah label relasi).
  useEffect(() => {
    if (initialLoading || pinnedUnreadScrollRowId) return;
    if (unreadChatRowIds.size === 0 || processedRows.length === 0) return;
    const first = processedRows.find((r) => unreadChatRowIds.has(r.id));
    if (first) setPinnedUnreadScrollRowId(first.id);
  }, [
    initialLoading,
    pinnedUnreadScrollRowId,
    unreadChatRowIds,
    processedRows,
  ]);

  useEffect(() => {
    if (
      initialLoading ||
      !relationLabelsReady ||
      !pinnedUnreadScrollRowId
    ) {
      return;
    }

    const lockKey = `${table.id}:${pinnedUnreadScrollRowId}`;
    if (scrolledUnreadLockRef.current === lockKey) return;
    if (unreadScrollInProgressRef.current === lockKey) return;
    unreadScrollInProgressRef.current = lockKey;

    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryScroll = () => {
      if (cancelled) return;
      if (scrollUnreadRowIntoView(pinnedUnreadScrollRowId)) {
        scrolledUnreadLockRef.current = lockKey;
        unreadScrollInProgressRef.current = null;
        return;
      }
      attempts += 1;
      if (attempts < 16) {
        retryTimer = setTimeout(tryScroll, 50);
      } else {
        unreadScrollInProgressRef.current = null;
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryScroll);
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (scrolledUnreadLockRef.current !== lockKey) {
        unreadScrollInProgressRef.current = null;
      }
    };
  }, [
    table.id,
    pinnedUnreadScrollRowId,
    relationLabelsReady,
    initialLoading,
    scrollUnreadRowIntoView,
  ]);

  // Group rows if groupBy is set
  const groupedRows = useMemo(() => {
    if (!groupBy) return null;
    const groupCol = columns.find((c) => c.slug === groupBy);
    const isRelation = groupCol?.data_type === "relation";
    const isUser = groupCol?.data_type === "user";

    const resolveKey = (val: unknown): string => {
      if (val == null || val === "") return "(kosong)";
      if (isRelation) {
        const ids = Array.isArray(val) ? (val as string[]) : [String(val)];
        const labels = ids.map((id) => relationLabels[id] ?? id.slice(0, 8));
        return labels.join(", ") || "(kosong)";
      }
      if (isUser) {
        return memberNameByUserId.get(String(val)) ?? String(val).slice(0, 8);
      }
      if (Array.isArray(val)) return (val as string[]).join(", ") || "(kosong)";
      return String(val);
    };

    const groups = new Map<string, VirtualDataRow[]>();
    for (const row of processedRows) {
      const val = row.payload[groupBy];
      const key = resolveKey(val);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return groups;
  }, [processedRows, groupBy, columns, relationLabels, memberNameByUserId]);

  const hasActiveFilters = filters.length > 0 || sorts.length > 0 || groupBy || hiddenColumns.size > 0;

  const canBulkDeleteFiltered =
    !isPaginatedEmbedded &&
    filters.length > 0 &&
    processedRows.length > 0 &&
    processedRows.length <= MAX_VIRTUAL_TABLE_BULK_DELETE_ROWS;

  const bulkDeleteOverLimit =
    !isPaginatedEmbedded &&
    filters.length > 0 &&
    processedRows.length > MAX_VIRTUAL_TABLE_BULK_DELETE_ROWS;

  const bulkDeleteFiltered = useCallback(() => {
    setShowBulkDeleteConfirm(false);
    const ids = processedRows.map((r) => r.id);
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("row_ids", JSON.stringify(ids));
    startTransition(async () => {
      const r = await deleteVirtualRowsBulkAction(fd);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.deleted} baris dihapus.`);
      bumpActivity();
      await loadRows();
    });
  }, [processedRows, table.id, loadRows, bumpActivity]);

  // --- Geometry editor ---
  const [geometryEditor, setGeometryEditor] = useState<{
    rowId: string;
    colSlug: string;
    currentGeoJSON: string;
  } | null>(null);
  const [geoEditorText, setGeoEditorText] = useState("");
  const [geoEditorError, setGeoEditorError] = useState<string | null>(null);

  useEffect(() => {
    if (geometryEditor) {
      setGeoEditorText(geometryEditor.currentGeoJSON);
      setGeoEditorError(null);
    }
  }, [geometryEditor]);

  const saveGeometry = useCallback(() => {
    if (!geometryEditor) return;
    setGeoEditorError(null);

    if (!geoEditorText.trim()) {
      saveCell(geometryEditor.rowId, geometryEditor.colSlug, "");
      setGeometryEditor(null);
      return;
    }

    try {
      const parsed = JSON.parse(geoEditorText);
      if (!parsed || typeof parsed !== "object") throw new Error("Bukan objek JSON");
      const geoType = String(parsed.type ?? "");
      const validTypes = ["Feature", "FeatureCollection", "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"];
      if (!validTypes.includes(geoType)) {
        setGeoEditorError(`Tipe GeoJSON "${geoType}" tidak valid. Gunakan Feature, Polygon, dll.`);
        return;
      }
      const fd = new FormData();
      fd.set("row_id", geometryEditor.rowId);
      fd.set("column_slug", geometryEditor.colSlug);
      fd.set("value", JSON.stringify(parsed));
      startTransition(async () => {
        const r = await updateVirtualRowCellAction(fd);
        if (r.error) {
          toast.error(r.error);
        } else {
          setGeometryEditor(null);
          bumpActivity();
        }
        await loadRows();
      });
    } catch (e) {
      setGeoEditorError(e instanceof Error ? e.message : "JSON tidak valid");
    }
  }, [geometryEditor, geoEditorText, loadRows, saveCell, bumpActivity]);

  const tableChatMentionOptions = useMemo((): ChatMentionOption[] => {
    const opts: ChatMentionOption[] = [];
    for (const [uid, name] of memberNameByUserId) {
      opts.push({
        id: uid,
        label: name,
        kind: "user",
        searchText: name.toLowerCase(),
      });
    }
    for (const p of projectsForMention) {
      opts.push({
        id: p.id,
        label: p.name,
        kind: "project",
        searchText: `${p.name} ${p.key ?? ""}`.toLowerCase(),
      });
    }
    opts.push({
      id: table.id,
      label: table.display_name,
      kind: "table",
      searchText: table.display_name.toLowerCase(),
    });
    for (const row of rows.slice(0, 200)) {
      const label = pickMapRowTitle(
        row.payload ?? {},
        columns.map((c) => ({
          slug: c.slug,
          display_name: c.display_name,
          data_type: c.data_type,
          position: c.position,
        })),
        relationLabels,
        row.id
      );
      opts.push({ id: row.id, label, kind: "row" });
    }
    return opts;
  }, [
    memberNameByUserId,
    projectsForMention,
    table.id,
    table.display_name,
    rows,
    columns,
    relationLabels,
  ]);

  // --- Render ---
  return (
    <div
      ref={rootRef}
      className={cn(
        shouldFillHeight
          ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3"
          : "space-y-3",
        isOverlayLayout && "px-4 pb-4 pt-3"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-between gap-2",
          paneHeader && "min-h-[3.75rem] items-center",
          overlayTouchToolbar && "flex-col items-stretch gap-3"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {headerLeading}
          {table.icon && <span className="text-lg">{table.icon}</span>}
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {table.display_name}
            </h2>
            {table.description ? (
              <p
                className={cn(
                  "text-sm text-muted-foreground",
                  overlayTouchToolbar ? "line-clamp-2" : ""
                )}
              >
                {overlayTouchToolbar ? table.description : `— ${table.description}`}
              </p>
            ) : null}
          </div>
          {!overlayTouchToolbar ? (
            <Badge
              variant="secondary"
              className="shrink-0 font-normal text-muted-foreground"
              title="Jumlah baris dan kolom"
            >
              {(totalRowCount || rows.length).toLocaleString("id-ID")} baris
              {" · "}
              {visibleColumns.length}
              {hiddenColumns.size > 0 ? `/${sortedColumns.length}` : ""} kolom
            </Badge>
          ) : null}
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            overlayTouchToolbar && "[&_button]:min-h-11 [&_button]:touch-manipulation"
          )}
        >
          {pending && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner className="size-3" /> Menyimpan…
            </div>
          )}
          <TableViewSwitcher
            tableId={table.id}
            columns={columns}
            layout={layoutType}
            layoutOptions={layoutOptions}
            onLayoutChange={handleLayoutChange}
            onAddColumn={embeddedInRightPanel ? undefined : openAddColumnForLayout}
            className={overlayTouchToolbar ? "min-h-11 touch-manipulation" : undefined}
          />
          {layoutType !== "grid" && layoutType !== "form" ? (
            <TableLayoutOptionsToolbar
              layout={layoutType}
              columns={columns}
              layoutOptions={layoutOptions}
              onLayoutOptionsChange={handleLayoutOptionsChange}
              touchFriendly={overlayTouchToolbar}
            />
          ) : null}
          {resolvedOrganizationId && userId && !embeddedInRightPanel ? (
            <Button
              type="button"
              variant={isTableChatOpen(table.id) ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => {
                if (isTableChatOpen(table.id)) {
                  closePanel();
                } else {
                  openTableChat({
                    tableId: table.id,
                    mentionOptions: tableChatMentionOptions,
                  });
                }
              }}
              title="Chat diskusi tingkat tabel"
            >
              <MessageSquare className="size-3.5 shrink-0" />
              Chat tabel
              <VirtualTableRoomChatUnreadBadge
                tableId={table.id}
                className="!ml-0"
              />
            </Button>
          ) : null}
          {canOpenInSpatial && !embeddedInRightPanel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleOpenInSpatialTab}
              title={
                hasGeometryColumn
                  ? "Buka lapisan tabel ini di tab Spasial"
                  : `Ikuti relasi «${findOnMapRelationPath?.relationColumnLabel ?? "gambar"}» ke poligon di tab Spasial`
              }
            >
              <MapIcon className="size-3.5 shrink-0" />
              {openInSpatialLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={showViewToolbar ? "default" : "outline"}
            size="sm"
            data-testid="table-view-toolbar-toggle"
            onClick={() => setShowViewToolbar((v) => !v)}
          >
            {hasActiveFilters ? "Filter ●" : "Filter"}
          </Button>
          {canBulkDeleteFiltered ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              Hapus {processedRows.length} baris (filter)
            </Button>
          ) : bulkDeleteOverLimit ? (
            <span
              className="text-xs text-muted-foreground"
              title={`Persempit filter (maks. ${MAX_VIRTUAL_TABLE_BULK_DELETE_ROWS} baris per penghapusan)`}
            >
              Terlalu banyak untuk hapus massal
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={pending}>
            + Baris
          </Button>
          <Popover open={showMoreMenu} onOpenChange={setShowMoreMenu}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  title="Aksi lainnya"
                  aria-label="Aksi lainnya"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-56 gap-0.5 p-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowAddColumn(true);
                }}
                disabled={pending}
              >
                + Kolom
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowCsvImport(true);
                }}
                disabled={pending || initialLoading}
              >
                <Upload className="size-3.5" />
                Impor CSV
              </Button>
              {projectId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowLayerUpload(true);
                  }}
                  disabled={pending || initialLoading}
                >
                  <Upload className="size-3.5" />
                  Layer baru dari file
                </Button>
              ) : null}
              {geometryColumns.length > 0 ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowGeoJsonImport(true);
                    }}
                    disabled={pending || initialLoading}
                  >
                    <MapPin className="size-3.5" />
                    Impor GeoJSON
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowDxfImport(true);
                    }}
                    disabled={pending || initialLoading}
                  >
                    <Upload className="size-3.5" />
                    Impor DXF
                  </Button>
                </>
              ) : null}
              <div className="my-1 h-px bg-border" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setShowMoreMenu(false);
                  setEditTableName(table.display_name);
                  setEditTableDesc(table.description ?? "");
                  setShowTableSettings(true);
                }}
              >
                Pengaturan
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* View Toolbar */}
      {showViewToolbar && (
        <VirtualTableViewToolbar
          sortedColumns={sortedColumns}
          filters={filters}
          setFilters={setFilters}
          sorts={sorts}
          setSorts={setSorts}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          hiddenColumns={hiddenColumns}
          setHiddenColumns={setHiddenColumns}
          savedViews={savedViews}
          activeViewId={activeViewId}
          onSelectDefaultView={() => {
            setActiveViewId(null);
            applyViewConfig(emptyVirtualViewConfig());
            clearViewSession(table.id);
          }}
          onSelectSavedView={(v) => {
            setActiveViewId(v.id);
            applyViewConfig(v.config);
            saveViewSession(table.id, {
              activeViewId: v.id,
              config: normalizeVirtualViewConfig(v.config),
            });
          }}
          onSaveViewClick={() => setShowSaveViewDialog(true)}
          onUpdateActiveView={updateActiveView}
          onDuplicateView={duplicateView}
          onSetDefaultView={setDefaultView}
          onDeleteView={deleteView}
        />
      )}

      {layoutSchemaMismatch ? (
        <TableLayoutSchemaPrompt
          layout={layoutType}
          columns={columns}
          onAddColumn={openAddColumnForLayout}
          className="mb-3 px-1"
        />
      ) : null}

      {/* Table / alternate layout viewport */}
      {effectiveLayout === "kanban" && layoutOptions.statusColumn ? (
        <div className={altLayoutShellClass}>
          <VirtualTableKanbanView
            rows={processedRows}
            columns={columns}
            statusColumnSlug={layoutOptions.statusColumn}
            statusOptions={
              selectOptionsBySlug.get(layoutOptions.statusColumn) ?? []
            }
            onOpenRow={openRowDetail}
            onStatusChange={
              embeddedInRightPanel ? undefined : handleKanbanStatusChange
            }
            className="min-h-[min(70vh,calc(100dvh-14rem))] flex-1 px-2 pt-2"
          />
          {loadMoreFooter}
        </div>
      ) : effectiveLayout === "calendar" && layoutOptions.dateColumn ? (
        <ScrollArea
          orientation="vertical"
          type="scroll"
          className={cn(
            "min-h-0 min-w-0 bg-card",
            shouldFillHeight
              ? "flex-1"
              : "rounded-xl border border-border shadow-sm"
          )}
          viewportClassName={cn(
            !shouldFillHeight && "max-h-[min(70vh,calc(100dvh-14rem))]"
          )}
        >
          <VirtualTableCalendarView
            rows={processedRows}
            columns={columns}
            dateColumnSlug={layoutOptions.dateColumn}
            onOpenRow={openRowDetail}
            className="p-3"
          />
          {loadMoreFooter}
        </ScrollArea>
      ) : effectiveLayout === "timeline" && layoutOptions.dateColumn ? (
        <div className={altLayoutShellClass}>
          <VirtualTableTimelineView
            rows={processedRows}
            columns={columns}
            startDateColumnSlug={layoutOptions.dateColumn}
            endDateColumnSlug={
              layoutOptions.endDateColumn ?? layoutOptions.dateColumn
            }
            onOpenRow={openRowDetail}
            className="min-h-[min(70vh,calc(100dvh-14rem))] flex-1 px-2 pt-2"
          />
          {loadMoreFooter}
        </div>
      ) : effectiveLayout === "gallery" ? (
        <ScrollArea
          orientation="vertical"
          type="scroll"
          className={cn(
            "min-h-0 min-w-0 bg-card",
            shouldFillHeight
              ? "flex-1"
              : "rounded-xl border border-border shadow-sm"
          )}
          viewportClassName={cn(
            !shouldFillHeight && "max-h-[min(70vh,calc(100dvh-14rem))]"
          )}
        >
          <VirtualTableGalleryView
            rows={processedRows}
            columns={columns}
            coverColumnSlug={layoutOptions.coverColumn}
            onOpenRow={openRowDetail}
          />
          {loadMoreFooter}
        </ScrollArea>
      ) : effectiveLayout === "form" ? (
        <div className={altLayoutShellClass}>
          <VirtualTableFormView
            rows={processedRows}
            columns={columns}
            visibleColumnSlugs={visibleColumns.map((c) => c.slug)}
            selectOptionsBySlug={selectOptionsBySlug}
            relationLabels={relationLabels}
            memberNameByUserId={memberNameByUserId}
            onSaveCell={saveCell}
            onAddRow={addRow}
            onOpenGeometry={openGeometryForForm}
            readOnly={embeddedInRightPanel}
            className="min-h-[min(70vh,calc(100dvh-14rem))] flex-1"
          />
          {loadMoreFooter}
        </div>
      ) : effectiveLayout === "map" && layoutOptions.geometryColumn ? (
        <div className={altLayoutShellClass}>
          <VirtualTableMapView
            table={table}
            columns={columns}
            rows={processedRows}
            geometryColumnSlug={layoutOptions.geometryColumn}
            relationLabels={relationLabels}
            memberNameByUserId={memberNameByUserId}
            projectName={
              table.project_id
                ? (projectsForMention.find((p) => p.id === table.project_id)
                    ?.name ?? null)
                : null
            }
            onVirtualRowSelect={handleMapVirtualRowSelect}
            highlightVirtualRowId={highlightVirtualRowId}
            highlightVirtualRowIds={highlightVirtualRowIds}
            onMapBackgroundClick={handleMapBackgroundClick}
            className="min-h-[min(70vh,calc(100dvh-14rem))] flex-1"
          />
          {loadMoreFooter}
        </div>
      ) : effectiveLayout === "chart" ? (
        <ScrollArea
          orientation="vertical"
          type="scroll"
          className={cn(
            "min-h-0 min-w-0 bg-card",
            shouldFillHeight
              ? "flex-1"
              : "rounded-xl border border-border shadow-sm"
          )}
          viewportClassName={cn(
            !shouldFillHeight && "max-h-[min(70vh,calc(100dvh-14rem))]"
          )}
        >
          <VirtualTableChartView
            rows={processedRows}
            columns={columns}
            chartColumnSlug={layoutOptions.chartColumn}
            chartMode={layoutOptions.chartMode ?? "bar"}
            className="pb-2"
          />
          {loadMoreFooter}
        </ScrollArea>
      ) : (
      <ScrollArea
        viewportRef={tableScrollRef}
        orientation="both"
        type="scroll"
        className={cn(
          "min-h-0 min-w-0 bg-card",
          shouldFillHeight
            ? "flex-1"
            : "rounded-xl border border-border shadow-sm"
        )}
        viewportClassName={cn(
          !shouldFillHeight && "max-h-[min(70vh,calc(100dvh-14rem))]"
        )}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-30 bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr className="border-b border-border bg-muted">
              {showSpatialSelection ? (
                <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                  ◉
                </th>
              ) : null}
              <th
                className={headStickyClass(
                  "rowNum",
                  "px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                )}
              >
                #
              </th>
              {visibleColumns.map((col, colIndex) => {
                const sortEntry = sorts.find((s) => s.column === col.slug);
                const isDragging = dragColId === col.id;
                const isDropTarget = dropTargetColId === col.id && dragColId !== col.id;
                return (
                <th
                  key={col.id}
                  draggable
                  onDragStart={(e) => handleColDragStart(e, col.id)}
                  onDragOver={(e) => handleColDragOver(e, col.id)}
                  onDrop={(e) => handleColDrop(e, col.id)}
                  onDragEnd={handleColDragEnd}
                  className={cn(
                    headStickyClass(colIndex === 0 ? "first" : "scroll"),
                    "px-3 py-2 text-left text-xs font-medium text-muted-foreground",
                    isDropTarget && "border-l-2 border-l-primary",
                    colIndex !== 0 && "min-w-[120px]"
                  )}
                >
                  <div
                    className={cn(
                      "group/col flex items-center gap-1",
                      isDragging && "opacity-40"
                    )}
                  >
                    <GripVertical
                      className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground/30 opacity-0 transition-opacity hover:text-muted-foreground active:cursor-grabbing col-reveal:opacity-100"
                    />
                    {renamingCol?.id === col.id ? (
                      <input
                        ref={renameColInputRef}
                        className="w-24 rounded border border-border bg-background px-1 py-0 text-xs font-medium"
                        value={renamingCol.name}
                        onChange={(e) => setRenamingCol({ ...renamingCol, name: e.target.value })}
                        onBlur={saveColRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveColRename();
                          if (e.key === "Escape") setRenamingCol(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => toggleSort(col.slug)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenamingCol({ id: col.id, name: col.display_name });
                        }}
                        title="Klik: sort · Double-klik: rename (slug ikut nama kolom)"
                      >
                        <span>{col.display_name}</span>
                        {sortEntry && (
                          <span className="text-primary text-[10px]">
                            {sortEntry.direction === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </button>
                    )}
                    {(() => {
                      const Icon = DATA_TYPE_ICON[col.data_type];
                      return Icon ? (
                        <span title={col.data_type} className="inline-flex shrink-0">
                          <Icon className="h-3 w-3 text-muted-foreground/50" />
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50" title={col.data_type}>?</span>
                      );
                    })()}
                    {col.is_required && (
                      <span className="text-red-500" title="Wajib">*</span>
                    )}
                    {col.data_type === "select" && (
                      <button
                        type="button"
                        className="ml-1 text-[10px] text-muted-foreground underline opacity-0 transition-opacity pointer-events-none hover:text-foreground col-reveal:pointer-events-auto col-reveal:opacity-100"
                        onClick={() =>
                          setEditingColOptions({
                            columnId: col.id,
                            options: (col.config?.options as string[]) ?? [],
                          })
                        }
                        title="Edit opsi"
                      >
                        opsi
                      </button>
                    )}
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground opacity-0 transition-opacity pointer-events-none hover:text-foreground col-reveal:pointer-events-auto col-reveal:opacity-100"
                      onClick={() => duplicateColumn(col)}
                      title={`Duplikat kolom ${col.display_name}`}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground opacity-0 transition-opacity pointer-events-none hover:text-destructive col-reveal:pointer-events-auto col-reveal:opacity-100"
                      onClick={() => removeColumn(col.id)}
                      title={`Hapus kolom ${col.display_name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </th>
                );
              })}
              <th className={headStickyClass("actions", "w-10 px-2 py-2")} />
            </tr>
          </thead>
          <tbody className="relative z-0 bg-card">
            {initialLoading ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 2}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  <div className="inline-flex items-center gap-2">
                    <Spinner className="size-4" /> Memuat data…
                  </div>
                </td>
              </tr>
            ) : processedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 2}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {rows.length > 0 && filters.length > 0
                    ? "Tidak ada data yang cocok dengan filter."
                    : (
                      <>
                        Belum ada data.{" "}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={addRow}
                        >
                          Tambah baris pertama
                        </button>
                      </>
                    )}
                </td>
              </tr>
            ) : groupedRows ? (
              [...groupedRows.entries()].map(([groupKey, groupRows]) => (
                <React.Fragment key={groupKey}>
                  <tr className="bg-muted">
                    <td
                      className={groupRowStickyClass(
                        "rowNum",
                        "border-y border-border border-l-2 border-l-primary/40"
                      )}
                    />
                    {visibleColumns.length === 0 ? (
                      <td
                        className={groupRowStickyClass(
                          "first",
                          "border-y border-border px-3 py-2 whitespace-nowrap"
                        )}
                      >
                        <GroupRowLabel
                          label={
                            sortedColumns.find((c) => c.slug === groupBy)
                              ?.display_name
                          }
                          value={groupKey}
                          count={groupRows.length}
                        />
                      </td>
                    ) : (
                      visibleColumns.map((col, colIndex) =>
                        colIndex === 0 ? (
                          <td
                            key={col.id}
                            className={groupRowStickyClass(
                              "first",
                              "border-y border-border px-3 py-2 whitespace-nowrap"
                            )}
                          >
                            <GroupRowLabel
                              label={
                                sortedColumns.find((c) => c.slug === groupBy)
                                  ?.display_name
                              }
                              value={groupKey}
                              count={groupRows.length}
                            />
                          </td>
                        ) : (
                          <td
                            key={col.id}
                            className="border-y border-border bg-muted p-0"
                            aria-hidden="true"
                          />
                        )
                      )
                    )}
                    <td
                      className="w-10 border-y border-border bg-muted p-0"
                      aria-hidden="true"
                    />
                  </tr>
                  {groupRows.map((row, idx) => (
                    <DataRow
                      key={row.id}
                      row={row}
                      idx={idx}
                      visibleColumns={visibleColumns}
                      editingCell={editingCell}
                      editInputRef={editInputRef}
                      selectOptionsBySlug={selectOptionsBySlug}
                      relationLabels={relationLabels}
                      memberNameByUserId={memberNameByUserId}
                      saveCell={saveCell}
                      toggleCheckbox={toggleCheckbox}
                      setEditingCell={setEditingCell}
                      setDeleteRowConfirm={setDeleteRowConfirm}
                      setRelationPicker={setRelationPicker}
                      setGeometryEditor={setGeometryEditor}
                      setUserPicker={setUserPicker}
                      onOpenRowChat={openRowChat}
                      onOpenRowDetail={
                        embeddedInRightPanel ? undefined : openRowDetail
                      }
                      onShowRowOnMap={
                        canOpenInSpatial && !embeddedInRightPanel
                          ? handleShowRowOnMap
                          : undefined
                      }
                      showRowMapAction={
                        canOpenInSpatial && !embeddedInRightPanel
                      }
                      isRowChatOpen={isRowPanelOpen(row.id)}
                      isRowDetailOpen={isRowDetailVisible(row.id)}
                      hasUnreadChat={unreadChatRowIds.has(row.id)}
                      hideRowChat={embeddedInRightPanel}
                      showSpatialSelection={showSpatialSelection}
                      isSpatialRowSelected={spatialSync.isRowSelected(
                        table.id,
                        row.id
                      )}
                      onToggleSpatialSelection={() =>
                        spatialSync.toggleRowSelection(table.id, row.id)
                      }
                    />
                  ))}
                </React.Fragment>
              ))
            ) : (
              processedRows.map((row, idx) => (
                <DataRow
                  key={row.id}
                  row={row}
                  idx={idx}
                  visibleColumns={visibleColumns}
                  editingCell={editingCell}
                  editInputRef={editInputRef}
                  selectOptionsBySlug={selectOptionsBySlug}
                  relationLabels={relationLabels}
                  memberNameByUserId={memberNameByUserId}
                  saveCell={saveCell}
                  toggleCheckbox={toggleCheckbox}
                  setEditingCell={setEditingCell}
                  setDeleteRowConfirm={setDeleteRowConfirm}
                  setRelationPicker={setRelationPicker}
                  setGeometryEditor={setGeometryEditor}
                  setUserPicker={setUserPicker}
                  onOpenRowChat={openRowChat}
                  onOpenRowDetail={
                    embeddedInRightPanel ? undefined : openRowDetail
                  }
                  onShowRowOnMap={
                    canOpenInSpatial && !embeddedInRightPanel
                      ? handleShowRowOnMap
                      : undefined
                  }
                  showRowMapAction={canOpenInSpatial && !embeddedInRightPanel}
                  isRowChatOpen={isRowPanelOpen(row.id)}
                  isRowDetailOpen={isRowDetailVisible(row.id)}
                  hasUnreadChat={unreadChatRowIds.has(row.id)}
                  hideRowChat={embeddedInRightPanel}
                  showSpatialSelection={showSpatialSelection}
                  isSpatialRowSelected={spatialSync.isRowSelected(
                    table.id,
                    row.id
                  )}
                  onToggleSpatialSelection={() =>
                    spatialSync.toggleRowSelection(table.id, row.id)
                  }
                />
              ))
            )}
          </tbody>
        </table>
        {hasMoreRows ? (
          <div className="sticky left-0 flex w-full justify-center border-t border-border/60 bg-card px-3 py-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loadingMore || initialLoading}
              onClick={() => void loadMoreRows()}
            >
              {loadingMore ? (
                <>
                  <Spinner className="size-4" /> Memuat…
                </>
              ) : (
                `Muat ${Math.min(
                  VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
                  remainingRowCount
                )} baris lagi · sisa ${remainingRowCount}`
              )}
            </Button>
          </div>
        ) : null}
      </ScrollArea>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {isPaginatedEmbedded && totalRowCount > 0 ? (
            <>
              Menampilkan {loadedRowCount} dari {totalRowCount} baris
              {filters.length > 0
                ? ` · ${processedRows.length} setelah filter (yang dimuat)`
                : null}
            </>
          ) : (
            <>
              {processedRows.length}
              {filters.length > 0 ? ` / ${rows.length}` : ""} baris
            </>
          )}
          {" · "}
          {visibleColumns.length}
          {hiddenColumns.size > 0 ? ` / ${sortedColumns.length}` : ""} kolom
        </span>
      </div>

      {/* Dialog: Add Column */}
      <Dialog open={showAddColumn} onOpenChange={setShowAddColumn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah kolom</DialogTitle>
            <DialogDescription>
              Tambahkan kolom baru ke tabel &quot;{table.display_name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-col-name">Nama kolom</Label>
              <Input
                id="new-col-name"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Contoh: Status, Tanggal, Harga"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="new-col-type">Tipe data</Label>
              <select
                id="new-col-type"
                value={newColType}
                onChange={(e) =>
                  setNewColType(e.target.value as VirtualColumnDataType)
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {VIRTUAL_COLUMN_DATA_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>
                    {dt.label} ({dt.value})
                  </option>
                ))}
              </select>
            </div>
            {newColType === "relation" && (
              <div>
                <Label htmlFor="new-col-target">Tabel target</Label>
                <select
                  id="new-col-target"
                  value={newColTargetTable}
                  onChange={(e) => {
                    setNewColTargetTable(e.target.value);
                    setNewColLookupSlug("");
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Pilih tabel —</option>
                  {allVirtualTables
                    .filter((vt) => vt.id !== table.id)
                    .map((vt) => (
                      <option key={vt.id} value={vt.id}>
                        {vt.display_name}{vt.organization_id ? " (Org)" : ""}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {newColType === "relation" && newColTargetTable ? (
              <div>
                <Label htmlFor="new-col-lookup-slug">Kolom lookup (impor CSV)</Label>
                <select
                  id="new-col-lookup-slug"
                  value={newColLookupSlug}
                  onChange={(e) => setNewColLookupSlug(e.target.value)}
                  disabled={lookupColumnsLoading || lookupColumnOptions.length === 0}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  {lookupColumnsLoading ? (
                    <option value="">Memuat kolom…</option>
                  ) : lookupColumnOptions.length === 0 ? (
                    <option value="">Tidak ada kolom teks/angka di tabel target</option>
                  ) : (
                    lookupColumnOptions.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.display_name} ({c.slug})
                      </option>
                    ))
                  )}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nilai di CSV (kolom relasi ini) dicocokkan ke kolom yang dipilih di
                  tabel target. Pilih kolom yang unik per baris (mis. kode atau nama
                  desa).
                </p>
              </div>
            ) : null}
            {(newColType === "relation" || newColType === "select") && (
              <div className="flex items-center gap-2">
                <input
                  id="new-col-multi"
                  type="checkbox"
                  checked={newColIsMulti}
                  onChange={(e) => setNewColIsMulti(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="new-col-multi" className="text-sm font-normal">
                  {newColType === "relation"
                    ? "Multi-relasi (bisa pilih lebih dari satu; belum didukung di impor CSV)"
                    : "Multi-pilihan (bisa pilih lebih dari satu)"}
                </Label>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAddColumn(false)}
              >
                Batal
              </Button>
              <Button onClick={addColumn} disabled={pending || !newColName.trim()}>
                Tambah
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Row Confirm */}
      <Dialog
        open={Boolean(deleteRowConfirm)}
        onOpenChange={(open) => {
          if (!open) setDeleteRowConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus baris?</DialogTitle>
            <DialogDescription>
              Baris ini akan dihapus (soft delete). Tindakan ini bisa
              dipulihkan dari database.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteRowConfirm(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (deleteRowConfirm) deleteRow(deleteRowConfirm);
              }}
            >
              Ya, hapus
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Bulk delete rows matching active filters */}
      <Dialog
        open={showBulkDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) setShowBulkDeleteConfirm(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Hapus {processedRows.length} baris sesuai filter?
            </DialogTitle>
            <DialogDescription>
              Semua baris yang cocok dengan filter aktif akan dihapus (soft
              delete). Baris di luar filter tidak terpengaruh.
              {rows.length > processedRows.length
                ? ` (${processedRows.length} dari ${rows.length} baris di tabel)`
                : null}
            </DialogDescription>
            <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
              {filters.map((f, i) => {
                const col = columns.find((c) => c.slug === f.column);
                const op =
                  VIEW_FILTER_OPERATORS.find((o) => o.value === f.operator)
                    ?.label ?? f.operator;
                const needsValue =
                  f.operator !== "is_empty" && f.operator !== "is_not_empty";
                return (
                  <li key={`${f.column}-${i}`}>
                    <span className="font-medium text-foreground">
                      {col?.display_name ?? f.column}
                    </span>{" "}
                    {op}
                    {needsValue ? ` "${f.value}"` : ""}
                  </li>
                );
              })}
            </ul>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteConfirm(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={bulkDeleteFiltered}
            >
              Ya, hapus {processedRows.length} baris
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Table Settings */}
      <Dialog open={showTableSettings} onOpenChange={setShowTableSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pengaturan tabel</DialogTitle>
            <DialogDescription>
              Ubah nama, deskripsi, atau hapus tabel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-table-name">Nama tabel</Label>
              <Input
                id="edit-table-name"
                value={editTableName}
                onChange={(e) => setEditTableName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-table-desc">Deskripsi</Label>
              <Input
                id="edit-table-desc"
                value={editTableDesc}
                onChange={(e) => setEditTableDesc(e.target.value)}
                placeholder="Opsional"
              />
            </div>
            <div className="flex items-center justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setShowTableSettings(false);
                  setShowDeleteTable(true);
                }}
              >
                Hapus tabel
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTableSettings(false)}
                >
                  Batal
                </Button>
                <Button onClick={saveTableSettings} disabled={pending}>
                  Simpan
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Table Confirm */}
      <Dialog open={showDeleteTable} onOpenChange={setShowDeleteTable}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus tabel &quot;{table.display_name}&quot;?</DialogTitle>
            <DialogDescription>
              Semua baris dan data di tabel ini akan dihapus (soft delete).
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDeleteTable(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={deleteTable}
            >
              Ya, hapus tabel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit select options for a column */}
      <Dialog
        open={Boolean(editingColOptions)}
        onOpenChange={(open) => {
          if (!open) setEditingColOptions(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit opsi pilihan</DialogTitle>
            <DialogDescription>
              Tambah atau hapus opsi untuk kolom bertipe &quot;Pilihan&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {editingColOptions?.options.map((opt, i) => (
                <Badge
                  key={`${opt}-${i}`}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  {opt}
                  <button
                    type="button"
                    className="ml-0.5 text-muted-foreground hover:text-red-500"
                    onClick={() =>
                      setEditingColOptions((prev) =>
                        prev
                          ? {
                              ...prev,
                              options: prev.options.filter(
                                (_, idx) => idx !== i
                              ),
                            }
                          : null
                      )
                    }
                  >
                    ×
                  </button>
                </Badge>
              ))}
              {(!editingColOptions?.options ||
                editingColOptions.options.length === 0) && (
                <span className="text-xs text-muted-foreground italic">
                  Belum ada opsi
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Ketik opsi baru"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newOption.trim()) {
                    setEditingColOptions((prev) =>
                      prev
                        ? {
                            ...prev,
                            options: [...prev.options, newOption.trim()],
                          }
                        : null
                    );
                    setNewOption("");
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!newOption.trim()}
                onClick={() => {
                  if (newOption.trim()) {
                    setEditingColOptions((prev) =>
                      prev
                        ? {
                            ...prev,
                            options: [...prev.options, newOption.trim()],
                          }
                        : null
                    );
                    setNewOption("");
                  }
                }}
              >
                Tambah
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setEditingColOptions(null)}
              >
                Batal
              </Button>
              <Button onClick={saveColOptions} disabled={pending}>
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Relation Picker */}
      <Dialog
        open={Boolean(relationPicker)}
        onOpenChange={(open) => {
          if (!open) setRelationPicker(null);
        }}
      >
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pilih relasi</DialogTitle>
            <DialogDescription>
              {relationPicker?.isMulti
                ? "Pilih satu atau lebih baris dari tabel target."
                : "Pilih satu baris dari tabel target."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={relationPickerSearch}
              onChange={(e) => setRelationPickerSearch(e.target.value)}
              placeholder="Cari..."
              autoFocus
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto border rounded-md">
            {relationPickerLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Memuat…
              </div>
            ) : filteredRelationPickerRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground space-y-3">
                <p>{relationPickerSearch ? "Tidak ditemukan." : "Tabel target kosong."}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!relationPicker) return;
                    const title = relationPickerSearch.trim() || "Baris baru";
                    const fd = new FormData();
                    fd.set("table_id", relationPicker.targetTableId);
                    fd.set("payload", JSON.stringify({ title }));
                    const r = await createVirtualRowAction(fd);
                    if (r.error) { toast.error(r.error); return; }
                    if (r.rowId) {
                      const newRow = { id: r.rowId, label: title };
                      setRelationPickerRows((prev) => [...prev, newRow]);
                      if (relationPicker.isMulti) {
                        const current = Array.isArray(relationPicker.currentValue)
                          ? (relationPicker.currentValue as string[])
                          : [];
                        setRelationPicker({ ...relationPicker, currentValue: [...current, r.rowId] });
                      } else {
                        saveRelation(relationPicker.rowId, relationPicker.colSlug, r.rowId);
                      }
                    }
                    setRelationPickerSearch("");
                  }}
                >
                  + Buat &quot;{relationPickerSearch.trim() || "Baris baru"}&quot;
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredRelationPickerRows.map((targetRow) => {
                  const isSelected = relationPicker?.isMulti
                    ? Array.isArray(relationPicker.currentValue) &&
                      (relationPicker.currentValue as string[]).includes(targetRow.id)
                    : relationPicker?.currentValue === targetRow.id;

                  return (
                    <li key={targetRow.id}>
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                          isSelected ? "bg-primary/10 font-medium text-primary" : "text-foreground"
                        }`}
                        onClick={() => {
                          if (!relationPicker) return;
                          if (relationPicker.isMulti) {
                            const current = Array.isArray(relationPicker.currentValue)
                              ? (relationPicker.currentValue as string[])
                              : [];
                            const next = current.includes(targetRow.id)
                              ? current.filter((id) => id !== targetRow.id)
                              : [...current, targetRow.id];
                            setRelationPicker({ ...relationPicker, currentValue: next });
                          } else {
                            saveRelation(relationPicker.rowId, relationPicker.colSlug, targetRow.id);
                          }
                        }}
                      >
                        {relationPicker?.isMulti && (
                          <input
                            type="checkbox"
                            checked={!!isSelected}
                            readOnly
                            className="mr-2 h-3.5 w-3.5 rounded border-border"
                          />
                        )}
                        {targetRow.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between pt-2">
            {relationPicker?.isMulti && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!relationPicker) return;
                  saveRelation(relationPicker.rowId, relationPicker.colSlug, "");
                }}
              >
                Hapus semua
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {!relationPicker?.isMulti && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!relationPicker) return;
                    saveRelation(relationPicker.rowId, relationPicker.colSlug, "");
                  }}
                >
                  Kosongkan
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRelationPicker(null)}
              >
                {relationPicker?.isMulti ? "Batal" : "Tutup"}
              </Button>
              {relationPicker?.isMulti && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (!relationPicker) return;
                    const val = Array.isArray(relationPicker.currentValue)
                      ? relationPicker.currentValue
                      : [];
                    saveRelation(relationPicker.rowId, relationPicker.colSlug, val);
                  }}
                >
                  Simpan
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: User Picker */}
      <Dialog
        open={Boolean(userPicker)}
        onOpenChange={(open) => {
          if (!open) setUserPicker(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pilih pengguna</DialogTitle>
            <DialogDescription>
              Pilih pengguna yang terhubung dengan cell ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Cari nama..."
              value={userPickerSearch}
              onChange={(e) => setUserPickerSearch(e.target.value)}
              autoFocus
            />
            {userPickerLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
                <Spinner className="size-4" /> Memuat pengguna…
              </div>
            ) : filteredUserPickerMembers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {userPickerSearch ? "Tidak ditemukan" : "Belum ada anggota"}
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {filteredUserPickerMembers.map((member) => {
                  const isSelected = userPicker?.currentUserId === member.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted text-foreground"
                      }`}
                      onClick={() => {
                        if (userPicker) saveUser(userPicker.rowId, userPicker.colSlug, member.id);
                      }}
                    >
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-400 mr-2" />
                      {member.label}
                      {isSelected && <span className="ml-2 text-xs text-muted-foreground">● terpilih</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between">
              {userPicker?.currentUserId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => {
                    if (userPicker) clearUser(userPicker.rowId, userPicker.colSlug);
                  }}
                >
                  Hapus pilihan
                </Button>
              )}
              <div className="ml-auto">
                <Button size="sm" variant="outline" onClick={() => setUserPicker(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Geometry Editor */}
      <Dialog
        open={Boolean(geometryEditor)}
        onOpenChange={(open) => {
          if (!open) setGeometryEditor(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit geometri</DialogTitle>
            <DialogDescription>
              Paste GeoJSON (Feature, Polygon, MultiPolygon, dll). Geometri akan ditampilkan di peta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={geoEditorText}
              onChange={(e) => setGeoEditorText(e.target.value)}
              className="h-48 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder='{"type": "Polygon", "coordinates": [[[...], ...]]}'
              spellCheck={false}
            />
            {geoEditorError && (
              <p className="text-xs text-red-600" role="alert">
                {geoEditorError}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!geometryEditor) return;
                  saveCell(geometryEditor.rowId, geometryEditor.colSlug, "");
                  setGeometryEditor(null);
                }}
              >
                Hapus geometri
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setGeometryEditor(null)}>
                  Batal
                </Button>
                <Button onClick={saveGeometry} disabled={pending}>
                  Simpan
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Save View */}
      <Dialog open={showSaveViewDialog} onOpenChange={setShowSaveViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Simpan view</DialogTitle>
            <DialogDescription>
              Simpan konfigurasi filter, sort, group, kolom, dan tampilan (Grid/Kanban/Kalender) saat ini sebagai view bernama.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="save-view-name">Nama view</Label>
              <Input
                id="save-view-name"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="Contoh: Tugas Aktif, Per Status"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCurrentView();
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              <p>
                {filters.length} filter, {sorts.length} sort, group:{" "}
                {groupBy ?? "—"}, {visibleColumns.length} kolom terlihat ·{" "}
                tampilan: {layoutMetaFor(effectiveLayout).label}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSaveViewDialog(false)}>
                Batal
              </Button>
              <Button
                data-testid="table-save-view-submit"
                onClick={saveCurrentView}
                disabled={pending || !saveViewName.trim()}
              >
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VirtualTableCsvImportDialog
        open={showCsvImport}
        onOpenChange={setShowCsvImport}
        table={table}
        columns={sortedColumns}
        onImported={() => {
          bumpActivity();
          void loadRows();
        }}
      />

      <VirtualTableGeoJsonImportDialog
        open={showGeoJsonImport}
        onOpenChange={setShowGeoJsonImport}
        table={table}
        columns={sortedColumns}
        allVirtualTables={allVirtualTables}
        allVirtualColumns={allVirtualColumnsForImport}
        onImported={() => {
          bumpActivity();
          void loadRows();
        }}
      />

      <VirtualTableDxfImportDialog
        open={showDxfImport}
        onOpenChange={setShowDxfImport}
        table={table}
        columns={sortedColumns}
        allVirtualTables={allVirtualTables}
        rows={rows}
        onImported={() => {
          bumpActivity();
          void loadRows();
        }}
      />

      {projectId ? (
        <VirtualTableLayerUploadDialog
          open={showLayerUpload}
          onOpenChange={setShowLayerUpload}
          projectId={projectId}
          onCreated={(result) => {
            onLayerCreated?.(result);
            bumpActivity();
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV import (existing table)
// ---------------------------------------------------------------------------

function VirtualTableCsvImportDialog({
  open,
  onOpenChange,
  table,
  columns,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: VirtualTableRow;
  columns: VirtualColumnRow[];
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importPending, startImportTransition] = useTransition();
  const [relationHints, setRelationHints] = useState<
    VirtualTableImportRelationHint[]
  >([]);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const importableColumns = useMemo(
    () => columns.filter((c) => VIRTUAL_TABLE_CSV_IMPORTABLE_TYPES.has(c.data_type)),
    [columns]
  );

  const skippedTypes = useMemo(
    () =>
      columns
        .filter((c) => !VIRTUAL_TABLE_CSV_IMPORTABLE_TYPES.has(c.data_type))
        .map((c) => c.display_name),
    [columns]
  );

  const multiRelationColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.data_type === "relation" &&
          (c.config as { is_multi?: boolean } | null)?.is_multi === true
      ),
    [columns]
  );

  const templateColumns = useMemo((): VirtualTableImportColumnHint[] => {
    return importableColumns.map((c) => {
      if (c.data_type !== "relation") {
        if (c.data_type === "checkbox") {
          return { slug: c.slug, data_type: c.data_type, example: "ya" };
        }
        if (c.data_type === "date") {
          return { slug: c.slug, data_type: c.data_type, example: "2026-01-15" };
        }
        if (c.data_type === "number") {
          return { slug: c.slug, data_type: c.data_type, example: "100" };
        }
        return { slug: c.slug, data_type: c.data_type };
      }
      const hint = relationHints.find((h) => h.column_slug === c.slug);
      const lookup =
        hint?.lookup_slug ??
        relationLookupSlugFromConfig(
          c.config as Record<string, unknown> | null | undefined
        );
      const targetName = hint?.target_table_name ?? "tabel target";
      return {
        slug: c.slug,
        data_type: c.data_type,
        example: `Nilai ${lookup}`,
        relationHint: `Cocokkan kolom ${lookup} di "${targetName}" (bukan UUID)`,
      };
    });
  }, [importableColumns, relationHints]);

  const preview = useMemo(() => {
    if (!csvText.trim()) return null;
    const rows = parseSimpleCsv(csvText);
    if (rows.length === 0) return { rowCount: 0, headers: [] as string[] };
    return { rowCount: rows.length, headers: Object.keys(rows[0]) };
  }, [csvText]);

  useEffect(() => {
    if (open) {
      setCsvText("");
      setImportMsg(null);
      setRelationHints([]);
      setContextError(null);
      setContextLoading(true);
      void fetchVirtualTableImportContextAction(table.id).then((r) => {
        setContextLoading(false);
        if (r.error) {
          setContextError(r.error);
          return;
        }
        setRelationHints(r.relation_hints);
      });
    }
  }, [open, table.id]);

  const downloadTemplate = useCallback(() => {
    const csv = virtualTableImportTemplateCsv(templateColumns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template-${table.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [templateColumns, table.slug]);

  const runImport = useCallback(() => {
    const text = csvText.trim();
    if (!text) {
      setImportMsg("Pilih atau tempel CSV terlebih dahulu.");
      return;
    }
    if (text.length > MAX_VIRTUAL_TABLE_CSV_CHARS) {
      setImportMsg(virtualTableCsvTooLargeMessage());
      return;
    }
    const parsed = parseSimpleCsv(text);
    if (parsed.length > MAX_VIRTUAL_TABLE_CSV_ROWS) {
      setImportMsg(
        `Terlalu banyak baris (${parsed.length}). Maks. ${MAX_VIRTUAL_TABLE_CSV_ROWS} baris per impor.`
      );
      return;
    }
    setImportMsg(null);
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("csv_text", text);
    startImportTransition(async () => {
      const r = await importVirtualRowsCsvAction(fd);
      if (r.error) {
        setImportMsg(r.error);
        return;
      }
      const unknown =
        r.unknownHeaders.length > 0
          ? ` Kolom CSV diabaikan: ${r.unknownHeaders.slice(0, 5).join(", ")}${r.unknownHeaders.length > 5 ? "…" : ""}.`
          : "";
      const failText =
        r.failed > 0
          ? ` Gagal ${r.failed}${r.failureSamples.length > 0 ? ` (${r.failureSamples.slice(0, 3).join("; ")})` : ""}.`
          : "";
      const skipText =
        r.skippedEmpty > 0 ? ` ${r.skippedEmpty} baris kosong dilewati.` : "";
      const dupText =
        r.skippedDuplicates > 0
          ? ` ${r.skippedDuplicates} baris duplikat dilewati (sama dengan data yang sudah ada atau baris ganda di CSV).`
          : "";
      setImportMsg(
        `Berhasil mengimpor ${r.inserted} baris.${skipText}${dupText}${failText}${unknown}`
      );
      if (r.inserted > 0) {
        onImported();
      }
    });
  }, [csvText, table.id, onImported]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Impor CSV ke {table.display_name}</DialogTitle>
          <DialogDescription>
            Baris pertama harus header (slug kolom, mis.{" "}
            <span className="font-mono">title</span>). Untuk kolom relasi,
            isi nilai lookup di tabel master (default kolom{" "}
            <span className="font-mono">title</span>, bisa diatur lewat{" "}
            <span className="font-mono">lookup_slug</span> pada kolom). Tipe:
            teks, angka, tanggal, centang, URL, pilihan, relasi tunggal. Baris yang
            persis sama dengan baris yang sudah ada (berdasarkan kolom yang diisi di
            CSV) atau baris ganda dalam satu file akan dilewati.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
              Unduh template CSV
            </Button>
          </div>

          {importableColumns.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Kolom impor:{" "}
              {importableColumns.map((c) => c.slug).join(", ")}
            </p>
          ) : (
            <p className="text-xs text-amber-700" role="alert">
              Tidak ada kolom yang bisa diimpor pada tabel ini.
            </p>
          )}

          {contextLoading ? (
            <p className="text-xs text-muted-foreground">Memuat info relasi…</p>
          ) : null}

          {contextError ? (
            <p className="text-xs text-red-600" role="alert">
              {contextError}
            </p>
          ) : null}

          {relationHints.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              {relationHints.map((h) => (
                <li key={h.column_slug}>
                  <span className="font-medium text-foreground">
                    {h.column_display_name}
                  </span>{" "}
                  → &quot;{h.target_table_name}&quot; via{" "}
                  <span className="font-mono">{h.lookup_slug}</span>
                  {h.is_multi ? (
                    <span className="text-amber-700">
                      {" "}
                      (multi-relasi: tidak didukung CSV)
                    </span>
                  ) : h.target_row_count === 0 ? (
                    <span className="text-amber-700">
                      {" "}
                      — tabel master kosong, impor master dulu
                    </span>
                  ) : (
                    <span> — {h.target_row_count} baris di master</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {multiRelationColumns.length > 0 ? (
            <p className="text-xs text-amber-700" role="status">
              Kolom multi-relasi ({multiRelationColumns.map((c) => c.display_name).join(", ")})
              tidak bisa diisi lewat CSV; gunakan UI tabel.
            </p>
          ) : null}

          {skippedTypes.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Tidak diimpor via CSV: {skippedTypes.join(", ")} (geometri, file,
              pengguna).
            </p>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="vtable-csv-file">File CSV</Label>
            <Input
              id="vtable-csv-file"
              type="file"
              accept=".csv,text/csv"
              disabled={importPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImportMsg(null);
                const reader = new FileReader();
                reader.onload = () => {
                  const raw = String(reader.result ?? "");
                  if (raw.length > MAX_VIRTUAL_TABLE_CSV_CHARS) {
                    setImportMsg(virtualTableCsvTooLargeMessage());
                    setCsvText("");
                    return;
                  }
                  setCsvText(raw);
                };
                reader.onerror = () => setImportMsg("Gagal membaca file CSV.");
                reader.readAsText(file, "UTF-8");
                e.target.value = "";
              }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="vtable-csv-paste">Atau tempel CSV</Label>
            <Textarea
              id="vtable-csv-paste"
              value={csvText}
              onChange={(e) => {
                setImportMsg(null);
                setCsvText(e.target.value);
              }}
              rows={6}
              className="font-mono text-xs"
              placeholder={"title,status\nContoh baris 1,aktif"}
              disabled={importPending}
            />
          </div>

          {preview && csvText.trim() ? (
            <p className="text-xs text-muted-foreground">
              Pratinjau: {preview.rowCount} baris data, header:{" "}
              {preview.headers.length > 0
                ? preview.headers.join(", ")
                : "—"}
            </p>
          ) : null}

          {importMsg ? (
            <p
              className={`text-xs ${importMsg.startsWith("Berhasil") ? "text-foreground" : "text-red-600"}`}
              role="status"
            >
              {importMsg}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={importPending}
            >
              Tutup
            </Button>
            <Button
              type="button"
              onClick={runImport}
              disabled={
                importPending || !csvText.trim() || importableColumns.length === 0
              }
            >
              {importPending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-4" /> Mengimpor…
                </span>
              ) : (
                "Impor"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// GeoJSON batch import (FeatureCollection → satu baris per poligon)
// ---------------------------------------------------------------------------

export { VirtualTableDxfImportDialog } from "./virtual-table-dxf-import-dialog";
export {
  VirtualTableLayerUploadDialog,
  type LayerUploadCreated,
} from "./virtual-table-layer-upload-dialog";

export function VirtualTableGeoJsonImportDialog({
  open,
  onOpenChange,
  table,
  columns,
  allVirtualTables,
  allVirtualColumns,
  onImported,
  mapPreviewEnabled = false,
  onPreviewChange,
  embedded = false,
  cancelLabel = "Tutup",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: VirtualTableRow;
  columns: VirtualColumnRow[];
  allVirtualTables: VirtualTableRow[];
  /** Semua kolom project (untuk deteksi relasi hub G-H5). Default: `columns` saja. */
  allVirtualColumns?: VirtualColumnRow[];
  onImported: () => void;
  /** Tampilkan poligon di tab Map sebelum impor (hanya dari workspace Map). */
  mapPreviewEnabled?: boolean;
  onPreviewChange?: (footprints: MapFootprint[] | null) => void;
  embedded?: boolean;
  cancelLabel?: string;
}) {
  const resolvedAllColumns = allVirtualColumns ?? columns;
  const [geojsonText, setGeojsonText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importPending, startImportTransition] = useTransition();
  const [geometrySlug, setGeometrySlug] = useState("");
  const [matchSlug, setMatchSlug] = useState("");
  const [desaRelationSlug, setDesaRelationSlug] = useState("");
  const [desaRowId, setDesaRowId] = useState("");
  const [upsertMode, setUpsertMode] = useState<"upsert" | "insert_only">("upsert");
  const [featureKeyPrefix, setFeatureKeyPrefix] = useState("");
  const [desaSourceMode, setDesaSourceMode] = useState<"fixed" | "from_properties">("fixed");
  const [geoDesaLookup, setGeoDesaLookup] = useState<"code" | "kecamatan_title">("code");
  const [geoCodeProp, setGeoCodeProp] = useState("kode_desa");
  const [targetCodeSlug, setTargetCodeSlug] = useState("kode_desa");
  const [geoKecamatanProp, setGeoKecamatanProp] = useState("kecamatan");
  const [geoNamaDesaProp, setGeoNamaDesaProp] = useState("desa");
  const [targetKecamatanSlug, setTargetKecamatanSlug] = useState("kecamatan");
  const [targetTitleSlug, setTargetTitleSlug] = useState("title");
  const [desaRowLabel, setDesaRowLabel] = useState("");
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);

  const geometryColumns = useMemo(
    () => columns.filter((c) => c.data_type === "geometry"),
    [columns]
  );

  const matchColumns = useMemo(
    () =>
      columns.filter((c) =>
        ["text", "number", "url"].includes(c.data_type)
      ),
    [columns]
  );

  const relationColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.data_type === "relation" &&
          (c.config as { is_multi?: boolean } | null)?.is_multi !== true
      ),
    [columns]
  );

  const relationTargetTableId = useMemo(() => {
    if (!desaRelationSlug) return null;
    const col = relationColumns.find((c) => c.slug === desaRelationSlug);
    return (
      (col?.config as { target_table_id?: string } | null)?.target_table_id ??
      null
    );
  }, [desaRelationSlug, relationColumns]);

  const relationTargetLabel = useMemo(() => {
    if (!relationTargetTableId) return "tabel target";
    const vt = allVirtualTables.find((t) => t.id === relationTargetTableId);
    const name = vt?.display_name?.trim();
    return name && name.length > 0 ? name : "tabel target";
  }, [relationTargetTableId, allVirtualTables]);

  const inboundGeomLinkSpecs = useMemo(() => {
    if (!table.project_id) return [];
    const projectTables = allVirtualTables.filter(
      (t) => t.project_id === table.project_id
    );
    const projectTableIds = new Set(projectTables.map((t) => t.id));
    const tableNameById = new Map(projectTables.map((t) => [t.id, t.display_name]));
    const cols = resolvedAllColumns.filter((c) =>
      projectTableIds.has(c.table_id)
    );
    return buildInboundGeomRelationSpecs({
      geomTableId: table.id,
      projectTableIds,
      tableNameById,
      columns: cols,
    });
  }, [table.id, table.project_id, allVirtualTables, resolvedAllColumns]);

  const preview = useMemo(() => {
    if (!geojsonText.trim()) return null;
    const r = parseFeatureCollectionForVirtualImport(geojsonText);
    if (!r.ok) return { error: r.error, count: 0 };
    return { error: null as string | null, count: r.rows.length };
  }, [geojsonText]);

  const onPreviewChangeRef = useRef(onPreviewChange);
  const lastPreviewSigRef = useRef<string>("");

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useEffect(() => {
    if (!mapPreviewEnabled || !open) return;
    const emit = (layers: MapFootprint[] | null) => {
      const sig = mapPreviewLayersSignature(layers);
      if (sig === lastPreviewSigRef.current) return;
      lastPreviewSigRef.current = sig;
      onPreviewChangeRef.current?.(layers);
    };
    const text = geojsonText.trim();
    if (!text) {
      emit(null);
      return;
    }
    const built = buildVirtualTableImportPreviewFootprints(
      text,
      table.display_name,
      matchSlug
    );
    if (!("footprints" in built)) {
      emit(null);
      return;
    }
    emit(built.footprints);
  }, [mapPreviewEnabled, open, geojsonText, matchSlug, table.display_name]);

  useEffect(() => {
    if (!open) lastPreviewSigRef.current = "";
  }, [open]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        lastPreviewSigRef.current = "";
        onPreviewChangeRef.current?.(null);
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  useEffect(() => {
    if (!open) return;
    setGeojsonText("");
    setImportMsg(null);
    setDesaRowId("");
    setDesaRowLabel("");
    setTargetPickerOpen(false);
    setFeatureKeyPrefix("");
    setDesaSourceMode("fixed");
    setGeoDesaLookup("code");
    setGeoCodeProp("kode_desa");
    setTargetCodeSlug("kode_desa");
    setGeoKecamatanProp("kecamatan");
    setGeoNamaDesaProp("desa");
    setTargetKecamatanSlug("kecamatan");
    setTargetTitleSlug("title");
    setUpsertMode("upsert");
    const geom =
      geometryColumns.find((c) => c.slug === "geom" || c.slug === "geometry") ??
      geometryColumns[0];
    setGeometrySlug(geom?.slug ?? "");
    const match = pickDefaultVirtualTableMatchColumn(matchColumns);
    setMatchSlug(match?.slug ?? "");
    const requiredRel = relationColumns.find((c) => c.is_required);
    setDesaRelationSlug(requiredRel?.slug ?? "");
  }, [open, geometryColumns, matchColumns, relationColumns]);

  const runImport = useCallback(() => {
    const text = geojsonText.trim();
    if (!text) {
      setImportMsg("Pilih file GeoJSON terlebih dahulu.");
      return;
    }
    if (text.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
      setImportMsg(spatialGeometryTextTooLargeMessage("GeoJSON"));
      return;
    }
    if (!geometrySlug || !matchSlug) {
      setImportMsg("Pilih kolom geometri dan kolom kunci pencocokan.");
      return;
    }
    if (desaSourceMode === "from_properties") {
      if (!desaRelationSlug) {
        setImportMsg("Pilih kolom relasi untuk lookup per fitur.");
        return;
      }
    } else if (desaRelationSlug && !desaRowId) {
      setImportMsg(
        "Pilih baris target untuk file ini (satu file = satu baris relasi)."
      );
      return;
    }
    const parsed = parseFeatureCollectionForVirtualImport(text);
    if (!parsed.ok) {
      setImportMsg(parsed.error);
      return;
    }
    setImportMsg(null);
    const fd = new FormData();
    fd.set("table_id", table.id);
    fd.set("geojson_json", text);
    fd.set("geometry_column_slug", geometrySlug);
    fd.set("match_column_slug", matchSlug);
    fd.set("upsert_mode", upsertMode);
    if (featureKeyPrefix) fd.set("feature_key_prefix", featureKeyPrefix);
    fd.set("desa_source_mode", desaSourceMode);
    if (desaSourceMode === "from_properties" && desaRelationSlug) {
      fd.set("desa_relation_column_slug", desaRelationSlug);
      fd.set("geo_desa_lookup", geoDesaLookup);
      if (geoDesaLookup === "code") {
        fd.set("geo_code_prop", geoCodeProp.trim() || "kode_desa");
        fd.set("target_code_slug", targetCodeSlug.trim() || "kode_desa");
      } else {
        fd.set("geo_kecamatan_prop", geoKecamatanProp.trim() || "kecamatan");
        fd.set("geo_nama_desa_prop", geoNamaDesaProp.trim() || "desa");
        fd.set(
          "target_kecamatan_slug",
          targetKecamatanSlug.trim() || "kecamatan"
        );
        fd.set("target_title_slug", targetTitleSlug.trim() || "title");
      }
    } else if (desaRelationSlug && desaRowId) {
      fd.set("desa_relation_column_slug", desaRelationSlug);
      fd.set("desa_target_row_id", desaRowId);
    }
    startImportTransition(async () => {
      const r = await importVirtualRowsGeoJsonBatchAction(fd);
      if (r.error) {
        setImportMsg(r.error);
        return;
      }
      const skipText =
        r.skippedExisting > 0
          ? ` ${r.skippedExisting} sudah ada (lewati).`
          : "";
      const failText =
        r.failed > 0
          ? ` Gagal ${r.failed}${r.failureSamples.length > 0 ? ` (${r.failureSamples.slice(0, 3).join("; ")})` : ""}.`
          : "";
      const linkText =
        (r.inboundLinked ?? 0) > 0
          ? ` ${r.inboundLinked} relasi hub terisi.`
          : "";
      setImportMsg(
        `Berhasil: ${r.inserted} baru, ${r.updated} diperbarui.${linkText}${skipText}${failText}`
      );
      if (r.inserted > 0 || r.updated > 0) {
        onPreviewChange?.(null);
        onImported();
      }
    });
  }, [
    geojsonText,
    geometrySlug,
    matchSlug,
    upsertMode,
    featureKeyPrefix,
    geoDesaLookup,
    geoCodeProp,
    targetCodeSlug,
    geoKecamatanProp,
    geoNamaDesaProp,
    targetKecamatanSlug,
    targetTitleSlug,
    desaSourceMode,
    desaRelationSlug,
    desaRowId,
    table.id,
    onImported,
    onPreviewChange,
  ]);

  const fileInputBlock = (
    <div>
      <Label htmlFor="geo-import-file">File GeoJSON</Label>
      <Input
        id="geo-import-file"
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        disabled={importPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setImportMsg(null);
          const reader = new FileReader();
          reader.onload = () => {
            const raw = String(reader.result ?? "");
            if (raw.length > MAX_SPATIAL_GEOMETRY_TEXT_CHARS) {
              setImportMsg(spatialGeometryTextTooLargeMessage("GeoJSON"));
              setGeojsonText("");
              return;
            }
            setGeojsonText(raw);
          };
          reader.onerror = () => setImportMsg("Gagal membaca file.");
          reader.readAsText(file, "UTF-8");
          e.target.value = "";
        }}
      />
    </div>
  );

  return (
    <ImportDialogShell
      embedded={embedded}
      open={open}
      onOpenChange={handleOpenChange}
      title={`Impor GeoJSON ke ${table.display_name}`}
      description={
        <>
          File harus berupa <span className="font-mono">FeatureCollection</span>{" "}
          (banyak poligon). Setiap feature → satu baris di tabel ini.{" "}
          <strong>Upsert</strong> memakai pasangan{" "}
          <span className="font-mono">kolom relasi (opsional) + kolom kunci</span>{" "}
          agar aman bila satu file berisi banyak nilai relasi berbeda.
        </>
      }
    >
          {mapPreviewEnabled ? (
            <p className="rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-foreground">
              Pilih file GeoJSON di bawah — poligon valid langsung ditampilkan di
              peta (garis teal putus-putus) sebelum Anda menekan Impor.
            </p>
          ) : null}

          {mapPreviewEnabled ? fileInputBlock : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="geo-import-geom-col">Kolom geometri</Label>
              <select
                id="geo-import-geom-col"
                value={geometrySlug}
                onChange={(e) => setGeometrySlug(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={importPending}
              >
                {geometryColumns.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.display_name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="geo-import-match-col">Kolom kunci (upsert)</Label>
              <select
                id="geo-import-match-col"
                value={matchSlug}
                onChange={(e) => setMatchSlug(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                disabled={importPending}
              >
                {matchColumns.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.display_name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {inboundGeomLinkSpecs.length > 0 ? (
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Setelah impor, baris di{" "}
              <strong className="font-medium text-foreground">
                {inboundGeomLinkSpecs.map((s) => s.hubTableName).join(", ")}
              </strong>{" "}
              akan dihubungkan otomatis jika property GeoJSON memuat{" "}
              <span className="font-mono text-foreground">
                {inboundGeomLinkSpecs.map((s) => s.hubMatchSlug).join(" / ")}
              </span>
              .
            </p>
          ) : null}

          {relationColumns.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <div>
                <Label htmlFor="geo-import-desa-col">Kolom relasi</Label>
                <select
                  id="geo-import-desa-col"
                  value={desaRelationSlug}
                  onChange={(e) => {
                    setDesaRelationSlug(e.target.value);
                    setDesaRowId("");
                    setDesaRowLabel("");
                  }}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  disabled={importPending}
                >
                  {!relationColumns.some((c) => c.is_required) ? (
                    <option value="">— Opsional —</option>
                  ) : null}
                  {relationColumns.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {desaRelationSlug ? (
                <>
                  <div>
                    <Label htmlFor="geo-desa-source-mode">Cara isi relasi</Label>
                    <select
                      id="geo-desa-source-mode"
                      value={desaSourceMode}
                      onChange={(e) =>
                        setDesaSourceMode(
                          e.target.value as "fixed" | "from_properties"
                        )
                      }
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      disabled={importPending}
                    >
                      <option value="fixed">
                        Satu baris target untuk seluruh file (pilih dari daftar)
                      </option>
                      <option value="from_properties">
                        Dari property setiap feature (banyak target dalam satu file)
                      </option>
                    </select>
                  </div>

                  {desaSourceMode === "fixed" ? (
                    <div>
                      <Label htmlFor="geo-import-desa-row">
                        Baris target ({relationTargetLabel})
                      </Label>
                      <Button
                        id="geo-import-desa-row"
                        type="button"
                        variant="outline"
                        className="mt-1 h-9 w-full justify-start font-normal"
                        disabled={importPending || !desaRelationSlug}
                        onClick={() => setTargetPickerOpen(true)}
                      >
                        <span
                          className={cn(
                            "truncate",
                            desaRowLabel ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          {desaRowLabel || "— Pilih baris —"}
                        </span>
                      </Button>
                      <RelationTargetPickerDialog
                        open={targetPickerOpen}
                        onOpenChange={setTargetPickerOpen}
                        targetTableId={relationTargetTableId}
                        title={`Pilih baris — ${relationTargetLabel}`}
                        description="Ketik nama desa, kecamatan, atau kode untuk memfilter daftar."
                        selectedId={desaRowId || undefined}
                        onSelect={(row) => {
                          setDesaRowId(row.id);
                          setDesaRowLabel(row.label);
                        }}
                        onClear={() => {
                          setDesaRowId("");
                          setDesaRowLabel("");
                        }}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <Label htmlFor="geo-desa-lookup-style">
                          Lookup ke tabel target
                        </Label>
                        <select
                          id="geo-desa-lookup-style"
                          value={geoDesaLookup}
                          onChange={(e) =>
                            setGeoDesaLookup(
                              e.target.value as "code" | "kecamatan_title"
                            )
                          }
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                          disabled={importPending}
                        >
                          <option value="code">
                            Satu kode unik (property GeoJSON → kolom tabel target)
                          </option>
                          <option value="kecamatan_title">
                            Dua kolom gabungan (tanpa kode tunggal)
                          </option>
                        </select>
                      </div>

                      {geoDesaLookup === "code" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label htmlFor="geo-code-prop">Property GeoJSON</Label>
                            <Input
                              id="geo-code-prop"
                              value={geoCodeProp}
                              onChange={(e) => setGeoCodeProp(e.target.value)}
                              className="mt-1 font-mono text-xs"
                              placeholder="kode_desa"
                              disabled={importPending}
                            />
                          </div>
                          <div>
                            <Label htmlFor="target-code-slug">
                              Kolom di tabel target
                            </Label>
                            <Input
                              id="target-code-slug"
                              value={targetCodeSlug}
                              onChange={(e) => setTargetCodeSlug(e.target.value)}
                              className="mt-1 font-mono text-xs"
                              placeholder="kode_desa"
                              disabled={importPending}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label htmlFor="geo-kec-prop">
                              Property kolom 1 (grup/wilayah)
                            </Label>
                            <Input
                              id="geo-kec-prop"
                              value={geoKecamatanProp}
                              onChange={(e) =>
                                setGeoKecamatanProp(e.target.value)
                              }
                              className="mt-1 font-mono text-xs"
                              placeholder="mis. kecamatan"
                              disabled={importPending}
                            />
                          </div>
                          <div>
                            <Label htmlFor="geo-nama-desa-prop">
                              Property kolom 2 (nama/unit)
                            </Label>
                            <Input
                              id="geo-nama-desa-prop"
                              value={geoNamaDesaProp}
                              onChange={(e) =>
                                setGeoNamaDesaProp(e.target.value)
                              }
                              className="mt-1 font-mono text-xs"
                              placeholder="mis. nama"
                              disabled={importPending}
                            />
                          </div>
                          <p className="col-span-full text-xs text-muted-foreground">
                            Tabel{" "}
                            <span className="font-medium">{relationTargetLabel}</span>{" "}
                            harus punya dua kolom dengan slug di bawah (pasangan nilai
                            unik). Sesuaikan slug bila skema Anda berbeda.
                          </p>
                          <div>
                            <Label htmlFor="tgt-kec-slug">
                              Slug kolom 1 di tabel target
                            </Label>
                            <Input
                              id="tgt-kec-slug"
                              value={targetKecamatanSlug}
                              onChange={(e) =>
                                setTargetKecamatanSlug(e.target.value)
                              }
                              className="mt-1 font-mono text-xs"
                              disabled={importPending}
                            />
                          </div>
                          <div>
                            <Label htmlFor="tgt-title-slug">
                              Slug kolom 2 di tabel target
                            </Label>
                            <Input
                              id="tgt-title-slug"
                              value={targetTitleSlug}
                              onChange={(e) => setTargetTitleSlug(e.target.value)}
                              className="mt-1 font-mono text-xs"
                              disabled={importPending}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          <div>
            <Label htmlFor="geo-import-mode">Jika kunci sudah ada</Label>
            <select
              id="geo-import-mode"
              value={upsertMode}
              onChange={(e) =>
                setUpsertMode(e.target.value as "upsert" | "insert_only")
              }
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              disabled={importPending}
            >
              <option value="upsert">Perbarui geometri &amp; atribut</option>
              <option value="insert_only">Lewati (hanya baris baru)</option>
            </select>
          </div>

          <div>
            <Label htmlFor="geo-import-prefix">Awalan kunci (opsional)</Label>
            <Input
              id="geo-import-prefix"
              value={featureKeyPrefix}
              onChange={(e) => setFeatureKeyPrefix(e.target.value)}
              placeholder="mis. BAB-"
              className="font-mono text-sm"
              disabled={importPending}
            />
          </div>

          {!mapPreviewEnabled ? fileInputBlock : null}

          <p className="text-xs text-muted-foreground">
            Property feature yang slug-nya sama dengan kolom tabel (mis.{" "}
            <span className="font-mono">no_bidang</span>,{" "}
            <span className="font-mono">luas_m2</span>) akan diisi otomatis.
            Kunci juga dibaca dari <span className="font-mono">feature_key</span>
            , <span className="font-mono">id</span>, atau urutan feature.
          </p>

          {preview ? (
            <p
              className={`text-xs ${preview.error ? "text-red-600" : "text-muted-foreground"}`}
              role="status"
            >
              {preview.error
                ? preview.error
                : `Pratinjau: ${preview.count} poligon valid.${
                    mapPreviewEnabled ? " Ditampilkan di peta." : ""
                  }`}
            </p>
          ) : null}

          {importMsg ? (
            <p
              className={`text-xs ${importMsg.startsWith("Berhasil") ? "text-foreground" : "text-red-600"}`}
              role="status"
            >
              {importMsg}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={importPending}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              onClick={runImport}
              disabled={
                importPending ||
                !geojsonText.trim() ||
                !geometrySlug ||
                !matchSlug ||
                Boolean(preview?.error)
              }
            >
              {importPending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-4" /> Mengimpor…
                </span>
              ) : (
                "Impor"
              )}
            </Button>
          </div>
    </ImportDialogShell>
  );
}

// ---------------------------------------------------------------------------
// Create Table Dialog (exported separately)
// ---------------------------------------------------------------------------

type CreateDialogProps = {
  projectId: string | null;
  organizationId: string | null;
  scope: "project" | "organization";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (tableId: string) => void | Promise<void>;
};

export function VirtualTableCreateDialog({
  projectId,
  organizationId,
  scope,
  open,
  onOpenChange,
  onCreated,
}: CreateDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setDesc("");
    }
  }, [open]);

  const handleCreate = useCallback(() => {
    if (!name.trim()) return;
    const fd = new FormData();
    if (scope === "project" && projectId) {
      fd.set("project_id", projectId);
    } else if (scope === "organization" && organizationId) {
      fd.set("organization_id", organizationId);
    } else {
      toast.error("Tidak bisa membuat tabel: scope tidak valid");
      return;
    }
    fd.set("display_name", name.trim());
    if (desc.trim()) fd.set("description", desc.trim());
    startTransition(async () => {
      const r = await (
        await import("./virtual-table-actions")
      ).createVirtualTableAction(fd);
      if (r.error) {
        toast.error(r.error);
      } else {
        onOpenChange(false);
        await onCreated?.(r.tableId!);
        router.refresh();
      }
    });
  }, [name, desc, projectId, organizationId, scope, onOpenChange, onCreated, router]);

  const scopeLabel = scope === "organization" ? "organisasi" : ruangKerjaLc;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat tabel {scopeLabel} baru</DialogTitle>
          <DialogDescription>
            {scope === "organization"
              ? "Tabel organisasi bisa diakses dari semua project dalam organisasi ini."
              : "Tabel project hanya tersedia di project yang dipilih saat ini."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="vtable-create-name">Nama tabel</Label>
            <Input
              id="vtable-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Data Pemilik, Inventaris Alat"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>
          <div>
            <Label htmlFor="vtable-create-desc">Deskripsi (opsional)</Label>
            <Input
              id="vtable-create-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Keterangan singkat"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button onClick={handleCreate} disabled={pending || !name.trim()}>
              {pending ? "Membuat…" : "Buat tabel"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

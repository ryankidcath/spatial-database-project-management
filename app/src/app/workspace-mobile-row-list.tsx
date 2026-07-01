"use client";

import { ChevronRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatVirtualTableValueForMapPopup,
  pickMapRowTitle,
  type VirtualColumnForMapPopup,
} from "@/lib/virtual-table-map-popup";
import type { VirtualColumnRow, VirtualDataRow } from "./virtual-table-types";
import { WorkspaceMobileListSkeleton } from "./workspace-mobile-list-skeleton";

const PREVIEW_COLUMN_COUNT = 2;

type Props = {
  rows: VirtualDataRow[];
  columns: VirtualColumnRow[];
  relationLabels: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  unreadRowIds: Set<string>;
  isRowPanelOpen: (rowId: string) => boolean;
  onOpenRow: (rowId: string, rowTitle: string) => void;
  onOpenRowChat: (rowId: string, rowTitle: string) => void;
  loading?: boolean;
  className?: string;
};

function previewColumns(columns: VirtualColumnRow[]): VirtualColumnForMapPopup[] {
  return [...columns]
    .filter((c) => c.data_type !== "geometry")
    .sort((a, b) => a.position - b.position)
    .slice(0, PREVIEW_COLUMN_COUNT)
    .map((c) => ({
      slug: c.slug,
      display_name: c.display_name,
      data_type: c.data_type,
      position: c.position,
    }));
}

function rowSubtitle(
  payload: Record<string, unknown>,
  previewCols: VirtualColumnForMapPopup[],
  relationLabels: Record<string, string>,
  memberNameByUserId: Map<string, string>,
  titleSlug: string | null
): string | null {
  const parts: string[] = [];
  for (const col of previewCols) {
    if (col.slug === titleSlug) continue;
    const val = payload[col.slug];
    if (val == null || val === "") continue;
    const text = formatVirtualTableValueForMapPopup(
      val,
      col.data_type,
      relationLabels,
      memberNameByUserId
    );
    if (text.trim()) parts.push(`${col.display_name}: ${text}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function WorkspaceMobileRowList({
  rows,
  columns,
  relationLabels,
  memberNameByUserId,
  unreadRowIds,
  isRowPanelOpen,
  onOpenRow,
  onOpenRowChat,
  loading = false,
  className,
}: Props) {
  const mapCols = columns.map((c) => ({
    slug: c.slug,
    display_name: c.display_name,
    data_type: c.data_type,
    position: c.position,
  }));
  const previewCols = previewColumns(columns);

  if (loading && rows.length === 0) {
    return (
      <ul className={cn("p-2", className)}>
        <WorkspaceMobileListSkeleton count={6} variant="table-row" />
      </ul>
    );
  }

  if (rows.length === 0) {
    return (
      <p className={cn("px-3 py-8 text-center text-sm text-muted-foreground", className)}>
        Belum ada baris di tabel ini.
      </p>
    );
  }

  return (
    <ul className={cn("p-2", className)}>
      {rows.map((row) => {
        const payload = row.payload ?? {};
        const title = pickMapRowTitle(
          payload,
          mapCols,
          relationLabels,
          row.id
        );
        const titleCol = previewCols.find((c) => {
          const v = payload[c.slug];
          return v != null && v !== "" && String(v) === title;
        });
        const subtitle = rowSubtitle(
          payload,
          previewCols,
          relationLabels,
          memberNameByUserId,
          titleCol?.slug ?? null
        );
        const unread = unreadRowIds.has(row.id);
        const panelOpen = isRowPanelOpen(row.id);

        return (
          <li key={row.id} className="flex min-w-0 items-stretch gap-0.5">
            <button
              type="button"
              aria-label={`Buka detail baris ${title}`}
              onClick={() => onOpenRow(row.id, title)}
              className={cn(
                "flex min-h-[3.25rem] min-w-0 flex-1 items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-left transition-colors",
                panelOpen ? "bg-primary/10" : "hover:bg-muted/60 active:bg-muted/60"
              )}
            >
              <span className="min-w-0 flex-1 basis-0 overflow-hidden">
                <span className="block truncate text-sm font-medium text-foreground">
                  {title}
                </span>
                {subtitle ? (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {subtitle}
                  </span>
                ) : null}
              </span>
              <ChevronRight
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
            <button
              type="button"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                panelOpen
                  ? "bg-primary/10 text-primary"
                  : unread
                    ? "text-amber-600 hover:bg-muted/60 active:bg-muted/60"
                    : "text-muted-foreground hover:bg-muted/60 active:bg-muted/60"
              )}
              aria-label={`Chat baris ${title}`}
              onClick={() => onOpenRowChat(row.id, title)}
            >
              <MessageSquare className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

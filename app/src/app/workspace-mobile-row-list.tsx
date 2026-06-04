"use client";

import { ChevronRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatVirtualTableValueForMapPopup,
  pickMapRowTitle,
  type VirtualColumnForMapPopup,
} from "@/lib/virtual-table-map-popup";
import type { VirtualColumnRow, VirtualDataRow } from "./virtual-table-types";

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
      <p className={cn("px-1 py-8 text-center text-sm text-muted-foreground", className)}>
        Memuat baris…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className={cn("rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground", className)}>
        Belum ada baris di tabel ini.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {rows.map((row, index) => {
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
          <li key={row.id}>
            <div
              className={cn(
                "flex w-full items-stretch gap-1 rounded-xl border border-border bg-card shadow-sm",
                unread && "border-l-4 border-l-amber-500 bg-amber-50/50",
                panelOpen && "ring-2 ring-primary/30"
              )}
            >
              <button
                type="button"
                aria-label={`Buka detail baris ${title}`}
                onClick={() => onOpenRow(row.id, title)}
                className={cn(
                  "flex min-h-[4.25rem] min-w-0 flex-1 items-center gap-3 p-4 text-left",
                  "transition-colors active:bg-muted/60"
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-foreground">
                    {title}
                  </span>
                  {subtitle ? (
                    <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {subtitle}
                    </span>
                  ) : null}
                </span>
                <ChevronRight
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                className={cn(
                  "flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground",
                  panelOpen ? "bg-primary/10 text-primary" : "active:bg-muted/60"
                )}
                aria-label={`Chat baris ${title}`}
                onClick={() => onOpenRowChat(row.id, title)}
              >
                <MessageSquare className="size-5" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

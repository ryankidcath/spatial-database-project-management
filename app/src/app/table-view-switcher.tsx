"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  getLayoutAvailability,
  resolveLayoutOptions,
} from "@/lib/virtual-table-layout-availability";
import { missingLayoutHints } from "@/lib/virtual-table-layout-hints";
import { writeTableLayoutPreference } from "@/lib/virtual-table-layout-preference";
import {
  layoutMetaFor,
  VIRTUAL_TABLE_LAYOUTS,
  type VirtualTableLayoutType,
} from "@/lib/virtual-table-layout-types";
import type {
  VirtualColumnDataType,
  VirtualColumnRow,
  VirtualViewLayoutOptions,
} from "./virtual-table-types";

export type TableViewSwitcherProps = {
  /** ID tabel virtual — dipakai untuk persist `lastLayout` di localStorage. */
  tableId: string;
  columns: VirtualColumnRow[];
  /** Layout aktif (controlled). */
  layout: VirtualTableLayoutType;
  layoutOptions: VirtualViewLayoutOptions;
  /**
   * Dipanggil saat pengguna memilih layout yang tersedia untuk schema tabel.
   * `options` sudah di-resolve (kolom anchor Kanban/Kalender).
   */
  onLayoutChange: (
    layout: VirtualTableLayoutType,
    options: VirtualViewLayoutOptions
  ) => void;
  /** Buka dialog tambah kolom dengan tipe & nama disarankan (onboarding layout). */
  onAddColumn?: (dataType: VirtualColumnDataType, suggestedName: string) => void;
  size?: "sm" | "default";
  className?: string;
  /** Label tombol trigger: short = «Grid», full = «Tampilan: Grid». */
  triggerLabel?: "short" | "full";
};

/**
 * Pemilih jenis tampilan data per tabel.
 * Lihat `docs/workspace-navigation-and-views.md` Fase 2–5.
 */
export function TableViewSwitcher({
  tableId,
  columns,
  layout,
  layoutOptions,
  onLayoutChange,
  onAddColumn,
  size = "sm",
  className,
  triggerLabel = "short",
}: TableViewSwitcherProps) {
  const [open, setOpen] = useState(false);
  const activeMeta = layoutMetaFor(layout);
  const ActiveIcon = activeMeta.icon;
  const availability = useMemo(
    () => getLayoutAvailability(columns),
    [columns]
  );
  const missingHints = useMemo(
    () => missingLayoutHints(columns),
    [columns]
  );

  const selectLayout = useCallback(
    (next: VirtualTableLayoutType) => {
      const avail = availability[next];
      if (!avail?.available) return;
      const resolved = resolveLayoutOptions(next, layoutOptions, columns);
      writeTableLayoutPreference(tableId, next);
      onLayoutChange(next, resolved);
      setOpen(false);
    },
    [availability, columns, layoutOptions, tableId, onLayoutChange]
  );

  const triggerText =
    triggerLabel === "full"
      ? `Tampilan: ${activeMeta.label}`
      : activeMeta.shortLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size={size}
            className={cn("gap-1.5 font-normal", className)}
            aria-label={`Tampilan data: ${activeMeta.label}`}
            data-testid="table-view-switcher"
          >
            <ActiveIcon className="size-3.5 shrink-0" aria-hidden />
            <span>{triggerText}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 gap-0.5 p-1.5">
        <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Tampilan
        </p>
        <ul className="flex flex-col gap-0.5">
          {VIRTUAL_TABLE_LAYOUTS.map((item) => {
            const Icon = item.icon;
            const selected = item.type === layout;
            const avail = availability[item.type];
            const enabled = avail?.available ?? false;
            const hint = enabled ? item.label : (avail?.hint ?? "Segera");
            return (
              <li key={item.type}>
                <button
                  type="button"
                  disabled={!enabled}
                  title={hint}
                  data-testid={`table-view-option-${item.type}`}
                  onClick={() => selectLayout(item.type)}
                  className={cn(
                    "flex w-full min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    enabled
                      ? "text-foreground hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none"
                      : "cursor-not-allowed text-muted-foreground/60"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {selected ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden />
                  ) : !enabled ? (
                    <span className="shrink-0 max-w-[5rem] truncate text-[10px] text-muted-foreground">
                      {avail?.hint ?? "Segera"}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        {onAddColumn && missingHints.length > 0 ? (
          <div
            className="mt-2 border-t border-border pt-2"
            data-testid="table-view-switcher-hints"
          >
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Aktifkan layout
            </p>
            <ul className="flex flex-col gap-1 px-1">
              {missingHints.slice(0, 4).map((h) => (
                <li key={h.layout}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted/80"
                    data-testid={`table-view-add-column-${h.layout}`}
                    onClick={() => {
                      onAddColumn(h.dataType, h.suggestedName);
                      setOpen(false);
                    }}
                  >
                    {h.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

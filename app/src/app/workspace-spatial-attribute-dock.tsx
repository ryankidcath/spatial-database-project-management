"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapAttributeRow } from "@/lib/workspace-map-attribute-rows";

type Props = {
  rows: MapAttributeRow[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  highlightFootprintId?: string | null;
  onRowClick: (row: MapAttributeRow) => void;
  embedded?: boolean;
  className?: string;
};

export function WorkspaceSpatialAttributeDock({
  rows,
  expanded,
  onExpandedChange,
  highlightFootprintId,
  onRowClick,
  embedded = false,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "bg-background/95 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm",
        embedded
          ? "relative w-full shrink-0"
          : "pointer-events-auto absolute inset-x-0 bottom-0 z-[440] border-t border-border",
        className
      )}
      data-testid="workspace-attribute-dock"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted/50"
        onClick={() => onExpandedChange(!expanded)}
      >
        <span>
          Tabel atribut
          <span className="ml-1.5 font-normal text-muted-foreground">
            {rows.length} fitur
          </span>
        </span>
        {expanded ? (
          <ChevronDown className="size-4 shrink-0" />
        ) : (
          <ChevronUp className="size-4 shrink-0" />
        )}
      </button>
      {expanded ? (
        <div className="max-h-[min(28vh,14rem)] overflow-auto border-t border-border">
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Tidak ada fitur di lapisan aktif.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/90">
                <tr>
                  <th className="px-3 py-1.5 font-medium text-muted-foreground">
                    Lapisan
                  </th>
                  <th className="px-3 py-1.5 font-medium text-muted-foreground">
                    Fitur
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const active = highlightFootprintId === row.footprintId;
                  return (
                    <tr
                      key={row.footprintId}
                      className={cn(
                        "cursor-pointer border-t border-border/60 hover:bg-muted/60",
                        active && "bg-orange-50/80 dark:bg-orange-950/30"
                      )}
                      onClick={() => onRowClick(row)}
                    >
                      <td className="max-w-[8rem] truncate px-3 py-1.5 text-muted-foreground">
                        {row.layerLabel}
                      </td>
                      <td className="truncate px-3 py-1.5 font-medium text-foreground">
                        {row.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}

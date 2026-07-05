"use client";

import { cn } from "@/lib/utils";
import { formatVirtualTableValueForMapPopup } from "@/lib/virtual-table-map-popup";
import type { VirtualColumnRow } from "./virtual-table-types";

type Props = {
  columns: VirtualColumnRow[];
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  compact?: boolean;
  className?: string;
};

export function VirtualTableRowFieldsReadonly({
  columns,
  rowPayload,
  relationLabels = {},
  memberNameByUserId,
  compact = false,
  className,
}: Props) {
  const visibleCols = [...columns]
    .filter((c) => c.data_type !== "geometry")
    .sort((a, b) => a.position - b.position);

  if (visibleCols.length === 0) {
    return (
      <p className={cn("text-muted-foreground", className)}>
        Tidak ada kolom untuk ditampilkan.
      </p>
    );
  }

  return (
    <dl className={cn(compact ? "space-y-2" : "space-y-3", className)}>
      {visibleCols.map((col) => {
        const val = rowPayload?.[col.slug];
        const formatted = formatVirtualTableValueForMapPopup(
          val,
          col.data_type,
          relationLabels,
          memberNameByUserId
        );
        const display = formatted.trim() !== "" ? formatted : "—";
        return (
          <div
            key={col.id}
            className={cn(
              compact
                ? "border-b border-border/60 pb-2 last:border-b-0"
                : "rounded-lg border border-border bg-muted/30 px-3 py-3"
            )}
          >
            <dt
              className={cn(
                "font-medium text-muted-foreground",
                compact ? "text-xs" : "text-sm"
              )}
            >
              {col.display_name}
            </dt>
            <dd
              className={cn(
                "mt-1 break-words text-foreground",
                !compact && "text-base leading-snug"
              )}
            >
              {display}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

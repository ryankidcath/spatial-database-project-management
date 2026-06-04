"use client";

import { ChevronRight, Table2 } from "lucide-react";
import { VirtualTableChatUnreadBadge } from "./virtual-table-chat-unread-context";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import { cn } from "@/lib/utils";

type TableListProps = {
  sectionTitle: string;
  tables: VirtualTableRow[];
  virtualColumnsByTableId: Map<string, VirtualColumnRow[]>;
  onOpenTable: (slug: string) => void;
  className?: string;
};

function VirtualTableListCard({
  table,
  columnCount,
  onOpen,
}: {
  table: VirtualTableRow;
  columnCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="virtual-table-open"
      aria-label={`Buka tabel ${table.display_name}`}
      onClick={onOpen}
      className={cn(
        "flex w-full min-h-[4.5rem] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm",
        "transition-colors hover:bg-muted/40 active:bg-muted/60"
      )}
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-lg"
        aria-hidden
      >
        {table.icon?.trim() ? table.icon : <Table2 className="size-5 text-muted-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-foreground">
            {table.display_name}
          </span>
          <VirtualTableChatUnreadBadge tableId={table.id} />
        </span>
        {table.description?.trim() ? (
          <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {table.description}
          </span>
        ) : null}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {columnCount} kolom
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

export function VirtualTableMobileList({
  sectionTitle,
  tables,
  virtualColumnsByTableId,
  onOpenTable,
  className,
}: TableListProps) {
  if (tables.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {sectionTitle}
      </p>
      <ul className="space-y-2">
        {tables.map((vt) => {
          const cols = virtualColumnsByTableId.get(vt.id) ?? [];
          return (
            <li key={vt.id} id={`vtable-${vt.slug}`}>
              <VirtualTableListCard
                table={vt}
                columnCount={cols.length}
                onOpen={() => onOpenTable(vt.slug)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { ChevronRight, Table2 } from "lucide-react";
import { VirtualTableChatUnreadBadge } from "./virtual-table-chat-unread-context";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import { cn } from "@/lib/utils";
import { WORKSPACE_TAB_LIST_HEADER_CLASS } from "./workspace-tab-list-header";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceMobileListSkeleton } from "./workspace-mobile-list-skeleton";

type TableListProps = {
  sectionTitle: string;
  tables: VirtualTableRow[];
  virtualColumnsByTableId: Map<string, VirtualColumnRow[]>;
  onOpenTable: (slug: string) => void;
  className?: string;
  loading?: boolean;
};

function VirtualTableListRow({
  table,
  columnCount,
  onOpen,
}: {
  table: VirtualTableRow;
  columnCount: number;
  onOpen: () => void;
}) {
  const subtitle =
    table.description?.trim() ||
    `${columnCount} kolom`;

  return (
    <button
      type="button"
      data-testid="virtual-table-open"
      aria-label={`Buka tabel ${table.display_name}`}
      onClick={onOpen}
      className={cn(
        "flex w-full min-h-[3.25rem] min-w-0 items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        "hover:bg-muted/60 active:bg-muted/60"
      )}
    >
      <Table2
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="min-w-0 flex-1 basis-0 overflow-hidden">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {table.display_name}
          </span>
          <VirtualTableChatUnreadBadge tableId={table.id} />
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

export function VirtualTableMobileList({
  sectionTitle,
  tables,
  virtualColumnsByTableId,
  onOpenTable,
  className,
  loading = false,
}: TableListProps) {
  if (loading && tables.length === 0) {
    return (
      <div className={cn("min-w-0", className)}>
        <div className={WORKSPACE_TAB_LIST_HEADER_CLASS}>
          <Skeleton className="h-3 w-36" />
        </div>
        <ul className="p-2">
          <WorkspaceMobileListSkeleton count={4} variant="inbox" />
        </ul>
      </div>
    );
  }

  if (tables.length === 0) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          WORKSPACE_TAB_LIST_HEADER_CLASS,
          "text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        )}
      >
        {sectionTitle}
      </p>
      <ul className="p-2">
        {tables.map((vt) => {
          const cols = virtualColumnsByTableId.get(vt.id) ?? [];
          return (
            <li key={vt.id} id={`vtable-${vt.slug}`} className="min-w-0">
              <VirtualTableListRow
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

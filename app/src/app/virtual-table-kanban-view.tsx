"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { virtualRowDisplayLabel } from "@/lib/virtual-table-row-label";
import type { VirtualColumnRow, VirtualDataRow } from "./virtual-table-types";

const COL_PREFIX = "vkanban:";

type Props = {
  rows: VirtualDataRow[];
  columns: VirtualColumnRow[];
  statusColumnSlug: string;
  statusOptions: string[];
  onOpenRow: (rowId: string) => void;
  onStatusChange?: (rowId: string, newStatus: string | null) => void;
  className?: string;
};

function colId(status: string | null) {
  return `${COL_PREFIX}${status ?? "__empty__"}`;
}

function KanbanCard({
  row,
  columns,
  onOpenRow,
}: {
  row: VirtualDataRow;
  columns: VirtualColumnRow[];
  onOpenRow: (rowId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    data: { type: "card", row },
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpenRow(row.id)}
      className={cn(
        "w-full rounded-md border border-border bg-card px-2.5 py-2 text-left text-sm shadow-sm transition-colors hover:bg-muted/40",
        isDragging && "opacity-40"
      )}
    >
      <span className="line-clamp-2 font-medium text-foreground">
        {virtualRowDisplayLabel(row, columns)}
      </span>
    </button>
  );
}

function KanbanColumn({
  title,
  statusKey,
  rows,
  columns,
  onOpenRow,
}: {
  title: string;
  statusKey: string | null;
  rows: VirtualDataRow[];
  columns: VirtualColumnRow[];
  onOpenRow: (rowId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: colId(statusKey),
    data: { type: "column", status: statusKey },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[12rem] min-w-[11rem] max-w-[16rem] flex-1 flex-col rounded-lg border border-border bg-muted/20",
        isOver && "ring-2 ring-primary/40"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-xs font-semibold text-foreground">
          {title}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {rows.length}
        </span>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 pm-mobile-scroll">
        {rows.map((row) => (
          <li key={row.id}>
            <KanbanCard row={row} columns={columns} onOpenRow={onOpenRow} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VirtualTableKanbanView({
  rows,
  columns,
  statusColumnSlug,
  statusOptions,
  onOpenRow,
  onStatusChange,
  className,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [activeRow, setActiveRow] = useState<VirtualDataRow | null>(null);

  const columnsWithEmpty = useMemo(() => {
    const keys: (string | null)[] = [...statusOptions];
    const hasEmpty = rows.some((r) => {
      const v = r.payload[statusColumnSlug];
      return v == null || v === "";
    });
    if (hasEmpty && !keys.includes("")) keys.unshift(null);
    return keys;
  }, [statusOptions, rows, statusColumnSlug]);

  const rowsByStatus = useMemo(() => {
    const map = new Map<string | null, VirtualDataRow[]>();
    for (const key of columnsWithEmpty) {
      map.set(key, []);
    }
    for (const row of rows) {
      const raw = row.payload[statusColumnSlug];
      const key =
        raw == null || raw === "" ? null : String(raw);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return map;
  }, [rows, statusColumnSlug, columnsWithEmpty]);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveRow(null);
    if (!onStatusChange) return;
    const { active, over } = event;
    if (!over) return;
    const row = active.data.current?.row as VirtualDataRow | undefined;
    if (!row) return;
    const overData = over.data.current;
    let targetStatus: string | null | undefined;
    if (overData?.type === "column") {
      targetStatus = overData.status as string | null;
    } else if (overData?.type === "card") {
      const overRow = overData.row as VirtualDataRow;
      const raw = overRow.payload[statusColumnSlug];
      targetStatus = raw == null || raw === "" ? null : String(raw);
    }
    if (targetStatus === undefined) return;
    const currentRaw = row.payload[statusColumnSlug];
    const current =
      currentRaw == null || currentRaw === "" ? null : String(currentRaw);
    if (current === targetStatus) return;
    onStatusChange(row.id, targetStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => {
        const row = e.active.data.current?.row as VirtualDataRow | undefined;
        setActiveRow(row ?? null);
      }}
      onDragEnd={handleDragEnd}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto pb-2 pm-mobile-scroll",
          className
        )}
      >
        {columnsWithEmpty.map((statusKey) => (
          <KanbanColumn
            key={statusKey ?? "__empty__"}
            title={statusKey ?? "(Kosong)"}
            statusKey={statusKey}
            rows={rowsByStatus.get(statusKey) ?? []}
            columns={columns}
            onOpenRow={onOpenRow}
          />
        ))}
      </div>
      <DragOverlay>
        {activeRow ? (
          <div className="w-[14rem] rounded-md border border-border bg-card px-2.5 py-2 text-sm shadow-lg">
            {virtualRowDisplayLabel(activeRow, columns)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

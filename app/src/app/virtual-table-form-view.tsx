"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { virtualRowDisplayLabel } from "@/lib/virtual-table-row-label";
import type {
  VirtualColumnDataType,
  VirtualColumnRow,
  VirtualDataRow,
} from "./virtual-table-types";

type Props = {
  rows: VirtualDataRow[];
  columns: VirtualColumnRow[];
  /** Kolom yang ditampilkan di form (slug). Kosong = semua kolom non-geometry. */
  visibleColumnSlugs?: string[];
  selectOptionsBySlug: Map<string, string[]>;
  relationLabels: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  onSaveCell: (rowId: string, colSlug: string, value: string) => void;
  onAddRow: () => void;
  onOpenGeometry?: (rowId: string, colSlug: string) => void;
  readOnly?: boolean;
  className?: string;
};

function formatDisplayValue(
  val: unknown,
  dataType: VirtualColumnDataType,
  relationLabels: Record<string, string>,
  memberNameByUserId: Map<string, string>
): string {
  if (val == null || val === "") return "";
  switch (dataType) {
    case "checkbox":
      return val === true ? "true" : "false";
    case "user": {
      const id = String(val);
      return memberNameByUserId.get(id) ?? id;
    }
    case "relation": {
      const ids = Array.isArray(val)
        ? (val as unknown[]).map(String)
        : [String(val)];
      return ids.map((id) => relationLabels[id] ?? id).join(", ");
    }
    default:
      return String(val);
  }
}

function FormField({
  col,
  value,
  options,
  readOnly,
  relationLabels,
  memberNameByUserId,
  onCommit,
  onOpenGeometry,
}: {
  col: VirtualColumnRow;
  value: unknown;
  options: string[];
  readOnly?: boolean;
  relationLabels: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  onCommit: (value: string) => void;
  onOpenGeometry?: () => void;
}) {
  const id = `vform-${col.slug}`;
  const strVal = value == null ? "" : String(value);

  if (col.data_type === "geometry") {
    const hasGeo = value != null && value !== "" && typeof value === "object";
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{col.display_name}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly}
          onClick={onOpenGeometry}
        >
          {hasGeo ? "Edit geometri" : "Tambah geometri"}
        </Button>
      </div>
    );
  }

  if (col.data_type === "file") {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{col.display_name}</Label>
        <Input
          id={id}
          type="url"
          defaultValue={strVal}
          disabled={readOnly}
          placeholder="URL berkas"
          onBlur={(e) => onCommit(e.target.value)}
        />
      </div>
    );
  }

  if (col.data_type === "checkbox") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          className="h-4 w-4 rounded border-border"
          defaultChecked={value === true}
          disabled={readOnly}
          onChange={(e) => onCommit(e.target.checked ? "true" : "false")}
        />
        <Label htmlFor={id}>{col.display_name}</Label>
      </div>
    );
  }

  if (col.data_type === "select") {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{col.display_name}</Label>
        <select
          id={id}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          defaultValue={strVal}
          disabled={readOnly}
          onChange={(e) => onCommit(e.target.value)}
        >
          <option value="">—</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (col.data_type === "relation" || col.data_type === "user") {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{col.display_name}</Label>
        <p className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm text-muted-foreground">
          {formatDisplayValue(
            value,
            col.data_type,
            relationLabels,
            memberNameByUserId
          ) || "—"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Edit relasi/pengguna lewat tampilan Grid.
        </p>
      </div>
    );
  }

  const isLong = col.data_type === "text" && strVal.length > 120;

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {col.display_name}
        {col.is_required ? " *" : ""}
      </Label>
      {isLong ? (
        <Textarea
          id={id}
          defaultValue={strVal}
          disabled={readOnly}
          rows={3}
          onBlur={(e) => onCommit(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={
            col.data_type === "number"
              ? "number"
              : col.data_type === "date"
                ? "date"
                : col.data_type === "url"
                  ? "url"
                  : "text"
          }
          defaultValue={
            col.data_type === "date" ? strVal.slice(0, 10) : strVal
          }
          disabled={readOnly}
          onBlur={(e) => onCommit(e.target.value)}
        />
      )}
    </div>
  );
}

export function VirtualTableFormView({
  rows,
  columns,
  visibleColumnSlugs,
  selectOptionsBySlug,
  relationLabels,
  memberNameByUserId,
  onSaveCell,
  onAddRow,
  onOpenGeometry,
  readOnly = false,
  className,
}: Props) {
  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.position - b.position),
    [columns]
  );

  const formColumns = useMemo(() => {
    const visible =
      visibleColumnSlugs && visibleColumnSlugs.length > 0
        ? new Set(visibleColumnSlugs)
        : null;
    return sortedColumns.filter((c) => {
      if (visible && !visible.has(c.slug)) return false;
      return true;
    });
  }, [sortedColumns, visibleColumnSlugs]);

  const [selectedRowId, setSelectedRowId] = useState<string | null>(
    rows[0]?.id ?? null
  );

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedRowId(null);
      return;
    }
    if (!selectedRowId || !rows.some((r) => r.id === selectedRowId)) {
      setSelectedRowId(rows[0]!.id);
    }
  }, [rows, selectedRowId]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedRowId) ?? null,
    [rows, selectedRowId]
  );

  const handleCommit = useCallback(
    (colSlug: string, value: string) => {
      if (!selectedRowId || readOnly) return;
      onSaveCell(selectedRowId, colSlug, value);
    },
    [selectedRowId, readOnly, onSaveCell]
  );

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:flex-row",
        className
      )}
    >
      <aside className="flex shrink-0 flex-col gap-2 border-border md:w-56 md:border-r md:pr-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Baris
          </span>
          {!readOnly ? (
            <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
              + Baru
            </Button>
          ) : null}
        </div>
        <ScrollArea
          orientation="vertical"
          className="max-h-48 md:max-h-none md:flex-1"
        >
          <ul className="flex flex-col gap-0.5 px-1 pb-2">
            {rows.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                Belum ada baris.
              </li>
            ) : (
              rows.map((row) => {
                const label = virtualRowDisplayLabel(row, columns);
                const active = row.id === selectedRowId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRowId(row.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted/80"
                      )}
                    >
                      <span className="line-clamp-2">{label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </ScrollArea>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-1 pb-4 pm-mobile-scroll">
        {!selectedRow ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Pilih baris atau buat baris baru.
          </p>
        ) : (
          <form
            key={selectedRow.id}
            className="mx-auto max-w-lg space-y-4 py-2"
            onSubmit={(e) => e.preventDefault()}
          >
            <h3 className="text-sm font-semibold text-foreground">
              {virtualRowDisplayLabel(selectedRow, columns)}
            </h3>
            {formColumns.map((col) => (
              <FormField
                key={col.id}
                col={col}
                value={selectedRow.payload[col.slug]}
                options={selectOptionsBySlug.get(col.slug) ?? []}
                readOnly={readOnly}
                relationLabels={relationLabels}
                memberNameByUserId={memberNameByUserId}
                onCommit={(v) => handleCommit(col.slug, v)}
                onOpenGeometry={
                  col.data_type === "geometry" && onOpenGeometry
                    ? () => onOpenGeometry(selectedRow.id, col.slug)
                    : undefined
                }
              />
            ))}
          </form>
        )}
      </div>
    </div>
  );
}

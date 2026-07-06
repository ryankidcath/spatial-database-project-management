"use client";

import type {
  DashboardGlobalFilterDef,
  DashboardGlobalFilterValue,
} from "@/app/virtual-dashboard-types";
import type { VirtualColumnRow, VirtualTableRow } from "@/app/virtual-table-types";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";

type Props = {
  filterDefs: DashboardGlobalFilterDef[];
  filterValues: DashboardGlobalFilterValue[];
  virtualTables: VirtualTableRow[];
  columnsByTableId: Map<string, VirtualColumnRow[]>;
  editing: boolean;
  onChangeValue: (tableId: string, column: string, value: string) => void;
  onConfigureFilters?: () => void;
};

function optionsForColumn(
  tableId: string,
  columnSlug: string,
  columnsByTableId: Map<string, VirtualColumnRow[]>
): string[] {
  const col = (columnsByTableId.get(tableId) ?? []).find(
    (c) => c.slug === columnSlug
  );
  if (!col?.config?.options) return [];
  const opts = col.config.options as { value?: string; label?: string }[];
  if (!Array.isArray(opts)) return [];
  return opts.map((o) => String(o.value ?? o.label ?? "")).filter(Boolean);
}

export function DashboardFilterBar({
  filterDefs,
  filterValues,
  virtualTables,
  columnsByTableId,
  editing,
  onChangeValue,
  onConfigureFilters,
}: Props) {
  if (filterDefs.length === 0 && !editing) return null;

  const tableName = (id: string) =>
    virtualTables.find((t) => t.id === id)?.display_name ?? "Tabel";

  const columnLabel = (tableId: string, slug: string) =>
    (columnsByTableId.get(tableId) ?? []).find((c) => c.slug === slug)
      ?.display_name ?? slug;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
      <span className="w-full text-xs font-medium text-muted-foreground sm:w-auto">
        Filter
      </span>
      {filterDefs.map((def) => {
        const value =
          filterValues.find(
            (f) =>
              f.table_id === def.table_id && f.column === def.column_slug
          )?.value ?? "";
        const options = optionsForColumn(
          def.table_id,
          def.column_slug,
          columnsByTableId
        );
        return (
          <label
            key={`${def.table_id}:${def.column_slug}`}
            className="flex min-w-[8rem] flex-col gap-0.5 text-xs"
          >
            <span className="text-muted-foreground">
              {columnLabel(def.table_id, def.column_slug)}
              <span className="ml-1 hidden text-[10px] opacity-70 sm:inline">
                ({tableName(def.table_id)})
              </span>
            </span>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={value}
              onChange={(e) =>
                onChangeValue(def.table_id, def.column_slug, e.target.value)
              }
            >
              <option value="">Semua</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {editing && onConfigureFilters ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={onConfigureFilters}
        >
          <Settings2 className="mr-1 h-3.5 w-3.5" />
          Atur filter
        </Button>
      ) : null}
    </div>
  );
}

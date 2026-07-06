"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Columns3,
  Copy,
  Filter,
  Layers,
  MoreHorizontal,
  Search,
  Star,
  Trash2,
  ArrowUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { layoutMetaFor } from "@/lib/virtual-table-layout-types";
import { layoutTypeFromConfig } from "@/lib/virtual-view-config";
import type {
  VirtualColumnRow,
  VirtualViewFilter,
  VirtualViewRow,
  VirtualViewSort,
} from "./virtual-table-types";
import { VIEW_FILTER_OPERATORS } from "./virtual-table-types";

const GROUPABLE_TYPES = new Set([
  "select",
  "text",
  "checkbox",
  "relation",
  "user",
]);

const selectClassName =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function ToolbarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function columnLabel(columns: VirtualColumnRow[], slug: string): string {
  return columns.find((c) => c.slug === slug)?.display_name ?? slug;
}

function operatorLabel(op: VirtualViewFilter["operator"]): string {
  return VIEW_FILTER_OPERATORS.find((o) => o.value === op)?.label ?? op;
}

function filterSummary(
  filter: VirtualViewFilter,
  columns: VirtualColumnRow[]
): string {
  const col = columnLabel(columns, filter.column);
  const op = operatorLabel(filter.operator);
  if (filter.operator === "is_empty" || filter.operator === "is_not_empty") {
    return `${col} · ${op}`;
  }
  const val = filter.value.trim();
  return val ? `${col} · ${op} · "${val}"` : `${col} · ${op}`;
}

type Props = {
  sortedColumns: VirtualColumnRow[];
  filters: VirtualViewFilter[];
  setFilters: Dispatch<SetStateAction<VirtualViewFilter[]>>;
  sorts: VirtualViewSort[];
  setSorts: Dispatch<SetStateAction<VirtualViewSort[]>>;
  groupBy: string | null;
  setGroupBy: Dispatch<SetStateAction<string | null>>;
  hiddenColumns: Set<string>;
  setHiddenColumns: Dispatch<SetStateAction<Set<string>>>;
  savedViews: VirtualViewRow[];
  activeViewId: string | null;
  onSelectDefaultView: () => void;
  onSelectSavedView: (view: VirtualViewRow) => void;
  onSaveViewClick: () => void;
  onUpdateActiveView: () => void;
  onDuplicateView: (viewId: string) => void;
  onSetDefaultView: (viewId: string) => void;
  onDeleteView: (viewId: string) => void;
};

function SavedViewActionsMenu({
  view,
  onDuplicate,
  onSetDefault,
  onDelete,
}: {
  view: VirtualViewRow;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-6 shrink-0 text-muted-foreground opacity-60 hover:opacity-100"
            aria-label={`Aksi view ${view.name}`}
            onClick={(e) => {
              e.stopPropagation();
              triggerProps.onClick?.(e);
            }}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        )}
      />
      <PopoverContent align="start" className="w-44 gap-0 p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2 px-2 text-xs font-normal"
          onClick={() => {
            onDuplicate();
            setOpen(false);
          }}
        >
          <Copy className="size-3.5" />
          Duplikat
        </Button>
        {!view.is_default ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 px-2 text-xs font-normal"
            onClick={() => {
              onSetDefault();
              setOpen(false);
            }}
          >
            <Star className="size-3.5" />
            Jadikan default
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2 px-2 text-xs font-normal text-destructive hover:text-destructive"
          onClick={() => {
            onDelete();
            setOpen(false);
          }}
        >
          <Trash2 className="size-3.5" />
          Hapus
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function FilterEditorRow({
  filter,
  index,
  sortedColumns,
  onChange,
  onRemove,
}: {
  filter: VirtualViewFilter;
  index: number;
  sortedColumns: VirtualColumnRow[];
  onChange: (index: number, next: VirtualViewFilter) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/80 bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          Filter {index + 1}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-6 text-muted-foreground hover:text-destructive"
          aria-label="Hapus filter"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <select
        value={filter.column}
        onChange={(e) => onChange(index, { ...filter, column: e.target.value })}
        className={selectClassName}
      >
        {sortedColumns.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.display_name}
          </option>
        ))}
      </select>
      <select
        value={filter.operator}
        onChange={(e) =>
          onChange(index, {
            ...filter,
            operator: e.target.value as VirtualViewFilter["operator"],
          })
        }
        className={selectClassName}
      >
        {VIEW_FILTER_OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      {filter.operator !== "is_empty" && filter.operator !== "is_not_empty" ? (
        <Input
          value={filter.value}
          onChange={(e) => onChange(index, { ...filter, value: e.target.value })}
          placeholder="Nilai…"
          className="h-8 text-xs"
        />
      ) : null}
    </div>
  );
}

function FilterPopover({
  sortedColumns,
  filters,
  setFilters,
}: {
  sortedColumns: VirtualColumnRow[];
  filters: VirtualViewFilter[];
  setFilters: Dispatch<SetStateAction<VirtualViewFilter[]>>;
}) {
  const [open, setOpen] = useState(false);

  const updateFilter = (index: number, next: VirtualViewFilter) => {
    setFilters((prev) => prev.map((f, i) => (i === index ? next : f)));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-normal"
          >
            <Filter className="size-3.5" />
            Filter
            {filters.length > 0 ? (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                {filters.length}
              </Badge>
            ) : null}
          </Button>
        )}
      />
      <PopoverContent align="start" className="w-72 gap-2 p-2">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <ToolbarSectionLabel>Filter</ToolbarSectionLabel>
          {filters.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => setFilters([])}
            >
              Hapus semua
            </Button>
          ) : null}
        </div>
        {filters.length === 0 ? (
          <p className="px-0.5 text-xs text-muted-foreground">
            Belum ada filter aktif.
          </p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {filters.map((f, i) => (
              <FilterEditorRow
                key={i}
                filter={f}
                index={i}
                sortedColumns={sortedColumns}
                onChange={updateFilter}
                onRemove={(idx) =>
                  setFilters((prev) => prev.filter((_, ii) => ii !== idx))
                }
              />
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full text-xs"
          onClick={() =>
            setFilters((prev) => [
              ...prev,
              {
                column: sortedColumns[0]?.slug ?? "",
                operator: "contains",
                value: "",
              },
            ])
          }
        >
          + Tambah filter
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function SortPopover({
  sortedColumns,
  sorts,
  setSorts,
}: {
  sortedColumns: VirtualColumnRow[];
  sorts: VirtualViewSort[];
  setSorts: Dispatch<SetStateAction<VirtualViewSort[]>>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-normal"
          >
            <ArrowUpDown className="size-3.5" />
            Sort
            {sorts.length > 0 ? (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                {sorts.length}
              </Badge>
            ) : null}
          </Button>
        )}
      />
      <PopoverContent align="start" className="w-64 gap-2 p-2">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <ToolbarSectionLabel>Sort</ToolbarSectionLabel>
          {sorts.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => setSorts([])}
            >
              Hapus sort
            </Button>
          ) : null}
        </div>
        {sorts.length === 0 ? (
          <p className="px-0.5 text-xs text-muted-foreground">
            Belum ada sort. Klik header kolom di tabel untuk mengurutkan.
          </p>
        ) : (
          <ul className="space-y-1">
            {sorts.map((s, i) => (
              <li
                key={`${s.column}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {s.direction === "asc" ? (
                    <ArrowUp className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ArrowDown className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate font-medium">
                    {columnLabel(sortedColumns, s.column)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-6 shrink-0"
                  aria-label="Hapus sort"
                  onClick={() => setSorts((prev) => prev.filter((_, ii) => ii !== i))}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function GroupPopover({
  sortedColumns,
  groupBy,
  setGroupBy,
}: {
  sortedColumns: VirtualColumnRow[];
  groupBy: string | null;
  setGroupBy: Dispatch<SetStateAction<string | null>>;
}) {
  const [open, setOpen] = useState(false);
  const groupable = sortedColumns.filter((c) => GROUPABLE_TYPES.has(c.data_type));
  const activeLabel = groupBy ? columnLabel(sortedColumns, groupBy) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 max-w-[11rem] gap-1.5 truncate text-xs font-normal"
          >
            <Layers className="size-3.5 shrink-0" />
            {activeLabel ? `Group: ${activeLabel}` : "Group"}
          </Button>
        )}
      />
      <PopoverContent align="start" className="w-56 gap-0 p-1">
        <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Kelompokkan menurut
        </p>
        <button
          type="button"
          className={cn(
            "flex w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/70",
            !groupBy && "bg-muted font-medium"
          )}
          onClick={() => {
            setGroupBy(null);
            setOpen(false);
          }}
        >
          Tidak ada
        </button>
        {groupable.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={cn(
              "flex w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/70",
              groupBy === c.slug && "bg-muted font-medium"
            )}
            onClick={() => {
              setGroupBy(c.slug);
              setOpen(false);
            }}
          >
            {c.display_name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ColumnsPopover({
  sortedColumns,
  hiddenColumns,
  setHiddenColumns,
}: {
  sortedColumns: VirtualColumnRow[];
  hiddenColumns: Set<string>;
  setHiddenColumns: Dispatch<SetStateAction<Set<string>>>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const visibleCount = sortedColumns.length - hiddenColumns.size;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedColumns;
    return sortedColumns.filter(
      (c) =>
        c.display_name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q)
    );
  }, [sortedColumns, query]);

  const showAll = () => setHiddenColumns(new Set());
  const hideAll = () =>
    setHiddenColumns(new Set(sortedColumns.map((c) => c.slug)));

  const toggleColumn = (slug: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-normal"
          >
            <Columns3 className="size-3.5" />
            Kolom ({visibleCount}/{sortedColumns.length})
          </Button>
        )}
      />
      <PopoverContent align="start" className="w-64 gap-2 p-2">
        <ToolbarSectionLabel>Kolom tampil</ToolbarSectionLabel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kolom…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={showAll}
          >
            Tampilkan semua
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={hideAll}
          >
            Sembunyikan semua
          </Button>
        </div>
        <ScrollArea className="max-h-52">
          <ul className="space-y-0.5 pr-2">
            {filtered.length === 0 ? (
              <li className="px-1 py-2 text-xs text-muted-foreground">
                Tidak ada kolom yang cocok.
              </li>
            ) : (
              filtered.map((c) => (
                <li key={c.slug}>
                  <Label className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 text-xs font-normal hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(c.slug)}
                      onChange={() => toggleColumn(c.slug)}
                      className="size-3.5 rounded border-border"
                    />
                    <span className="min-w-0 flex-1 truncate">{c.display_name}</span>
                  </Label>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function VirtualTableViewToolbar({
  sortedColumns,
  filters,
  setFilters,
  sorts,
  setSorts,
  groupBy,
  setGroupBy,
  hiddenColumns,
  setHiddenColumns,
  savedViews,
  activeViewId,
  onSelectDefaultView,
  onSelectSavedView,
  onSaveViewClick,
  onUpdateActiveView,
  onDuplicateView,
  onSetDefaultView,
  onDeleteView,
}: Props) {
  const hasActiveChips = filters.length > 0 || sorts.length > 0;

  return (
    <div className="shrink-0 space-y-2.5 rounded-xl border border-border bg-muted/30 p-3">
      {/* Zona 1: saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarSectionLabel>View</ToolbarSectionLabel>
        <button
          type="button"
          className={cn(
            "rounded-md px-2.5 py-1 text-xs transition-colors",
            !activeViewId
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground hover:bg-muted/80"
          )}
          onClick={onSelectDefaultView}
        >
          Default
        </button>
        {savedViews.map((v) => {
          const layoutLabel = layoutMetaFor(
            layoutTypeFromConfig(v.config)
          ).shortLabel;
          const active = activeViewId === v.id;
          return (
            <div
              key={v.id}
              className={cn(
                "flex items-center gap-0.5 rounded-md pr-0.5",
                active ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/50"
              )}
            >
              <button
                type="button"
                className={cn(
                  "max-w-[14rem] truncate rounded-md px-2.5 py-1 text-left text-xs transition-colors",
                  active
                    ? "font-medium text-primary"
                    : "text-foreground hover:bg-muted/80"
                )}
                onClick={() => onSelectSavedView(v)}
              >
                {v.is_default ? "★ " : ""}
                {v.name}
                <span className="ml-1 opacity-70">({layoutLabel})</span>
              </button>
              <SavedViewActionsMenu
                view={v}
                onDuplicate={() => onDuplicateView(v.id)}
                onSetDefault={() => onSetDefaultView(v.id)}
                onDelete={() => onDeleteView(v.id)}
              />
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-normal"
          data-testid="table-save-view"
          onClick={onSaveViewClick}
        >
          <BookmarkPlus className="size-3.5" />
          Simpan view
        </Button>
        {activeViewId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs font-normal"
            onClick={onUpdateActiveView}
          >
            Perbarui
          </Button>
        ) : null}
      </div>

      {/* Zona 2: kontrol data */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
        <FilterPopover
          sortedColumns={sortedColumns}
          filters={filters}
          setFilters={setFilters}
        />
        <SortPopover
          sortedColumns={sortedColumns}
          sorts={sorts}
          setSorts={setSorts}
        />
        <GroupPopover
          sortedColumns={sortedColumns}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
        />
        <ColumnsPopover
          sortedColumns={sortedColumns}
          hiddenColumns={hiddenColumns}
          setHiddenColumns={setHiddenColumns}
        />
      </div>

      {/* Zona 3: chip aktif */}
      {hasActiveChips ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
          {filters.map((f, i) => (
            <Badge
              key={`filter-${i}`}
              variant="secondary"
              className="max-w-full gap-1 pr-1 text-xs font-normal"
            >
              <span className="truncate">{filterSummary(f, sortedColumns)}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Hapus filter"
                onClick={() =>
                  setFilters((prev) => prev.filter((_, ii) => ii !== i))
                }
              >
                ×
              </button>
            </Badge>
          ))}
          {sorts.map((s, i) => (
            <Badge
              key={`sort-${s.column}-${i}`}
              variant="secondary"
              className="gap-1 pr-1 text-xs font-normal"
            >
              {s.direction === "asc" ? (
                <ArrowUp className="size-3 shrink-0" aria-hidden />
              ) : (
                <ArrowDown className="size-3 shrink-0" aria-hidden />
              )}
              {columnLabel(sortedColumns, s.column)}
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                aria-label="Hapus sort"
                onClick={() => setSorts((prev) => prev.filter((_, ii) => ii !== i))}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchEntity360PanelAction } from "./virtual-table-actions";
import { VirtualTableRowFieldsReadonly } from "./virtual-table-row-fields-readonly";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import type { Entity360Section } from "@/lib/virtual-table-entity-360";
import {
  buildEntity360SeedSections,
  readEntity360Cache,
  writeEntity360Cache,
} from "@/lib/virtual-table-entity-360";

type Props = {
  anchorTableId: string;
  anchorRowId: string;
  anchorPayload?: Record<string, unknown>;
  seedRelationLabels?: Record<string, string>;
  allVirtualTables: VirtualTableRow[];
  allVirtualColumns: VirtualColumnRow[];
  memberNameByUserId: Map<string, string>;
  compact?: boolean;
  className?: string;
};

function initialPanelState(
  anchorTableId: string,
  anchorRowId: string,
  anchorPayload: Record<string, unknown> | undefined,
  seedRelationLabels: Record<string, string>,
  anchorTableName: string,
  anchorColumns: VirtualColumnRow[],
  tableNameById: Map<string, string>
): {
  sections: Entity360Section[];
  relationLabels: Record<string, string>;
  loadingRelated: boolean;
} {
  const cached = readEntity360Cache(anchorTableId, anchorRowId);
  if (cached) {
    return {
      sections: cached.sections,
      relationLabels: { ...seedRelationLabels, ...cached.relationLabels },
      loadingRelated: false,
    };
  }

  if (anchorPayload) {
    return {
      sections: buildEntity360SeedSections({
        anchorTableId,
        anchorTableName,
        anchorRowId,
        anchorPayload,
        anchorColumns,
        relationLabels: seedRelationLabels,
        tableNameById,
      }),
      relationLabels: seedRelationLabels,
      loadingRelated: true,
    };
  }

  return {
    sections: [],
    relationLabels: seedRelationLabels,
    loadingRelated: true,
  };
}

export function VirtualTableEntity360Panel({
  anchorTableId,
  anchorRowId,
  anchorPayload,
  seedRelationLabels = {},
  allVirtualTables,
  allVirtualColumns,
  memberNameByUserId,
  compact = false,
  className,
}: Props) {
  const tableNameById = useMemo(
    () => new Map(allVirtualTables.map((t) => [t.id, t.display_name])),
    [allVirtualTables]
  );
  const anchorColumns = useMemo(
    () =>
      allVirtualColumns
        .filter((c) => c.table_id === anchorTableId)
        .sort((a, b) => a.position - b.position),
    [allVirtualColumns, anchorTableId]
  );
  const anchorTableName =
    tableNameById.get(anchorTableId) ?? anchorTableId.slice(0, 8);

  const [sections, setSections] = useState<Entity360Section[]>(() =>
    initialPanelState(
      anchorTableId,
      anchorRowId,
      anchorPayload,
      seedRelationLabels,
      anchorTableName,
      anchorColumns,
      tableNameById
    ).sections
  );
  const [relationLabels, setRelationLabels] = useState<
    Record<string, string>
  >(
    () =>
      initialPanelState(
        anchorTableId,
        anchorRowId,
        anchorPayload,
        seedRelationLabels,
        anchorTableName,
        anchorColumns,
        tableNameById
      ).relationLabels
  );
  const [loadingRelated, setLoadingRelated] = useState(
    () =>
      initialPanelState(
        anchorTableId,
        anchorRowId,
        anchorPayload,
        seedRelationLabels,
        anchorTableName,
        anchorColumns,
        tableNameById
      ).loadingRelated
  );

  const columnsByTableId = useMemo(() => {
    const map = new Map<string, VirtualColumnRow[]>();
    for (const col of allVirtualColumns) {
      const list = map.get(col.table_id) ?? [];
      list.push(col);
      map.set(col.table_id, list);
    }
    for (const [tableId, cols] of map) {
      map.set(
        tableId,
        [...cols].sort((a, b) => a.position - b.position)
      );
    }
    return map;
  }, [allVirtualColumns]);

  useEffect(() => {
    const cached = readEntity360Cache(anchorTableId, anchorRowId);
    if (cached) {
      setSections(cached.sections);
      setRelationLabels({ ...seedRelationLabels, ...cached.relationLabels });
      setLoadingRelated(false);
      return;
    }

    if (anchorPayload) {
      setSections(
        buildEntity360SeedSections({
          anchorTableId,
          anchorTableName,
          anchorRowId,
          anchorPayload,
          anchorColumns,
          relationLabels: seedRelationLabels,
          tableNameById,
        })
      );
      setRelationLabels(seedRelationLabels);
      setLoadingRelated(true);
    } else {
      setSections([]);
      setRelationLabels(seedRelationLabels);
      setLoadingRelated(true);
    }

    let cancelled = false;
    void (async () => {
      const result = await fetchEntity360PanelAction(
        anchorTableId,
        anchorRowId,
        anchorPayload ?? null
      );
      if (cancelled) return;
      if (result.error) {
        toast.error(result.error);
        if (!anchorPayload) setSections([]);
      } else {
        const mergedLabels = {
          ...seedRelationLabels,
          ...result.relationLabels,
        };
        setSections(result.sections);
        setRelationLabels(mergedLabels);
        writeEntity360Cache(anchorTableId, anchorRowId, {
          sections: result.sections,
          relationLabels: result.relationLabels,
        });
      }
      setLoadingRelated(false);
    })();

    return () => {
      cancelled = true;
    };
    // Muat ulang hanya saat baris anchor berganti; payload mengikuti klik terbaru.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorTableId, anchorRowId]);

  if (sections.length === 0 && loadingRelated) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-6 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="size-4 animate-spin" />
        Memuat panel 360°…
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <p className={cn("py-4 text-sm text-muted-foreground", className)}>
        Tidak ada data untuk ditampilkan.
      </p>
    );
  }

  const hasInboundPending =
    loadingRelated &&
    !sections.some((section) => section.direction === "inbound");

  return (
    <div className={cn("space-y-4", className)}>
      {sections.map((section) => {
        const columns = columnsByTableId.get(section.tableId) ?? [];
        const subtitle =
          section.direction === "anchor"
            ? "Lapisan diklik"
            : section.direction === "outbound"
              ? `Keluar · ${section.relationColumnDisplayName ?? "relasi"}`
              : `Masuk · ${section.relationColumnDisplayName ?? "relasi"}`;
        const sectionPending =
          loadingRelated &&
          section.direction !== "anchor" &&
          section.rows.some((row) => Object.keys(row.payload).length === 0);

        return (
          <section
            key={`${section.direction}:${section.tableId}:${section.relationColumnSlug ?? "anchor"}`}
            className="rounded-lg border border-border bg-card"
          >
            <header className="border-b border-border/70 bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <Layers className="size-3.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {section.tableName}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                </div>
                {sectionPending ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            </header>
            <div className="space-y-4 p-3">
              {section.rows.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    section.rows.length > 1 &&
                      "rounded-md border border-border/60 bg-muted/10 p-2"
                  )}
                >
                  {section.rows.length > 1 ? (
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {row.label}
                    </p>
                  ) : null}
                  {sectionPending && Object.keys(row.payload).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Memuat detail…
                    </p>
                  ) : (
                    <VirtualTableRowFieldsReadonly
                      columns={columns}
                      rowPayload={row.payload}
                      relationLabels={relationLabels}
                      memberNameByUserId={memberNameByUserId}
                      compact={compact}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {hasInboundPending ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Memuat tabel terkait…
        </div>
      ) : null}
    </div>
  );
}

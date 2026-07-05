"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, GitBranch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import {
  buildOutboundRelationGroups,
  hasRelationExplorerContent,
  type RelationExplorerGroup,
} from "@/lib/virtual-table-relation-explorer";
import {
  fetchInboundRelationsForRowAction,
  fetchVirtualRowByIdAction,
  resolveRelationLabelsAction,
} from "./virtual-table-actions";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";

type Props = {
  tableId: string;
  rowId: string;
  rowPayload?: Record<string, unknown>;
  columns: VirtualColumnRow[];
  allVirtualColumns: VirtualColumnRow[];
  relationLabels?: Record<string, string>;
  allVirtualTables: VirtualTableRow[];
  projectName?: string | null;
  organizationName?: string | null;
  className?: string;
};

export function VirtualTableRelationExplorer({
  tableId,
  rowId,
  rowPayload,
  columns,
  allVirtualColumns,
  relationLabels = {},
  allVirtualTables,
  projectName = null,
  organizationName = null,
  className,
}: Props) {
  const { openRowDetail } = useWorkspaceRightPanel();
  const [inboundGroups, setInboundGroups] = useState<RelationExplorerGroup[]>(
    []
  );
  const [loadingInbound, setLoadingInbound] = useState(true);

  const tableNameById = useMemo(
    () => new Map(allVirtualTables.map((t) => [t.id, t.display_name])),
    [allVirtualTables]
  );

  const outboundGroups = useMemo(() => {
    if (!rowPayload) return [];
    return buildOutboundRelationGroups({
      columns,
      rowPayload,
      relationLabels,
      tableNameById,
    });
  }, [columns, rowPayload, relationLabels, tableNameById]);

  useEffect(() => {
    let cancelled = false;
    setLoadingInbound(true);
    void (async () => {
      const result = await fetchInboundRelationsForRowAction(tableId, rowId);
      if (cancelled) return;
      if (result.error) {
        toast.error(result.error);
        setInboundGroups([]);
      } else {
        setInboundGroups(result.groups);
      }
      setLoadingInbound(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId, rowId]);

  const showExplorer = hasRelationExplorerContent(
    outboundGroups,
    inboundGroups
  );

  const openRelatedRow = useCallback(
    async (targetTableId: string, targetRowId: string, label: string) => {
      const table = allVirtualTables.find((t) => t.id === targetTableId);
      const fetched = await fetchVirtualRowByIdAction(targetRowId);
      if (fetched.error) {
        toast.error(fetched.error);
        return;
      }
      if (!fetched.row) {
        toast.error("Baris tidak ditemukan.");
        return;
      }

      const targetColumns = allVirtualColumns.filter(
        (c) => c.table_id === targetTableId
      );
      const relationIds = new Set<string>();
      for (const col of targetColumns) {
        if (col.data_type !== "relation") continue;
        const val = fetched.row.payload[col.slug];
        if (typeof val === "string" && val) relationIds.add(val);
        if (Array.isArray(val)) {
          for (const v of val) {
            if (typeof v === "string" && v) relationIds.add(v);
          }
        }
      }

      let nextRelationLabels: Record<string, string> = {};
      if (relationIds.size > 0) {
        const resolved = await resolveRelationLabelsAction([...relationIds]);
        if (resolved.error) toast.error(resolved.error);
        else nextRelationLabels = resolved.labels;
      }

      const pathSegments = buildChatRowPathSegments({
        projectName: table?.project_id ? projectName : null,
        organizationName: table?.project_id ? null : organizationName,
        tableDisplayName: table?.display_name ?? "Tabel",
        rowLabel: label,
      });

      openRowDetail({
        tableId: targetTableId,
        rowId: targetRowId,
        pathSegments,
        rowPayload: fetched.row.payload,
        relationLabels: nextRelationLabels,
      });
    },
    [
      allVirtualTables,
      allVirtualColumns,
      openRowDetail,
      organizationName,
      projectName,
    ]
  );

  if (!showExplorer && !loadingInbound) return null;

  return (
    <section
      className={cn(
        "mt-4 border-t border-border pt-3",
        className
      )}
    >
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <GitBranch className="size-3.5" />
        Relasi
      </h3>

      {outboundGroups.length > 0 ? (
        <RelationExplorerSection
          title="Keluar"
          groups={outboundGroups}
          onOpen={openRelatedRow}
        />
      ) : null}

      {loadingInbound ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Memuat relasi masuk…
        </div>
      ) : inboundGroups.length > 0 ? (
        <RelationExplorerSection
          title="Masuk"
          groups={inboundGroups}
          onOpen={openRelatedRow}
        />
      ) : null}
    </section>
  );
}

function RelationExplorerSection({
  title,
  groups,
  onOpen,
}: {
  title: string;
  groups: RelationExplorerGroup[];
  onOpen: (tableId: string, rowId: string, label: string) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">
        {groups.map((group) => (
          <div
            key={`${group.direction}:${group.tableId}:${group.columnSlug}`}
            className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5"
          >
            <p className="text-[11px] text-muted-foreground">
              {group.tableName}
              <span className="mx-1">·</span>
              {group.columnDisplayName}
            </p>
            <ul className="mt-1 space-y-0.5">
              {group.links.map((link) => (
                <li key={link.rowId}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-between px-2 font-normal"
                    onClick={() =>
                      onOpen(group.tableId, link.rowId, link.label)
                    }
                  >
                    <span className="truncate">{link.label}</span>
                    <ChevronRight className="size-3.5 shrink-0 opacity-60" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { buildVirtualTableRowFootprints } from "@/lib/virtual-table-map-footprints";
import { useWorkspaceSpatialDataSync } from "./workspace-spatial-data-sync-context";
import type { MapFootprint, VirtualRowMapSelect } from "./workspace-map";
import type {
  VirtualColumnRow,
  VirtualDataRow,
  VirtualTableRow,
} from "./virtual-table-types";

const WorkspaceMap = dynamic(
  () => import("./workspace-map").then((m) => m.WorkspaceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
        <Spinner className="mr-2 size-4" />
        Memuat peta…
      </div>
    ),
  }
);

type Props = {
  table: Pick<VirtualTableRow, "id" | "display_name">;
  columns: VirtualColumnRow[];
  rows: VirtualDataRow[];
  geometryColumnSlug: string;
  relationLabels: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  projectName?: string | null;
  onVirtualRowSelect?: (select: VirtualRowMapSelect) => void;
  highlightVirtualRowId?: string | null;
  highlightVirtualRowIds?: ReadonlySet<string>;
  onMapBackgroundClick?: () => void;
  className?: string;
};

export function VirtualTableMapView({
  table,
  columns,
  rows,
  geometryColumnSlug,
  relationLabels,
  memberNameByUserId,
  projectName = null,
  onVirtualRowSelect,
  highlightVirtualRowId = null,
  highlightVirtualRowIds,
  onMapBackgroundClick,
  className,
}: Props) {
  const spatialSync = useWorkspaceSpatialDataSync();

  const footprints = useMemo(
    (): MapFootprint[] =>
      buildVirtualTableRowFootprints({
        table,
        columns,
        rows,
        relationLabels,
        memberNameByUserId,
        projectName,
        geometryColumnSlug,
      }),
    [
      table,
      columns,
      rows,
      relationLabels,
      memberNameByUserId,
      projectName,
      geometryColumnSlug,
    ]
  );

  const rowIdsWithGeometry = useMemo(
    () =>
      rows
        .filter((row) => {
          const geo = row.payload[geometryColumnSlug];
          return geo != null && geo !== "" && typeof geo === "object";
        })
        .map((row) => row.id),
    [rows, geometryColumnSlug]
  );

  if (footprints.length === 0) {
    return (
      <p
        className={cn(
          "px-4 py-8 text-center text-sm text-muted-foreground",
          className
        )}
      >
        Belum ada geometri pada baris yang dimuat.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "relative min-h-[min(70vh,calc(100dvh-14rem))] w-full flex-1 overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <div className="absolute right-2 top-2 z-[500]">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5 shadow-sm"
          onClick={() =>
            spatialSync.openInSpatial({
              tableId: table.id,
              rowIds:
                highlightVirtualRowId != null
                  ? [highlightVirtualRowId]
                  : rowIdsWithGeometry,
              zoomToSelection: true,
            })
          }
        >
          <MapIcon className="size-3.5" />
          Buka di tab Spasial
        </Button>
      </div>
      <WorkspaceMap
        footprints={footprints}
        highlightVirtualRowId={highlightVirtualRowId}
        highlightVirtualRowIds={highlightVirtualRowIds}
        onVirtualRowSelect={onVirtualRowSelect}
        onMapBackgroundClick={onMapBackgroundClick}
      />
    </div>
  );
}

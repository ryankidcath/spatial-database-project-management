"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { buildVirtualTableRowFootprints } from "@/lib/virtual-table-map-footprints";
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
  onMapBackgroundClick,
  className,
}: Props) {
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
      <WorkspaceMap
        footprints={footprints}
        highlightVirtualRowId={highlightVirtualRowId}
        onVirtualRowSelect={onVirtualRowSelect}
        onMapBackgroundClick={onMapBackgroundClick}
      />
    </div>
  );
}

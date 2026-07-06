"use client";

import dynamic from "next/dynamic";
import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MapFootprint, VirtualRowMapSelect } from "@/app/workspace-map";
import { cn } from "@/lib/utils";

const WorkspaceMap = dynamic(
  () => import("./workspace-map").then((m) => m.WorkspaceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[10rem] items-center justify-center text-xs text-muted-foreground">
        <Spinner className="mr-2 size-4" />
        Memuat peta…
      </div>
    ),
  }
);

type Props = {
  footprints: MapFootprint[];
  loading?: boolean;
  editing?: boolean;
  highlightRowId?: string | null;
  onRowSelect?: (select: VirtualRowMapSelect) => void;
  onOpenSpatial?: () => void;
  className?: string;
};

export function DashboardMiniMapWidget({
  footprints,
  loading = false,
  editing = false,
  highlightRowId = null,
  onRowSelect,
  onOpenSpatial,
  className,
}: Props) {
  if (editing) {
    return (
      <p className="text-sm text-muted-foreground">
        Mini-peta tampil saat mode lihat. Seret untuk ubah ukuran widget.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[10rem] items-center justify-center text-xs text-muted-foreground">
        <Spinner className="mr-2 size-4" />
        Memuat lapisan peta…
      </div>
    );
  }

  if (footprints.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada geometri pada baris yang memenuhi filter.
      </p>
    );
  }

  return (
    <div className={cn("relative h-full min-h-[10rem] w-full", className)}>
      {onOpenSpatial ? (
        <div className="absolute right-1 top-1 z-[500]">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 gap-1 px-2 text-xs shadow-sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSpatial();
            }}
          >
            <MapIcon className="size-3" />
            Buka di Spasial
          </Button>
        </div>
      ) : null}
      <WorkspaceMap
        footprints={footprints}
        highlightVirtualRowId={highlightRowId}
        onVirtualRowSelect={onRowSelect}
      />
    </div>
  );
}

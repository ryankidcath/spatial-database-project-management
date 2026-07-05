"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Layers,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { buildReturnQueryValue } from "@/lib/safe-return-url";
import { spatialLayerColorForTableIndex } from "@/lib/workspace-spatial-layer-colors";
import { WorkspaceSpatialLayerList } from "./workspace-spatial-layer-list";
import type { ReactNode } from "react";
import type { VirtualTableRow } from "./virtual-table-types";

export type SpatialLayerRow = {
  tableId: string;
  displayName: string;
  featureCount: number;
  color: string;
  visible: boolean;
};

type Props = {
  layerRows: SpatialLayerRow[];
  importPreviewCount: number;
  importPreviewVisible?: boolean;
  onImportPreviewVisibilityChange?: (visible: boolean) => void;
  onTableLayerVisibilityChange: (tableId: string, visible: boolean) => void;
  onOpenImportWizard: () => void;
  isBelowMd: boolean;
  className?: string;
  headerLeading?: ReactNode;
  layersInRail?: boolean;
};

export function WorkspaceSpatialToolbar({
  layerRows,
  importPreviewCount,
  importPreviewVisible = true,
  onImportPreviewVisibilityChange,
  onTableLayerVisibilityChange,
  onOpenImportWizard,
  isBelowMd,
  className,
  headerLeading,
  layersInRail = false,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const spatialHelpHref = useMemo(() => {
    const ret = buildReturnQueryValue(pathname, searchParams.toString());
    return `/help/spatial-import?return=${ret}`;
  }, [pathname, searchParams]);

  const [layersOpen, setLayersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleLayerCount = useMemo(
    () =>
      layerRows.filter((r) => r.visible).length +
      (importPreviewCount > 0 && importPreviewVisible ? 1 : 0),
    [layerRows, importPreviewCount, importPreviewVisible]
  );

  const touchBtn = isBelowMd ? "min-h-11 touch-manipulation" : undefined;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 py-2",
        className
      )}
      data-testid="spatial-toolbar"
    >
      <div className="flex min-w-0 items-center gap-2">
        {headerLeading}
        <p className="text-xs text-muted-foreground">
          {visibleLayerCount > 0 ? (
            <>
              <span className="font-medium text-foreground">
                {visibleLayerCount}
              </span>{" "}
              lapisan aktif
              {importPreviewCount > 0 ? (
                <span className="ml-1 text-teal-700 dark:text-teal-300">
                  · pratinjau {importPreviewCount}
                </span>
              ) : null}
            </>
          ) : (
            "Tidak ada lapisan aktif"
          )}
        </p>
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          touchBtn && "[&_button]:min-h-11"
        )}
      >
        {!layersInRail ? (
          <Popover open={layersOpen} onOpenChange={setLayersOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 font-normal"
                  data-testid="spatial-layers-trigger"
                >
                  <Layers className="size-3.5 shrink-0" aria-hidden />
                  Lapisan
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-[min(20rem,92vw)] p-0">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium text-foreground">
                  Lapisan peta
                </p>
                <p className="text-xs text-muted-foreground">
                  Tabel virtual ber-geometry di ruang kerja ini
                </p>
              </div>
              <div className="max-h-[min(50vh,16rem)] overflow-y-auto p-2">
                <WorkspaceSpatialLayerList
                  layerRows={layerRows}
                  importPreviewCount={importPreviewCount}
                  importPreviewVisible={importPreviewVisible}
                  onImportPreviewVisibilityChange={
                    onImportPreviewVisibilityChange
                  }
                  onTableLayerVisibilityChange={onTableLayerVisibilityChange}
                  isBelowMd={isBelowMd}
                  variant="compact"
                />
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 font-normal"
          onClick={onOpenImportWizard}
          data-testid="spatial-import-trigger"
        >
          <Upload className="size-3.5 shrink-0" aria-hidden />
          Impor
        </Button>

        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-2"
                aria-label="Opsi lain"
                data-testid="spatial-more-trigger"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-56 p-2">
            <Link
              href={spatialHelpHref}
              className="block rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
              onClick={() => setMoreOpen(false)}
            >
              Bantuan impor spasial
            </Link>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function buildSpatialLayerRows(
  vtablesWithGeometry: VirtualTableRow[],
  featureCountByTableId: Map<string, number>,
  visibility: Record<string, boolean>
): SpatialLayerRow[] {
  return vtablesWithGeometry.map((vt, index) => ({
    tableId: vt.id,
    displayName: vt.display_name,
    featureCount: featureCountByTableId.get(vt.id) ?? 0,
    color: spatialLayerColorForTableIndex(index),
    visible: visibility[vt.id] !== false,
  }));
}

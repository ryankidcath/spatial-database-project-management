"use client";

import { useMemo } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fileColumnUrl,
  isLikelyImageUrl,
} from "@/lib/virtual-table-file-value";
import { virtualRowDisplayLabel } from "@/lib/virtual-table-row-label";
import type { VirtualColumnRow, VirtualDataRow } from "./virtual-table-types";

type Props = {
  rows: VirtualDataRow[];
  columns: VirtualColumnRow[];
  coverColumnSlug?: string | null;
  onOpenRow: (rowId: string) => void;
  className?: string;
};

export function VirtualTableGalleryView({
  rows,
  columns,
  coverColumnSlug,
  onOpenRow,
  className,
}: Props) {
  const cards = useMemo(
    () =>
      rows.map((row) => {
        const title = virtualRowDisplayLabel(row, columns);
        const coverRaw = coverColumnSlug
          ? row.payload[coverColumnSlug]
          : null;
        const coverUrl = fileColumnUrl(coverRaw);
        const showImage = coverUrl && isLikelyImageUrl(coverUrl);
        return { row, title, coverUrl, showImage };
      }),
    [rows, columns, coverColumnSlug]
  );

  if (cards.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Tidak ada baris untuk ditampilkan.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className
      )}
    >
      {cards.map(({ row, title, coverUrl, showImage }) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpenRow(row.id)}
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="relative aspect-[4/3] w-full bg-muted/30">
            {showImage && coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : coverUrl ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
                <ImageIcon className="size-8 text-muted-foreground/50" />
                <span className="line-clamp-2 text-[10px] text-muted-foreground">
                  Berkas
                </span>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageIcon className="size-10 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="border-t border-border px-3 py-2.5">
            <span className="line-clamp-2 text-sm font-medium text-foreground">
              {title}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetchVirtualTableRowCountAction } from "./virtual-table-actions";
import { VirtualTableChatUnreadBadge } from "./virtual-table-chat-unread-context";
import type { VirtualTableRow } from "./virtual-table-types";

type Props = {
  table: VirtualTableRow;
  onOpenInOverlay: () => void;
};

/** Ringkasan tabel di tab Tabel — tanpa grid / fetch semua baris. */
export function VirtualTableTabCard({ table, onOpenInOverlay }: Props) {
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchVirtualTableRowCountAction(table.id).then((res) => {
      if (cancelled) return;
      setRowCount(res.error ? null : res.count);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [table.id]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {table.icon ? <span className="text-lg">{table.icon}</span> : null}
          <h3 className="text-base font-semibold text-foreground">
            {table.display_name}
          </h3>
          <VirtualTableChatUnreadBadge tableId={table.id} />
        </div>
        {table.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{table.description}</p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3" />
              Menghitung baris…
            </span>
          ) : rowCount != null ? (
            <>
              <strong className="text-foreground">{rowCount}</strong> baris
            </>
          ) : (
            "Tidak bisa memuat jumlah baris"
          )}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={onOpenInOverlay}
      >
        <Maximize2 className="size-3.5" />
        Buka tabel lengkap
      </Button>
    </div>
  );
}

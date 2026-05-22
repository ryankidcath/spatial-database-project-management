"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { fetchRelationTargetRowsAction } from "@/app/virtual-table-actions";

export type RelationTargetOption = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetTableId: string | null;
  title?: string;
  description?: string;
  selectedId?: string;
  onSelect: (row: RelationTargetOption) => void;
  onClear?: () => void;
};

export function RelationTargetPickerDialog({
  open,
  onOpenChange,
  targetTableId,
  title = "Pilih baris target",
  description = "Ketik untuk memfilter daftar.",
  selectedId,
  onSelect,
  onClear,
}: Props) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<RelationTargetOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    if (!targetTableId) {
      setRows([]);
      return;
    }
    setLoading(true);
    void fetchRelationTargetRowsAction(targetTableId).then((r) => {
      setLoading(false);
      if (r.error) {
        setRows([]);
        return;
      }
      setRows(r.rows);
    });
  }, [open, targetTableId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, kecamatan, kode…"
          autoFocus
          disabled={loading || !targetTableId}
        />
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Memuat…
            </div>
          ) : !targetTableId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tabel target belum dipilih.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search.trim() ? "Tidak ditemukan." : "Tabel target kosong."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((row) => {
                const isSelected = selectedId === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                        isSelected
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground"
                      }`}
                      onClick={() => {
                        onSelect(row);
                        onOpenChange(false);
                      }}
                    >
                      {row.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          {onClear ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!selectedId}
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
            >
              Kosongkan
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

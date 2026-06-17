"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  fetchNotificationPreferencesAction,
  fetchScopeColumnOptionsAction,
  saveNotificationPreferencesAction,
  type NotificationPreferenceRow,
} from "./user-notification-preferences-actions";
import {
  NOTIFICATION_PREFERENCE_META,
  NOTIFICATION_SCOPE_CATEGORIES,
  type NotificationScopeCategory,
  type NotificationScopeRow,
  type VirtualColumnScopeOption,
  type VirtualTableScopeOption,
} from "./workspace-notification-types";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NotificationPreferencesPanel({ open, onOpenChange }: Props) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<NotificationPreferenceRow[]>([]);
  const [scopes, setScopes] = useState<NotificationScopeRow[]>([]);
  const [tables, setTables] = useState<VirtualTableScopeOption[]>([]);
  const [newScopeCategory, setNewScopeCategory] =
    useState<NotificationScopeCategory>("cell_value_changed");
  const [newScopeTableId, setNewScopeTableId] = useState("");
  const [newScopeColumnSlug, setNewScopeColumnSlug] = useState("");
  const [columnOptions, setColumnOptions] = useState<VirtualColumnScopeOption[]>(
    []
  );
  const [columnsLoading, setColumnsLoading] = useState(false);

  const tableNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tables) m.set(t.id, t.displayName);
    return m;
  }, [tables]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchNotificationPreferencesAction();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setRows(res.preferences);
    setScopes(res.scopes);
    setTables(res.tables);
    setNewScopeTableId((prev) => {
      if (prev && res.tables.some((t) => t.id === prev)) return prev;
      return res.tables[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open || newScopeCategory !== "cell_value_changed" || !newScopeTableId) {
      setColumnOptions([]);
      setNewScopeColumnSlug("");
      return;
    }
    let cancelled = false;
    setColumnsLoading(true);
    void fetchScopeColumnOptionsAction(newScopeTableId).then((res) => {
      if (cancelled) return;
      setColumnsLoading(false);
      if (res.error) {
        setColumnOptions([]);
        return;
      }
      setColumnOptions(res.columns);
      setNewScopeColumnSlug("");
    });
    return () => {
      cancelled = true;
    };
  }, [open, newScopeCategory, newScopeTableId]);

  const toggle = (category: string, enabled: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.category === category ? { ...r, enabled } : r))
    );
  };

  const removeScope = (index: number) => {
    setScopes((prev) => prev.filter((_, i) => i !== index));
  };

  const addScope = () => {
    if (!newScopeTableId) {
      toast.error("Pilih tabel untuk filter.");
      return;
    }
    const columnSlug =
      newScopeCategory === "cell_value_changed" ? newScopeColumnSlug : "";
    const duplicate = scopes.some(
      (s) =>
        s.category === newScopeCategory &&
        s.virtualTableId === newScopeTableId &&
        s.columnSlug === columnSlug
    );
    if (duplicate) {
      toast.error("Filter ini sudah ada.");
      return;
    }
    setScopes((prev) => [
      ...prev,
      {
        category: newScopeCategory,
        virtualTableId: newScopeTableId,
        columnSlug,
      },
    ]);
  };

  const save = () => {
    const fd = new FormData();
    fd.set("preferences", JSON.stringify(rows));
    fd.set("scopes", JSON.stringify(scopes));
    startTransition(async () => {
      const res = await saveNotificationPreferencesAction(fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Preferensi notifikasi disimpan");
      onOpenChange(false);
    });
  };

  const scopeLabel = (scope: NotificationScopeRow) => {
    const tableName = tableNameById.get(scope.virtualTableId) ?? "Tabel";
    const catLabel =
      NOTIFICATION_PREFERENCE_META[scope.category]?.label ?? scope.category;
    const colPart =
      scope.category === "cell_value_changed" && scope.columnSlug
        ? ` · kolom ${scope.columnSlug}`
        : "";
    return `${catLabel} · ${tableName}${colPart}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,40rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atur notifikasi</DialogTitle>
          <DialogDescription>
            Pilih kategori aktivitas lonceng «Aktivitas». Filter per tabel/kolom
            opsional — kosong berarti semua tabel dalam kategori yang aktif.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Memuat…</p>
            ) : (
              rows.map((row) => {
                const meta = NOTIFICATION_PREFERENCE_META[row.category];
                return (
                  <label
                    key={row.category}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border"
                      checked={row.enabled}
                      onChange={(e) => toggle(row.category, e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {meta.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {meta.description}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Filter per tabel (opsional)</p>
            <p className="text-xs text-muted-foreground">
              Tambahkan hanya jika ingin membatasi notifikasi ke tabel atau kolom
              tertentu. Tanpa filter = semua tabel yang Anda akses.
            </p>
            {scopes.length > 0 ? (
              <ul className="space-y-1">
                {scopes.map((scope, i) => (
                  <li
                    key={`${scope.category}-${scope.virtualTableId}-${scope.columnSlug}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate">{scopeLabel(scope)}</span>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeScope(i)}
                      aria-label="Hapus filter"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                Belum ada filter — semua tabel.
              </p>
            )}
            {tables.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Tidak ada tabel virtual yang dapat difilter.
              </p>
            ) : (
              <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                <div>
                  <Label htmlFor="scope-category" className="text-xs">
                    Kategori
                  </Label>
                  <select
                    id="scope-category"
                    value={newScopeCategory}
                    onChange={(e) =>
                      setNewScopeCategory(
                        e.target.value as NotificationScopeCategory
                      )
                    }
                    className="mt-1 flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    {NOTIFICATION_SCOPE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {NOTIFICATION_PREFERENCE_META[c].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="scope-table" className="text-xs">
                    Tabel
                  </Label>
                  <select
                    id="scope-table"
                    value={newScopeTableId}
                    onChange={(e) => setNewScopeTableId(e.target.value)}
                    className="mt-1 flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                {newScopeCategory === "cell_value_changed" ? (
                  <div>
                    <Label htmlFor="scope-column" className="text-xs">
                      Kolom (kosong = semua kolom ber-flag)
                    </Label>
                    <select
                      id="scope-column"
                      value={newScopeColumnSlug}
                      onChange={(e) => setNewScopeColumnSlug(e.target.value)}
                      disabled={columnsLoading}
                      className="mt-1 flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs disabled:opacity-50"
                    >
                      <option value="">Semua kolom ber-flag</option>
                      {columnOptions.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.displayName} ({c.slug})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={addScope}
                >
                  Tambah filter
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" onClick={save} disabled={pending || loading}>
            Simpan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

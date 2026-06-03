"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import type {
  DashboardWidget,
  DashboardWidgetType,
  VirtualDashboardRow,
} from "./virtual-dashboard-types";
import { DASHBOARD_WIDGET_TYPES } from "./virtual-dashboard-types";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import {
  ensureVirtualDashboardAction,
  saveVirtualDashboardWidgetsAction,
} from "./virtual-dashboard-actions";
import { fetchVirtualRowsAction } from "./virtual-table-actions";
import { VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE } from "@/lib/virtual-table-import-limits";
import {
  barByGroupCounts,
  countRows,
  statusPieCounts,
} from "./virtual-dashboard-lib";
import type { VirtualDataRow } from "./virtual-table-types";

const CARD_CLASS =
  "rounded-xl border border-border bg-card shadow-sm bg-gradient-to-b from-card to-muted/20";

type Props = {
  projectId: string;
  projectName: string;
  virtualTables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
};

function SimpleStatusPie({
  todo,
  inProgress,
  done,
}: {
  todo: number;
  inProgress: number;
  done: number;
}) {
  const total = todo + inProgress + done;
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada data status.</p>;
  }
  const segments = [
    { n: todo, color: "bg-gray-400", label: "To Do" },
    { n: inProgress, color: "bg-amber-400", label: "On Progress" },
    { n: done, color: "bg-green-500", label: "Done" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((s) =>
          s.n > 0 ? (
            <div
              key={s.label}
              className={s.color}
              style={{ width: `${(s.n / total) * 100}%` }}
              title={`${s.label}: ${s.n}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
            {s.label}: {s.n}
          </span>
        ))}
      </div>
    </div>
  );
}

function WidgetBody({
  widget,
  rows,
  columnsByTableId,
  tableNameById,
}: {
  widget: DashboardWidget;
  rows: VirtualDataRow[];
  columnsByTableId: Map<string, VirtualColumnRow[]>;
  tableNameById: Map<string, string>;
}) {
  const cfg = widget.config as Record<string, string | undefined>;

  if (widget.type === "header") {
    return (
      <p className="text-lg font-semibold text-foreground">
        {String(cfg.text ?? widget.title)}
      </p>
    );
  }

  if (widget.type === "stat") {
    const n = countRows(rows, {
      column: cfg.filter_column,
      value: cfg.filter_value,
    });
    return (
      <div>
        <p className="text-4xl font-bold tabular-nums text-foreground">{n}</p>
        {cfg.filter_column && cfg.filter_value ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {cfg.filter_column} = {cfg.filter_value}
          </p>
        ) : null}
      </div>
    );
  }

  if (widget.type === "status_pie") {
    const col = cfg.status_column ?? "";
    const counts = statusPieCounts(rows, col);
    return (
      <SimpleStatusPie
        todo={counts.todo}
        inProgress={counts.inProgress}
        done={counts.done + counts.other}
      />
    );
  }

  if (widget.type === "bar_by_group") {
    const bars = barByGroupCounts(
      rows,
      cfg.group_column ?? "",
      cfg.status_column ?? "",
      cfg.count_when ?? "Done"
    );
    if (bars.length === 0) {
      return <p className="text-sm text-muted-foreground">Tidak ada data.</p>;
    }
    const max = Math.max(...bars.map((b) => b.count), 1);
    return (
      <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
        {bars.map((b) => (
          <div key={b.label} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="truncate text-foreground">{b.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {b.count}/{b.total}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (widget.type === "table_preview") {
    const tableId = cfg.table_id ?? "";
    const cols = columnsByTableId.get(tableId) ?? [];
    const showCols = cols.slice(0, 4);
    const limit = Math.min(Number(cfg.limit) || 8, 20);
    const preview = rows.slice(0, limit);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              {showCols.map((c) => (
                <th key={c.id} className="px-2 py-1 font-medium">
                  {c.display_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row) => (
              <tr key={row.id} className="border-b border-border/50">
                {showCols.map((c) => (
                  <td key={c.id} className="max-w-[140px] truncate px-2 py-1">
                    {formatPreview(row.payload[c.slug])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {preview.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Tabel kosong.</p>
        ) : null}
        <p className="mt-2 text-[10px] text-muted-foreground">
          {tableNameById.get(tableId) ?? "Tabel"} · {rows.length} baris
        </p>
      </div>
    );
  }

  return null;
}

function formatPreview(val: unknown): string {
  if (val == null || val === "") return "—";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return "…";
  return String(val);
}

function WidgetCard({
  widget,
  rows,
  columnsByTableId,
  tableNameById,
  editing,
  onRemove,
}: {
  widget: DashboardWidget;
  rows: VirtualDataRow[];
  columnsByTableId: Map<string, VirtualColumnRow[]>;
  tableNameById: Map<string, string>;
  editing: boolean;
  onRemove: () => void;
}) {
  const w = Math.min(4, Math.max(1, widget.w ?? 1));
  return (
    <div
      className={`${CARD_CLASS} relative flex flex-col p-4`}
      style={{ gridColumn: `span ${w} / span ${w}` }}
    >
      {editing ? (
        <button
          type="button"
          className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          title="Hapus widget"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {widget.type !== "header" ? (
        <p className="mb-2 text-sm font-medium text-muted-foreground">{widget.title}</p>
      ) : null}
      <WidgetBody
        widget={widget}
        rows={rows}
        columnsByTableId={columnsByTableId}
        tableNameById={tableNameById}
      />
    </div>
  );
}

export function VirtualDashboardView({
  projectId,
  projectName,
  virtualTables,
  virtualColumns,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedProjectIdRef = useRef<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [dashboard, setDashboard] = useState<VirtualDashboardRow | null>(null);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [editing, setEditing] = useState(false);
  const [rowsByTable, setRowsByTable] = useState<Map<string, VirtualDataRow[]>>(new Map());
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState<DashboardWidgetType>("stat");
  const [newTitle, setNewTitle] = useState("");
  const [newTableId, setNewTableId] = useState("");
  const [newStatusCol, setNewStatusCol] = useState("");
  const [newGroupCol, setNewGroupCol] = useState("");
  const [newHeaderText, setNewHeaderText] = useState("");
  const [newW, setNewW] = useState(2);

  const projectTables = useMemo(
    () => virtualTables.filter((t) => t.project_id === projectId),
    [virtualTables, projectId]
  );

  const allPickerTables = useMemo(
    () => virtualTables,
    [virtualTables]
  );

  const columnsByTableId = useMemo(() => {
    const m = new Map<string, VirtualColumnRow[]>();
    for (const t of virtualTables) {
      m.set(
        t.id,
        virtualColumns.filter((c) => c.table_id === t.id).sort((a, b) => a.position - b.position)
      );
    }
    return m;
  }, [virtualTables, virtualColumns]);

  const tableNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of virtualTables) m.set(t.id, t.display_name);
    return m;
  }, [virtualTables]);

  const loadDashboard = useCallback(() => {
    if (!projectId) {
      setLoading(false);
      setLoadError(null);
      setDashboard(null);
      setWidgets([]);
      loadedProjectIdRef.current = null;
      return () => undefined;
    }

    const showSpinner = loadedProjectIdRef.current !== projectId;
    if (showSpinner) {
      setLoading(true);
      setLoadError(null);
    }

    let cancelled = false;
    void ensureVirtualDashboardAction(projectId)
      .then(async (res) => {
        if (cancelled) return;
        if (res.error) {
          setLoadError(res.error);
          toast.error(res.error);
          return;
        }
        const d = res.dashboard;
        setDashboard(d);
        setWidgets(d?.widgets ?? []);
        setLoadError(null);
        loadedProjectIdRef.current = projectId;

        const tableIds = new Set<string>();
        for (const w of d?.widgets ?? []) {
          const c = w.config as { table_id?: string };
          if (c.table_id) tableIds.add(c.table_id);
        }
        const next = new Map<string, VirtualDataRow[]>();
        await Promise.all(
          [...tableIds].map(async (tid) => {
            const r = await fetchVirtualRowsAction(tid, {
              limit: VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
              offset: 0,
            });
            if (!r.error) next.set(tid, r.rows as VirtualDataRow[]);
          })
        );
        if (!cancelled) setRowsByTable(next);
      })
      .catch(() => {
        if (cancelled) return;
        const msg = "Gagal memuat dashboard";
        setLoadError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  useEffect(() => {
    return loadDashboard();
  }, [loadDashboard]);

  const refreshRowsForWidgets = useCallback(async (list: DashboardWidget[]) => {
    const tableIds = new Set<string>();
    for (const w of list) {
      const c = w.config as { table_id?: string };
      if (c.table_id) tableIds.add(c.table_id);
    }
    const next = new Map(rowsByTable);
    await Promise.all(
      [...tableIds].map(async (tid) => {
        if (next.has(tid)) return;
        const r = await fetchVirtualRowsAction(tid, {
          limit: VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE,
          offset: 0,
        });
        if (!r.error) next.set(tid, r.rows as VirtualDataRow[]);
      })
    );
    setRowsByTable(next);
  }, [rowsByTable]);

  const getRowsForWidget = (widget: DashboardWidget): VirtualDataRow[] => {
    const tid = (widget.config as { table_id?: string }).table_id;
    if (!tid) return [];
    return rowsByTable.get(tid) ?? [];
  };

  const saveWidgets = () => {
    if (!dashboard) return;
    const fd = new FormData();
    fd.set("dashboard_id", dashboard.id);
    fd.set("widgets", JSON.stringify(widgets));
    startTransition(async () => {
      const r = await saveVirtualDashboardWidgetsAction(fd);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Dashboard disimpan");
        setEditing(false);
        router.refresh();
      }
    });
  };

  const addWidget = () => {
    const id = crypto.randomUUID();
    let config: DashboardWidget["config"];

    if (newType === "header") {
      config = { text: newHeaderText.trim() || "Judul" };
    } else {
      if (!newTableId) {
        toast.error("Pilih tabel sumber");
        return;
      }
      if (newType === "stat") {
        config = { table_id: newTableId };
      } else if (newType === "status_pie") {
        if (!newStatusCol) {
          toast.error("Pilih kolom status");
          return;
        }
        config = { table_id: newTableId, status_column: newStatusCol };
      } else if (newType === "bar_by_group") {
        if (!newGroupCol || !newStatusCol) {
          toast.error("Pilih kolom grup dan status");
          return;
        }
        config = {
          table_id: newTableId,
          group_column: newGroupCol,
          status_column: newStatusCol,
          count_when: "Done",
        };
      } else {
        config = { table_id: newTableId, limit: 8 };
      }
    }

    const title =
      newTitle.trim() ||
      (newType === "header"
        ? newHeaderText.trim()
        : tableNameById.get(newTableId) ?? "Widget");

    const next = [
      ...widgets,
      { id, type: newType, title, w: newW, config },
    ];
    setWidgets(next);
    void refreshRowsForWidgets(next);
    setAddOpen(false);
    setNewTitle("");
    setNewHeaderText("");
  };

  const colsForPicker = newTableId ? columnsByTableId.get(newTableId) ?? [] : [];
  const selectCols = colsForPicker.filter((c) => c.data_type === "select");

  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Spinner className="size-5" /> Memuat dashboard…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mt-6 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm">
        <p className="font-medium text-destructive">Gagal memuat dashboard</p>
        <p className="text-muted-foreground">{loadError}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            loadedProjectIdRef.current = null;
            setReloadToken((t) => t + 1);
          }}
        >
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{projectName}</h2>
          <p className="text-sm text-muted-foreground">Dashboard custom</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Widget
              </Button>
              <Button size="sm" onClick={saveWidgets} disabled={pending}>
                <Save className="mr-1 h-3.5 w-3.5" /> Simpan
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setWidgets(dashboard?.widgets ?? []);
                  setEditing(false);
                }}
              >
                Batal
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit layout
            </Button>
          )}
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className={`${CARD_CLASS} p-8 text-center`}>
          <p className="text-sm text-muted-foreground">
            Belum ada widget. Klik <strong>Edit layout</strong> lalu tambah widget.
          </p>
          {projectTables.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Buat tabel project dulu di sidebar (Tabel Project).
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {widgets.map((w) => (
            <WidgetCard
              key={w.id}
              widget={w}
              rows={getRowsForWidget(w)}
              columnsByTableId={columnsByTableId}
              tableNameById={tableNameById}
              editing={editing}
              onRemove={() => setWidgets((prev) => prev.filter((x) => x.id !== w.id))}
            />
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah widget</DialogTitle>
            <DialogDescription>
              Pilih jenis widget dan sumber data dari tabel custom.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Jenis</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={newType}
                onChange={(e) => setNewType(e.target.value as DashboardWidgetType)}
              >
                {DASHBOARD_WIDGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} — {t.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Judul widget</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Opsional" />
            </div>
            <div className="space-y-1">
              <Label>Lebar (1–4 kolom)</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={newW}
                onChange={(e) => setNewW(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            {newType === "header" ? (
              <div className="space-y-1">
                <Label>Teks judul</Label>
                <Input
                  value={newHeaderText}
                  onChange={(e) => setNewHeaderText(e.target.value)}
                  placeholder="Contoh: Ringkasan Progres"
                />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Tabel sumber</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={newTableId}
                    onChange={(e) => {
                      setNewTableId(e.target.value);
                      setNewStatusCol("");
                      setNewGroupCol("");
                    }}
                  >
                    <option value="">— Pilih —</option>
                    {allPickerTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.display_name}
                        {t.organization_id ? " (Org)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {(newType === "status_pie" || newType === "bar_by_group") && (
                  <div className="space-y-1">
                    <Label>Kolom status (pilihan)</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={newStatusCol}
                      onChange={(e) => setNewStatusCol(e.target.value)}
                    >
                      <option value="">— Pilih —</option>
                      {selectCols.map((c) => (
                        <option key={c.id} value={c.slug}>
                          {c.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {newType === "bar_by_group" && (
                  <div className="space-y-1">
                    <Label>Kolom grup</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={newGroupCol}
                      onChange={(e) => setNewGroupCol(e.target.value)}
                    >
                      <option value="">— Pilih —</option>
                      {selectCols.map((c) => (
                        <option key={c.id} value={c.slug}>
                          {c.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            <Button type="button" onClick={addWidget}>
              Tambahkan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

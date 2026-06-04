"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { saveVirtualRowCell } from "@/lib/virtual-table-row-cell";
import { emitVirtualTableRowsMutated } from "@/lib/workspace-virtual-table-mutations";
import {
  fetchOrgMembersAction,
  fetchRelationTargetRowsAction,
  resolveRelationLabelsAction,
} from "./virtual-table-actions";
import type { VirtualColumnRow } from "./virtual-table-types";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";

type Props = {
  rowId: string;
  tableId: string;
  columns: VirtualColumnRow[];
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  organizationId: string | null;
};

function fileUrlFromValue(val: unknown): string | null {
  if (typeof val === "string" && val.trim()) return val.trim();
  if (val && typeof val === "object" && "url" in val) {
    const url = String((val as { url?: unknown }).url ?? "").trim();
    return url || null;
  }
  return null;
}

export function WorkspaceMobileRowDetailForm({
  rowId,
  tableId,
  columns,
  rowPayload: rowPayloadProp,
  relationLabels: relationLabelsProp = {},
  memberNameByUserId,
  organizationId,
}: Props) {
  const { patchRowPanel } = useWorkspaceRightPanel();
  const [payload, setPayload] = useState<Record<string, unknown>>(
    () => rowPayloadProp ?? {}
  );
  const [relationLabels, setRelationLabels] =
    useState<Record<string, string>>(relationLabelsProp);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPayload(rowPayloadProp ?? {});
  }, [rowId, rowPayloadProp]);

  useEffect(() => {
    setRelationLabels(relationLabelsProp);
  }, [rowId, relationLabelsProp]);

  const visibleCols = useMemo(
    () =>
      [...columns]
        .filter((c) => c.data_type !== "geometry")
        .sort((a, b) => a.position - b.position),
    [columns]
  );

  const geometryCols = useMemo(
    () => columns.filter((c) => c.data_type === "geometry"),
    [columns]
  );

  const selectOptionsBySlug = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const col of columns) {
      if (col.data_type === "select" && col.config?.options) {
        m.set(col.slug, col.config.options as string[]);
      }
    }
    return m;
  }, [columns]);

  const saveCell = useCallback(
    (colSlug: string, value: string) => {
      setSavingSlug(colSlug);
      startTransition(async () => {
        const r = await saveVirtualRowCell(rowId, colSlug, value);
        setSavingSlug(null);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        let parsed: unknown = value;
        try {
          parsed = JSON.parse(value);
        } catch {
          parsed = value;
        }
        setPayload((prev) => {
          const next = { ...prev };
          if (parsed == null || parsed === "") {
            delete next[colSlug];
          } else {
            next[colSlug] = parsed;
          }
          patchRowPanel({ rowPayload: next });
          emitVirtualTableRowsMutated(tableId);
          return next;
        });
      });
    },
    [rowId, patchRowPanel, tableId]
  );

  const refreshRelationLabels = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const res = await resolveRelationLabelsAction(ids);
      if (!res.error && res.labels) {
        const merged = { ...relationLabels, ...res.labels };
        setRelationLabels(merged);
        patchRowPanel({ relationLabels: merged });
      }
    },
    [relationLabels, patchRowPanel]
  );

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      {visibleCols.length === 0 && geometryCols.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tidak ada kolom untuk ditampilkan.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleCols.map((col) => (
            <FieldBlock
              key={col.id}
              col={col}
              value={payload[col.slug]}
              saving={savingSlug === col.slug || (isPending && savingSlug === col.slug)}
              relationLabels={relationLabels}
              memberNameByUserId={memberNameByUserId}
              selectOptions={selectOptionsBySlug.get(col.slug) ?? []}
              organizationId={organizationId}
              onSave={(v) => saveCell(col.slug, v)}
              onRefreshRelationLabels={refreshRelationLabels}
            />
          ))}
          {geometryCols.map((col) => {
            const val = payload[col.slug];
            const hasGeo =
              val != null && val !== "" && typeof val === "object";
            return (
              <div
                key={col.id}
                className="rounded-lg border border-border bg-muted/30 px-3 py-3"
              >
                <Label className="text-sm font-medium text-muted-foreground">
                  {col.display_name}
                </Label>
                <p className="mt-2 text-sm text-foreground">
                  {hasGeo ? "Geometri tersimpan" : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Edit geometri lewat tab Peta atau desktop.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FieldBlock({
  col,
  value,
  saving,
  relationLabels,
  memberNameByUserId,
  selectOptions,
  organizationId,
  onSave,
  onRefreshRelationLabels,
}: {
  col: VirtualColumnRow;
  value: unknown;
  saving: boolean;
  relationLabels: Record<string, string>;
  memberNameByUserId: Map<string, string>;
  selectOptions: string[];
  organizationId: string | null;
  onSave: (value: string) => void;
  onRefreshRelationLabels: (ids: string[]) => Promise<void>;
}) {
  const label = (
    <div className="flex items-center gap-2">
      <Label className="text-sm font-medium text-muted-foreground">
        {col.display_name}
        {col.is_required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {saving ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
    </div>
  );

  const wrap = (children: React.ReactNode) => (
    <div className="rounded-lg border border-border bg-card px-3 py-3 shadow-sm">
      {label}
      <div className="mt-2">{children}</div>
    </div>
  );

  if (col.data_type === "checkbox") {
    return wrap(
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={value === true}
          disabled={saving}
          className="size-5 rounded border-border"
          onChange={() =>
            onSave(value === true ? "false" : "true")
          }
        />
        <span className="text-sm text-foreground">
          {value === true ? "Ya" : "Tidak"}
        </span>
      </label>
    );
  }

  if (col.data_type === "select") {
    const isMulti = col.config?.is_multi === true;
    if (isMulti) {
      const selected: string[] = Array.isArray(value)
        ? (value as string[])
        : typeof value === "string" && value
          ? [value]
          : [];
      return wrap(
        <div className="space-y-2">
          {selectOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada opsi</p>
          ) : (
            selectOptions.map((opt) => {
              const active = selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex min-h-10 items-center gap-3 rounded-md border border-border/60 px-2"
                >
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={saving}
                    className="size-4 rounded border-border"
                    onChange={() => {
                      const next = active
                        ? selected.filter((s) => s !== opt)
                        : [...selected, opt];
                      onSave(JSON.stringify(next));
                    }}
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              );
            })
          )}
        </div>
      );
    }
    const current = value != null ? String(value) : "";
    return wrap(
      <select
        value={current}
        disabled={saving}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
        onChange={(e) => onSave(e.target.value)}
      >
        <option value="">—</option>
        {selectOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (col.data_type === "relation") {
    return wrap(
      <RelationField
        col={col}
        value={value}
        relationLabels={relationLabels}
        saving={saving}
        onSave={onSave}
        onRefreshRelationLabels={onRefreshRelationLabels}
      />
    );
  }

  if (col.data_type === "user") {
    return wrap(
      <UserField
        value={value}
        memberNameByUserId={memberNameByUserId}
        organizationId={organizationId}
        saving={saving}
        onSave={onSave}
      />
    );
  }

  if (col.data_type === "file") {
    const url = fileUrlFromValue(value);
    const readOnlyObject =
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value);
    if (readOnlyObject && url) {
      return wrap(
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-sm text-primary underline"
        >
          {url}
        </a>
      );
    }
    return wrap(
      <Input
        type="url"
        className="h-11 text-base"
        defaultValue={url ?? ""}
        disabled={saving}
        placeholder="URL file"
        onBlur={(e) => {
          if (e.target.value !== (url ?? "")) onSave(e.target.value);
        }}
      />
    );
  }

  if (col.data_type === "number") {
    return wrap(
      <Input
        type="number"
        inputMode="decimal"
        className="h-11 text-base"
        defaultValue={value != null ? String(value) : ""}
        disabled={saving}
        onBlur={(e) => {
          const prev = value != null ? String(value) : "";
          if (e.target.value !== prev) onSave(e.target.value);
        }}
      />
    );
  }

  if (col.data_type === "date") {
    const dateVal =
      typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}/)
        ? value.slice(0, 10)
        : "";
    return wrap(
      <Input
        type="date"
        className="h-11 text-base"
        defaultValue={dateVal}
        disabled={saving}
        onBlur={(e) => {
          if (e.target.value !== dateVal) onSave(e.target.value);
        }}
      />
    );
  }

  if (col.data_type === "url") {
    return wrap(
      <Input
        type="url"
        className="h-11 text-base"
        defaultValue={value != null ? String(value) : ""}
        disabled={saving}
        placeholder="https://"
        onBlur={(e) => {
          const prev = value != null ? String(value) : "";
          if (e.target.value !== prev) onSave(e.target.value);
        }}
      />
    );
  }

  return wrap(
    <Input
      type="text"
      className="h-11 text-base"
      defaultValue={value != null ? String(value) : ""}
      disabled={saving}
      onBlur={(e) => {
        const prev = value != null ? String(value) : "";
        if (e.target.value !== prev) onSave(e.target.value);
      }}
    />
  );
}

function RelationField({
  col,
  value,
  relationLabels,
  saving,
  onSave,
  onRefreshRelationLabels,
}: {
  col: VirtualColumnRow;
  value: unknown;
  relationLabels: Record<string, string>;
  saving: boolean;
  onSave: (value: string) => void;
  onRefreshRelationLabels: (ids: string[]) => Promise<void>;
}) {
  const targetTableId = col.config?.target_table_id as string | undefined;
  const isMulti = col.config?.is_multi === true;
  const ids: string[] = Array.isArray(value)
    ? (value as string[])
    : typeof value === "string" && value
      ? [value]
      : [];
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !targetTableId) return;
    setLoading(true);
    void fetchRelationTargetRowsAction(targetTableId).then((res) => {
      if (!res.error) setRows(res.rows);
      else toast.error(res.error);
      setLoading(false);
    });
  }, [open, targetTableId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q));
  }, [rows, search]);

  const apply = async (nextIds: string[]) => {
    const val = isMulti ? JSON.stringify(nextIds) : nextIds[0] ?? "";
    onSave(val);
    await onRefreshRelationLabels(nextIds);
    if (!isMulti) setOpen(false);
  };

  const summary =
    ids.length === 0
      ? "Kosong"
      : ids.map((id) => relationLabels[id] ?? id.slice(0, 8)).join(", ");

  return (
    <>
      <button
        type="button"
        disabled={saving || !targetTableId}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm"
        onClick={() => {
          if (!targetTableId) {
            toast.error(`Kolom "${col.display_name}" belum dikonfigurasi.`);
            return;
          }
          setOpen(true);
        }}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} side="bottom">
        <SheetContent side="bottom" className="h-[min(85dvh,100%)] gap-0 p-0">
          <div className="border-b border-border px-4 py-3">
            <p className="font-semibold">{col.display_name}</p>
            <Input
              className="mt-2 h-10"
              placeholder="Cari…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Tidak ada baris
              </p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((r) => {
                  const active = ids.includes(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full min-h-11 items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                          active ? "bg-primary/10 font-medium" : "hover:bg-muted"
                        )}
                        onClick={() => {
                          if (isMulti) {
                            const next = active
                              ? ids.filter((id) => id !== r.id)
                              : [...ids, r.id];
                            void apply(next);
                          } else {
                            void apply([r.id]);
                          }
                        }}
                      >
                        {r.label}
                        {active ? (
                          <Badge variant="secondary" className="text-xs">
                            Dipilih
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {isMulti ? (
            <div className="border-t border-border p-3">
              <Button
                type="button"
                className="w-full"
                onClick={() => setOpen(false)}
              >
                Selesai
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function UserField({
  value,
  memberNameByUserId,
  organizationId,
  saving,
  onSave,
}: {
  value: unknown;
  memberNameByUserId: Map<string, string>;
  organizationId: string | null;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const userId = typeof value === "string" && value ? value : null;
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !organizationId) return;
    setLoading(true);
    void fetchOrgMembersAction(organizationId).then((res) => {
      if (!res.error) setMembers(res.members);
      else toast.error(res.error);
      setLoading(false);
    });
  }, [open, organizationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.label.toLowerCase().includes(q));
  }, [members, search]);

  const display = userId
    ? memberNameByUserId.get(userId) ?? userId.slice(0, 8)
    : "Kosong";

  return (
    <>
      <button
        type="button"
        disabled={saving || !organizationId}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm"
        onClick={() => setOpen(true)}
      >
        <span>{display}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} side="bottom">
        <SheetContent side="bottom" className="h-[min(85dvh,100%)] gap-0 p-0">
          <div className="border-b border-border px-4 py-3">
            <p className="font-semibold">Pilih pengguna</p>
            <Input
              className="mt-2 h-10"
              placeholder="Cari…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : (
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    className="flex w-full min-h-11 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onSave("");
                      setOpen(false);
                    }}
                  >
                    Kosong
                  </button>
                </li>
                {filtered.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full min-h-11 rounded-lg px-3 py-2 text-left text-sm",
                        userId === m.id
                          ? "bg-primary/10 font-medium"
                          : "hover:bg-muted"
                      )}
                      onClick={() => {
                        onSave(m.id);
                        setOpen(false);
                      }}
                    >
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { VirtualColumnRow, VirtualTableRow } from "./virtual-table-types";
import type { ProjectEntity360Profile } from "@/lib/project-entity-360-profile";
import {
  EMPTY_ENTITY_360_PROFILE,
  buildGeometryPathOptions,
  geometryPathKeyFromProfile,
  isEntity360ProfileCustomized,
  panelTableIdsFromProfile,
  profileFromGeometryPathKey,
  profileWithPanelTableIds,
  type GeometryPathOption,
} from "@/lib/project-entity-360-profile";
import {
  fetchProjectEntity360ProfileAction,
  updateProjectEntity360ProfileAction,
} from "./project-entity-360-profile-actions";
import { clearEntity360PanelCache } from "@/lib/virtual-table-entity-360";
import { tableHasGeometryColumn } from "@/lib/virtual-table-find-on-map";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  /** Profil dari bootstrap — untuk status awal sebelum fetch. */
  initialProfile?: ProjectEntity360Profile;
  onSaved?: (profile: ProjectEntity360Profile) => void;
};

export function WorkspaceEntity360ProfileDialog({
  open,
  onOpenChange,
  projectId,
  projectTables,
  virtualColumns,
  initialProfile,
  onSaved,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [profile, setProfile] = useState<ProjectEntity360Profile>({
    ...EMPTY_ENTITY_360_PROFILE,
  });
  const [geometryPathKey, setGeometryPathKey] = useState("");
  const [panelAuto, setPanelAuto] = useState(true);
  const [panelTableIds, setPanelTableIds] = useState<string[]>([]);

  const columnsByTableId = useMemo(() => {
    const map = new Map<string, VirtualColumnRow[]>();
    for (const col of virtualColumns) {
      if (!projectTables.some((t) => t.id === col.table_id)) continue;
      const list = map.get(col.table_id) ?? [];
      list.push(col);
      map.set(col.table_id, list);
    }
    for (const [tableId, cols] of map) {
      map.set(
        tableId,
        [...cols].sort((a, b) => a.position - b.position)
      );
    }
    return map;
  }, [virtualColumns, projectTables]);

  const tableHasGeometry = useCallback(
    (tableId: string) =>
      tableHasGeometryColumn(columnsByTableId.get(tableId) ?? []),
    [columnsByTableId]
  );

  const geometryPathOptions = useMemo(
    () =>
      buildGeometryPathOptions({
        projectTables,
        columnsByTableId,
        tableHasGeometry,
      }),
    [projectTables, columnsByTableId, tableHasGeometry]
  );

  const hasGeometryPaths = geometryPathOptions.length > 0;

  const applyProfileToForm = useCallback(
    (p: ProjectEntity360Profile, pathOptions: GeometryPathOption[]) => {
      setProfile(p);
      setGeometryPathKey(geometryPathKeyFromProfile(p, pathOptions));
      const ids = panelTableIdsFromProfile(p);
      setPanelAuto(ids.length === 0);
      setPanelTableIds(ids);
    },
    []
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const result = await fetchProjectEntity360ProfileAction(projectId);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    applyProfileToForm(result.profile, geometryPathOptions);
    setAdvancedOpen(isEntity360ProfileCustomized(result.profile));
  }, [projectId, applyProfileToForm, geometryPathOptions]);

  useEffect(() => {
    if (!open) return;
    if (initialProfile) {
      applyProfileToForm(initialProfile, geometryPathOptions);
      setAdvancedOpen(isEntity360ProfileCustomized(initialProfile));
    }
    void loadProfile();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncProfileFromForm = (): ProjectEntity360Profile => {
    const geom = profileFromGeometryPathKey(geometryPathKey, geometryPathOptions);
    let next: ProjectEntity360Profile = {
      anchor_table_id: geom.anchor_table_id,
      geometry_holder: geom.geometry_holder,
      panel_sections: [],
    };
    if (!panelAuto) {
      next = profileWithPanelTableIds(next, panelTableIds);
    }
    return next;
  };

  const handleSave = async () => {
    const normalized = syncProfileFromForm();
    setSaving(true);
    const result = await updateProjectEntity360ProfileAction({
      projectId,
      profile: normalized,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setProfile(normalized);
    clearEntity360PanelCache();
    onSaved?.(normalized);
    router.refresh();
    toast.success(
      isEntity360ProfileCustomized(normalized)
        ? "Penyesuaian disimpan."
        : "Kembali ke deteksi otomatis."
    );
    onOpenChange(false);
  };

  const handleResetAutomatic = async () => {
    setSaving(true);
    const result = await updateProjectEntity360ProfileAction({
      projectId,
      profile: {},
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    applyProfileToForm({}, geometryPathOptions);
    setAdvancedOpen(false);
    clearEntity360PanelCache();
    onSaved?.({});
    router.refresh();
    toast.success("Kembali ke deteksi otomatis.");
    onOpenChange(false);
  };

  const togglePanelTable = (tableId: string, checked: boolean) => {
    setPanelTableIds((prev) => {
      if (checked) {
        return prev.includes(tableId) ? prev : [...prev, tableId];
      }
      return prev.filter((id) => id !== tableId);
    });
  };

  const movePanelTable = (index: number, direction: "up" | "down") => {
    setPanelTableIds((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const customized = isEntity360ProfileCustomized(profile);
  const showSimpleOnly = !advancedOpen && !customized && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,40rem)] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4 shrink-0" aria-hidden />
            Relasi peta & panel 360°
          </DialogTitle>
          <DialogDescription>
            Atur bagaimana baris tanpa peta menemukan poligon, dan tabel apa
            yang tampil saat klik di Spasial.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Memuat…
            </div>
          ) : showSimpleOnly ? (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Sparkles
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden
                />
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground">
                    Relasi dan peta dideteksi otomatis
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    <li>
                      <strong className="font-medium text-foreground">
                        Tunjukkan di peta
                      </strong>
                      : relasi pertama ke tabel yang punya geometri
                    </li>
                    <li>
                      <strong className="font-medium text-foreground">
                        Panel 360°
                      </strong>
                      : semua tabel terkait terdekat (1 langkah)
                    </li>
                  </ul>
                  <p className="text-muted-foreground">
                    Cukup untuk kebanyakan project. Sesuaikan hanya jika hasilnya
                    salah atau panel terlalu penuh.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setAdvancedOpen(true)}
                disabled={!hasGeometryPaths && projectTables.length === 0}
              >
                Sesuaikan…
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {customized ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
                  <span>Penyesuaian aktif untuk project ini</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => void handleResetAutomatic()}
                    disabled={saving}
                  >
                    Kembali ke otomatis
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-mt-1 h-8 px-0 text-muted-foreground"
                  onClick={() => setAdvancedOpen(false)}
                >
                  ← Kembali ke mode otomatis
                </Button>
              )}

              {hasGeometryPaths ? (
                <div className="space-y-2">
                  <Label htmlFor="entity360-geom-path">
                    Dari tabel ini, poligon ada di mana?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Untuk <strong>Tunjukkan di peta</strong> dari tabel yang
                    tidak punya geometri sendiri.
                  </p>
                  <select
                    id="entity360-geom-path"
                    value={geometryPathKey}
                    onChange={(e) => setGeometryPathKey(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="">Deteksi otomatis (relasi pertama)</option>
                    {geometryPathOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Semua tabel project sudah punya geometri sendiri — tidak perlu
                  atur jalur ke poligon.
                </p>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Di panel 360°, tampilkan apa saja?</Label>
                  <p className="text-xs text-muted-foreground">
                    Saat klik poligon di Spasial, tabel mana yang muncul di panel
                    kanan.
                  </p>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="panel-mode"
                    checked={panelAuto}
                    onChange={() => setPanelAuto(true)}
                    className="size-4"
                  />
                  Otomatis — semua tabel terkait terdekat
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="panel-mode"
                    checked={!panelAuto}
                    onChange={() => {
                      setPanelAuto(false);
                      if (panelTableIds.length === 0 && projectTables[0]) {
                        setPanelTableIds([projectTables[0].id]);
                      }
                    }}
                    className="size-4"
                  />
                  Pilih tabel sendiri
                </label>

                {!panelAuto ? (
                  <ul className="space-y-1 rounded-md border border-border p-2">
                    {projectTables.map((table) => {
                      const checked = panelTableIds.includes(table.id);
                      const orderIndex = panelTableIds.indexOf(table.id);
                      return (
                        <li
                          key={table.id}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-1 py-1.5",
                            checked && "bg-muted/50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              togglePanelTable(table.id, e.target.checked)
                            }
                            className="size-4 shrink-0"
                            id={`panel-table-${table.id}`}
                          />
                          <label
                            htmlFor={`panel-table-${table.id}`}
                            className="min-w-0 flex-1 cursor-pointer truncate text-sm"
                          >
                            {table.display_name}
                          </label>
                          {checked ? (
                            <div className="flex shrink-0 items-center gap-0.5">
                              <GripVertical
                                className="size-3.5 text-muted-foreground"
                                aria-hidden
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={`Naikkan ${table.display_name}`}
                                disabled={orderIndex <= 0}
                                onClick={() =>
                                  movePanelTable(orderIndex, "up")
                                }
                              >
                                <ChevronUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={`Turunkan ${table.display_name}`}
                                disabled={
                                  orderIndex < 0 ||
                                  orderIndex >= panelTableIds.length - 1
                                }
                                onClick={() =>
                                  movePanelTable(orderIndex, "down")
                                }
                              >
                                <ChevronDown className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                {!panelAuto && panelTableIds.length === 0 ? (
                  <p className="text-xs text-destructive">
                    Pilih minimal satu tabel, atau kembali ke mode otomatis.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {showSimpleOnly ? "Tutup" : "Batal"}
          </Button>
          {!showSimpleOnly ? (
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={
                loading ||
                saving ||
                (!panelAuto && panelTableIds.length === 0)
              }
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Menyimpan…
                </>
              ) : (
                "Simpan"
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

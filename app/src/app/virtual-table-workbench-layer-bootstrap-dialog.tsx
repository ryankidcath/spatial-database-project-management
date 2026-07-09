"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  defaultWorkbenchLayerTableName,
  WORKBENCH_LAYER_KIND_ICONS,
  WORKBENCH_LAYER_KIND_LABELS,
  workbenchLayerKindDescription,
  type WorkbenchLayerKind,
} from "@/lib/virtual-table-workbench-layer-bootstrap";
import { bootstrapVirtualTableWorkbenchLayerAction } from "./virtual-table-actions";
import { ImportDialogShell } from "./import-dialog-shell";

export type WorkbenchLayerBootstrapCreated = {
  tableId: string;
  tableSlug: string;
  displayName: string;
  layerKind: WorkbenchLayerKind;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onCreated: (result: WorkbenchLayerBootstrapCreated) => void;
  embedded?: boolean;
  cancelLabel?: string;
  defaultKind?: WorkbenchLayerKind;
};

const KIND_OPTIONS: WorkbenchLayerKind[] = ["bidang", "jalan", "saluran"];

export function VirtualTableWorkbenchLayerBootstrapDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
  embedded = false,
  cancelLabel = "Batal",
  defaultKind = "bidang",
}: Props) {
  const [pending, startTransition] = useTransition();
  const [layerKind, setLayerKind] = useState<WorkbenchLayerKind>(defaultKind);
  const [displayName, setDisplayName] = useState(
    defaultWorkbenchLayerTableName(defaultKind)
  );
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLayerKind(defaultKind);
    setDisplayName(defaultWorkbenchLayerTableName(defaultKind));
    setDescription("");
    setMessage(null);
  }, [open, defaultKind]);

  useEffect(() => {
    setDisplayName(defaultWorkbenchLayerTableName(layerKind));
  }, [layerKind]);

  const handleSubmit = () => {
    setMessage(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("project_id", projectId);
      fd.set("layer_kind", layerKind);
      fd.set("display_name", displayName.trim());
      if (description.trim()) fd.set("description", description.trim());

      const r = await bootstrapVirtualTableWorkbenchLayerAction(fd);
      if (r.error || !r.tableId || !r.tableSlug || !r.displayName) {
        setMessage(r.error ?? "Gagal membuat tabel layer.");
        return;
      }
      onCreated({
        tableId: r.tableId,
        tableSlug: r.tableSlug,
        displayName: r.displayName,
        layerKind: r.layerKind ?? layerKind,
      });
    });
  };

  return (
    <ImportDialogShell
      embedded={embedded}
      open={open}
      onOpenChange={onOpenChange}
      title="Buat tabel layer kosong"
      description="Siapkan tabel virtual untuk digitasi di peta — tanpa mengunggah file. Cocok setelah titik lapangan diimpor."
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="font-medium text-foreground">Jenis layer</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {KIND_OPTIONS.map((kind) => (
              <label
                key={kind}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-3 transition-colors",
                  layerKind === kind
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/40"
                )}
              >
                <input
                  type="radio"
                  name="workbench-layer-kind"
                  className="sr-only"
                  checked={layerKind === kind}
                  onChange={() => setLayerKind(kind)}
                />
                <span className="text-lg leading-none">
                  {WORKBENCH_LAYER_KIND_ICONS[kind]}
                </span>
                <span className="font-medium text-foreground">
                  {WORKBENCH_LAYER_KIND_LABELS[kind]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {workbenchLayerKindDescription(kind)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="workbench-layer-name">Nama tabel</Label>
          <Input
            id="workbench-layer-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="workbench-layer-desc">
            Deskripsi <span className="text-muted-foreground">(opsional)</span>
          </Label>
          <Textarea
            id="workbench-layer-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={pending}
          />
        </div>

        {message ? (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !displayName.trim() || !projectId}
          >
            {pending ? (
              <>
                <Spinner className="mr-2 size-4" />
                Membuat…
              </>
            ) : (
              "Buat tabel layer"
            )}
          </Button>
        </div>
      </div>
    </ImportDialogShell>
  );
}

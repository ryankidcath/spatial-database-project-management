"use client";

import { Button } from "@/components/ui/button";
import { hintForLayout } from "@/lib/virtual-table-layout-hints";
import { layoutMetaFor } from "@/lib/virtual-table-layout-types";
import type { VirtualColumnDataType, VirtualColumnRow } from "./virtual-table-types";
import type { VirtualTableLayoutType } from "@/lib/virtual-table-layout-types";

type Props = {
  layout: VirtualTableLayoutType;
  columns: VirtualColumnRow[];
  onAddColumn: (dataType: VirtualColumnDataType, suggestedName: string) => void;
  className?: string;
};

/** Empty state saat layout dipilih tapi schema belum memenuhi syarat. */
export function TableLayoutSchemaPrompt({
  layout,
  columns,
  onAddColumn,
  className,
}: Props) {
  const hint = hintForLayout(layout, columns);
  if (!hint) return null;
  const meta = layoutMetaFor(layout);

  return (
    <div
      className={className}
      data-testid="table-layout-schema-prompt"
      role="status"
    >
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
        <p className="text-sm font-medium text-foreground">
          {meta.label} membutuhkan kolom tambahan
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{hint.message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          data-testid="table-layout-add-column-cta"
          onClick={() => onAddColumn(hint.dataType, hint.suggestedName)}
        >
          Tambah kolom
        </Button>
      </div>
    </div>
  );
}

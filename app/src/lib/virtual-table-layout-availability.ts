import type { VirtualColumnRow } from "@/app/virtual-table-types";
import type { VirtualTableLayoutType } from "@/lib/virtual-table-layout-types";
import type { VirtualViewLayoutOptions } from "@/app/virtual-table-types";

export type LayoutAvailability = {
  available: boolean;
  hint?: string;
};

export function selectColumnsOrdered(
  columns: VirtualColumnRow[]
): VirtualColumnRow[] {
  return columns
    .filter((c) => c.data_type === "select")
    .sort((a, b) => a.position - b.position);
}

export function selectColumnSlugs(columns: VirtualColumnRow[]): string[] {
  return selectColumnsOrdered(columns).map((c) => c.slug);
}

export function dateColumnsOrdered(
  columns: VirtualColumnRow[]
): VirtualColumnRow[] {
  return columns
    .filter((c) => c.data_type === "date")
    .sort((a, b) => a.position - b.position);
}

export function dateColumnSlugs(columns: VirtualColumnRow[]): string[] {
  return dateColumnsOrdered(columns).map((c) => c.slug);
}

export function fileColumnsOrdered(
  columns: VirtualColumnRow[]
): VirtualColumnRow[] {
  return columns
    .filter((c) => c.data_type === "file")
    .sort((a, b) => a.position - b.position);
}

export function fileColumnSlugs(columns: VirtualColumnRow[]): string[] {
  return fileColumnsOrdered(columns).map((c) => c.slug);
}

export function geometryColumnsOrdered(
  columns: VirtualColumnRow[]
): VirtualColumnRow[] {
  return columns
    .filter((c) => c.data_type === "geometry")
    .sort((a, b) => a.position - b.position);
}

export function geometryColumnSlugs(columns: VirtualColumnRow[]): string[] {
  return geometryColumnsOrdered(columns).map((c) => c.slug);
}

export function numberColumnsOrdered(
  columns: VirtualColumnRow[]
): VirtualColumnRow[] {
  return columns
    .filter((c) => c.data_type === "number")
    .sort((a, b) => a.position - b.position);
}

export function numberColumnSlugs(columns: VirtualColumnRow[]): string[] {
  return numberColumnsOrdered(columns).map((c) => c.slug);
}

export function chartColumnsOrdered(
  columns: VirtualColumnRow[]
): VirtualColumnRow[] {
  return [...selectColumnsOrdered(columns), ...numberColumnsOrdered(columns)];
}

export function chartColumnSlugs(columns: VirtualColumnRow[]): string[] {
  return chartColumnsOrdered(columns).map((c) => c.slug);
}

export function pickDefaultStatusColumn(
  columns: VirtualColumnRow[]
): string | null {
  return selectColumnSlugs(columns)[0] ?? null;
}

export function pickDefaultDateColumn(columns: VirtualColumnRow[]): string | null {
  return dateColumnSlugs(columns)[0] ?? null;
}

export function pickDefaultCoverColumn(columns: VirtualColumnRow[]): string | null {
  return fileColumnSlugs(columns)[0] ?? null;
}

export function pickDefaultGeometryColumn(
  columns: VirtualColumnRow[]
): string | null {
  return geometryColumnSlugs(columns)[0] ?? null;
}

export function getLayoutAvailability(
  columns: VirtualColumnRow[]
): Record<VirtualTableLayoutType, LayoutAvailability> {
  const hasSelect = selectColumnSlugs(columns).length > 0;
  const hasDate = dateColumnSlugs(columns).length > 0;
  const hasFile = fileColumnSlugs(columns).length > 0;
  const hasGeometry = geometryColumnSlugs(columns).length > 0;

  return {
    grid: { available: true },
    kanban: hasSelect
      ? { available: true }
      : {
          available: false,
          hint: "Butuh kolom pilihan (select) untuk status",
        },
    calendar: hasDate
      ? { available: true }
      : {
          available: false,
          hint: "Butuh kolom tanggal",
        },
    timeline: hasDate
      ? { available: true }
      : {
          available: false,
          hint: "Butuh kolom tanggal",
        },
    gallery: hasFile
      ? { available: true }
      : {
          available: true,
          hint: "Tanpa kolom file — kartu tanpa cover",
        },
    form: { available: true },
    map: hasGeometry
      ? { available: true }
      : {
          available: false,
          hint: "Butuh kolom geometry",
        },
    chart:
      selectColumnSlugs(columns).length > 0 ||
      numberColumnSlugs(columns).length > 0
        ? { available: true }
        : {
            available: false,
            hint: "Butuh kolom pilihan atau angka",
          },
  };
}

export function resolveLayoutOptions(
  layout: VirtualTableLayoutType,
  options: VirtualViewLayoutOptions | undefined,
  columns: VirtualColumnRow[]
): VirtualViewLayoutOptions {
  const next: VirtualViewLayoutOptions = { ...(options ?? {}) };

  if (layout === "kanban") {
    const slugs = selectColumnSlugs(columns);
    if (!next.statusColumn || !slugs.includes(next.statusColumn)) {
      next.statusColumn = slugs[0] ?? null;
    }
  }

  if (layout === "calendar" || layout === "timeline") {
    const slugs = dateColumnSlugs(columns);
    if (!next.dateColumn || !slugs.includes(next.dateColumn)) {
      next.dateColumn = slugs[0] ?? null;
    }
    if (layout === "timeline") {
      if (
        next.endDateColumn &&
        !slugs.includes(next.endDateColumn)
      ) {
        next.endDateColumn = null;
      }
      if (!next.endDateColumn && slugs.length > 1) {
        next.endDateColumn = slugs[1] ?? null;
      }
    }
  }

  if (layout === "gallery") {
    const slugs = fileColumnSlugs(columns);
    if (!next.coverColumn || !slugs.includes(next.coverColumn)) {
      next.coverColumn = slugs[0] ?? null;
    }
  }

  if (layout === "map") {
    const slugs = geometryColumnSlugs(columns);
    if (!next.geometryColumn || !slugs.includes(next.geometryColumn)) {
      next.geometryColumn = slugs[0] ?? null;
    }
  }

  if (layout === "chart") {
    const slugs = chartColumnSlugs(columns);
    if (!next.chartColumn || !slugs.includes(next.chartColumn)) {
      next.chartColumn = slugs[0] ?? null;
    }
    if (!next.chartMode) {
      const col = columns.find((c) => c.slug === next.chartColumn);
      next.chartMode =
        col?.data_type === "number"
          ? "stat"
          : selectColumnSlugs(columns).length > 0
            ? "bar"
            : "stat";
    }
  }

  return next;
}

export function isLayoutReady(
  layout: VirtualTableLayoutType,
  options: VirtualViewLayoutOptions,
  columns: VirtualColumnRow[]
): boolean {
  const availability = getLayoutAvailability(columns);
  if (!availability[layout]?.available) return false;

  if (layout === "kanban") {
    return Boolean(
      options.statusColumn &&
        selectColumnSlugs(columns).includes(options.statusColumn)
    );
  }
  if (layout === "calendar") {
    return Boolean(
      options.dateColumn && dateColumnSlugs(columns).includes(options.dateColumn)
    );
  }
  if (layout === "timeline") {
    const dates = dateColumnSlugs(columns);
    if (!options.dateColumn || !dates.includes(options.dateColumn)) {
      return false;
    }
    if (
      options.endDateColumn &&
      !dates.includes(options.endDateColumn)
    ) {
      return false;
    }
    return true;
  }
  if (layout === "gallery") {
    return true;
  }
  if (layout === "form") {
    return true;
  }
  if (layout === "map") {
    return Boolean(
      options.geometryColumn &&
        geometryColumnSlugs(columns).includes(options.geometryColumn)
    );
  }
  if (layout === "chart") {
    return true;
  }
  return layout === "grid";
}

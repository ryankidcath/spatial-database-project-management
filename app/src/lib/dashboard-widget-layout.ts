import type { DashboardWidget } from "@/app/virtual-dashboard-types";
import { DASHBOARD_GRID_COLS } from "@/app/virtual-dashboard-types";

const DEFAULT_H: Record<string, number> = {
  header: 1,
  stat: 2,
  status_pie: 4,
  value_distribution: 4,
  multi_column_chart: 4,
  bar_by_group: 4,
  table_preview: 4,
  mini_map: 5,
  spatial_summary: 3,
  spatial_shortcut: 2,
};

const DEFAULT_W: Record<string, number> = {
  header: 12,
  stat: 3,
  status_pie: 4,
  value_distribution: 4,
  multi_column_chart: 4,
  bar_by_group: 6,
  table_preview: 6,
  mini_map: 8,
  spatial_summary: 4,
  spatial_shortcut: 3,
};

function legacyWidthToGrid(w: number | undefined): number {
  const legacy = Math.min(4, Math.max(1, w ?? 2));
  return Math.round((legacy / 4) * DASHBOARD_GRID_COLS);
}

/** Normalisasi widget v1 → grid 12 kolom dengan posisi x,y,h. */
export function normalizeDashboardWidgetsLayout(
  widgets: DashboardWidget[]
): DashboardWidget[] {
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;

  return widgets.map((w) => {
    const hasV2Grid = w.x != null && w.y != null;
    const gw = hasV2Grid
      ? Math.min(
          DASHBOARD_GRID_COLS,
          Math.max(1, w.w ?? DEFAULT_W[w.type] ?? 3)
        )
      : w.w != null && w.w > 4
        ? Math.min(DASHBOARD_GRID_COLS, Math.max(1, w.w))
        : legacyWidthToGrid(w.w);
    const gh = w.h ?? DEFAULT_H[w.type] ?? 2;
    let gx = w.x;
    let gy = w.y;

    if (gx == null || gy == null) {
      if (cursorX + gw > DASHBOARD_GRID_COLS) {
        cursorX = 0;
        cursorY += rowH || 2;
        rowH = 0;
      }
      gx = cursorX;
      gy = cursorY;
      cursorX += gw;
      rowH = Math.max(rowH, gh);
    }

    return {
      ...w,
      x: gx,
      y: gy,
      w: Math.min(DASHBOARD_GRID_COLS, Math.max(1, gw)),
      h: Math.max(1, gh),
    };
  });
}

export function defaultSizeForWidgetType(type: DashboardWidget["type"]): {
  w: number;
  h: number;
} {
  return {
    w: DEFAULT_W[type] ?? 3,
    h: DEFAULT_H[type] ?? 2,
  };
}

export function nextWidgetPosition(widgets: DashboardWidget[]): {
  x: number;
  y: number;
} {
  if (widgets.length === 0) return { x: 0, y: 0 };
  let maxBottom = 0;
  for (const w of widgets) {
    const y = w.y ?? 0;
    const h = w.h ?? DEFAULT_H[w.type] ?? 2;
    maxBottom = Math.max(maxBottom, y + h);
  }
  return { x: 0, y: maxBottom };
}

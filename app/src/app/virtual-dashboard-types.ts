export type DashboardWidgetType =
  | "stat"
  | "status_pie"
  | "value_distribution"
  | "multi_column_chart"
  | "bar_by_group"
  | "table_preview"
  | "header"
  | "mini_map"
  | "spatial_summary"
  | "spatial_shortcut";

export const DASHBOARD_GRID_COLS = 12;

export const DASHBOARD_WIDGET_TYPES: {
  value: DashboardWidgetType;
  label: string;
  description: string;
}[] = [
  {
    value: "stat",
    label: "KPI / Angka",
    description: "Jumlah baris, unik, atau jumlah kolom angka",
  },
  {
    value: "value_distribution",
    label: "Distribusi nilai",
    description: "Donut dari banyak nilai dalam satu kolom pilihan (satu tahap per baris)",
  },
  {
    value: "multi_column_chart",
    label: "Chart multi-kolom",
    description: "Donut/bar seperti Excel — satu segmen per kolom (tahap paralel)",
  },
  {
    value: "status_pie",
    label: "Pie status (legacy)",
    description: "To Do / On Progress / Done — gunakan Distribusi nilai untuk tahap kerja",
  },
  {
    value: "bar_by_group",
    label: "Bar per grup",
    description: "Hitung baris per nilai grup (mis. per kecamatan)",
  },
  {
    value: "table_preview",
    label: "Cuplikan tabel",
    description: "Beberapa baris pertama dari tabel",
  },
  {
    value: "mini_map",
    label: "Mini-peta",
    description: "Peta read-only 1–2 lapisan tabel virtual",
  },
  {
    value: "spatial_summary",
    label: "Ringkasan spasial",
    description: "Jumlah poligon terpetakan & total luas",
  },
  {
    value: "spatial_shortcut",
    label: "Pintasan Spasial",
    description: "Tombol buka tab Spasial dengan filter sama",
  },
  { value: "header", label: "Judul", description: "Teks judul section" },
];

export type DashboardStatMetric = "count" | "count_distinct" | "sum";

export type StatWidgetConfig = {
  table_id: string;
  /** Default: count */
  metric?: DashboardStatMetric;
  /** Kolom untuk distinct/sum */
  column?: string;
  filter_column?: string;
  filter_value?: string;
  suffix?: string;
  prefix?: string;
};

export type StatusPieWidgetConfig = {
  table_id: string;
  status_column: string;
};

export type ValueDistributionWidgetConfig = {
  table_id: string;
  column: string;
  chart_type?: "pie" | "bar";
  /** Teks di tengah donut, mis. "Bidang" */
  center_unit?: string;
};

export type MultiColumnChartSeriesItem = {
  column: string;
  label?: string;
  /** Kosong: centang aktif / nilai tidak kosong */
  match_value?: string;
};

export type MultiColumnChartWidgetConfig = {
  table_id: string;
  series: MultiColumnChartSeriesItem[];
  chart_type?: "pie" | "bar";
  center_unit?: string;
};

export type BarByGroupWidgetConfig = {
  table_id: string;
  group_column: string;
  status_column: string;
  count_when?: string;
};

export type TablePreviewWidgetConfig = {
  table_id: string;
  limit?: number;
  /** Slug kolom tampil; kosong = 4 kolom pertama */
  columns?: string[];
};

export type HeaderWidgetConfig = {
  text: string;
};

export type MiniMapWidgetConfig = {
  table_id: string;
  geometry_column?: string;
  layer2_table_id?: string;
  layer2_geometry_column?: string;
};

export type SpatialSummaryWidgetConfig = {
  table_id: string;
  geometry_column?: string;
  /** Kolom angka luas (ha/m²); kosong = hitung dari geometri */
  area_column?: string;
};

export type SpatialShortcutWidgetConfig = {
  table_id: string;
  label?: string;
  /** Default true — salin filter global ke sesi view tabel */
  sync_filters?: boolean;
};

export type DashboardWidgetConfig =
  | StatWidgetConfig
  | StatusPieWidgetConfig
  | ValueDistributionWidgetConfig
  | MultiColumnChartWidgetConfig
  | BarByGroupWidgetConfig
  | TablePreviewWidgetConfig
  | HeaderWidgetConfig
  | MiniMapWidgetConfig
  | SpatialSummaryWidgetConfig
  | SpatialShortcutWidgetConfig;

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  title: string;
  /** Grid width 1–12 (v2). Legacy v1 used 1–4. */
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  config: DashboardWidgetConfig;
};

/** Filter global dashboard (disimpan di layout_config + nilai runtime). */
export type DashboardGlobalFilterDef = {
  table_id: string;
  column_slug: string;
};

export type DashboardGlobalFilterValue = {
  table_id: string;
  column: string;
  value: string;
};

export type DashboardLayoutConfig = {
  version?: number;
  /** Kolom yang muncul di filter bar (user bisa custom di mode Edit). */
  globalFilters?: DashboardGlobalFilterDef[];
};

export type VirtualDashboardRow = {
  id: string;
  project_id: string;
  name: string;
  widgets: DashboardWidget[];
  layout_config: DashboardLayoutConfig;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

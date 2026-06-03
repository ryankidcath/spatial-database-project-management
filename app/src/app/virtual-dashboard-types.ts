export type DashboardWidgetType =
  | "stat"
  | "status_pie"
  | "bar_by_group"
  | "table_preview"
  | "header";

export const DASHBOARD_WIDGET_TYPES: {
  value: DashboardWidgetType;
  label: string;
  description: string;
}[] = [
  { value: "stat", label: "Angka", description: "Jumlah baris di database (bukan cuplikan 50)" },
  { value: "status_pie", label: "Pie status", description: "Distribusi kolom pilihan (To Do / On Progress / Done)" },
  {
    value: "bar_by_group",
    label: "Bar per grup",
    description: "Hitung baris per nilai grup (mis. per kecamatan)",
  },
  { value: "table_preview", label: "Cuplikan tabel", description: "Beberapa baris pertama dari tabel" },
  { value: "header", label: "Judul", description: "Teks judul section" },
];

export type StatWidgetConfig = {
  table_id: string;
  filter_column?: string;
  filter_value?: string;
};

export type StatusPieWidgetConfig = {
  table_id: string;
  status_column: string;
};

export type BarByGroupWidgetConfig = {
  table_id: string;
  group_column: string;
  status_column: string;
  /** Count rows where status_column equals this (default Done). */
  count_when?: string;
};

export type TablePreviewWidgetConfig = {
  table_id: string;
  limit?: number;
};

export type HeaderWidgetConfig = {
  text: string;
};

export type DashboardWidgetConfig =
  | StatWidgetConfig
  | StatusPieWidgetConfig
  | BarByGroupWidgetConfig
  | TablePreviewWidgetConfig
  | HeaderWidgetConfig;

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  title: string;
  /** Grid width 1–4 (of 4 columns). */
  w?: number;
  config: DashboardWidgetConfig;
};

export type VirtualDashboardRow = {
  id: string;
  project_id: string;
  name: string;
  widgets: DashboardWidget[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

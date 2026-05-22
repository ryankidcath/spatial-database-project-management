export type VirtualTableRow = {
  id: string;
  project_id: string | null;
  organization_id: string | null;
  slug: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
};

export type VirtualColumnRow = {
  id: string;
  table_id: string;
  slug: string;
  display_name: string;
  data_type: VirtualColumnDataType;
  position: number;
  is_required: boolean;
  config: Record<string, unknown>;
};

export type VirtualColumnDataType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "url"
  | "user"
  | "file"
  | "relation"
  | "geometry";

export const VIRTUAL_COLUMN_DATA_TYPES: {
  value: VirtualColumnDataType;
  label: string;
}[] = [
  { value: "text", label: "Teks" },
  { value: "number", label: "Angka" },
  { value: "date", label: "Tanggal" },
  { value: "select", label: "Pilihan" },
  { value: "checkbox", label: "Centang" },
  { value: "url", label: "URL" },
  { value: "user", label: "Pengguna" },
  { value: "file", label: "File" },
  { value: "relation", label: "Relasi" },
  { value: "geometry", label: "Geometri" },
];

export type VirtualDataRow = {
  id: string;
  table_id: string;
  payload: Record<string, unknown>;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Virtual Views (saved filter/sort/group/column configs)
// ---------------------------------------------------------------------------

export type VirtualViewFilter = {
  column: string;
  operator: "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "is_empty" | "is_not_empty";
  value: string;
};

export type VirtualViewSort = {
  column: string;
  direction: "asc" | "desc";
};

export type VirtualViewConfig = {
  filters: VirtualViewFilter[];
  sorts: VirtualViewSort[];
  groupBy: string | null;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
};

export type VirtualViewRow = {
  id: string;
  table_id: string;
  name: string;
  config: VirtualViewConfig;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const VIEW_FILTER_OPERATORS: { value: VirtualViewFilter["operator"]; label: string }[] = [
  { value: "eq", label: "sama dengan" },
  { value: "neq", label: "tidak sama dengan" },
  { value: "contains", label: "mengandung" },
  { value: "not_contains", label: "tidak mengandung" },
  { value: "gt", label: "lebih dari" },
  { value: "gte", label: "lebih dari atau sama" },
  { value: "lt", label: "kurang dari" },
  { value: "lte", label: "kurang dari atau sama" },
  { value: "is_empty", label: "kosong" },
  { value: "is_not_empty", label: "tidak kosong" },
];

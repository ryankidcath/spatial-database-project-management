/** Kategori preferensi lonceng (selaras migration 0065). */
export type NotificationPreferenceCategory =
  | "workspace_membership"
  | "schema_changes"
  | "row_lifecycle"
  | "cell_value_changed"
  | "import_summary";

export type WorkspaceNotificationKind =
  | "workspace_member"
  | "workspace_project"
  | "virtual_table"
  | "virtual_column"
  | "virtual_row"
  | "virtual_import"
  | "system";

export const NOTIFICATION_PREFERENCE_DEFAULTS: Record<
  NotificationPreferenceCategory,
  boolean
> = {
  workspace_membership: true,
  schema_changes: false,
  row_lifecycle: false,
  cell_value_changed: false,
  import_summary: true,
};

export const NOTIFICATION_PREFERENCE_META: Record<
  NotificationPreferenceCategory,
  { label: string; description: string }
> = {
  workspace_membership: {
    label: "Proyek & anggota",
    description: "Proyek baru, anggota ditambahkan, dan perubahan keanggotaan.",
  },
  schema_changes: {
    label: "Tabel & kolom",
    description: "Struktur tabel virtual: kolom ditambah, diubah, atau dihapus.",
  },
  row_lifecycle: {
    label: "Baris baru / dihapus",
    description: "Baris ditambah atau dihapus (bukan import massal).",
  },
  cell_value_changed: {
    label: "Perubahan nilai kolom ber-flag",
    description:
      "Edit sel pada kolom yang PM tandai «beri tahu saat nilai berubah».",
  },
  import_summary: {
    label: "Import selesai",
    description: "Ringkasan setelah import CSV atau GeoJSON.",
  },
};

export const NOTIFICATION_PREFERENCE_CATEGORIES = Object.keys(
  NOTIFICATION_PREFERENCE_DEFAULTS
) as NotificationPreferenceCategory[];

/** Kategori yang mendukung filter per tabel/kolom (fase 3). */
export type NotificationScopeCategory = Exclude<
  NotificationPreferenceCategory,
  "workspace_membership"
>;

export const NOTIFICATION_SCOPE_CATEGORIES: NotificationScopeCategory[] = [
  "schema_changes",
  "row_lifecycle",
  "cell_value_changed",
  "import_summary",
];

export type NotificationScopeRow = {
  category: NotificationScopeCategory;
  virtualTableId: string;
  /** Kosong = seluruh tabel. */
  columnSlug: string;
};

export type VirtualTableScopeOption = {
  id: string;
  displayName: string;
};

export type VirtualColumnScopeOption = {
  slug: string;
  displayName: string;
};

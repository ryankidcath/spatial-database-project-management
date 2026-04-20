/** Baris view `spatial.v_issue_geometry_feature_map` (fitur geometri 1:N per task). */
export type IssueGeometryFeatureMapRow = {
  id: string;
  project_id: string;
  issue_id: string;
  feature_key: string;
  label: string;
  properties: unknown;
  geojson: unknown;
};

/** Gabungan baris geometri + atribut-only untuk tabel Atribut Spasial. */
export type SpatialAttributeTableRow = {
  id: string;
  issue_id: string;
  feature_key: string;
  properties: unknown;
  geometryFeatureId: string | null;
};

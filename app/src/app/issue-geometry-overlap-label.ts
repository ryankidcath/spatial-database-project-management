/**
 * Label untuk peringatan overlap: utamakan `properties.id` (unik di sumber data),
 * fallback `feature_key`, lalu `label` (sering dari Nama yang tidak unik).
 */
export function overlapDisplayLabelForIssueGeometryRow(row: {
  label: string;
  feature_key?: string;
  properties?: unknown;
}): string {
  const p = row.properties;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    const props = p as Record<string, unknown>;
    const id = props.id ?? props.ID ?? props.Id;
    if (id != null && String(id).trim() !== "") {
      return `id:${String(id).trim()}`;
    }
  }
  const fk = row.feature_key;
  if (fk != null && String(fk).trim() !== "") {
    return String(fk).trim();
  }
  return row.label;
}

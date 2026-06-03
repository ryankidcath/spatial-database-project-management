/** Breadcrumb konteks chat baris: project › tabel › label baris. */

/** Breadcrumb chat tabel: project/org › nama tabel. */
export function buildChatTablePathSegments(parts: {
  projectName?: string | null;
  organizationName?: string | null;
  tableDisplayName: string;
}): string[] {
  const segments: string[] = [];
  const project = parts.projectName?.trim();
  const org = parts.organizationName?.trim();
  const table = parts.tableDisplayName.trim();
  if (project) segments.push(project);
  else if (org) segments.push(org);
  if (table) segments.push(table);
  return segments.length > 0 ? segments : [table || "Tabel"];
}

export function buildChatRowPathSegments(parts: {
  projectName?: string | null;
  organizationName?: string | null;
  tableDisplayName: string;
  rowLabel: string;
}): string[] {
  const segments: string[] = [];
  const project = parts.projectName?.trim();
  const org = parts.organizationName?.trim();
  const table = parts.tableDisplayName.trim();
  const row = parts.rowLabel.trim() || "Baris";
  if (project) segments.push(project);
  else if (org) segments.push(org);
  if (table) segments.push(table);
  segments.push(row);
  return segments;
}

export function rowLabelFromPath(pathSegments: string[]): string {
  return pathSegments[pathSegments.length - 1]?.trim() || "Baris";
}

export const CHAT_PATH_SEGMENTS_PROP = "_chat_path_segments";

export function parseChatPathSegmentsFromProperties(
  properties: Record<string, unknown> | undefined
): string[] | null {
  const raw = properties?.[CHAT_PATH_SEGMENTS_PROP];
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const segments = parsed
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    return segments.length > 0 ? segments : null;
  } catch {
    return null;
  }
}

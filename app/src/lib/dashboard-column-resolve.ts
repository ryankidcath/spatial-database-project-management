/** Selesaikan slug kolom dari nilai tersimpan (slug atau display_name). */
export function resolveVirtualColumnSlug(
  columns: { slug: string; display_name: string }[],
  stored?: string
): string {
  const s = stored?.trim() ?? "";
  if (!s) return "";
  if (columns.some((c) => c.slug === s)) return s;
  const exact = columns.find((c) => c.display_name === s);
  if (exact) return exact.slug;
  const lower = s.toLowerCase();
  const ci = columns.find((c) => c.display_name.toLowerCase() === lower);
  return ci?.slug ?? s;
}

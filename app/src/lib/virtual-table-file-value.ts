/** URL berkas dari nilai kolom `file` (string atau `{ url }`). */
export function fileColumnUrl(val: unknown): string | null {
  if (typeof val === "string" && val.trim()) return val.trim();
  if (val && typeof val === "object" && "url" in val) {
    const url = String((val as { url?: unknown }).url ?? "").trim();
    return url || null;
  }
  return null;
}

export function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(url);
}

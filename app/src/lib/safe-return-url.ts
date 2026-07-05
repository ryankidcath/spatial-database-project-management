/** Path internal aman untuk tombol kembali dari halaman bantuan / overlay. */
export function sanitizeInternalReturnPath(
  raw: string | undefined | null
): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const decoded = decodeURIComponent(raw.trim());
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
    if (decoded.includes("://")) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function buildReturnQueryValue(pathname: string, search: string): string {
  const path = search ? `${pathname}?${search}` : pathname;
  return encodeURIComponent(path);
}

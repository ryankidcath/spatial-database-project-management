/**
 * Pola snapshot + stale-while-revalidate (PR-A → PR-G).
 *
 * 1. **Paint** — `useLayoutEffect`: baca cache durable → set state (tanpa spinner jika ada data).
 * 2. **Revalidate** — fetch server dengan `limit = resolveSnapshotFetchLimit(cached, loaded, pageSize)`
 *    agar tidak menyusut ke satu halaman setelah user pernah Muat lebih.
 * 3. **Persist** — `useEffect`: tulis state kembali ke cache saat berubah.
 *
 * Implementasi: `workspace-chat-inbox.tsx`, `workspace-mobile-virtual-table-overlay.tsx`.
 */

/** Limit fetch saat revalidate: jangan kurangi dari yang sudah di-cache atau dimuat. */
export function resolveSnapshotFetchLimit(
  cachedCount: number,
  loadedCount: number,
  pageSize: number
): number {
  return Math.max(cachedCount, loadedCount, pageSize);
}

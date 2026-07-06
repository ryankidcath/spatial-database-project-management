# Catatan: Fetch data virtual table & optimasi (Dashboard, Data, Obrolan, Spasial)

Dokumen ringkas dari analisis chat — supaya tidak perlu scroll history.  
Tanggal: 2026-07-06.

---

## 1. Arsitektur fetch workspace (ringkas)

### Tiga lapisan

| Lapisan | Kapan | Isi utama |
|--------|--------|-----------|
| **Shell** | Load halaman (`fetchWorkspaceShellAction`) | Org, proyek, metadata virtual table/kolom, modul, anggota |
| **Deferred payload** | Tab selain Chat / Aktivitas / Tabel / Dashboard | Issues, statuses, footprints legacy, berkas PLM, keuangan, presence, dll. |
| **Fetch per-komponen** | Mount tab / tab aktif / mutasi | Baris virtual table, geometri peta, inbox chat, trace relasi |

Definisi tab “shell only”:

```ts
// app/src/app/workspace-deferred-payload.ts
viewUsesShellOnly: Chat | Aktivitas | Tabel | Dashboard
```

### Tab keep-alive

`TabPanelKeepAlive` (`workspace-client.tsx`): tab di-**mount saat pertama dibuka**, lalu tetap mounted (hidden). State dipertahankan; beberapa effect tetap jalan saat tab diaktifkan kembali.

### File penting

| Area | Path |
|------|------|
| Shell awal | `app/src/app/workspace-home-client.tsx`, `lib/workspace-shell-server.ts` |
| Deferred | `app/src/app/use-workspace-deferred-payload.ts`, `lib/workspace-deferred-payload-server.ts` |
| Tab Data | `app/src/app/virtual-table-view.tsx`, `app/src/app/workspace-table-browser.tsx` |
| Tab Spasial | `app/src/app/workspace-spatial-view.tsx` |
| Tab Dashboard | `app/src/app/virtual-dashboard-view.tsx`, `virtual-dashboard-actions.ts`, `lib/dashboard-table-aggregate-server.ts` |
| Tab Obrolan | `app/src/app/workspace-chat-inbox.tsx`, `app/src/app/chat-actions.ts`, `lib/chat-inbox-row-context.ts` |
| Cache baris (Data ↔ Spasial) | `app/src/lib/virtual-table-rows-fetch.ts`, `virtual-table-rows-cache.ts` |
| Warmup background | `app/src/lib/workspace-warmup.ts` |

---

## 2. Perilaku fetch per tab (virtual table)

### Tab Data (Tabel)

- Metadata tabel: dari **shell** (sudah ada).
- Baris: `fetchVirtualRowsAction` via `VirtualTableView`.
- Trigger: `IntersectionObserver` → `isInView === true` (lazy).
- Pagination: 50 baris (`VIRTUAL_TABLE_EMBEDDED_PAGE_SIZE`), “muat lebih banyak”.
- Cache: memori + IndexedDB (`virtual-table-rows-cache`), TTL 30 menit.
- Ganti tabel di rail → `key={selected.id}` → remount → fetch tabel baru.
- Kembali ke tab Data setelah pernah buka → **biasanya tidak** fetch ulang (`isInView` tidak pernah di-set `false`).
- `loadRows()`: cache **segar** (TTL 30 menit) → tanpa network; cache **kedaluwarsa** → tampilkan dulu (SWR) lalu revalidate di background.

### Tab Spasial (Map)

- Butuh **deferred payload** (issues/footprints legacy untuk layer tugas).
- Geometri virtual table: `buildSpatialGeometryLayers` — fetch paralel per tabel, **cache** (TTL 30 menit).
- Refresh geometri hanya saat: ganti project, import, mutasi baris, filter view berubah, atau TTL habis — **bukan** tiap switch tab Map.
- Fetch tambahan: import wizard, trace relasi (`fetchRelationTraceTargetsAction` saat Entity 360 + toggle trace ON).

### Tab Dashboard

- **Shell only** — tidak memicu deferred bundle penuh (issues/berkas/keuangan).
- Metadata dashboard: `ensureVirtualDashboardAction` per proyek (ringan).
- Data widget: `fetchDashboardTableBundleAction` **per tabel** yang dipakai widget.
  - Widget `stat`: count di DB (bagus).
  - Widget `status_pie` / `bar_by_group`: RPC agregasi SQL (migration `0078`).
  - Widget `table_preview`: limit kecil (bagus).
- **Tidak** memakai `virtual-table-rows-cache`.

### Tab Obrolan (Chat)

- Shell only untuk metadata tabel.
- Inbox: RPC `get_chat_inbox_active_row_rooms` (sudah bawa `row_payload`).
- Lalu **`resolveVirtualRowChatContextsBatchAction`** — query `virtual_rows` lagi untuk judul breadcrumb.
- Cache inbox (memori + IndexedDB), prefetch (`chat-inbox-prefetch.ts`), realtime + polling.
- Fetch saat mount / ganti proyek; tidak full refetch tiap switch tab (setelah pernah dibuka).

### Warmup background

`startWorkspaceWarmup` prefetch: inbox, activity, deferred, **3 tabel pertama** — tapi ke cache **mobile** (`virtual-table-mobile-rows-cache`), **bukan** cache desktop tab Data.

---

## 3. Masalah utama (empat tab, satu sumber data)

Keempat tab menyentuh `virtual_rows` lewat jalur **terpisah tanpa cache bersama**:

| Tab | Fetch baris | Cache? |
|-----|-------------|--------|
| Data | `fetchVirtualTableRowsWithCache` (paginated) | Ya — scoped + full |
| Dashboard | RPC agregasi + preview terbatas | Chart: agregat saja; preview: limit kecil |
| Obrolan | RPC inbox + context dari payload RPC | Inbox cache; tidak re-query `virtual_rows` |
| Spasial | `fetchVirtualTableRowsWithCache` (full) + cache lapisan geometri | Ya — baris + layer |

---

## 4. Rekomendasi optimasi (prioritas)

### Prioritas tinggi (ROI besar)

1. **Spasial — stop full refetch tiap buka tab Map** ✅ *(2026-07-06)*
   - `mapTabEpoch` tidak lagi naik saat `isMapTabActive`; hanya ganti project, import, mutasi baris.
   - Cache lapisan: `workspace-spatial-geometry-layers-cache.ts` (memori + IndexedDB, TTL 30 menit, stale-while-revalidate).
   - Fetch paralel per tabel: `buildSpatialGeometryLayers` di `workspace-spatial-geometry-layers.ts`.

2. **Cache baris virtual table terpadu (lintas tab)** ✅ *(2026-07-06)*
   - `fetchVirtualTableRowsWithCache` di `lib/virtual-table-rows-fetch.ts`.
   - Kunci `tableId:all:0` (seluruh tabel) + kunci paginated (`tableId:50:0`); baca silang scoped ↔ full.
   - Dipakai tab Data, Spasial (`buildSpatialGeometryLayers`), warmup mobile prefetch.

3. **Dashboard — agregasi SQL, bukan full row fetch** ✅ *(2026-07-06)*
   - RPC `dashboard_payload_value_counts` + `dashboard_group_status_counts` (migration `0078`).
   - Server: `dashboard-table-aggregate-server.ts` → bucket status di Node, kirim agregat ke client.
   - Widget `table_preview` tetap fetch baris terbatas; chart tidak lagi `fetchVirtualRowsAction` semua baris.

4. **Obrolan — hilangkan double-fetch** ✅ *(2026-07-06)*
   - `resolveVirtualRowChatContextsBatchAction` menerima **seeds** dari RPC (`row_payload` + metadata tabel), tanpa re-query `virtual_rows`.
   - Helper bersama: `lib/chat-inbox-row-context.ts` (dipakai inbox + prefetch).

### Prioritas menengah

5. **Data — skip network jika cache masih fresh** ✅ *(2026-07-06)*
   - `loadRows`: cache TTL → tampilkan & return; cache kedaluwarsa → tampilkan dulu lalu revalidate (`forceNetwork`).
   - `fetchVirtualTableRowsWithCache`: `forceNetwork` + `skippedNetwork` untuk cache segar.
   - Mutasi tetap invalidasi cache → fetch penuh setelah edit.

6. **Spasial — fetch geometry-only** ✅ *(2026-07-06)*
   - RPC `core_pm.fetch_virtual_rows_map_payload` (migration `0079`): proyeksi `id` + slug kolom peta saja.
   - `columnSlugsNeededForMapLayers` + `fetchVirtualTableRowsForMap` (`lib/workspace-map-rows-fetch.ts`): cache full → cache map → RPC.
   - `buildSpatialGeometryLayers` memakai fetch map-only, bukan full `payload`.

7. **Dashboard — lepas dari deferred bundle penuh** ✅ *(2026-07-06)*
   - Tab Dashboard masuk `viewUsesShellOnly`; tidak menunggu issues/berkas/keuangan.
   - Metadata via `ensureVirtualDashboardAction`; widget data tetap per-tabel.
   - Metadata dashboard dihapus dari `fetchWorkspaceDeferredPayload`.

8. ~~**Warmup desktop ↔ cache Data tab**~~ *(sebagian via prefetch → unified cache)*  
   Mobile warmup sekarang menulis ke `virtual-table-rows-cache` juga; namespace mobile tetap untuk relation labels.

### Prioritas rendah / jangka panjang

- Incremental update layer peta per baris (bukan rebuild semua layer).
- Realtime patch cache `virtual_rows` (bukan invalidate + full refetch).
- Server-side filter/sort untuk grid Data besar.
- Kurangi polling obrolan jika realtime sudah stabil.

---

## 5. Urutan implementasi yang disarankan

1. ~~Map: hentikan refetch tiap switch tab + cache geometry layers~~ ✅  
2. ~~Cache baris terpadu (Data ↔ Spasial)~~ ✅  
3. ~~Dashboard: agregasi SQL untuk pie/bar~~ ✅  
4. ~~Obrolan: hilangkan double-fetch inbox → context~~ ✅  
5. ~~Map: geometry-only fetch~~ ✅  
6. ~~Dashboard: bootstrap terpisah dari deferred gemuk~~ ✅  
7. ~~Data: skip network jika cache fresh~~ ✅  

---

## 6. Yang sudah baik (jangan rusak)

- Tab Data: pagination, lazy `isInView`, keep-alive.
- Dashboard: count `stat` di DB; `table_preview` limited.
- Obrolan: cache inbox, prefetch, realtime.
- Mutasi: `VIRTUAL_TABLE_ROWS_MUTATED` + invalidasi per `tableId`.

---

## 7. Konteks proyek terkait

- Dummy GHDEMO: migration `0074`, `0077` (trace relasi G-H / G-D5).
- Roadmap spasial: `docs/workspace-spatial-gis-roadmap.md`.
- Roadmap dashboard v2: `docs/workspace-dashboard-v2-roadmap.md`.
- Branch kerja: `dev` (preview Vercel — lihat `DEPLOY.md` jika preview tidak muncul).

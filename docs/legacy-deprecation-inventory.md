# Inventaris fitur & schema legacy — rencana sunset

**Status:** L0 ✅ (2026-07-06); L1–L4 belum. Migration `0082` perlu dijalankan di Supabase.  
**Arah produk:** ruang kerja **virtual table first** — Dashboard, Data, Spasial, Chat, Aktivitas. Modul PLM / issue / keuangan / geometri issue **tidak dikembangkan** dan akan dihapus setelah data pilot termigrasi atau diarsipkan.

**Dokumen terkait (sudah ada, tersebar):**

| Dokumen | Isi relevan |
|---------|-------------|
| `docs/virtual-tables-migration-plan.md` | Model vtable; Fase 8 migrasi PLM opsional |
| `docs/workspace-spatial-tab-ux.md` | §2 legacy geom issue; S7 hapus kode legacy |
| `docs/chat-feature-decisions.md` | §Entitas di-deprecate (`issues`, PLM UI) |
| `docs/notifikasi-event-matrix.md` | Mode vtable; event legacy di luar scope |
| `docs/workspace-sidebar-v2-roadmap.md` | Sidebar tanpa issue tree (S4) |
| `docs/workspace-navigation-and-views.md` | Q4 issue vs vtable views |

---

## 1. Prinsip

1. **Jangan hapus DB** sebelum ada keputusan migrasi/arsip per organisasi yang masih punya data.
2. **UI dulu:** sembunyikan tab/modul legacy untuk org/ruang kerja baru; kode & schema menyusul.
3. **Geometri produksi** = kolom `geometry` di `core_pm.virtual_rows.payload`, bukan schema `spatial.*`.
4. **Satu dokumen ini** = daftar induk; detail teknis tetap di dokumen spesifik di atas.

---

## 2. Schema & tabel — status sunset

### 2.1 `core_pm` — **TETAP** (inti platform)

| Objek | Peran |
|-------|--------|
| `organizations`, `projects`, `project_members`, `organization_members` | Scope Portal |
| `profiles` | User |
| `virtual_tables`, `virtual_columns`, `virtual_rows`, `virtual_views` | Data custom |
| `virtual_dashboards` | Dashboard v2 |
| `audit_log`, `user_notifications` | Observabilitas |
| `chat_rooms`, `chat_messages`, `chat_room_reads` | Obrolan |
| `module_registry`, `organization_modules` | Gate modul (perlu disederhanakan pasca-sunset) |
| `push_subscriptions`, `push_outbox` | PWA push |
| `virtual_row_cell_notification_pending` | Debounce notifikasi sel |

### 2.2 `core_pm` — **SUNSET** (issue / task PM lama)

| Objek | Keterangan | Pengganti vtable |
|-------|------------|------------------|
| `issues` | Unit kerja hierarkis (`parent_id`, `status_id`) | Baris di tabel virtual (mis. Desa, Bidang) |
| `statuses` | Status Kanban per project | Kolom `select` di virtual table |
| URL `?task=` | Scope issue di workspace | Filter baris / deep link `vtable` + row (future) |

**UI terkait:** pohon issue di sidebar, tab Kanban/Kalender/Gantt (workspace), monitoring milestone, banyak logika di `workspace-client.tsx` (`selectedTaskId`, `sidebarProjectTrees`).

### 2.3 Schema `plm` — **SUNSET** (modul berkas & pengukuran)

| Tabel (utama) | Modul UI |
|---------------|----------|
| `berkas_permohonan`, `pemilik_tanah`, `berkas_pemilik` | Tab **Berkas** |
| `permohonan_informasi_spasial` | PLM / spasial berkas |
| `pengukuran_lapangan`, `pengukuran_surveyor`, `pengukuran_alat`, `pengukuran_dokumen`, `alat_ukur` | Alur pengukuran |
| `legalisasi_gu`, `legalisasi_gu_file`, `legalisasi_gu_history` | Legalisasi |
| `legalisasi_gu_history` | Riwayat tahap |

**Pengganti:** tabel virtual per ruang kerja (contoh seed: `0074_gh_demo_virtual_tables_seed.sql`, TKD Cirebon).

**Migrasi data:** opsional — lihat `virtual-tables-migration-plan.md` Fase 8 (script runtime, bukan SQL drop).

### 2.4 Schema `finance` — **SUNSET**

| Tabel | Modul UI |
|-------|----------|
| `invoice`, `invoice_item`, `pembayaran` | Tab **Keuangan** |

**Catatan:** `finance.invoice.berkas_id` → FK ke `plm.berkas_permohonan` — hapus finance setelah atau bersamaan dengan PLM.

### 2.5 Schema `spatial` — **SUNSET** (bukan penyimpanan vtable)

Geometri **produksi baru** disimpan di **`core_pm.virtual_rows`** (kolom `data_type = geometry` di `virtual_columns`).

| Objek | Peran legacy | Sunset? |
|-------|--------------|---------|
| `issue_geometries` | Geometri per issue | ✅ |
| `issue_geometry_features` | Feature per issue + `feature_key` | ✅ |
| `issue_feature_attributes` | Atribut JSON per feature (pola lama) | ✅ |
| `v_issue_geometry_feature_map` (view) | Join issue ↔ feature | ✅ |
| RPC `upsert_issue_geometry_feature_from_wkt`, dll. | Edit geom issue | ✅ |
| `bidang_hasil_ukur` | Hasil ukur terikat berkas PLM | ✅ (migrasi ke vtable atau arsip) |
| `project_demo_footprints` | Demo footprint project | ✅ |

**Tab Spasial v2** memakai layer dari **virtual table** (`workspace-spatial-view.tsx`, `virtual-table-map-footprints.ts`). Setelah S7 (`workspace-spatial-tab-ux.md`), tidak ada ketergantungan UI pada `spatial.*` untuk pilot baru.

**Jawaban singkat:** ya — untuk produk vtable-only, **schema `spatial` tidak diperlukan** setelah data lama termigrasi; geometri cukup di payload vtable + PostGIS di JSONB/RPC yang sudah ada untuk vtable.

---

## 3. Tab & komponen UI — sunset

| Tab / view (`ViewId`) | Modul gate | Status |
|------------------------|------------|--------|
| `Dashboard` | — | ✅ **Tetap** |
| `Tabel` (UI: Data) | — | ✅ **Tetap** |
| `Chat` | — | ✅ **Tetap** |
| `Map` (UI: Spasial) | `spatial` | ✅ **Tetap** (vtable layers) |
| `Aktivitas` | — | ✅ Tetap (entry sidebar / sheet) |
| `Berkas` | `plm` | 🌅 Sunset |
| `Laporan` | `plm` | 🌅 Sunset |
| `Keuangan` | `finance` | 🌅 Sunset |
| `Kanban`, `Kalender`, `Gantt` | — | 🌅 Sunset (sudah `HIDDEN_WORKSPACE_VIEWS`; terikat `issues`) |

**Komponen app (contoh path):**

| Area | File / pola |
|------|-------------|
| Berkas | `berkas-list-panel.tsx`, `berkas-detail-panel.tsx` |
| Laporan | `laporan-panel.tsx` |
| Keuangan | `finance-panel.tsx`, `finance-types.ts` |
| Kanban / kalender / gantt | `kanban-board.tsx`, `calendar-schedule-view.tsx`, `gantt-schedule-view.tsx` |
| Issue tree sidebar | `workspace-client.tsx` → `sidebarProjectTrees` |
| Legacy geom / atribut | `workspace-spatial-geometry-dialog.tsx`, `spatial-attributes-panel.tsx` |
| Deferred payload PLM | `lib/workspace-deferred-payload-server.ts` (issues, footprints, berkas, …) |

---

## 4. Urutan penghapusan disarankan

| Fase | Lingkup | Risiko |
|------|---------|--------|
| **L0** | Sembunyikan tab PLM/Keuangan untuk org baru; sidebar tanpa issue tree (S4) | ✅ 2026-07-06 |
| **L1** | Stop fetch deferred payload untuk view yang tidak dipakai | Rendah |
| **L2** | Hapus komponen UI & server actions PLM/finance/issues | Sedang |
| **L3** | Migrasi/arsip data org yang masih pakai PLM | Tinggi — butuh script |
| **L4** | Drop tabel `plm.*`, `finance.*`, `spatial.*`, `core_pm.issues`, `core_pm.statuses` | Tinggi — hanya setelah L3 |

### L0 — selesai (2026-07-06)

| Area | Perubahan |
|------|-----------|
| **Bootstrap org baru** | Migration `0082`: hanya `core_pm` + `spatial` aktif |
| **RPC modul** | `set_organization_module_enabled` menolak aktivasi `plm`/`finance` baru |
| **Tab workspace** | Tetap gate `organization_modules` — org baru tidak lihat Berkas/Laporan/Keuangan |
| **URL `?task=`** | Dihapus otomatis jika modul `plm` tidak aktif |
| **Kode app** | `app/src/lib/legacy-module-sunset.ts`, `workspace-modules.ts`, `organization-module-toggles.tsx` |
| **Sidebar** | S4 — tanpa pohon issue |

**Org pilot lama** (mis. KJSB dengan `plm` aktif): tab legacy tetap tampil; modul legacy bisa dimatikan lewat toggle, tidak bisa diaktifkan ulang.

**Jangan L4** sebelum semua organisasi pilot konfirmasi tidak butuh read-only archive di DB yang sama.

---

## 5. Yang **tidak** ikut dihapus

- **Chat** (room org / project / virtual_row)
- **Dashboard** widget board
- **Impor GeoJSON/DXF** ke virtual table
- **Audit log & notifikasi** mode vtable
- **Organisasi & ruang kerja** (scope)

---

## 6. Checklist verifikasi sebelum drop schema

- [ ] Tidak ada org aktif dengan `organization_modules` mengaktifkan `plm` / `finance` untuk pekerjaan harian
- [ ] Tidak ada deep link produksi ke `?task=`
- [ ] Tab Spasial hanya layer vtable (S7 selesai)
- [ ] Laporan/invoice historis diekspor atau dimigrasi ke vtable / arsip file
- [ ] Migration SQL drop di branch terpisah + backup

---

## 7. Changelog dokumen

| Tanggal | Perubahan |
|---------|-----------|
| 2026-07-06 | Dokumen awal: inventaris schema plm/finance/spatial/issues + tab UI; konfirmasi geometri vtable di `core_pm` |
| 2026-07-06 | **L0:** bootstrap org baru = `core_pm`+`spatial`; blok aktivasi `plm`/`finance`; URL `?task=` dibersihkan; `legacy-module-sunset.ts` |

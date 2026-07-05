# Navigasi Portal & View Switcher — sumber kebenaran

**Status:** keputusan arsitektur UX (2026-07); belum diimplementasi penuh.  
**Tujuan:** memisahkan **permukaan kerja** (melihat & mengerjakan data) dari **observabilitas** (audit/aktivitas), lalu menempatkan **view switcher di level tabel** — bukan tab workspace — agar setiap fase punya acuan yang sama.

**Referensi terkait:**

| Dokumen | Isi |
|---------|-----|
| `docs/product-terminology.md` | Label Portal, Ruang Kerja, Organisasi |
| `docs/chat-feature-decisions.md` | Chat sebagai tab/konteks terpisah; panel kanan |
| `docs/virtual-tables-migration-plan.md` | Meta schema virtual tables; saved views (filter/sort) |
| `docs/mobile-workspace-guide.md` | Bottom bar mobile, wizard scope |
| `docs/workspace-spatial-tab-ux.md` | Tab Spasial: UX target, legacy vs vtable, beda dengan view Peta |
| `docs/notifikasi-event-matrix.md` | Lonceng vs tab Obrolan vs aktivitas |

**Kode terkait (anchor):**

| Area | File |
|------|------|
| Daftar tab workspace | `app/src/app/workspace-views.ts` |
| Tab disembunyikan (Kanban/Kalender/Gantt) | `app/src/app/workspace-modules.ts` → `HIDDEN_WORKSPACE_VIEWS` |
| Layout utama + tab bar | `app/src/app/workspace-client.tsx` |
| Tab master–detail tabel (desktop) | `app/src/app/workspace-table-browser.tsx` |
| Grid + saved views (filter/sort/group) | `app/src/app/virtual-table-view.tsx`, `virtual-table-types.ts` |
| View switcher v0 + layout types | `app/src/app/table-view-switcher.tsx`, `lib/virtual-table-layout-types.ts` |
| Preferensi layout per tabel (localStorage) | `lib/virtual-table-layout-preference.ts` → key `spatial-pm-table-view-v1` |
| Schema saved views | `supabase/migrations/0044_virtual_views_schema.sql` |
| Tab aktivitas (audit log) | `app/src/app/workspace-activity-tab.tsx` |
| Lonceng notifikasi (judul «Aktivitas») | `app/src/app/notifications-bell.tsx` |
| Dashboard widget (project scope) | `app/src/app/virtual-dashboard-view.tsx` |
| Bottom bar mobile | `app/src/app/workspace-mobile-tabs.tsx` |
| Tab Spasial (target UX) | `docs/workspace-spatial-tab-ux.md`; implementasi: `workspace-client.tsx` → `workspace-spatial-view.tsx` (rencana) |

---

## Ringkasan keputusan (quick reference)

| # | Topik | Keputusan |
|---|--------|-----------|
| 1 | Dua kategori navigasi | **Permukaan kerja** vs **observabilitas** — jangan dicampur setara di tab bar |
| 2 | View switcher | Di **level satu tabel** (bukan tab workspace); default = **Grid** |
| 3 | Tab **Data** (dulu «Tabel») | Pusat tabel custom + view switcher; `ViewId` internal tetap `Tabel` |
| 4 | Tab «Chat» | **Tetap tab terpisah** — kolaborasi lintas scope, bukan «cara melihat baris» |
| 5 | Tab **Spasial** (dulu «Map»/«Peta») | Modul spatial workspace; berbeda dari view **Peta** di switcher per tabel |
| 6 | Tab «Dashboard» | **Tetap tab terpisah** — agregasi multi-tabel per Ruang Kerja, bukan view per-tabel |
| 7 | Tab «Aktivitas» | **Turunkan** dari tab bar utama → sidebar / drawer / «Lainnya» mobile |
| 8 | Kanban / Kalender / Gantt | **Bukan** tab workspace; nanti **view switcher per tabel** (atau issue-set khusus) |
| 9 | Saved views (`virtual_views`) | Sudah ada untuk filter/sort/group; **perlu perluas** dengan `layout_type` di fase view switcher |
| 10 | Overlay tabel desktop | **Dihapus** (2026-07) — klik tabel → tab Tabel master–detail; mobile tetap penampil layar penuh |

---

## 1. Diagnosis: mengapa tab Aktivitas terasa «gatal»

Tab bar saat ini mencampur dua peran:

```
Permukaan kerja (data sama, wujud berbeda)
├── Dashboard   → ringkasan / widget board
├── Tabel       → grid virtual tables (+ master–detail desktop)  [tab UI: **Data**]
├── Chat        → obrolan org / Ruang Kerja / tabel / baris
└── Map         → lensa spasial (modul spatial)  [tab UI: **Spasial**]

Observabilitas (meta, read-only)
└── Aktivitas   → feed audit_log; tap → navigasi ke sumber
```

**Aktivitas** berguna sebagai **audit trail & pintu masuk navigasi**, tetapi pengguna **tidak mengerjakan data** di sana. Tab ini bersaing dengan permukaan kerja di slot navigasi utama — terutama di mobile, bottom bar sudah penuh (`Dashboard`, `Tabel`, `Chat`, `Map`, `Aktivitas`).

Selain itu, lonceng notifikasi sudah memakai label **«Aktivitas»** — ada overlap konseptual antara «yang perlu perhatian» (bell) dan «riwayat lengkap» (tab).

---

## 2. Model target (dua lapisan)

### 2.1 Lapisan 1 — Tab workspace (navigasi kasar)

Tab bar fokus ke **tempat kerja**, bukan log:

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard  │  Data  │  Chat  │  Spasial  │  (modul lain…)   │
└─────────────────────────────────────────────────────────┘
```

- **Dashboard** — widget board per Ruang Kerja (`VirtualDashboardView`).
- **Data** — daftar tabel (master) + detail tabel + **view switcher** (Fase 2+).
- **Chat** — inbox obrolan; «Buka berdampingan» via panel kanan global (sudah ada).
- **Map** — ruang kerja peta; modul `spatial` wajib aktif.

Tab modul opsional (tetap seperti sekarang, gated by module): Berkas, Laporan, Keuangan, dll.

### 2.2 Lapisan 2 — View switcher (per tabel)

Di dalam detail satu tabel (pane kanan master–detail desktop, atau layar penuh mobile):

```
┌─ Penjadwalan Pengukuran ─────────────────────────────────┐
│  [Grid ▾]  [Filter]  [Sort]  …                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  … isi view (grid / kanban / kalender / …) …        │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Prinsip:** satu baris virtual table = satu dataset; banyak **view** = kombinasi **layout** + **konfigurasi** (filter, sort, kolom visible, grouping).

### 2.3 Lapisan observabilitas (di luar tab bar utama)

| Entry point | Peran |
|-------------|-------|
| Lonceng notifikasi | Event yang perlu perhatian; unread; deep link |
| Drawer / sidebar «Aktivitas» | Riwayat audit lengkap (`WorkspaceActivityTab`) |
| Deep link dari aktivitas | Buka tab Data + pilih tabel/baris (sudah: `openActivityVirtualTable`) |

**Pemisahan bell vs riwayat:**

- **Bell** = actionable, terbatas tinggi, «baru».
- **Riwayat** = scroll panjang, filter cross-project opsional, tidak perlu slot tab utama.

---

## 3. Jenis view per tabel (target jangka panjang)

### 3.1 Layout types

| Layout | Syarat schema (minimum) | Prioritas |
|--------|-------------------------|-----------|
| **Grid** | selalu | ✅ sudah (`VirtualTableView`) |
| **Form** | selalu (entry / edit satu baris) | Fase 2–3 |
| **Kanban** | kolom `select` (status) | Fase 3 |
| **Kalender** | kolom `date` | Fase 3 |
| **Timeline / Gantt** | kolom `date` (+ dependensi opsional) | Fase 4 |
| **Gallery** | kolom `file` / cover | Fase 4 |
| **Map** (mini) | kolom `geometry` | Fase 4 (tab Map tetap ada untuk workspace peta) |
| **Chart** | kolom numerik / kategorikal | Fase 5 |

UI hanya menampilkan layout yang **valid** untuk schema tabel; yang tidak valid disembunyikan atau ditawari «tambah kolom X».

### 3.2 Saved views vs layout

**Sudah ada** (`core_pm.virtual_views`, `VirtualViewConfig`):

```ts
{ filters, sorts, groupBy, visibleColumns, columnWidths }
```

**Perlu ditambah** (Fase 3, migration baru):

```ts
// usulan perluasan config atau kolom terpisah
layout_type: "grid" | "kanban" | "calendar" | "gallery" | "form" | …
layout_options: { statusColumn?, dateColumn?, coverColumn?, … }
```

Satu **saved view** = **satu layout** + konfigurasi filter/sort + opsi layout. User bisa punya banyak view bernama (mis. «Kanban — Sprint ini», «Grid — Semua baris»).

Default view per tabel: `is_default = true`, `layout_type = "grid"`.

### 3.3 Hubungan dengan Kanban/Kalender/Gantt workspace

Di `workspace-modules.ts`, `Kanban`, `Kalender`, `Gantt` ada sebagai `ViewId` tetapi **`HIDDEN_WORKSPACE_VIEWS`** — sengaja tidak di tab bar.

**Keputusan:** komponen `KanbanBoard`, `CalendarScheduleView`, `GanttScheduleView` (dynamic import di `workspace-client.tsx`) **dipindahkan konsepnya** ke view switcher per tabel/issue-set, **bukan** diaktifkan kembali sebagai tab workspace.

---

## 4. Posisi Chat, Map, Dashboard

| Tab | Tetap tab? | Alasan |
|-----|------------|--------|
| **Chat** | Ya | Scope lintas org/project/tabel/baris; bukan representasi baris |
| **Map** | Ya | Ruang kerja spasial (layer, import, overlay); modul terpisah |
| **Dashboard** | Ya | Agregasi multi-tabel; `VirtualDashboardView` ≠ view satu tabel |

**Chat + panel kanan:** pola «Buka berdampingan» dari tab Obrolan (data di panel kanan) **tetap** — jangan dipaksa jadi sub-view tabel.

**Map + tab Data:** keduanya bisa menampilkan data yang sama; Map = konteks geografis workspace, view Map (mini) di tabel = opsional nanti.

---

## 5. Rencana fase

| # | Fase | Inti deliverable | Status |
|---|------|------------------|--------|
| **0** | Overlay desktop dihapus | Klik tabel → tab Tabel; mobile penampil layar penuh | ✅ 2026-07 |
| **1** | Rapikan navigasi | Turunkan Aktivitas dari tab bar; rapikan mobile bar / «Lainnya» | ✅ 2026-07 |
| **2** | View switcher v0 | Toolbar `[Grid ▾]` di detail tabel; placeholder layout; preferensi localStorage | ✅ 2026-07 |
| **3** | Saved views + layout | Migration `layout_type`; UI buat/duplikat/hapus view; Kanban/Kalender pertama | ✅ 2026-07 |
| **4** | Layout lanjutan | Gallery, Timeline, Form, Map mini-view | ✅ 2026-07 |
| **5** | Chart & polish | Chart view; onboarding kolom; E2E smoke views | ✅ 2026-07 |

---

### Fase 1 — Rapikan navigasi

**Goal:** tab bar = permukaan kerja saja; Aktivitas tetap bisa diakses tapi tidak setara hierarki.

**Deliverable:**

- [x] Hapus `Aktivitas` dari `visibleViews` default / urutan tab bar desktop & `MOBILE_BAR_VIEWS`.
- [x] Entry point Aktivitas baru:
  - Desktop: tombol header «Riwayat» + item sidebar «Riwayat aktivitas» → sheet kanan.
  - Mobile: menu «Lainnya» (⋯) di header → «Riwayat aktivitas».
- [x] Bedakan label bell vs riwayat: bell «Notifikasi», riwayat «Riwayat aktivitas».
- [x] Deep link aktivitas → Data + seleksi tabel tetap (`openActivityVirtualTable`, `focusVirtualTable`).
- [x] Update `docs/mobile-workspace-guide.md` (bottom bar).

**Non-goals fase ini:** view switcher, rename tab, schema DB.

**Acceptance:** pengguna utama (Tabel/Chat/Map) tidak kehilangan akses; Aktivitas ≤2 tap dari sidebar/menu.

---

### Fase 2 — View switcher v0 (grid-first)

**Goal:** UX switcher ada; hanya Grid yang hidup; fondasi komponen.

**Deliverable:**

- [x] Komponen `TableViewSwitcher` di toolbar `VirtualTableView` / penampil mobile tabel.
- [x] Satu layout aktif: **Grid** (implementasi saat ini).
- [x] Dropdown menampilkan layout future (disabled + label «Segera»).
- [x] Persist `lastLayout` per `table_id` di localStorage (`spatial-pm-table-view-v1`).
- [x] Dokumentasi internal: props switcher, event `onLayoutChange` (lihat §2.4).

**Non-goals:** Kanban/Kalender hidup, migration DB.

**Acceptance:** switcher terlihat di desktop master–detail dan mobile penampil tabel; tidak regress filter/sort/group yang ada.

### 2.4 API `TableViewSwitcher` (Fase 2)

Komponen: `app/src/app/table-view-switcher.tsx`

| Prop | Tipe | Keterangan |
|------|------|------------|
| `tableId` | `string` | ID tabel — kunci persist localStorage |
| `layout` | `VirtualTableLayoutType` | Layout aktif (controlled) |
| `onLayoutChange` | `(layout) => void` | Dipanggil saat user memilih layout **enabled** |
| `size` | `"sm" \| "default"` | Ukuran tombol trigger |
| `triggerLabel` | `"short" \| "full"` | Label trigger («Grid» vs «Tampilan: Grid») |

Parent (`VirtualTableView`, mobile overlay) memuat preferensi via `readTableLayoutPreference(tableId)` saat `table.id` berubah. Switcher menulis via `writeTableLayoutPreference` saat seleksi.

---

### Fase 3 — Saved views + layout type

**Goal:** user bisa menyimpan beberapa view bernama per tabel, masing-masing dengan layout.

**Deliverable:**

- [x] Migration: perluas `virtual_views.config` atau kolom `layout_type` + `layout_options` (backward compatible dengan view grid lama).
- [x] Server actions: create/update/delete view dengan layout; duplikat; set default.
- [x] UI: daftar view (tabs atau dropdown); «+ View baru»; duplikat; set default; badge layout.
- [x] Implementasi **Kanban** (kolom status) dan **Kalender** (kolom date) sebagai renderer alternatif di `VirtualTableView`.
- [x] Validasi schema: disable layout jika kolom anchor tidak ada.

**Reuse kode:** `KanbanBoard`, `CalendarScheduleView` — adaptasi input dari virtual rows, bukan tab workspace.

**Acceptance:** dua view berbeda (mis. Grid + Kanban) pada tabel yang sama; refresh mempertahankan view aktif (URL param atau saved default).

---

### Fase 4 — Layout lanjutan

**Goal:** parity mendekati Airtable/Notion untuk tipe view umum.

**Deliverable:**

- [x] Gallery, Timeline/Gantt, Form (create/edit dedicated).
- [x] Map mini-view per tabel (geometry column) — opsional jika tab Map sudah cukup.
- [x] Mobile: layout non-grid full-screen dengan pola navigasi konsisten.

**Komponen baru:** `virtual-table-gallery-view`, `virtual-table-timeline-view`, `virtual-table-form-view`, `virtual-table-map-view`, `lib/virtual-table-map-footprints`.

---

### Fase 5 — Chart & polish

**Goal:** analitik ringan per tabel; UX matang.

**Deliverable:**

- [x] Chart view (aggregasi sederhana: bar/pie/stat per kolom select/number).
- [x] Empty state «Tambah kolom Status untuk Kanban» dengan CTA ke column manager (switcher + `TableLayoutSchemaPrompt`).
- [x] E2E smoke: ganti view, simpan view, buka riwayat aktivitas (`e2e/virtual-table-views.spec.ts`).

**Komponen:** `virtual-table-chart-view`, `table-layout-schema-prompt`, `lib/virtual-table-chart-lib`, `lib/virtual-table-layout-hints`.

---

## 6. Perilaku navigasi tabel (setelah Fase 0)

| Entry point | Desktop | Mobile |
|-------------|---------|--------|
| Sidebar — klik tabel | Tab **Data/Tabel** + seleksi master–detail | Penampil layar penuh |
| Tab Aktivitas — klik tabel | Tab **Data/Tabel** + seleksi | Penampil layar penuh |
| Buat tabel baru | Tab **Data/Tabel** + seleksi | Penampil layar penuh |
| Impor layer peta | Pra-seleksi di tab Tabel (tanpa paksa pindah tab) | Penampil layar penuh |
| Tab Data — master list | Seleksi controlled (`tabelSelectedSlug`) | Daftar kartu tabel |

State:

- `tabelSelectedSlug` — desktop, tab master–detail.
- `activeVirtualTableSlug` — mobile-only, penampil layar penuh.

Helper: `focusVirtualTable(slug, { navigate? })` di `workspace-client.tsx`.

---

## 7. Hal yang sengaja tidak dilakukan

- **Chat jadi sub-view tabel** — ditolak; chat lintas scope.
- **Aktivitas tetap di bottom bar mobile** — ditolak setelah Fase 1.
- **Kanban/Kalender/Gantt sebagai tab workspace** — sudah disembunyikan; jangan aktifkan kembali tanpa revisi dokumen ini.
- **Satu tab «Data» menelan Map/Chat** — ditolak; tab Map & Chat tetap.
- **Overlay tabel desktop** — dihapus permanen (2026-07).

---

## 8. Pertanyaan terbuka (putuskan sebelum Fase 3)

| ID | Pertanyaan | Ops i |
|----|------------|-------|
| Q1 | Rename tab «Tabel» → «Data» di UI? | ✅ **Data** (2026-07); `ViewId` & URL `?view=tabel` tetap |
| Q2 | Bell label: «Notifikasi» vs tetap «Aktivitas»? | … |
| Q3 | View aktif di URL? (`?view=…&vtable=…&vview=…`) | Ya (shareable) / Tidak (session only) |
| Q4 | Issue/task PM lama: Kanban terpisah atau merge ke virtual table views? | Terpisah / Merge / Deprecate issues UI |
| Q5 | Siapa boleh buat/hapus saved view? | Semua anggota / Admin org saja |

---

## 9. Checklist sebelum merge per fase

- [ ] Perilaku desktop & mobile divergen secara eksplisit (jangan asumsikan satu state untuk keduanya).
- [ ] Deep link & notifikasi masih resolve ke tabel/baris yang benar.
- [ ] Panel kanan Chat / «Buka berdampingan» tidak regress.
- [ ] `docs/product-terminology.md` — label UI konsisten (Portal, Ruang Kerja).
- [ ] Update baris **Status** tabel Fase di dokumen ini.

---

## Changelog dokumen

| Tanggal | Perubahan |
|---------|-----------|
| 2026-07-05 | Tab Spasial: semua keputusan SQ1–SQ5 + implementasi — siap S1–S5 (`workspace-spatial-tab-ux.md` §8) |
| 2026-07-05 | `docs/workspace-spatial-tab-ux.md`: SQ1 rail collapsible; klik geometri → panel kanan (§6) |
| 2026-07-05 | `docs/workspace-spatial-tab-ux.md`: keputusan tab Spasial (vtable-only UX, default lapisan aktif, legacy issue geom) |
| 2026-07-05 | Label tab UI: **Data** (ex-Tabel), **Spasial** (ex-Map/Peta); view switcher tetap **Peta** per tabel |
| 2026-07-04 | Fase 4 selesai: Gallery, Timeline, Form, Map mini-view; mobile full-screen untuk semua layout |
| 2026-07-04 | Fase 3 selesai: saved views + layout; Kanban/Kalender; duplikat/set default |
| 2026-07-04 | Fase 1 selesai: Aktivitas keluar tab bar; sheet riwayat + entry sidebar/header/mobile menu |
| 2026-07-04 | Dokumen awal: diagnosis, model dua lapisan, fase 0–5, keputusan Chat/Map/Dashboard/Aktivitas |

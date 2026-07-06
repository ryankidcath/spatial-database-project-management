# Sidebar v2 — catatan produk, diagnosis & rencana

**Status:** Fase S1–S5 ✅ (2026-07-06).  
**Tujuan:** merombak **sidebar desktop** (`≥ md`) menjadi **Scope Navigator** yang ringkas — memilih Organisasi & Ruang Kerja — tanpa menduplikasi navigasi tabel, task tree, dan aksi admin yang sudah ada di tab/header.

**Mockup target UI:** belum ada PNG; wireframe referensi di §4. Bisa ditambahkan ke `docs/assets/` setelah iterasi UI pertama.

**Referensi internal:**

| Dokumen | Isi |
|---------|-----|
| `docs/workspace-navigation-and-views.md` | Tab workspace vs view switcher; perilaku klik tabel → tab Data |
| `docs/mobile-scope-flow-v2.md` | Wizard org → ruang kerja di mobile (pola yang bisa diadaptasi desktop) |
| `docs/mobile-workspace-guide.md` | Bottom bar; sidebar tidak dirender di mobile |
| `docs/product-terminology.md` | Portal, Organisasi, Ruang Kerja |
| `docs/chat-feature-decisions.md` | Chat sebagai tab; panel kanan |
| `docs/workspace-dashboard-v2-roadmap.md` | Contoh format catatan fase + acceptance |
| `docs/legacy-deprecation-inventory.md` | Sunset PLM / finance / issues / spatial |

**Kode anchor (kondisi sekarang):**

| Area | File |
|------|------|
| Sidebar monolitik | `app/src/app/workspace-client.tsx` (~baris 3983–4718) |
| Menu sidebar S1 | `app/src/app/workspace-sidebar-menus.tsx` |
| Scope switcher desktop S2 | `app/src/app/workspace-desktop-scope-switcher.tsx` |
| Item tabel di sidebar | ~~`workspace-sidebar-vtable-item.tsx`~~ dihapus S3 |
| Breadcrumb header | `workspace-client.tsx` → `workspaceHeaderBreadcrumb` |
| Tab Data master–detail | `app/src/app/workspace-table-browser.tsx` |
| Header mobile (switcher scope) | `app/src/app/workspace-mobile-compact-header.tsx` |
| Wizard org/project mobile | `workspace-mobile-org-picker.tsx`, `workspace-mobile-project-picker.tsx` |
| Pohon task di sidebar | `workspace-client.tsx` → `sidebarProjectTrees`, `treeRowsForSidebar` |
| Rail collapsible (pola reuse) | `app/src/app/workspace-collapsible-rail.tsx` |
| Collapse sidebar | `isSidebarCollapsed`, lebar `w-64` (256px) |
| Helper navigasi tabel | `focusVirtualTable(slug, { navigate? })` |

---

## 1. Diagnosis v1 (kondisi sekarang)

Satu kolom sidebar **320px** menampung terlalu banyak peran sekaligus:

```
Branding (Spatial PM v1.0.0)
├── Organisasi
│   ├── daftar org (klik ganti scope)
│   ├── chat organisasi
│   └── + Organisasi (dialog)
├── Ruang Kerja
│   ├── + Tim inti, + Anggota, + Ruang Kerja (dialog)
│   └── per project:
│       ├── nama + badge unread
│       ├── tombol chat project
│       ├── tombol hapus (destructive)
│       ├── chevron expand/collapse
│       └── pohon task/issue (nested)
├── Tabel Organisasi (+ Baru)
├── Tabel Ruang Kerja (+ Baru)
└── Riwayat aktivitas
```

### 1.1 Masalah UX yang terlihat di lapangan

| Masalah | Dampak |
|---------|--------|
| **Satu sidebar = navigasi + data + admin** | Scroll panjang; tidak jelas fokus kerja |
| **3–4 kontrol per baris ruang kerja** | Sempit di 320px; rawan salah klik |
| **Header section penuh tombol outline** | `+ Tim inti`, `+ Anggota`, `+ Ruang Kerja` terpotong |
| **Duplikasi navigasi tabel** | Sidebar + tab **Data** (`WorkspaceTableBrowser` + search) |
| **Duplikasi konteks** | Breadcrumb header `Org › Ruang Kerja › Tabel` vs daftar panjang di sidebar |
| **Hierarki visual lemah** | `ml-2`, label campur («Organisasi» vs «TABEL ORGANISASI» uppercase) |
| **Aksi destruktif selalu terlihat** | Ikon sampah di setiap baris ruang kerja |
| **Chat ganda** | Chat org di header section + chat per project di setiap baris |

### 1.2 Kontras dengan mobile (sudah lebih baik)

Di `< md`, sidebar **tidak dirender**. Scope lewat:

- Wizard full screen org → ruang kerja (`mobile-scope-flow-v2.md`)
- `WorkspaceMobileCompactHeader` — popover ganti org/ruang kerja + menu «Lainnya»

**Kesimpulan:** desktop perlu konvergensi ke pola mobile — **switcher scope** di atas, bukan daftar flat + admin di setiap section.

---

## 2. Visi v2 (satu kalimat)

> Sidebar = **«Saya di mana?»** — pilih Organisasi & Ruang Kerja, akses riwayat; **bukan** browser semua tabel, task, dan dialog admin.

Bukan pengganti:

| Permukaan | Tetap untuk |
|-----------|-------------|
| **Tab Data** | Daftar tabel, search, master–detail, view switcher |
| **Tab Dashboard / Spasial / Chat** | Konteks kerja sesuai tab |
| **Header breadcrumb** | Konteks aktif `Org › Ruang Kerja › Tabel` |
| **Dialog admin** | Buat org/ruang kerja, undang anggota — via menu terpusat |

---

## 3. Prinsip desain

1. **Satu tugas per permukaan** — sidebar = scope; tab = kerja; header = konteks + aksi global.
2. **Jangan duplikasi tab Data** — hapus daftar tabel dari sidebar desktop (klik tabel dari aktivitas/deep link tetap `focusVirtualTable` → tab Data).
3. **Progressive disclosure** — aksi admin jarang (tim inti, anggota, hapus) di menu `⋯` / Pengaturan, bukan 3 tombol di header section.
4. **Reuse pola mobile** — adaptasi `WorkspaceMobileCompactHeader` / popover bertingkat untuk desktop.
5. **Aksi destruktif tersembunyi** — hapus ruang kerja hanya di dialog konfirmasi dari menu konteks.
6. **Skala** — search di popover org/ruang kerja; pin/terakhir dibuka; (fase lanjut) command palette `Ctrl+K`.
7. **Desktop ≠ mobile** — perilaku eksplisit per breakpoint; jangan asumsikan satu komponen tanpa cabang `isBelowMd`.

---

## 4. Model target (wireframe)

### 4.1 Sidebar ramping (~240–260px)

```
┌──────────────────────────┐
│ ◫ Spatial PM        v1.0 │
├──────────────────────────┤
│ 🏢 KJSB Demo          ▾  │  ← popover: daftar org + search
│ 📁 TKD Kab. Cirebon   ▾  │  ← popover: ruang kerja di org aktif
│                    [ + ] │  ← menu: Org baru / RK baru / Undang…
├──────────────────────────┤
│ Ruang kerja di org ini   │  ← opsional: daftar singkat (≤8 item)
│  • G-H Demo              │
│  • PLM Kab. Cirebon      │
│  ▶ TKD Kab. Cirebon  ●2  │  ← unread badge; tanpa trash/chat inline
│  • Reposisi              │
├──────────────────────────┤
│ ↻ Riwayat aktivitas      │
└──────────────────────────┘
```

### 4.2 Yang **keluar** dari sidebar

| Konten v1 | Destinasi v2 |
|-----------|--------------|
| Daftar **Tabel Organisasi / Ruang Kerja** | Tab **Data** saja (`WorkspaceTableBrowser`) |
| **Pohon task/issue** per project | Tab modul terkait / rail opsional (lihat §6 Q4) |
| **Chat** per baris project | Tab **Chat** + badge unread di daftar ruang kerja |
| **+ Tim inti / + Anggota / + Ruang Kerja** di header | Menu `+` atau `Kelola` → dropdown/dialog |
| **Hapus** inline | Menu `⋯` pada ruang kerja terpilih → Pengaturan |

### 4.3 Header utama (tetap)

```
[≡ toggle sidebar]  KJSB Demo › TKD Kab. Cirebon › Progres Desa
Tab: Dashboard | Data | Spasial | Chat | …
```

Breadcrumb dan sidebar saling melengkapi: sidebar untuk **ganti** scope; breadcrumb untuk **baca** konteks + navigasi segment.

---

## 5. Urutan implementasi (fase)

| # | Fase | Inti deliverable | Status |
|---|------|------------------|--------|
| **S0** | Catatan & diagnosis | Dokumen ini | ✅ 2026-07-06 |
| **S1** | Quick wins | Satukan tombol admin → menu `+`; sembunyikan hapus di `⋯`; rapikan baris ruang kerja (nama + badge saja) | ✅ 2026-07-06 |
| **S2** | Scope switcher | Dua bar popover org + ruang kerja (adaptasi mobile header); daftar ruang kerja disederhanakan | ✅ 2026-07-06 |
| **S3** | Hapus duplikasi tabel | Keluarkan blok Tabel Org/RK dari sidebar; deep link & aktivitas tetap `focusVirtualTable` | ✅ 2026-07-06 |
| **S4** | Task tree keluar sidebar | Hapus pohon issue + daftar RK; hapus via menu `+` | ✅ 2026-07-06 |
| **S5** | Skala & polish | Pin/recent, lebar 256px, command palette `Ctrl+K` | ✅ 2026-07-06 |

### Fase S1 — Quick wins

**Goal:** kurangi kebisingan tanpa mengubah arsitektur navigasi.

**Deliverable:**

- [x] Ganti deretan `+ Tim inti`, `+ Anggota`, `+ Ruang Kerja` dengan satu trigger menu.
- [x] Hapus ikon chat per baris ruang kerja (akses lewat tab Chat).
- [x] Pindahkan hapus ruang kerja ke menu konteks / dialog pengaturan.
- [x] Section kosong («Belum ada tabel organisasi») tidak memakan ruang di sidebar (nanti dihapus di S3).

**Acceptance:** baris ruang kerja maksimal 2 kontrol (klik pilih + opsional `⋯`); tidak ada regress dialog buat org/anggota.

---

### Fase S2 — Scope switcher desktop

**Goal:** ganti dua section flat «Organisasi» + «Ruang Kerja» dengan switcher bertingkat.

**Deliverable:**

- [x] Komponen `WorkspaceDesktopScopeSwitcher` (atau perluas `WorkspaceMobileCompactHeader` dengan mode desktop).
- [x] Popover org: daftar + search jika >5 org.
- [x] Popover ruang kerja: filter `projectsInOrg` + search.
- [x] Menu `+` terpusat: organisasi baru, ruang kerja baru, undang anggota/tim inti (permission-gated seperti sekarang).

**Reuse:** logika `commitScopeInUrl`, `canonicalOrgId`, `selectedProjectId` — tidak ubah URL model.

**Acceptance:** ganti org/ruang kerja ≤2 klik; header breadcrumb ikut berubah.

---

### Fase S3 — Tabel hanya di tab Data

**Goal:** satu sumber navigasi tabel.

**Deliverable:**

- [x] Hapus section «Tabel Organisasi» & «Tabel Ruang Kerja» dari sidebar.
- [x] `+ Baru` tabel: pindah ke tab Data (toolbar) atau tetap dialog dari menu `+` scope.
- [x] Verifikasi: sidebar lama klik tabel → masih `focusVirtualTable(..., { navigate: true })` dari entry point lain (aktivitas, notifikasi).

**Acceptance:** semua akses tabel melalui tab Data; sidebar lebih pendek ≥30%.

---

### Fase S4 — Task tree keluar sidebar

**Goal:** sidebar tidak memuat pohon issue per project.

**Keputusan produk (2026-07-06):** fokus **virtual table**; issue/task PM tidak dipakai untuk ruang kerja baru. PLM/keuangan akan sunset — lihat `docs/legacy-deprecation-inventory.md`.

**Implementasi:** **Opsi A** — hapus pohon issue dari sidebar; URL `?task=` boleh tetap untuk sisa project lama tanpa UI picker.

**Deliverable:**

- [x] Hapus render `treeRowsForSidebar` di sidebar desktop.
- [x] Hapus item menu `⋯` «Tampilkan unit kerja».
- [x] Hapus daftar «Semua Ruang Kerja» — cukup scope switcher (S2).
- [x] Sidebar = branding + switcher + menu `+` + riwayat aktivitas.
- [x] Hapus ruang kerja aktif → menu `+` (jika punya izin).

**Opsi historis (tidak dipakai):**

| Opsi | Deskripsi |
|------|-----------|
| ~~B~~ | Rail issue di tab modul legacy |
| ~~C~~ | Tree collapse untuk PLM |

**Acceptance:** sidebar tidak memuat baris issue; tidak regress switcher org/RK.

---

### Fase S5 — Skala & polish

**Deliverable:**

- [x] Pin / «Terakhir dibuka» (3 ruang kerja) di sidebar + popover ruang kerja.
- [x] Lebar sidebar default 256px (`w-64`); state collapse disimpan di localStorage.
- [x] Command palette `Ctrl+K` / `⌘K` — lompat org / ruang kerja / tabel.
- [ ] Screenshot mockup di `docs/assets/workspace-sidebar-v2-mockup.png` (backlog).

**Kode baru:** `workspace-scope-preference.ts`, `workspace-scope-quick-access.tsx`, `workspace-command-palette.tsx`.

---

## 6. Perilaku navigasi (setelah S3)

Selaras dengan `workspace-navigation-and-views.md` §6:

| Entry point | Desktop v2 |
|-------------|------------|
| Sidebar — pilih ruang kerja | Set URL `?org=&project=`; tab aktif tidak dipaksa ganti |
| Aktivitas / notifikasi — klik tabel | Tab **Data** + `tabelSelectedSlug` |
| Buat tabel baru | Tab **Data** atau dialog dari menu `+` |
| Breadcrumb — klik segment | (opsional fase lanjut) buka popover scope |

State URL tetap: `?org=`, `?project=`, `?view=`, `?vtable=` — tidak diubah di sidebar v2.

---

## 7. Pertanyaan terbuka

| ID | Pertanyaan | Opsi |
|----|------------|------|
| Q1 | Lebar sidebar default? | ✅ **256px** (`w-64`) |
| Q2 | Daftar ruang kerja di sidebar setelah switcher? | ✅ Hanya pin/recent (≤3) + switcher |
| Q3 | Chat organisasi di sidebar? | Hapus (tab Chat) / satu ikon di footer sidebar |
| Q4 | Pohon task/issue (Fase S4)? | ✅ **Hapus dari sidebar** (vtable-only); lihat `legacy-deprecation-inventory.md` |
| Q5 | `+ Baru` tabel setelah S3? | Hanya tab Data / juga menu scope `+` |
| Q6 | Command palette? | ✅ S5 — `Ctrl+K` / `⌘K` |

---

## 8. Hal yang sengaja tidak dilakukan

- **Menggabungkan tab Chat ke sidebar** — chat lintas scope tetap tab.
- **Menjadikan sidebar browser dashboard/widget** — tetap tab Dashboard.
- **Mengubah model URL scope** — `org` / `project` tetap sumber kebenaran.
- **Satu komponen sidebar identik mobile/desktop** — mobile tetap tanpa sidebar; desktop pakai switcher adaptasi.

---

## 9. Kriteria selesai (acceptance keseluruhan)

- [x] Sidebar desktop ≤2 «lapisan» konten utama (scope + footer).
- [x] Tidak ada daftar tabel virtual di sidebar.
- [x] Tidak ada ≥3 tombol aksi di header section sidebar.
- [x] Ganti ruang kerja tidak memicu scroll panjang mencari item.
- [ ] Deep link, notifikasi, aktivitas → tabel masih benar.
- [x] Mobile tidak regress (`!isBelowMd` gate tetap).

---

## 10. Changelog dokumen

| Tanggal | Perubahan |
|---------|-----------|
| 2026-07-06 | Dokumen awal: diagnosis sidebar v1, visi Scope Navigator, fase S0–S5, wireframe |
| 2026-07-06 | Fase S1: menu `+` terpusat, baris RK disederhanakan, hapus/chat di menu `⋯`, sembunyikan section tabel kosong |
| 2026-07-06 | Fase S2: `WorkspaceDesktopScopeSwitcher`, popover org/RK + search, menu `+` unified |
| 2026-07-06 | Fase S3: tabel keluar sidebar; `+` buat tabel di tab Data (`WorkspaceTableBrowser`) |
| 2026-07-06 | Fase S4: sidebar switcher-only; pohon issue & daftar RK dihapus; hapus RK di menu `+` |
| 2026-07-06 | Fase S5: pin/recent, lebar `w-64`, command palette `Ctrl+K`, prefs `workspace-scope-preference.ts` |

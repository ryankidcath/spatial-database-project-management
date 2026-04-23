# Catatan Performa Workspace Scope Project

Tanggal: 2026-04-22
Konteks: Workspace terasa lambat saat pindah organisasi/project, sementara volume data akan naik sampai puluhan ribu baris.

## Gejala

- Paling terasa lambat saat pindah `scope` project/organisasi.
- Saat data belum penuh saja sudah terasa berat; diproyeksikan makin berat saat skala data naik.

## Hipotesis Penyebab Utama

1. Data `issues` diambil penuh per scope project (paging 1000 berulang sampai habis), lalu seluruh hasil dipass ke client.
2. Halaman bersifat dinamis (`force-dynamic`) sehingga query server sering dieksekusi ulang.
3. Ada bagian fetch serial (ambil `issues` dulu, baru query lain), sehingga total latency bertambah.
4. Banyak komputasi turunan di client dari array `issues` yang sama (filter berulang, flatten tree, summary, progress, matriks).
5. Index tabel `core_pm.issues` masih dasar; belum optimal untuk pola query real yang melibatkan `deleted_at`, `parent_id`, `sort_order`.
6. Potensi biaya rendering tinggi saat jumlah row/kolom besar (terutama tabel/matriks) tanpa virtualisasi.

## Bukti Teknis (Lokasi Kode)

- Fetch semua issue dengan loop pagination:
  - `app/src/app/page.tsx` -> `fetchAllIssuesForProjects(...)`
- Halaman dinamis:
  - `app/src/app/page.tsx` -> `export const dynamic = "force-dynamic"`
- Fetch lain dijalankan setelah `issues`:
  - `app/src/app/page.tsx` -> `issuesResult = await ...` sebelum `Promise.all([...])`
- Komputasi client berulang dari `issues`:
  - `app/src/app/workspace-client.tsx`:
    - `issueProgressById`
    - `completionBars`
    - `completionStatusPie`
    - `subtreeVillageProgress`
    - `projectWideMilestoneTitles`
    - `projectMonitoringBlocks`
- Index issues saat ini:
  - `supabase/migrations/0002_core_pm_initial.sql`
    - `idx_core_pm_issues_project (project_id)`
    - `idx_core_pm_issues_parent (parent_id)`

## Opsi Optimasi (Prioritas)

### Quick Wins (1-2 hari)

1. Kurangi beban Dashboard:
   - Jangan kirim full `issues` untuk ringkasan.
   - Buat query agregat khusus dashboard (count per depth, done %, pie status, total geometri).
2. Pusatkan precompute:
   - Bangun struktur `projectIssues`, `childByParent`, `depthById` sekali per scope.
   - Reuse hasilnya untuk semua blok UI.
3. Tambah index komposit paling kritis:
   - `core_pm.issues (project_id, deleted_at, parent_id, sort_order)`
   - `core_pm.issues (project_id, deleted_at, sort_order, id)`

### Medium (3-7 hari)

1. Lazy-load per view/tab:
   - `Dashboard`, `Tabel`, `Map`, `Kalender`, `Kanban` fetch sesuai kebutuhan masing-masing.
2. Query bertahap untuk tree:
   - Root dulu, child saat expand/pilih task.
3. Optimasi audit/activity:
   - Pertimbangkan endpoint ringkas, bukan payload detail besar jika tidak dibutuhkan.

### Lanjutan (1-2 minggu)

1. Virtualisasi render row besar (tabel/matriks).
2. Materialized summary atau tabel ringkasan untuk metrik dashboard.
3. Profiling end-to-end (DB + server + client render) untuk menetapkan SLA performa.

## Rekomendasi Eksekusi Bertahap

Urutan aman implementasi:

1. Index komposit + query aggregate dashboard.
2. Refactor precompute client agar tidak filter berulang.
3. Lazy-load data per tab.
4. Virtualisasi tabel/matriks bila row meningkat.

## Target Dampak

- Waktu pindah scope project menurun signifikan.
- Beban transfer data ke browser berkurang.
- UI tetap responsif saat skala data naik (puluhan ribu baris).

---

## Checklist Eksekusi (Siap Dikerjakan)

Catatan:
- Kolom **Owner** diisi saat planning sprint.
- Estimasi bersifat awal dan dapat disesuaikan.

### Phase 1 — Quick Wins (Prioritas Tinggi)

- [ ] **Tambah index komposit issues**
  - **Task**: buat migration index:
    - `core_pm.issues (project_id, deleted_at, parent_id, sort_order)`
    - `core_pm.issues (project_id, deleted_at, sort_order, id)`
  - **Output**: file migration SQL + verifikasi `EXPLAIN ANALYZE`.
  - **Owner**: TBD
  - **Estimasi**: 0.5 hari

- [ ] **Buat query agregat dashboard (server-side)**
  - **Task**: endpoint/RPC ringkasan untuk:
    - total unit per depth
    - done count / completion rate
    - distribusi status pie
    - total geometri + jumlah unit bergeometri
  - **Output**: payload ringkas dashboard tanpa full issues.
  - **Owner**: TBD
  - **Estimasi**: 1 hari

- [ ] **Ubah Dashboard pakai payload agregat**
  - **Task**: di `page.tsx`/`workspace-client.tsx`, ganti sumber data ringkasan dari full `issues` ke payload agregat.
  - **Output**: penurunan ukuran props + render lebih cepat.
  - **Owner**: TBD
  - **Estimasi**: 0.5–1 hari

- [ ] **Refactor precompute client**
  - **Task**: buat memo terpusat untuk `projectIssues`, `childByParent`, `depthById`, `statusCategoryByIssueId` agar tidak `filter` berulang.
  - **Output**: komputasi turunan reuse satu sumber.
  - **Owner**: TBD
  - **Estimasi**: 1 hari

### Phase 2 — Data Loading Strategy

- [ ] **Lazy-load per view/tab**
  - **Task**: pisahkan fetch berat berdasarkan view:
    - Dashboard: summary
    - Tabel/Monitoring: tree + rows
    - Map: geometry + atribut
    - Kalender/Gantt: schedule minimal
  - **Output**: perpindahan scope lebih cepat, tab berat hanya load saat dibuka.
  - **Owner**: TBD
  - **Estimasi**: 2–3 hari

- [ ] **Tree loading bertahap**
  - **Task**: load root dulu; children saat expand/select.
  - **Output**: payload awal kecil untuk project besar.
  - **Owner**: TBD
  - **Estimasi**: 2 hari

### Phase 3 — Render Scalability

- [ ] **Virtualisasi tabel/matriks**
  - **Task**: terapkan virtualization untuk row panjang di view tabel/matriks.
  - **Output**: render stabil saat data ribuan baris.
  - **Owner**: TBD
  - **Estimasi**: 2–3 hari

- [ ] **Optimasi chart dataset**
  - **Task**: batasi/aggregate bucket chart agar tidak render terlalu banyak bar.
  - **Output**: waktu render chart lebih cepat.
  - **Owner**: TBD
  - **Estimasi**: 1 hari

### Phase 4 — Observability & Guardrails

- [ ] **Tambah metrik performa**
  - **Task**: log server timing per query penting + client timing render utama.
  - **Output**: baseline metrik (p50/p95) untuk scope switch.
  - **Owner**: TBD
  - **Estimasi**: 1 hari

- [ ] **Tetapkan performance budget**
  - **Task**: definisikan target:
    - scope switch p95
    - payload size max
    - render frame budget
  - **Output**: KPI performa yang terukur.
  - **Owner**: TBD
  - **Estimasi**: 0.5 hari

## Definisi Selesai (Definition of Done)

- [ ] Scope switch project p95 turun signifikan dari baseline.
- [ ] Payload dashboard tidak lagi membawa full issues.
- [ ] View tabel/matriks tetap lancar pada data skala besar.
- [ ] Ada dashboard/rekap metrik performa yang bisa dipantau.

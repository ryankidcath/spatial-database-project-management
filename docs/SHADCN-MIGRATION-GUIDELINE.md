# Guideline Migrasi Bertahap ke shadcn/ui

Dokumen ini jadi acuan migrasi UI bertahap dari komponen Tailwind custom ke `shadcn/ui` tanpa mengganggu fitur domain (`core_pm`, `plm`, `spatial`, `finance`).

## Tujuan

- Menstandarkan komponen UI lintas halaman.
- Meningkatkan konsistensi style + aksesibilitas.
- Menjaga perubahan tetap kecil, aman, dan mudah direview.

## Prinsip eksekusi

- Migrasi bertahap, **bukan** rewrite total.
- Prioritaskan komponen dasar yang paling sering dipakai.
- Satu PR fokus ke satu paket kecil (mis. form controls saja).
- Tidak mengubah behavior bisnis saat tahap visual/refactor komponen.

## Scope awal yang direkomendasikan

1. `Button`, `Input`, `Label`, `Textarea`
2. `Select`, `Badge`, `Table` wrapper
3. `Dialog` / `Popover` / `Dropdown`
4. `Card` + section layout utilities

## Tahapan implementasi

## Status eksekusi saat ini

- [x] Tahap 0 — Persiapan
- [x] Tahap 1 — Setup fondasi shadcn/ui
- [x] Tahap 2 — Migrasi form `core_pm` utama
- [x] Tahap 3 — Navigasi dan elemen status
- [x] Tahap 4 — Komponen kompleks bertahap

### Tahap 0 — Persiapan

- Pastikan branch bersih dan test/lint hijau.
- Tetapkan gaya dasar (radius, spacing, font scale, color tokens).
- Sepakati pola import komponen UI (mis. `@/components/ui/...`).

### Tahap 1 — Setup fondasi shadcn/ui

- Install dependency yang dibutuhkan shadcn/ui.
- Inisialisasi shadcn/ui di app.
- Generate komponen dasar: `button`, `input`, `label`, `textarea`.
- Buat aturan naming/variant yang dipakai tim.

Realisasi:
- `components.json` sudah dibuat di `app/`.
- Komponen dasar sudah tersedia di `app/src/components/ui/`.
- Utility `cn` tersedia di `app/src/lib/utils.ts`.

Kriteria selesai:
- Komponen dasar tersedia dan bisa dipakai tanpa regress build.

### Tahap 2 — Migrasi form paling sering dipakai

- Migrasikan form di area `core_pm` dulu:
  - form tambah task/subtask
  - form progress angka
  - form create organization/project
- Pertahankan action dan validasi backend apa adanya.

Realisasi:
- Form create organization/project di state project kosong sudah pakai komponen shadcn.
- Form tambah task/subtask + form progress angka sudah pakai `Button/Input/Label/Textarea`.
- Logic server action dan validasi tetap dipertahankan.

Kriteria selesai:
- UX sama, style lebih konsisten, lint/typecheck/e2e tetap hijau.

### Tahap 3 — Navigasi dan elemen status

- Migrasi badge status, tombol aksi tabel, dan panel ringkasan dashboard.
- Standardisasi warna status (`todo`, `in_progress`, `done`) di satu tempat.

Realisasi:
- Komponen `Badge` sudah ditambahkan dan dipakai untuk status di tabel.
- Tombol navigasi utama (organisasi/project/task, tab view) sudah dipindah ke `Button` shadcn.
- Tombol aksi tabel `Selesaikan/Buka lagi` sudah dipindah ke `Button` shadcn.
- Token warna status sudah dipusatkan melalui mapping helper (`todo`, `in_progress`, `done`).
- Panel ringkasan dashboard sudah memakai komponen `Card` shadcn.

Kriteria selesai:
- status visual konsisten di tabel/dashboard/sidebar.

Sisa minor (opsional):
- Audit visual kecil (spasi/ukuran) agar nuansa `Button` baru seragam di semua breakpoint.

### Tahap 4 — Komponen kompleks bertahap

- Dialog konfirmasi, popover/filter, komponen map controls, dsb.
- Lakukan per modul agar review lebih mudah.

Realisasi:
- Komponen `Dialog` sudah ditambahkan (`src/components/ui/dialog.tsx`).
- Komponen `Popover` sudah ditambahkan (`src/components/ui/popover.tsx`).
- Form tambah task di dashboard sudah dipindah ke modal dialog (trigger `+ Task`).
- Form tambah subtask dipindah ke modal dialog (trigger `+ Subtask`).
- Form progress angka dipindah ke modal dialog (trigger `Update progress`).
- Aksi status task `Selesaikan/Buka lagi` di tabel sudah ditambah dialog konfirmasi.
- Kontrol lapisan di view peta dipindah ke popover `Atur lapisan`.
- Toggle tema `dark/light` ditambahkan di header workspace.
- Polish visual lanjutan: sidebar + kontainer utama diselaraskan ke token `card/muted/sidebar` untuk style dashboard yang lebih konsisten.
- Fine-tuning: hierarchy tipografi, kepadatan spacing, dan style tabel diselaraskan ke pola dashboard shadcn (header chips + table surface).
- Tombol aksi utama diseragamkan ke varian semantik `Button` shadcn (`default/secondary/outline`) tanpa hardcoded warna.
- Badge status (`todo/in_progress/done`) diselaraskan ke style semantic lintas light/dark dengan tone yang konsisten.
- Panel info/warning dan helper text utama di workspace dikonversi ke token tema (`foreground/muted/primary`) agar konsisten di light/dark.
- QA pass akhir dijalankan ulang (`lint`, `typecheck`, `test:e2e`) dan alur smoke tetap lolos.

Kriteria selesai:
- komponen kompleks utama sudah memakai pattern yang sama.
- status tahap ini ditutup setelah validasi lint/typecheck batch terakhir.

## Test plan per tahap

- `npm run lint`
- `npm run typecheck`
- Smoke manual:
  - login
  - create org/project
  - create task/subtask
  - update progres + aksi selesai/buka lagi
  - cek tampilan dashboard/tabel/sidebar

## Risiko & mitigasi

- **Campuran style lama-baru**  
  Mitigasi: migrasi per area utuh, hindari setengah komponen dalam satu panel.

- **Regresi interaksi** (row click, form submit, keyboard)  
  Mitigasi: jaga event handler lama, refactor visual dulu.

- **Scope membesar**  
  Mitigasi: batasi PR ke komponen yang sudah ditentukan tahap berjalan.

## Definition of Done migrasi UI

- Komponen inti `core_pm` sudah konsisten memakai komponen `shadcn/ui`.
- Tidak ada regress alur utama user.
- Lint/typecheck/e2e utama stabil.
- Dokumen ini diperbarui jika ada perubahan strategi.

## Catatan operasional

- Migrasi dilakukan bertahap dan bisa coexist (komponen lama + shadcn) sementara waktu.
- Untuk menghindari regress, setiap batch wajib ditutup dengan smoke test manual pada alur utama user.

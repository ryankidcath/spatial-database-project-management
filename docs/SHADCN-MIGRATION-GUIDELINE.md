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

### Tahap 0 — Persiapan

- Pastikan branch bersih dan test/lint hijau.
- Tetapkan gaya dasar (radius, spacing, font scale, color tokens).
- Sepakati pola import komponen UI (mis. `@/components/ui/...`).

### Tahap 1 — Setup fondasi shadcn/ui

- Install dependency yang dibutuhkan shadcn/ui.
- Inisialisasi shadcn/ui di app.
- Generate komponen dasar: `button`, `input`, `label`, `textarea`.
- Buat aturan naming/variant yang dipakai tim.

Kriteria selesai:
- Komponen dasar tersedia dan bisa dipakai tanpa regress build.

### Tahap 2 — Migrasi form paling sering dipakai

- Migrasikan form di area `core_pm` dulu:
  - form tambah task/subtask
  - form progress angka
  - form create organization/project
- Pertahankan action dan validasi backend apa adanya.

Kriteria selesai:
- UX sama, style lebih konsisten, lint/typecheck/e2e tetap hijau.

### Tahap 3 — Navigasi dan elemen status

- Migrasi badge status, tombol aksi tabel, dan panel ringkasan dashboard.
- Standardisasi warna status (`todo`, `in_progress`, `done`) di satu tempat.

Kriteria selesai:
- status visual konsisten di tabel/dashboard/sidebar.

### Tahap 4 — Komponen kompleks bertahap

- Dialog konfirmasi, popover/filter, komponen map controls, dsb.
- Lakukan per modul agar review lebih mudah.

Kriteria selesai:
- komponen kompleks utama sudah memakai pattern yang sama.

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

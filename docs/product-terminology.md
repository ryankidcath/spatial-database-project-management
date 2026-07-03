# Istilah produk — Portal & Ruang Kerja

**Status:** keputusan copy UX (2026-07); T1 sweep UI selesai. Nama teknis di kode/DB (`projects`, `project_id`, `WorkspaceClient`, dll.) **tetap** sampai ada PR terpisah.

**Tujuan:** menghindari kebingungan user antara (A) wadah tim di aplikasi, (B) data bisnis (klien, pekerjaan, invoice), dan (C) shell aplikasi setelah login.

---

## Label yang disepakati (user-facing)

| Konsep | Label UI | Di sistem (tidak diubah) | Catatan |
|--------|----------|---------------------------|---------|
| Shell aplikasi setelah login (tab, header, scope) | **Portal** | `WorkspaceClient`, “workspace” di dokumen teknis | Menggantikan istilah **workspace** untuk user |
| Wadah tim / scope akses (`?project=` di URL) | **Ruang Kerja** | `core_pm.projects`, `project_id` | Bukan “Proyek” di menu/header |
| Organisasi | **Organisasi** | `core_pm.organizations` | Tetap |
| Daftar pekerjaan/kontrak bisnis (tabel virtual) | *(bebas, buatan user)* | `virtual_tables` + `virtual_rows` | **Tidak** dipreskripsikan nama; user boleh “Proyek”, “Pekerjaan”, “Kontrak”, dll. |
| Master klien, invoice, dll. | Nama tabel virtual user | `virtual_tables` org-level | Lihat `0046_virtual_tables_org_level.sql` |

---

## Tiga lapisan (model mental)

```
Portal
 └── Organisasi
      ├── Ruang Kerja          ← scope app (1 baris core_pm.projects)
      │     └── task, chat, tabel project-scoped, dashboard, …
      ├── Klien, Invoice, …  ← tabel virtual org (master data)
      └── [tabel virtual apa pun]  ← pekerjaan bisnis, nama bebas user
```

**Pemisahan penting:**

- **Ruang Kerja** = *di mana tim bekerja di Portal* (hak akses, tab, URL).
- **Tabel virtual** (mis. Klien, Invoice, atau daftar pekerjaan buatan user) = *data bisnis*; boleh direlasikan antar baris virtual (`relation`).
- Keduanya **tidak** harus 1:1: satu Ruang Kerja bisa melayanan banyak klien/pekerjaan; atau satu Ruang Kerja ≈ satu klien (pola operasi tim).

---

## Pola operasi yang didukung (tanpa validasi paksa di app)

| Pola | Ruang Kerja | Bisnis |
|------|-------------|--------|
| Kecil / dedicated | 1 Ruang Kerja ≈ 1 tim ≈ 1 klien | Satu baris Klien + pekerjaan virtual opsional |
| Tim portfolio | 1 Ruang Kerja = 1 tim internal | Banyak baris di tabel virtual (klien, pekerjaan, invoice) dalam scope yang sama |

App **tidak** memaksa “satu klien = satu Ruang Kerja”. Relasi bisnis lewat kolom `relation` di tabel virtual; scope lewat pemilihan Ruang Kerja di header.

---

## Menghubungkan Klien, invoice, dan pekerjaan bisnis

**Disarankan (hari ini, tanpa fitur baru):**

1. Tabel org **Klien** — master.
2. Tabel virtual lain (nama bebas user) — pekerjaan/kontrak; kolom **relation** → Klien.
3. **Invoice** (jika ada) — relation → Klien + tabel pekerjaan bisnis user.

**Hindari:** tabel virtual bernama sama dengan label scope (**jangan** “Ruang Kerja” atau “Portal” sebagai `display_name` tabel).

**Rencana fitur (belum diimplementasi):** kolom tipe **`ruang_kerja`** (picker ke `core_pm.projects`) pada baris virtual — untuk menandai *pekerjaan ini dikelola di Ruang Kerja mana*, tanpa menduplikasi daftar Ruang Kerja di tabel virtual. Lihat diskusi “Opsi 7” di catatan produk / chat terminologi 2026-07.

---

## Onboarding satu paragraf (untuk pilot / help)

> **Portal** adalah aplikasi Anda. Pilih **Organisasi**, lalu **Ruang Kerja** — tempat tim berkolaborasi (chat, tabel, task). Data bisnis seperti **Klien** atau daftar pekerjaan ada di **tabel organisasi**; nama tabel pekerjaan Anda tentukan sendiri. **Ruang Kerja** di header bukan hal yang sama dengan baris di tabel virtual pekerjaan.

---

## Implementasi bertahap (TODO teknis)

| Fase | Isi | Status |
|------|-----|--------|
| T0 | Dokumen ini | ✅ |
| T1 | Sweep copy UI: “Proyek/project” → **Ruang Kerja**; “workspace” user-facing → **Portal** | ✅ |
| T2 | Template org opsional (Klien + kolom relation) di panduan pilot | 🔲 |
| T3 | Kolom virtual `ruang_kerja` → `core_pm.projects` (picker + validasi org) | 🔲 |

**File yang kemungkinan disentuh di T1:** `workspace-client.tsx`, picker scope mobile (`workspace-mobile-*`), notifikasi, dialog properti, `docs/mobile-scope-flow-v2.md`, `docs/mobile-workspace-guide.md` (tambah catatan historis atau redirect istilah).

**Tidak direncanakan:** rename tabel `core_pm.projects` atau parameter URL `?project=` (breaking change besar).

---

## Referensi terkait

- Tabel virtual org-level: `supabase/migrations/0046_virtual_tables_org_level.sql`
- Relasi antar tabel virtual: `docs/virtual-tables-migration-plan.md` (Fase 5)
- Alur scope mobile: `docs/mobile-scope-flow-v2.md` (istilah lama: organisasi → proyek → workspace)

---

## Riwayat

| Tanggal | Perubahan |
|---------|-----------|
| 2026-07-03 | T1: sweep copy UI ke **Portal** / **Ruang Kerja** (`app/src/lib/product-labels.ts`, workspace shell, panel, e2e) |
| 2026-07-03 | Keputusan: **Portal** (ganti workspace UI), **Ruang Kerja** (ganti project UI); nama tabel daftar pekerjaan bisnis tidak dipreskripsikan |

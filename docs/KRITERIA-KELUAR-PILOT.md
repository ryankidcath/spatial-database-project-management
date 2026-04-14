# Kriteria keluar pilot (F7-4)

Sebelum **menambah organisasi** atau melebar ke pengguna di luar daftar pilot, tim dapat memakai daftar cek di bawah. Sesuaikan ambang biner (ya/tidak) dengan risiko bisnis Anda.

## Stabilitas & teknis

- [ ] **Deployment production** stabil minimal **X minggu** (isi X) tanpa rollback darurat.
- [ ] **CI** (lint, typecheck, verifikasi migration, E2E) hijau pada branch utama.
- [ ] **Backup / PITR** Supabase aktif dan pernah diverifikasi (restore uji opsional).
- [ ] Tidak ada **migration kritis** tertunda yang belum di-review.

## Pengguna & proses

- [ ] **Umpan balik** pilot terkumpul (rapat / formulir) dan isu besar ditindaklanjuti atau diterima sebagai batasan.
- [ ] **Dokumentasi** singkat untuk pengguna (login, alur utama PLM/core) tersedia atau didemokan.
- [ ] **Kebijakan akses** (`docs/PILOT.md`) jelas untuk gelombang berikutnya (signup / domain / undangan).

## Operasi

- [ ] **Runbook** (`docs/RUNBOOK-OPERASI.md`) diisi kontak nyata dan pernah diuji (latihan ringan).
- [ ] **Monitoring** (`docs/MONITORING.md`) — minimal satu orang tahu membuka log Vercel + Supabase.

## Keputusan

- [ ] **Go / no-go** direkam (tanggal, nama) sebelum menambah organisasi atau mengubah skala trafik.

*Tidak ada skor otomatis — ini adalah kerangka keputusan tim.*

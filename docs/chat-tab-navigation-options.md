# Opsi navigasi tab Chat (mobile & desktop)

**Status:** **Opsi B diimplementasi** (Step 5b, 2026-06-03) — tab Chat + inbox mobile/desktop.  
**Tanggal:** 2026-06-04  
**Diputuskan:** 2026-06-04 — tab Chat = inbox mobile; desktop master–detail.
**Konteks:** Mobile v1 selesai dengan chat lewat **sheet** + panel kontekstual (`docs/mobile-workspace-guide.md`). Keputusan awal chat: **tanpa tab Chat** (`docs/chat-feature-decisions.md` §7).

**Prasyarat navigasi mobile:** selesaikan **Step 1–2** di `docs/mobile-scope-flow-v2.md` (wizard org → project → workspace) sebelum memutuskan tab Chat di bottom bar. Step 5 v2 merapikan chat di konteks scope baru.

---

## Latar

- Bottom bar mobile (`workspace-mobile-tabs.tsx`): 4 slot + **Lainnya**, mengikuti `visibleViews`.
- Chat hari ini: `WorkspaceRightPanel` (desktop `aside` / mobile `Sheet`), dibuka dari sidebar, tabel, baris, peta.
- URL `?view=chat` dialihkan ke Dashboard.
- **Kanban, Kalender, Gantt** disembunyikan sementara (`HIDDEN_WORKSPACE_VIEWS` di `workspace-modules.ts`) — memberi ruang di navigasi tanpa menghapus kode view.

---

## Opsi A — Tab / tombol Chat hanya membuka sheet (mobile-first)

| Platform | Perilaku |
|----------|----------|
| **Mobile** | Slot di bottom bar (atau **Lainnya**): tap → **sheet** yang sama seperti sekarang (org / proyek / room terakhir / picker ringkas). **Bukan** `ViewId` baru. |
| **Desktop** | **Tidak berubah** — panel kanan `w-96`, tanpa tab Chat di header. |

| Pro | Kontra |
|-----|--------|
| Perubahan kecil (`workspace-mobile-tabs` + wiring panel) | Dua kebiasaan: mobile punya “pintu chat” di bar, desktop di sidebar |
| Selaras §7 panel kanan | Bukan “inbox” penuh |

**Perkiraan usaha:** kecil (≈1–2 hari).

---

## Opsi B — Tab Chat = layar inbox (mobile); desktop master–detail (disarankan jika lanjut)

| Platform | Perilaku |
|----------|----------|
| **Mobile** | `ViewId` **Chat** (atau setara): **main** = daftar room (org, proyek, tabel, baris) + unread; tap room → sheet atau layar obrolan penuh. |
| **Desktop** | Tab **Chat** di header: **kiri** daftar room (~280–360px) + **kanan** `ChatPanel` (reuse komponen). Saat tab Chat aktif, **panel kanan `w-96` tidak dipakai** untuk room yang sama (hindari duplikasi). |
| **Konteks kerja** | Dari **grid tabel / peta** tetap boleh buka chat baris/tabel lewat **panel/sheet kontekstual** (§7) — “kerja sambil chat”. |

| Pro | Kontra |
|-----|--------|
| Satu tempat “semua obrolan” di HP dan desktop | Perlu komponen **inbox** + query agregat room (belum ada) |
| Cocok setelah Kanban/Gantt disembunyikan | Dua jalur buka chat (tab vs konteks) perlu aturan UX |
| Desktop terasa seperti klien pesan ringan di tab khusus | Perkiraan sedang–besar (≈1+ minggu) |

**Perkiraan usaha:** sedang–besar.

**File sentuh (indikatif):** `workspace-views.ts`, `workspace-url.ts`, `workspace-client.tsx`, komponen baru `workspace-chat-inbox.tsx`, `workspace-right-panel.tsx`, `workspace-mobile-tabs.tsx`, notifikasi deep link, E2E.

---

## Opsi C — Tab Chat = inbox di main; detail selalu panel kanan

| Platform | Perilaku |
|----------|----------|
| **Mobile** | Tab Chat = daftar room; tap → **sheet** obrolan. |
| **Desktop** | Tab Chat = daftar room di **main** (lebar penuh); tap → **panel kanan** terbuka (sama seperti hari ini). |

| Pro | Kontra |
|-----|--------|
| Desktop tetap 3 kolom familiar | Di tablet sempit: inbox + panel `w-96` sempit |
| Inbox di main, detail di panel | Mirip klien email, bukan satu pane obrolan |

**Perkiraan usaha:** sedang.

---

## Perbandingan singkat

| Kriteria | A (sheet) | B (inbox + master–detail) | C (inbox + panel) |
|----------|-----------|---------------------------|-------------------|
| Ubah desktop layout | Minimal | Tab Chat, panel off saat tab Chat | Tab Chat, panel untuk detail |
| Inbox semua room | Opsional / ringkas | Ya, inti fitur | Ya |
| Selaras §7 kontekstual | Ya | Ya (dengan aturan) | Ya |
| Ruang di bottom bar 4 slot | 1 tombol / Lainnya | 1 tab Chat | 1 tab Chat |

---

## Tab yang disembunyikan sementara

| View | URL param | Catatan |
|------|-----------|---------|
| Kanban | `?view=kanban` | → Dashboard |
| Kalender | `?view=kalender` | → Dashboard |
| Gantt | `?view=gantt` | → Dashboard |

Aktifkan lagi: hapus entri dari `HIDDEN_WORKSPACE_VIEWS` di `app/src/app/workspace-modules.ts`.

Setelah disembunyikan, urutan mobile umum: **Home, Peta, Tabel, Berkas** di bar; **Laporan, Keuangan** di **Lainnya** (jika modul aktif).

---

## Rekomendasi sementara (belum diputuskan)

1. Tetap pakai **sheet + konteks** sampai inbox jelas (kebutuhan: daftar room, unread global, filter).
2. Jika butuh akses chat lebih cepat di HP tanpa inbox penuh → **Opsi A** dulu.
3. Jika inbox jadi fitur utama → **Opsi B** di mobile + desktop agar tidak dua produk berbeda.

---

## Keputusan (isi setelah timbang)

| Item | Pilihan | Tanggal | Catatan |
|------|---------|---------|---------|
| Opsi Chat mobile/desktop | **B** — inbox mobile + master–detail desktop | 2026-06-04 | `workspace-chat-inbox.tsx` |
| Chat mobile v2 (kontekstual) | Header org/proyek, guard akses, notifikasi | 2026-06-03 | `workspace-mobile-header-chat.tsx` |
| Tab Chat di bottom bar (4 slot) | **Chat** di bar (Home, Peta, Tabel, Chat) | 2026-06-03 | `workspace-mobile-tabs.tsx` |
| Panel kanan saat tab Chat (desktop) | **Off** saat `activeView === Chat`; konteks tabel/peta tetap panel | 2026-06-04 | Pola 2 |

---

## Changelog dokumen

| Tanggal | Perubahan |
|---------|-----------|
| 2026-06-04 | Draft opsi A/B/C; catatan sembunyikan Kanban/Kalender/Gantt |
| 2026-06-04 | Prasyarat `mobile-scope-flow-v2.md` Step 1–2 |
| 2026-06-04 | Keputusan produk: **Opsi B** |

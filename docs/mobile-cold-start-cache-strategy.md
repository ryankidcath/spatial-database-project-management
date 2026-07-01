# Mobile cold start — strategi cache setelah app di-kill

**Status:** PR-A, PR-B & PR-C selesai; PR-D belum.  
**Tanggal:** 2026-06-17  
**Konteks:** PWA mobile terasa lebih baik saat installed, tetapi jika user **menutup app dari recent apps** (proses WebView dimatikan), cold start memuat ulang data dan terasa lambat. Dokumen ini merencanakan perbaikan bertahap.

Referensi terkait:

- `docs/pwa-mobile-gestures-overscroll.md` — PWA install, overscroll, manifest (PR-1 s/d PR-3 selesai)
- `docs/mobile-workspace-guide.md` — layout & tab mobile
- `docs/performance-notes-workspace-scope.md` — bootstrap server `page.tsx`
- `app/src/app/page.tsx` — `dynamic = "force-dynamic"`, fetch workspace penuh
- `app/src/app/workspace-mobile-scope.ts` — wizard org/project (`sessionStorage`)
- `app/src/lib/chat-inbox-cache.ts`, `chat-room-cache.ts`, `activity-logs-cache.ts`, `virtual-table-rows-cache.ts`, `virtual-table-mobile-rows-cache.ts` — cache client (`sessionStorage` + memori)

---

## Masalah

| Kejadian | Dampak |
|----------|--------|
| App di-swipe dari recent apps | Proses browser mati → **state React + memori + `sessionStorage` hilang** |
| Buka ulang dari icon PWA | Cold start: HTML/JS baru + **fetch server penuh** (`page.tsx`) + fetch client (inbox, unread, chat, tabel) |
| `sessionStorage` cache hilang | Pola cache-first (inbox, aktivitas, baris tabel) **tidak bisa** instant paint |
| URL hanya `/` | Wizard mobile bisa muncul lagi meski user tadi sudah di workspace |

**Yang tetap setelah kill:** cookie login Supabase, `localStorage` (tema, preferensi view tabel per `virtual-table-view.tsx`).

**Bukan tujuan fase ini:** offline penuh tanpa jaringan; service worker agresif; duplikasi data permanen di server.

---

## Pola arsitektur target

**Stale-while-revalidate (SWR):**

1. Tampilkan **snapshot terakhir** dari storage lokal (jika ada & belum kedaluwarsa).
2. Login tetap dari cookie — tidak perlu login ulang.
3. **Sync background** ke Supabase / server actions.
4. Perbarui UI jika data server lebih baru.

Ini melanjutkan pola cache-first yang sudah ada; perubahan utama = **durability** (`sessionStorage` → `localStorage` / IndexedDB) dan **ukuran bootstrap server**.

---

## Dampak ke Supabase — ringkasan

| Aspek Supabase | Terpengaruh? | Penjelasan |
|----------------|--------------|------------|
| **Ukuran database (rows/storage)** | **Tidak** | Semua opsi di bawah menyimpan snapshot di **perangkat user** (browser), bukan tabel baru di Postgres |
| **Supabase Storage (file upload)** | **Tidak** | Tidak menambah file di bucket |
| **Jumlah read / RPC per cold start** | **Bisa turun atau naik** | Lihat tabel detail di bawah |
| **Egress / bandwidth** | **Netral–sedikit naik** | Background revalidate menambah request kecil; lazy bootstrap bisa **mengurangi** payload besar per buka |
| **Realtime** | **Tidak berubah** | Subscribe ulang seperti sekarang |

### Per prioritas rekomendasi

| # | Opsi | DB size | Read/API | Catatan |
|---|------|---------|----------|---------|
| 1 | Cache inbox/room meta → `localStorage` | Tidak | **Sama + revalidate** | Tetap fetch fresh; snapshot hanya untuk paint cepat. Unread **tidak** disimpan (sudah kebijakan `chat-inbox-cache.ts`) |
| 2 | Skeleton + parallel fetch client | Tidak | Sama | Hanya UX; tidak mengurangi query |
| 3 | Lazy bootstrap `page.tsx` per tab | Tidak | **Turun** pada cold start | Tab tidak dibuka = tidak fetch data tab itu |
| 4 | IndexedDB data besar | Tidak | Sama + revalidate | Kuota client lebih besar; server tidak menyimpan duplikat |
| 5 | Service worker asset-only | Tidak | **Turun** egress JS/CSS | Cache file statis di device |
| 10 | Mobile scope → `localStorage` | Tidak | **Netral** | Hindari wizard ulang; tidak mengurangi query workspace |

**Kesimpulan:** strategi ini **tidak membesarkan size database Supabase**. Yang perlu dimonitor di dashboard Supabase adalah **API requests / egress** — terutama jika revalidate background terlalu agresif (mitigasi: TTL, debounce, hanya saat `visibilityState === visible`).

---

## Urutan eksekusi (rekomendasi)

### PR-A — Mobile scope + inbox durable ✅

| Item | File / area | Spesifikasi |
|------|-------------|-------------|
| A1 | `workspace-mobile-scope.ts` | `localStorage` + migrasi sekali dari `sessionStorage` |
| A2 | `chat-inbox-cache.ts` | `localStorage`, TTL 30 menit, `client-durable-storage.ts` |
| A3 | `chat-room-cache.ts` | Sama pola A2 |
| A4 | `workspace-chat-inbox.tsx` | `useLayoutEffect` + `silent` fetch jika snapshot ada |
| — | `client-durable-storage.ts` | Utility bersama migrasi + TTL |

**QA:** kill app → buka icon → inbox tampil snapshot < 1s → preview/urutan ter-update tanpa spinner penuh.

---

### PR-B — Perceived performance + fetch paralel ✅

| Item | File / area | Spesifikasi |
|------|-------------|-------------|
| B1 | `workspace-chat-inbox.tsx` | Skeleton baris obrolan; static rooms tetap tampil |
| B2 | `workspace-chat-inbox.tsx` | `Promise.all` untuk row + meta + mentions |
| B3 | `workspace-chat-inbox.tsx` | Debounce 0ms tanpa cache, 300ms dengan cache |
| B4 | `workspace-activity-tab.tsx`, `workspace-mobile-row-list.tsx`, `workspace-virtual-table-list.tsx` | `workspace-mobile-list-skeleton.tsx` |

**QA:** cold start tanpa cache terasa terstruktur; dengan cache PR-A hampir instant.

---

### PR-C — Kurangi payload bootstrap server ✅

| Item | File / area | Spesifikasi |
|------|-------------|-------------|
| C1 | `page.tsx` | Shell: org, project, modul, vtables, anggota |
| C2 | `use-workspace-deferred-payload.ts` | Lazy fetch saat tab butuh payload (bukan Chat/Aktivitas/Tabel) |
| C3 | `fetch-workspace-deferred-payload-action.ts` + `workspace-deferred-payload-server.ts` | Server action; `force-dynamic` tetap |
| C4 | `loading.tsx` + skeleton Dashboard | Spinner + skeleton shell |

**QA:** cold start time-to-interactive tab Chat turun drastis; login & org/project tetap benar.

**Dampak Supabase:** **positif** — lebih sedikit query berat saat user hanya buka Chat.

---

### PR-D — IndexedDB untuk volume besar (effort sedang, setelah PR-A)

| Item | Spesifikasi |
|------|-------------|
| D1 | Pesan chat > N per room, baris tabel halaman pertama |
| D2 | Lib ringan (`idb-keyval` atau wrapper internal) |
| D3 | Migrasi dari `localStorage` jika kuota hampir penuh |
| D4 | TTL + eviction per org/project |

**QA:** org dengan banyak room/tabel tidak error `QuotaExceededError`.

---

### PR-E — Service worker asset-only (effort sedang, opsional)

| Item | Spesifikasi |
|------|-------------|
| E1 | Cache JS/CSS/font hashed Next.js |
| E2 | **Tidak** cache HTML/API dulu (hindari stale app) |
| E3 | Strategi update: activate on reload / toast “Versi baru” |
| E4 | Uji di Vercel + PWA installed |

**Dampak Supabase:** mengurangi egress asset; tidak mengubah DB.

---

### PR-F — Prefetch saat app masih hidup (effort rendah, melengkapi PR-A)

| Item | Spesifikasi |
|------|-------------|
| F1 | Saat `visibilitychange` → `hidden`, flush snapshot terbaru ke `localStorage`/IndexedDB |
| F2 | Prefetch inbox saat user di tab Dashboard (idle) |
| F3 | Jangan prefetch jika baterai rendah / save-data (opsional `navigator.connection`) |

---

## Inventaris cache saat ini

| Modul | Storage | Hilang saat kill? | Target fase |
|-------|---------|-------------------|-------------|
| Mobile scope wizard | `localStorage` (+ migrasi session) | **Tidak** | PR-A ✅ |
| Chat inbox | `localStorage` + memori | **Tidak** | PR-A ✅ |
| Chat room messages | `localStorage` + memori | **Tidak** | PR-A ✅ |
| Activity logs | `sessionStorage` + memori | Ya | PR-A atau PR-D |
| Virtual table rows (desktop) | `sessionStorage` + memori | Ya | PR-A (prioritas mobile overlay) |
| Mobile table rows | `sessionStorage` + memori | Ya | PR-A |
| View filter/sort tabel | `localStorage` | **Tidak** | Sudah OK |
| Tema | `localStorage` | **Tidak** | Sudah OK |
| Auth session | Cookie (Supabase SSR) | **Tidak** | Sudah OK |

---

## Kebijakan cache (tetap berlaku)

1. **Unread badge** — jangan simpan ke storage; selalu ambil dari server (`stripUnreadFromEntries`).
2. **Invalidasi** — tetap pakai event mutasi yang ada (`CHAT_UNREAD_INVALIDATE`, `VIRTUAL_TABLE_ROWS_MUTATED`, dll.).
3. **TTL disarankan** — 15–30 menit untuk snapshot; tampilkan stale sambil revalidate.
4. **Private mode / quota** — try/catch seperti cache existing; fallback fetch saja.
5. **Desktop** — boleh ikut `localStorage` dengan key sama; tidak wajib skeleton mobile.

---

## Pengujian QA (setelah implementasi)

| # | Skenario | Harapan |
|---|----------|---------|
| 1 | Kill app → buka icon (ada cache PR-A) | Inbox/scope tampil cepat; data menyusul update |
| 2 | Kill app → offline | Login cookie ada tapi data stale + indikator offline (jika ditambahkan nanti) |
| 3 | Kill app → URL `/` saja | Scope org/project dipulihkan dari `localStorage` |
| 4 | Deploy baru | Tidak perlu instal ulang; revalidate dapat versi baru |
| 5 | Kirim pesan → kill → buka | Pesan terbaru muncul setelah revalidate (bukan dari cache stale selamanya) |
| 6 | Dashboard Supabase | Read count cold start tidak melonjak tak terkendali |

---

## Risiko & mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Data stale terlihat “benar” | Timestamp `updatedAt`; indikator “Memperbarui…” (sudah ada di overlay tabel) |
| `localStorage` penuh (~5MB) | `MAX_SCOPES`, eviction, PR-D IndexedDB |
| Lebih banyak API read dari revalidate | TTL, debounce, sync hanya tab visible |
| Refactor `page.tsx` besar | PR-C bertahap: shell dulu, satu tab per PR |
| Stale SW (PR-E) | Asset-only; no API cache di fase 1 |

---

## Log keputusan

| Tanggal | Keputusan |
|---------|-----------|
| 2026-06-17 | PR-C: shell `page.tsx` + lazy deferred payload via server action |
| 2026-06-17 | PR-B: skeleton list, fetch paralel inbox, debounce adaptif |
| 2026-06-17 | PR-A: durable `localStorage` scope + inbox + room cache; utility `client-durable-storage.ts` |
| 2026-06-17 | Dokumen sumber kebenaran dibuat; urutan PR-A → B → C → D → E → F |
| 2026-06-17 | Strategi tidak menambah ukuran DB Supabase; monitor read/egress |
| 2026-06-17 | Pola target: stale-while-revalidate; lanjutkan cache-first existing |

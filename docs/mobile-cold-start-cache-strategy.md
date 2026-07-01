# Mobile cold start — strategi cache setelah app di-kill

**Status:** PR-A s/d PR-F selesai; PR-G2 awal selesai; PR-G lanjutan & PR-H+ direncanakan.  
**Tanggal:** 2026-07-01 (diperbarui)  
**Konteks:** PWA mobile terasa lebih baik saat installed, tetapi jika user **menutup app dari recent apps** (proses WebView dimatikan), cold start memuat ulang data dan terasa lambat. Dokumen ini merencanakan perbaikan bertahap.

Referensi terkait:

- `docs/pwa-mobile-gestures-overscroll.md` — PWA install, overscroll, manifest (PR-1 s/d PR-3 selesai)
- `docs/mobile-workspace-guide.md` — layout & tab mobile
- `docs/mobile-notifications-sound-push.md` — push OS; peluang prefetch dari service worker (PR-H)
- `docs/performance-notes-workspace-scope.md` — bootstrap server `page.tsx`
- `app/src/app/page.tsx` — `dynamic = "force-dynamic"`, fetch workspace shell
- `app/src/app/workspace-mobile-scope.ts` — wizard org/project (`localStorage`)
- `app/src/lib/chat-inbox-prefetch.ts` — prefetch inbox saat Dashboard idle (PR-F)
- `app/src/lib/client-indexed-db-storage.ts` — IndexedDB snapshot besar (PR-D)

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

### PR-D — IndexedDB untuk volume besar ✅

| Item | Spesifikasi |
|------|-------------|
| D1 | Pesan chat per room, baris tabel halaman pertama → IndexedDB |
| D2 | `client-indexed-db-storage.ts` + `client-durable-record-storage.ts` (tanpa dependency baru) |
| D3 | Migrasi otomatis dari `localStorage`/`sessionStorage` saat hydrate pertama |
| D4 | TTL 30 menit + eviction LRU per namespace (max 32 room, 24 tabel mobile, 48 halaman desktop, 8 scope aktivitas) |

**File:** `chat-room-cache.ts`, `virtual-table-mobile-rows-cache.ts`, `virtual-table-rows-cache.ts`, `activity-logs-cache.ts` + hydrate di `chat-panel`, overlay mobile, `virtual-table-view`, `workspace-client`.

**QA:** org dengan banyak room/tabel tidak error `QuotaExceededError`.

---

### PR-E — Service worker asset-only ✅

| Item | Spesifikasi |
|------|-------------|
| E1 | `public/sw.js` — cache `/_next/static/*`, font, ikon PWA |
| E2 | Bypass navigasi HTML, RSC (`RSC` header / `_rsc`), `/api/*`, `/auth/*` |
| E3 | `PwaServiceWorker` + toast Sonner “Versi baru tersedia” → muat ulang (`SKIP_WAITING`) |
| E4 | Hanya register di `NODE_ENV=production`; uji di Vercel + PWA installed |

**File:** `public/sw.js`, `pwa-service-worker-client.ts`, `components/pwa-service-worker.tsx`, `layout.tsx`.

**Dampak Supabase:** mengurangi egress asset; tidak mengubah DB.

---

### PR-F — Prefetch saat app masih hidup ✅

| Item | Spesifikasi |
|------|-------------|
| F1 | `DurableCacheLifecycle` — `visibilitychange` + `pagehide` → `flushDurableCachesOnBackground()` |
| F2 | `scheduleDashboardChatInboxPrefetch` di tab Dashboard (`requestIdleCallback`) |
| F3 | `client-background-cache-policy.ts` — skip prefetch jika `saveData` atau baterai <20% & tidak charging |

**File:** `client-durable-cache-flush.ts`, `chat-inbox-prefetch.ts`, `durable-cache-lifecycle.tsx`, flush per modul cache, `workspace-client.tsx`.

**QA:** user di Dashboard tanpa buka Chat → buka Chat nanti → inbox sudah di cache (jika prefetch selesai).

---

## Kenapa masih ada “loading” vs app native (WhatsApp)

| | App native (WhatsApp) | PWA Spatial PM (sekarang) |
|---|----------------------|---------------------------|
| Setelah kill | UI dari **SQLite lokal** (sinkron) | Boot WebView + JS + React + server shell |
| Sumber paint pertama | File DB di disk | `page.tsx` + hydrate IndexedDB (**async**) |
| Sync | Background service + FCM | Realtime (app hidup), Web Push (killed) |
| Data multi-scope | Satu DB lokal per app | Cache per org/project key; prefetch terbatas scope aktif |

**Kesimpulan:** gap UX bukan hanya “belum ada cache”, tapi **urutan startup** (server dulu, lokal menyusul). PR-G ke depan menargetkan **local-first paint**; PR-G2 menargetkan **warm-up progresif** setelah Dashboard interaktif.

---

## SQLite vs IndexedDB — perlu ganti?

| Opsi | Kapan | Catatan |
|------|-------|---------|
| **IndexedDB (sudah ada)** | Default lanjutan | Cukup untuk snapshot inbox, chat room, baris tabel, aktivitas |
| **SQLite WASM** (`wa-sqlite` + OPFS) | Query lokal kompleks (JOIN lintas tabel) | Dependency + kompleksitas; tidak otomatis mempercepat cold start |
| **Capacitor + SQLite native** | APK Play Store, sync agresif | Di luar PWA murni; UI React bisa sama |

**Keputusan sementara:** lanjutkan **IndexedDB + pola SWR**; pertimbangkan SQLite hanya jika query client-side menjadi bottleneck nyata.

---

## Background warm-up — konsep produk

### Prinsip utama

> **Warm-up berjalan diam-diam di background selama app terbuka (foreground), di halaman/tab mana pun** — Dashboard, Chat, Aktivitas, Tabel, dll. User **tidak perlu** pindah halaman agar prefetch jalan.

| | Sebelum PR-G2 | Setelah PR-G2 (implementasi awal) |
|---|---------------|-----------------------------------|
| Kapan prefetch jalan | Hanya saat `activeView === "Dashboard"` | Saat workspace siap, **semua tab** |
| Scope chat inbox | Org + project aktif saja | Project aktif dulu, lalu project lain + scope org |
| Aktivitas | Hanya saat user buka tab Aktivitas | Prefetch snapshot org di background |
| Blocking UI | Tidak | Tidak — antrian `requestIdleCallback` |

### Pertanyaan awal

> User buka app → loading sebentar → Dashboard muncul. **Bisakah** data tab/halaman lain tetap dimuat di background walaupun user tidak pindah tab?

**Jawaban: ya.** PR-F memulai pola ini (inbox saat Dashboard); **PR-G2** memperluas ke **semua halaman** dan **multi-project**.

**Implementasi awal PR-G2 ✅:** `client-warmup-queue.ts`, `workspace-warmup.ts`, `activity-logs-prefetch.ts`; `workspace-client.tsx` memanggil `startWorkspaceWarmup` tanpa syarat `activeView`.

Yang **belum** (lanjutan PR-G2 / PR-G):

- Prefetch **org lain** (multi-tenant)
- Prefetch baris tabel halaman 1 per tabel
- Deferred payload PLM/Map untuk scope non-aktif
- Indikator UI “Menyinkronkan…” (opsional)

### Pola target: **progressive warm-up**

```
[Cold start]
  → paint shell + halaman aktif (PR-G: bisa dari snapshot lokal)
  → user bisa interaksi di tab mana pun

[Background warm-up queue — tidak blocking UI, tab apa pun]
  Prioritas 0: aktivitas org + inbox project terpilih
  Prioritas 1+: inbox project lain dalam org + scope org-level
  Prioritas lanjutan: org lain, tabel, deferred payload
  Setiap job: fetch → tulis IndexedDB/localStorage → tidak update UI kecuali badge
```

**Ini bukan “Background Sync API” murni** — ini **idle prefetch** saat app **visible** (halaman apa pun). Nama internal: **warm-up queue**.

### Prasyarat warm-up

Gunakan kebijakan yang sama dengan PR-F (`client-background-cache-policy.ts`):

- Skip jika `navigator.connection.saveData`
- Skip jika baterai < 20% dan tidak charging
- Pause queue jika `document.visibilityState !== "visible"`
- Batasi konkurensi (mis. 1–2 fetch paralel)
- Hormati TTL — jangan re-fetch jika snapshot masih fresh (30 menit)

### Data per scope yang layak di-warm-up

| Dataset | Storage | Prioritas | Catatan |
|---------|---------|-----------|---------|
| Chat inbox | `localStorage` | Tinggi | Sudah PR-F untuk scope aktif |
| Chat room (room populer / terakhir dibuka) | IndexedDB | Sedang | LRU; max 32 room |
| Activity logs (halaman pertama) | IndexedDB | Sedang | Key per org/project |
| Virtual table list meta | Memori + optional cache | Sedang | Sudah di shell server |
| Baris tabel (halaman 1 per tabel mobile) | IndexedDB | Rendah | Mahal; hanya tabel yang pernah dibuka atau top N |
| Deferred payload (PLM, Map, Finance) | Memori | Rendah | Hanya jika modul aktif di org |

### Multi-project / multi-org

User story: *“Punya banyak project — pindah project ingin langsung cepat.”*

Strategi bertahap:

1. **Minimal viable:** warm-up **semua project dalam org aktif** (inbox + activity ringkas) setelah Dashboard idle.
2. **Lanjutan:** ingat **project terakhir dikunjungi** (`localStorage`) → prioritas lebih tinggi.
3. **Org lain:** warm-up hanya metadata ringan (daftar project) dulu; inbox org lain saat user pernah switch atau idle panjang.

Mitigasi Supabase: monitor read count; cap mis. **max 5 scope warm-up per sesi** atau stop setelah **30 detik** idle work.

### Hubungan dengan halaman aktif

Alur UX:

1. Loading awal → halaman default tampil (sering Dashboard).
2. **Tanpa aksi user**, antrian warm-up jalan di belakang — **meski user tetap di Chat atau tab lain**.
3. User buka tab/data scope lain nanti → **cache hit** → hampir instant.

Saat user **ganti org/project**, antrian di-reset dan prioritas dihitung ulang (project terpilih dulu).

Indikator opsional (belum): ikon kecil “Menyinkronkan…” di header.

---

### PR-G2 — Progressive warm-up queue ✅ (awal)

| Item | File / area | Status |
|------|-------------|--------|
| G2-1 | `client-warmup-queue.ts` | ✅ Antrian idle, pause on hidden, budget sesi |
| G2-2 | `chat-inbox-prefetch.ts` | ✅ Dipakai per scope project |
| G2-3 | `activity-logs-prefetch.ts` | ✅ Snapshot aktivitas per org |
| G2-4 | `workspace-warmup.ts` + `workspace-client.tsx` | ✅ `startWorkspaceWarmup` — **semua tab** |
| G2-5 | `client-background-cache-policy.ts` | ✅ Max 12 job / 30s per sesi |
| G2-6 | Multi-org, tabel rows, deferred payload | ✅ |

**QA:** buka app → tetap di Chat 30s → pindah project → inbox project lain dari cache. Atau buka Aktivitas tanpa pernah buka tab itu sebelumnya → snapshot sudah ada.

**Catatan produk:** warm-up **tidak memerlukan** user di Dashboard; jalan di **halaman mana pun** selama app foreground + idle.

**PR-G2-6 (file):** `workspace-warmup-scope.ts`, `virtual-table-mobile-rows-prefetch.ts`, `workspace-deferred-payload-cache.ts`, `workspace-deferred-payload-prefetch.ts`; org lain = aktivitas + inbox project pertama saja (tanpa deferred/tabel).

### PR-H — Push-triggered cache (service worker) 🔲

| Item | Spesifikasi |
|------|-------------|
| H1 | `sw.js` `push` handler — selain `showNotification`, tulis payload/minimal fetch ke IndexedDB |
| H2 | Koordinasi key cache dengan `chat-inbox-cache` / room cache |
| H3 | Tap notifikasi → cold start dengan data push sudah di disk |

**QA:** kill app → kirim pesan → notifikasi OS → buka app → preview chat sudah ada sebelum Realtime connect.

**Catatan:** SW tidak bisa akses IndexedDB namespace app sembarangan — perlu kontrak key + mungkin `postMessage` ke client saat app hidup.

---

### PR-I — Outbox offline + Background Sync API 🔲

| Item | Spesifikasi |
|------|-------------|
| I1 | Antrian aksi gagal (kirim chat, patch baris) di IndexedDB |
| I2 | `registration.sync.register('spatial-pm-outbox')` di SW (Chromium) |
| I3 | Retry drain ke Supabase saat online |

**QA:** mode pesawat → kirim chat → tampil optimistic → online → terkirim tanpa user refresh.

**Prioritas:** setelah PR-G2; relevan untuk lapangan sinyal lemah.

---

### PR-J — SQLite WASM (opsional) 🔲

Hanya jika PR-G2 + IndexedDB tidak cukup untuk query gabungan lokal. Evaluasi ulang setelah metrik.

---

### PR-K — Capacitor / native shell (opsional, jangka panjang) 🔲

APK dengan SQLite native + background task — keluar dari scope PWA murni.

---

## Inventaris cache saat ini

| Modul | Storage | Hilang saat kill? | Target fase |
|-------|---------|-------------------|-------------|
| Mobile scope wizard | `localStorage` (+ migrasi session) | **Tidak** | PR-A ✅ |
| Chat inbox | `localStorage` + memori | **Tidak** | PR-A ✅ |
| Chat room messages | IndexedDB + memori (+ migrasi localStorage) | **Tidak** | PR-D ✅ |
| Activity logs | IndexedDB + memori (+ migrasi session) | **Tidak** | PR-D ✅ |
| Virtual table rows (desktop) | IndexedDB + memori (+ migrasi session) | **Tidak** | PR-D ✅ |
| Virtual table mobile rows | IndexedDB + memori | **Tidak** | PR-D ✅ / warm-up PR-G2-6 ✅ |
| Deferred payload (Map/PLM) | IndexedDB | **Tidak** | PR-G2-6 ✅ |
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
| 7 | PR-G2: tunggu 30s di Dashboard → buka Chat project lain | Inbox project lain dari cache warm-up |
| 8 | PR-G2: saveData / baterai rendah | Warm-up queue tidak jalan |

---

## Risiko & mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Data stale terlihat “benar” | Timestamp `updatedAt`; indikator “Memperbarui…” (sudah ada di overlay tabel) |
| `localStorage` penuh (~5MB) | `MAX_SCOPES`, eviction, PR-D IndexedDB |
| Lebih banyak API read dari revalidate | TTL, debounce, sync hanya tab visible, **budget warm-up queue** (PR-G2) |
| Refactor `page.tsx` besar | PR-C bertahap: shell dulu; PR-G client paint |
| Stale SW (PR-E) | Asset-only; no API cache di fase 1 |
| Warm-up multi-project membanjiri API | Cap scope/sesi; prioritas project terakhir; hentikan saat hidden |

---

## Log keputusan

| Tanggal | Keputusan |
|---------|-----------|
| 2026-07-01 | PR-G s/d K direncanakan; SQLite/Capacitor opsional — IndexedDB cukup dulu |
| 2026-07-01 | PR-G2-6: multi-org warm-up ringan, prefetch baris tabel mobile (max 3), deferred payload cache |
| 2026-07-01 | Prinsip: user di halaman mana pun → data lain tetap di-load diam-diam (idle prefetch) |
| 2026-07-01 | Bedakan istilah: *warm-up queue* (idle prefetch app hidup) vs *Background Sync API* (outbox offline, PR-I) vs *push→SW→disk* (PR-H) |
| 2026-06-17 | PR-C: shell `page.tsx` + lazy deferred payload via server action |
| 2026-06-17 | PR-B: skeleton list, fetch paralel inbox, debounce adaptif |
| 2026-06-17 | PR-A: durable `localStorage` scope + inbox + room cache; utility `client-durable-storage.ts` |
| 2026-06-17 | Dokumen sumber kebenaran dibuat; urutan PR-A → B → C → D → E → F |
| 2026-06-17 | Strategi tidak menambah ukuran DB Supabase; monitor read/egress |
| 2026-06-17 | Pola target: stale-while-revalidate; lanjutkan cache-first existing |

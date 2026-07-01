# PWA mobile — gesture browser & pencegahan pull-to-refresh

**Status:** PR-1, PR-2 & PR-3 selesai.  
**Tanggal:** 2026-06-17  
**Konteks:** Rencana menjadikan workspace mobile sebagai **PWA** (Add to Home Screen / installed app). User tidak boleh tidak sengaja **refresh halaman** saat menggeser ke bawah di daftar obrolan, aktivitas, atau tabel.

Referensi terkait:

- `docs/mobile-workspace-guide.md` — panduan layout mobile & safe area
- `docs/mobile-scope-flow-v2.md` — alur wizard org → project → workspace
- `app/src/app/layout.tsx` — `viewportFit: cover`, `interactiveWidget: resizes-content`
- `app/src/app/workspace-client.tsx` — shell `h-svh` + `overflow-hidden`
- `app/src/app/globals.css` — safe area peta + **PR-1** overscroll global & `.pm-mobile-scroll`

---

## Ringkasan keputusan

| Topik | Keputusan |
|-------|-----------|
| Pull-to-refresh browser | **Diblok** di level halaman (`html`/`body`) pada mobile |
| Scroll internal (list chat, aktivitas, tabel) | **Tetap aktif**; pakai `overscroll-behavior-y: contain` |
| Composer chat mobile | **Tetap** `touch-none` + `overscroll-none` (jangan diubah) |
| Swipe back wizard (`WorkspaceMobileSwipeBack`) | **Tetap**; gesture horizontal tepi kiri, tidak bentrok dengan PTR vertikal |
| Desktop (`md+`) | **Tidak** terpengaruh rule overscroll global |
| Manifest PWA | **Belum ada** di repo; bagian terpisah di bawah (checklist) |

---

## Masalah yang ingin dicegah

1. **Pull-to-refresh (PTR)** — di Chrome Android / Safari, tarik ke bawah saat scroll di atas bisa me-refresh seluruh halaman → kehilangan state client, loading ulang workspace, UX seperti “app crash”.
2. **Overscroll chaining** — saat list internal sudah di posisi paling atas, geser lanjut “menular” ke `body` dan memicu PTR atau rubber-band.
3. **Refresh tidak disengaja saat chat** — user scroll daftar obrolan atau pesan; jangan sampai memicu reload halaman.

**Bukan tujuan:** memblokir semua gesture (mis. scroll vertikal normal, keyboard, pinch zoom di peta jika diperlukan).

---

## Perilaku per mode instalasi

| Mode | PTR / gesture browser | Catatan |
|------|------------------------|---------|
| Tab browser mobile | Paling sering masalah PTR | Rule CSS wajib |
| PWA installed (`display: standalone`) | PTR biasanya berkurang | Rule CSS **tetap wajib** (Safari/iOS masih bisa overscroll) |
| Desktop | Bukan fokus | Rule hanya `@media (max-width: 767px)` |

---

## Arsitektur scroll mobile (baseline kode)

```
html/body
└─ workspace-client root: h-svh, overflow-hidden
   └─ main section: overflow-hidden + padding tab bar
      └─ ScrollArea (mobile Chat/Aktivitas/Tabel/Map: fillAvailableHeight)
         └─ TabsContent → panel tab
            └─ scroll container dalam (overflow-y-auto)  ← target overscroll-y-contain
```

**Sudah benar:**

- Root workspace fixed viewport: `workspace-client.tsx` (`h-svh max-h-svh overflow-hidden`).
- Pesan chat: `chat-panel.tsx` list sudah `overscroll-y-contain`.
- Composer chat mobile: `touch-none overscroll-none`.

**Belum ada guard overscroll (rencana implementasi):**

| Area | File | Selector / elemen |
|------|------|-------------------|
| Global halaman | `globals.css` | `html, body` @mobile — **PR-1 selesai** |
| Daftar obrolan | `workspace-chat-inbox.tsx` | `<ul>` — **PR-2 selesai** |
| Aktivitas | `workspace-activity-tab.tsx` | `<ul>` — **PR-2 selesai** |
| Tab Tabel (daftar kartu tabel) | `workspace-client.tsx` | wrapper `overflow-y-auto` saat `isBelowMd` — **PR-2 selesai** |
| Overlay baris tabel | `workspace-mobile-virtual-table-overlay.tsx` | scroll body — **PR-2 selesai** |

**Tidak perlu diubah untuk PTR:**

- `WorkspaceMobileSwipeBack` — swipe dari tepi kiri ≤48px, horizontal; beda sumbu dengan PTR.
- Dialog / sheet dengan scroll sendiri — PTR halaman sudah diblok di `body`; dialog boleh `overscroll-y-contain` jika nanti ada keluhan.

---

## Spesifikasi implementasi (untuk eksekusi)

### 1. Global — `globals.css`

Hanya mobile (`max-width: 767px`, selaras breakpoint `md` / `useIsBelowMd`):

```css
@media (max-width: 767px) {
  html,
  body {
    overscroll-behavior-y: none;
    overscroll-behavior-x: none;
  }
}
```

**Alasan:** memutus rantai overscroll ke viewport browser. Scroll di dalam container internal tidak terpengaruh.

### 2. Utility bersama (disarankan)

```css
@media (max-width: 767px) {
  .pm-mobile-scroll {
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
}
```

Pasang class `pm-mobile-scroll` pada keempat container scroll utama (atau tambahkan utility Tailwind setara: `overflow-y-auto overscroll-y-contain`).

### 3. Tailwind inline (alternatif tanpa utility class)

Pada setiap container di tabel di atas, tambahkan:

`overflow-y-auto overscroll-y-contain`

Opsional iOS: `[-webkit-overflow-scrolling:touch]` jika scroll terasa berat.

### 4. Yang tidak boleh

- Jangan set `overscroll-behavior: none` pada **semua** elemen — scroll dalam bisa terasa kaku.
- Jangan hapus `touch-none` pada composer chat.
- Jangan ubah `WorkspaceMobileSwipeBack` tanpa uji regresi wizard org/project.

---

## PWA manifest (PR-3 selesai)

| Item | Nilai |
|------|-------|
| `display` | `standalone` |
| `start_url` | `/` |
| `theme_color` / `background_color` | `#ffffff` (light); meta `themeColor` dark `#252525` |
| Icons | `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` |
| iOS | `metadata.appleWebApp` di `layout.tsx` |

File:

- `app/public/manifest.webmanifest`
- `app/public/icons/` — PNG 192, 512, 180 (apple)
- `app/src/app/layout.tsx` — `manifest`, `icons`, `appleWebApp`, `themeColor`

**Catatan:** manifest standalone **tidak menggantikan** rule overscroll; keduanya dipakai bersamaan.

---

## Pengujian QA (wajib setelah implementasi)

Lakukan di **Chrome Android** (tab + installed) dan **Safari iOS** (tab + Add to Home Screen):

| # | Skenario | Harapan |
|---|----------|---------|
| 1 | Tab Obrolan — list di atas, tarik ke bawah | Tidak refresh halaman; list tidak “loncat” reload |
| 2 | Tab Obrolan — scroll panjang | Scroll normal ke atas/bawah |
| 3 | Percakapan chat — scroll pesan | Normal; composer tetap bisa fokus + keyboard |
| 4 | Tab Aktivitas — PTR di atas list | Tidak refresh halaman |
| 5 | Tab Tabel — daftar tabel | Tidak refresh |
| 6 | Overlay baris tabel — daftar baris | Tidak refresh |
| 7 | Wizard mobile — swipe back tepi kiri | Masih kembali ke picker org/project |
| 8 | Tab Dashboard (jika scroll) | Tidak refresh tidak sengaja (atau terima jika konten panjang — prioritaskan tab Chat/Aktivitas/Tabel) |
| 9 | Desktop `≥768px` | Tidak ada regresi scroll / PTR |

---

## Risiko & mitigasi

| Risiko | Mitigasi |
|--------|----------|
| iOS Safari tetap rubber-band sedikit | `html/body` none + `contain` di list; uji di perangkat nyata |
| Scroll “mentok” di nested container | Hanya satu primary scroller per layar (sudah pola flex + `min-h-0`) |
| Regresi keyboard chat | Jangan ubah `interactiveWidget` / composer padding; QA item 3 |
| Peta Leaflet gesture | PTR halaman diblok; gesture peta terpisah di `.workspace-map-root` |

---

## Urutan eksekusi (PR kecil)

1. ~~**PR-1:** `globals.css` global overscroll mobile + utility `pm-mobile-scroll`~~ ✅
2. ~~**PR-2:** Terapkan ke 4 file container (inbox, aktivitas, tabel wrapper, overlay baris)~~ ✅
3. ~~**PR-3 (opsional):** manifest PWA + icon~~ ✅
4. **QA:** checklist di atas + screenshot before/after

---

## Log keputusan

| Tanggal | Keputusan |
|---------|-----------|
| 2026-06-17 | PR-3: `manifest.webmanifest`, icons PNG, metadata PWA di `layout.tsx` |
| 2026-06-17 | PR-2: `pm-mobile-scroll` di inbox, aktivitas, tab Tabel, overlay baris |
| 2026-06-17 | PR-1: `html/body` overscroll none + utility `.pm-mobile-scroll` di `globals.css` |
| 2026-06-17 | Dokumen sumber kebenaran dibuat; implementasi CSS ditunda sampai dokumen disetujui |
| 2026-06-17 | Strategi: block PTR di `html/body`, `contain` di scroll internal, composer tidak diubah |
| 2026-06-17 | Manifest PWA dicatat terpisah; belum ada di codebase |

# Panduan mobile workspace — penerapan bertahap

Dokumen ini menjadi **guide implementasi** responsif untuk Spatial PM workspace (sidebar, tab utama, panel kanan chat, tabel virtual, peta).  
**Status:** Fase 0–5 + **mobile v2 Step 1–6** selesai (2026-06-03). Rencana: `docs/mobile-scope-flow-v2.md`.

Referensi terkait:

- `docs/mobile-scope-flow-v2.md` — **rencana eksekusi berikutnya** (org → project → workspace, tabel → baris → detail edit)
- `docs/chat-feature-decisions.md` — model chat & panel kanan desktop
- `docs/chat-tab-navigation-options.md` — opsi tab Chat / inbox (draft; putuskan setelah v2 Step 5)
- `docs/performance-notes-workspace-scope.md` — muat data workspace di server
- `app/src/app/workspace-client.tsx`, `workspace-right-panel.tsx`, `virtual-table-view.tsx`

---

## Ringkasan produk

| Platform | Peran utama |
|----------|-------------|
| **Desktop / tablet landscape** | Kerja penuh: grid tabel, edit sel, peta, PLM, chat samping |
| **Tablet portrait / HP** | Navigasi, notifikasi, chat singkat, lihat status; **bukan** pengganti editor grid penuh |

Prinsip: **satu layar aktif** di viewport sempit — jangan memaksa tiga kolom (sidebar + main + panel chat) sekaligus.

---

## Kondisi codebase saat ini (baseline)

### Layout workspace

```
┌─────────────┬──────────────────────┬──────────────┐
│  Sidebar    │       Main           │ Panel kanan  │
│  w-80       │  (tabs + konten)     │  w-96        │
│  (320px)    │                      │  (384px)     │
└─────────────┴──────────────────────┴──────────────┘
```

- `workspace-client.tsx`: flex horizontal; sidebar `w-80`, toggle `isSidebarCollapsed` (default **terbuka**).
- `WorkspaceRightPanel`: `aside` tetap `w-96 shrink-0` di samping `main` — **bukan** overlay di mobile.
- Padding luar workspace: `p-3` pada container rounded.

### Chat & tabel

- Chat: panel kanan (`WorkspaceRightPanel`), scope org / project / tabel / baris — lihat chat-feature-decisions §7.
- Tabel tab: preview embedded (paginated) + overlay **Tabel lengkap** (`layout="overlay"`).
- Tombol chat baris di grid: ikon kecil, opacity rendah; `isRowPanelOpen` belum dipakai untuk highlight aktif.

### Login

- Halaman `/login`: sudah `max-w-sm`, form satu kolom; loading submit (`useFormStatus`) + `app/loading.tsx` setelah redirect.
- Performa post-login: `page.tsx` masih memuat banyak modul sekaligus (lihat performance-notes).

### Komponen UI

- Belum ada `Sheet` / `Drawer` di `components/ui/` (hanya `Dialog`, `Popover`, dll.).
- Breakpoint Tailwind dipakai sporadis (`sm:` di tab list, beberapa dialog); **tidak** ada pola mobile khusus workspace.

### Risiko di layar ~390px

- Main hampir tidak terlihat jika sidebar + panel chat terbuka.
- Tap target kecil di aksi baris tabel.
- Scroll horizontal tabel berat tetapi masih usable.

---

## Keputusan desain (target)

### Breakpoint rekomendasi

| Token | Lebar | Perilaku workspace |
|-------|-------|-------------------|
| default | `< 768px` | **Mobile** — satu layar aktif, overlay/sheet |
| `md` | `≥ 768px` | **Tablet** — sidebar drawer; panel chat bisa sheet atau sempit |
| `lg` | `≥ 1024px` | **Desktop** — layout 3 kolom seperti sekarang (opsional: sidebar collapse) |

**Keputusan awal:** gunakan **`md` (768px)** sebagai batas mobile ↔ desktop layout, kecuali uji lapangan meminta `lg`.

### Satu layar aktif (mobile)

| Konteks | Yang tampil |
|---------|-------------|
| Navigasi org/project | Wizard + chip scope header (sidebar **tidak** dipakai di mobile) |
| Tabel | Tab **Tabel** (kartu); bukan sidebar |
| Kerja (tab) | **Main** full width |
| Chat / detail baris | **Sheet** ~`90dvh` (bawah atau kanan), menutupi main — bukan kolom ketiga |
| Overlay tabel lengkap | Tetap full-bleed di `main`; panel chat sheet **di atas** overlay |

### Chat mobile

- Room & RLS **tidak berubah** — hanya shell UI.
- Satu komponen isi: `ChatPanel` + header path (`RowChatContextPath`) + tab Detail | Chat untuk baris.
- Buka dari: sidebar, header tabel, baris grid, popup peta → sheet yang sama (`virtual_row` dari peta = dari tabel).

### Tabel mobile

- Tab **Tabel**: daftar kartu per tabel (bukan banyak preview grid stacked).
- Tap tabel → layar penuh overlay / route dedicated (reuse `VirtualTableView` `layout="overlay"`).
- Edit intensif: prioritaskan tab **Detail** di sheet baris; inline edit grid opsional fase belakang.
- Chat baris: ikon lebih besar, state aktif jelas, min touch target **44×44px**.

### Login mobile

- Pertahankan pola sekarang; pastikan tombol submit ≥ 44px tinggi efektif.
- Loading workspace: `loading.tsx` sudah cukup; pertimbangkan skeleton ringan fase 2.

### Performa (paralel dengan layout)

- Lazy-load data per tab/modul di `page.tsx` (tidak blocking layout mobile).
- Lihat `performance-notes-workspace-scope.md`.

---

## Fase implementasi

Setiap fase bisa PR terpisah. Centang `[ ]` saat selesai.

### Fase 0 — Persiapan (tanpa ubah UX besar)

- [x] Tambah komponen `Sheet` (Base UI `Drawer`) ke `components/ui/sheet.tsx`
- [x] Hook utilitas `useMediaQuery` / `useIsBelowMd` — `lib/use-media-query.ts`, `lib/breakpoints.ts`
- [ ] Dokumentasi breakpoint di Storybook / catatan QA manual (opsional)
- [x] Viewport meta di `app/src/app/layout.tsx` (`export const viewport`)

**File sentuh:** `components/ui/sheet.tsx`, `lib/use-media-query.ts`, `lib/breakpoints.ts`.

---

### Fase 1 — Quick wins (dampak langsung di HP)

**Tujuan:** layar tidak “pecah” tiga kolom; user tahu sesuatu terjadi saat tap.

| Item | Perubahan | File utama |
|------|-----------|------------|
| Sidebar default tutup di mobile | `useState` awal atau `useEffect` set collapsed jika `< md` | `workspace-client.tsx` |
| Sidebar sebagai drawer | Di mobile: `fixed inset-0 z-40`, backdrop klik tutup; di desktop: perilaku sekarang | `workspace-client.tsx` |
| Panel kanan → sheet | `< md`: `WorkspaceRightPanel` render di `Sheet` full height; `≥ md`: `aside` `w-96` | `workspace-right-panel.tsx`, mungkin wrapper baru |
| Padding responsif | `p-3` → `p-2 md:p-3`; header `px-4 md:px-6` | `workspace-client.tsx` |
| Chat baris — feedback | Pakai `isRowPanelOpen(rowId)`; opacity/touch target tombol | `virtual-table-view.tsx` |

**Acceptance criteria (Fase 1):**

- [x] iPhone/Android portrait: hanya **main** yang terlihat saat mulai; sidebar tidak memakan 320px permanen.
- [x] Buka chat tabel/baris: sheet `90dvh`, tutup via X / swipe / backdrop (`WorkspaceRightPanel` + `Sheet`).
- [x] Toggle sidebar: overlay + backdrop; tidak mendorong main ke lebar ~0.
- [x] Regresi desktop `≥ md`: layout 3 kolom masih berfungsi seperti sekarang.
- [x] Chat baris: `isRowPanelOpen`, touch target 44px, highlight aktif.

**Implementasi (2026-06-03):** `workspace-client.tsx` (drawer sidebar), `workspace-right-panel.tsx` (sheet mobile), `virtual-table-view.tsx` (tombol chat baris).

**Risiko / catatan:**

- `WorkspaceRightPanelCloser` / `TableSync` — pastikan sheet open/close tetap sinkron dengan state context yang ada.
- `z-index`: overlay tabel (`z-20`) vs sheet chat (`z-30`+) — urutan harus konsisten.

---

### Fase 2 — Navigasi & tab utama

| Item | Perubahan |
|------|-----------|
| Bottom tab bar (opsional) | 4–5 tab sering dipakai: Dashboard, Map, Tabel, Berkas, … — hanya `< md` |
| Tab list atas | Tetap wrap atau disembunyikan jika bottom bar ada |
| Breadcrumb header | Truncate + satu baris di mobile |
| Notifikasi bell | Popover lebar penuh `max-w-[calc(100vw-2rem)]` di mobile |

**File utama:** `workspace-client.tsx`, komponen baru `workspace-mobile-tabs.tsx` (opsional).

**Acceptance criteria:**

- [x] Ganti tab tanpa membuka sidebar panjang (bottom bar + tab list tersembunyi di `< md`).
- [x] Scope org/project masih jelas di header (breadcrumb satu baris truncate di mobile).

**Implementasi (2026-06-03):** `workspace-mobile-tabs.tsx`, `workspace-client.tsx` (bottom bar, breadcrumb), `notifications-bell.tsx` (panel fixed di atas tab bar).

---

### Fase 3 — Tabel virtual mobile-first

| Item | Perubahan |
|------|-----------|
| Daftar tabel di tab Tabel | Kartu ringkas per tabel; tap → overlay lengkap |
| Kurangi preview embedded | Opsional: sembunyikan grid 50-baris di `< md`, hanya daftar + CTA “Buka” |
| Overlay tabel | Toolbar wrap; tombol Chat tabel / Filter touch-friendly |
| Detail baris | Tab Detail di sheet sebagai form read-only / edit field vertikal |

**File utama:** `virtual-table-view.tsx`, `workspace-client.tsx` (TabsContent Tabel).

**Acceptance criteria:**

- [x] Satu tabel per layar penuh; scroll horizontal masih jalan untuk banyak kolom.
- [x] Chat baris dari grid membuka sheet yang sama seperti desktop panel.

**Implementasi (2026-06-03):** `workspace-virtual-table-list.tsx`, tab Tabel mobile di `workspace-client.tsx`, toolbar overlay + detail baris di `virtual-table-view.tsx` / `workspace-right-panel.tsx`.

---

### Fase 4 — Peta & notifikasi

| Item | Perubahan |
|------|-----------|
| Map | Kontrol peta tidak tertutup sheet; popup “Chat baris” buka sheet |
| Mention notification | Deep link → sheet chat + tab Map jika geometri |

**File utama:** `workspace-map.tsx`, `workspace-client.tsx` (handler notifikasi), `globals.css`.

**Acceptance criteria:**

- [x] Kontrol zoom/atribusi peta tidak tertutup bottom tab bar (CSS + posisi kontrol).
- [x] Popup **Chat baris** → sheet (`openVirtualRowChatPanel`, tutup popup Leaflet).
- [x] Notifikasi mention baris/geometri → tab Map + sheet chat (`closeWhenOverlayCloses: false`).

**Implementasi (2026-06-03):** `openVirtualRowChatPanel`, kontrol peta mobile di `workspace-map.tsx` + `globals.css`, toolbar lapisan peta touch-friendly.

---

### Fase 5 — Performa & polish

| Item | Perubahan |
|------|-----------|
| Data loading | Lazy per tab; kurangi payload awal `page.tsx` di mobile (jika terukur perlu) |
| `100dvh` / safe area | Sheet & overlay hormati `env(safe-area-inset-*)` |
| E2E | Playwright viewport mobile untuk smoke: login, buka sheet chat, tutup sidebar |
| A11y | Focus trap di sheet; `aria-modal`; tombol tutup terlihat |

**Acceptance criteria:**

- [x] Tab hanya di-mount saat pertama dikunjungi (`TabPanelKeepAlive`; Map/Kanban/dll. sudah `dynamic()`).
- [x] Shell mobile `100dvh` + `viewportFit: cover` + inset pada sidebar, sheet, tab bar, overlay tabel, kontrol peta.
- [x] Sheet: `role="dialog"`, `aria-modal`, `aria-labelledby`, tombol tutup 44px.
- [x] E2E `e2e/mobile-workspace.spec.ts` + proyek Playwright `mobile-chrome` (Pixel 5).

**Catatan:** pemecahan fetch server `page.tsx` per tab tetap di `performance-notes-workspace-scope.md` (medium term); Fase 5 fokus lazy client + polish.

**Implementasi (2026-06-03):** `workspace-client.tsx`, `sheet.tsx`, `workspace-right-panel.tsx`, `layout.tsx`, `playwright.config.ts`, `e2e/mobile-workspace.spec.ts`.

---

## Pola teknis (implementasi)

### Deteksi mobile

```tsx
// Contoh kontrak — implementasi di lib/
export function useIsBelowMd(): boolean;
// true jika window.matchMedia("(max-width: 767px)").matches
```

Hindari duplikasi breakpoint di banyak file — satu hook atau context `WorkspaceLayoutMode: "mobile" | "desktop"`.

### Panel kanan responsif (sketsa)

```tsx
// Pseudocode — bukan kode final
const isMobile = useIsBelowMd();
const { panel, closePanel, ... } = useWorkspaceRightPanel();

if (!panel) return null;

if (isMobile) {
  return (
    <Sheet open onOpenChange={(o) => !o && closePanel()}>
      <SheetContent side="bottom" className="h-[90dvh] p-0">
        <RightPanelContent ... />
      </SheetContent>
    </Sheet>
  );
}

return <aside className="w-96 ...">...</aside>;
```

Ekstrak isi panel ke komponen bersama (`RightPanelContent`) agar `ChatPanel` / header tidak duplikat.

### Sidebar drawer (sketsa)

- Mobile + sidebar open: `fixed inset-y-0 left-0 w-80 z-50` + `fixed inset-0 bg-black/50 z-40` onClick close.
- Mobile + collapsed: sidebar `w-0` atau off-screen (sama seperti desktop collapsed).
- Desktop: pertahankan transisi `w-80` / `w-0` di flow dokumen.

### State yang sudah ada (jangan rusak)

| State / komponen | Perilaku yang dipertahankan |
|------------------|----------------------------|
| `WorkspaceRightPanelProvider` | Satu sumber panel state |
| `WorkspaceRightPanelCloser` | Tutup chat baris saat overlay tabel ditutup (`closeWhenOverlayCloses`) |
| `WorkspaceRightPanelTableSync` | Tutup panel jika tabel sidebar tidak cocok |
| `openRowPanel` / `openTableChat` | API tetap; hanya shell UI yang berubah |

---

## QA manual (checklist)

Uji di Chrome DevTools + satu perangkat fisik jika bisa.

### Layout

- [ ] 390×844 — workspace load, sidebar tidak permanen 320px
- [ ] 768px — transisi desktop/mobile tidak “melompat” aneh
- [ ] 1280px — regresi layout 3 kolom

### Chat

- [ ] Chat tabel dari header overlay → sheet/panel
- [ ] Chat baris dari grid → sheet, tab Detail & Chat
- [ ] Tutup overlay tabel (← Kembali) → chat baris ikut tutup (desktop & mobile)
- [ ] Chat dari popup peta → room baris sama

### Tabel

- [ ] Scroll horizontal banyak kolom
- [ ] Tap tidak memicu edit sel saat tap ikon chat (stopPropagation tetap)

### Login

- [ ] Tombol Login → “Memproses…” → loading workspace → masuk

### Mobile v2 — wizard scope (Step 1–2)

- [ ] 390px: login → (jika >1 org) pilih organisasi → pilih project → bottom bar muncul
- [ ] 1 org: langsung layar project
- [ ] URL `?org=&project=` valid → skip wizard ke workspace
- [ ] **Ganti proyek** / **Ganti organisasi** di header; overlay & chat tertutup
- [ ] Refresh dengan scope lengkap di URL → tetap workspace (tanpa wizard ulang)
- [ ] Refresh di pemilih project → tetap project (sessionStorage)
- [ ] Swipe dari tepi kiri di layar project → kembali ke org (jika >1 org)

### Mobile v2 — tabel & baris (Step 3–4)

- [ ] Tab Tabel → kartu tabel → daftar baris (tanpa grid horizontal); **Muat lebih** jika >50 baris
- [ ] Tap baris → sheet Detail (form editable) + tab Chat
- [ ] Simpan field → daftar baris ter-update
- [ ] ← Daftar tabel menutup overlay

### Mobile v2 — chat (Step 5–5b)

- [ ] Header ringkas: chip scope + notif + menu ⋯ (online, tema, keluar); **tanpa** sidebar; chat lewat tab **Chat**
- [ ] Tab **Chat** di bottom bar → inbox room → sheet obrolan
- [ ] Mention notifikasi baris → Peta + chat; org/proyek/tabel → tab Chat

### Desktop regresi (v2 tidak mengubah wizard)

- [ ] 1280px: sidebar org/project; grid tabel; panel kanan chat
- [ ] Tab Chat desktop: master–detail; panel `w-96` off di tab Chat

---

## Tab disembunyikan sementara (2026-06-04)

**Kanban**, **Kalender**, dan **Gantt** tidak tampil di tab desktop maupun bottom bar mobile. URL lama (`?view=kanban`, `kalender`, `gantt`) dialihkan ke Dashboard. Kode view tetap ada; aktifkan lagi lewat `HIDDEN_WORKSPACE_VIEWS` di `app/src/app/workspace-modules.ts`.

---

## Di luar scope (v1 mobile)

- Aplikasi native / PWA offline penuh
- Edit geometri kompleks di peta via touch gestures khusus
- Markdown / rich text chat
- Dua panel chat sekaligus di mobile
- Rotasi landscape khusus (cukup responsif umum)

---

## Urutan PR yang disarankan

### v1 (selesai)

1. **PR-A:** Fase 0 + hook media query  
2. **PR-B:** Fase 1 (sidebar drawer + panel sheet + padding)  
3. **PR-C:** Fase 1 sisa — tombol chat baris touch-friendly  
4. **PR-D:** Fase 2 navigasi  
5. **PR-E:** Fase 3 tabel  
6. **PR-F:** Fase 4–5  

### v2 (berikutnya — lihat `mobile-scope-flow-v2.md`)

1. **PR-G:** Step 1 wizard org/project  
2. **PR-H:** Step 2 ganti proyek dari header  
3. **PR-I:** Step 3 daftar baris mobile  
4. **PR-J:** Step 4 detail vertikal editable  
5. **PR-K:** Step 5 chat + keputusan opsi A/B/C  
6. **PR-L:** Step 6 polish & E2E  

Setiap PR: screenshot before/after mobile + desktop smoke.

---

## Changelog dokumen

| Tanggal | Perubahan |
|---------|-----------|
| 2026-06-03 | Draft awal — baseline codebase, fase 0–5, QA checklist |
| 2026-06-03 | Fase 0–1 selesai — Sheet, `useIsBelowMd`, sidebar drawer, panel chat sheet |
| 2026-06-03 | Fase 2 selesai — bottom tab bar, breadcrumb mobile, notifikasi responsif |
| 2026-06-03 | Fase 3 selesai — daftar kartu tabel mobile, overlay toolbar, detail baris |
| 2026-06-03 | Fase 4 selesai — peta mobile, popup chat baris, notifikasi mention → Map + sheet |
| 2026-06-03 | Fase 5 selesai — lazy tab, safe area, a11y sheet, E2E mobile |
| 2026-06-04 | Sembunyikan Kanban/Kalender/Gantt; draft opsi tab Chat di `chat-tab-navigation-options.md` |
| 2026-06-04 | Rencana mobile v2: `mobile-scope-flow-v2.md` (wizard scope, tabel→baris→detail edit) |
| 2026-06-03 | v2 Step 3 — tap tabel → daftar baris (`workspace-mobile-row-list`, `workspace-mobile-virtual-table-overlay`) |
| 2026-06-03 | v2 Step 4 — detail baris editable mobile (`workspace-mobile-row-detail-form`, sheet 100dvh) |
| 2026-06-03 | v2 Step 5 — chat header mobile, guard org, notifikasi → workspace/Map/Tabel |
| 2026-06-03 | v2 Step 5b — tab Chat inbox (`workspace-chat-inbox.tsx`, Opsi B) |
| 2026-06-03 | v2 Step 6 — sessionStorage fase, swipe back, E2E wizard/tabel/detail, QA checklist |
| 2026-06-03 | Header mobile ringkas — `workspace-mobile-compact-header.tsx` (scope sheet, menu ⋯) |
| 2026-06-03 | Mobile v2: sidebar tidak dirender; navigasi lewat wizard, bottom bar, chip scope |

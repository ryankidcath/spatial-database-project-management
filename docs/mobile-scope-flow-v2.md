# Mobile scope flow v2 — rencana perubahan

**Status:** Step 1–6 selesai (2026-06-03). Mobile v2 siap QA. Chat: **Opsi B** (`chat-tab-navigation-options.md`).
**Tanggal:** 2026-06-04  
**Tujuan:** Di HP, user memilih **organisasi → proyek → workspace** secara full screen; edit data lewat **detail vertikal**, bukan grid; desktop tetap layout saat ini.

Dokumen ini adalah **catatan eksekusi** — kerjakan **step berurutan** di bawah; centang saat selesai.

Referensi:

- `docs/mobile-workspace-guide.md` — mobile v1 (sheet, bottom bar, kartu tabel)
- `docs/chat-tab-navigation-options.md` — opsi tab Chat (**setelah** scope v2 jelas)
- `docs/chat-feature-decisions.md` — model room & panel kanan §7

---

## Ringkasan alur target (mobile `< md`)

```
Login
  → Layar pilih Organisasi (full screen)
  → Layar pilih Project (full screen; ← kembali ke org)
  → Workspace utama (tab bawah; ← ganti project / ← ganti org)
       Tab Tabel:
         Daftar tabel (kartu) — sudah ada
         → Tap tabel → daftar/ringkasan baris (bukan grid edit)
         → Tap baris → detail vertikal (editable) + tab Chat
```

**Desktop (`≥ md`):** tidak pakai wizard; sidebar + URL `?org=` & `?project=` + grid edit seperti sekarang.

---

## Perbandingan dengan app sekarang

| Area | Sekarang (mobile) | Target v2 |
|------|-------------------|-----------|
| Scope org/project | Sidebar drawer + URL | Wizard full screen bertingkat |
| Setelah login | Langsung shell workspace | Org → project → baru shell |
| Ganti project | Buka sidebar | Tombol/slide **Ganti proyek** → layar project |
| Tab Tabel | Kartu tabel ✓ | Tetap kartu |
| Tap tabel | ~~Overlay grid~~ → **daftar baris** (Step 3) | **Daftar baris** (kartu/row list) ✓ |
| Tap baris | Sheet: Detail **editable** (mobile) + Chat | Layar/stack **detail vertikal editable** + Chat ✓ |
| Chat | Sheet / konteks | Tetap sheet atau tab di layar detail; lihat chat MD **setelah Step 4–5** |

---

## Prinsip teknis

1. **Satu sumber scope:** tetap `canonicalOrgId`, `selectedProjectId`, URL `?org=` & `?project=` — wizard hanya **UI mobile** untuk mengubah state yang sama.
2. **Gate `useIsBelowMd()`:** perilaku v2 hanya di mobile; desktop tidak regress.
3. **Deep link / notifikasi:** jika URL sudah punya `org` (+ `project` valid) → bisa **skip** wizard ke fase yang sesuai.
4. **RLS & server actions:** tidak diubah; reuse simpan sel dari `virtual-table-view` / actions yang ada.
5. **Gesture slide:** opsional; **tombol ← Kembali** dulu di Step 1–3, slide di Step 6 jika perlu.

---

## Desktop — apa yang “cocok” (minim perubahan)

| Topik | Desktop |
|-------|---------|
| Wizard org/project | **Tidak** — sidebar tetap |
| Tab Tabel | Grid + overlay + inline edit **tetap** |
| Panel kanan chat | **Tetap** `w-96` (§7) |
| URL | Sama; mobile & desktop baca parameter yang sama |
| Header | Boleh tambah dropdown ganti project (opsional, bukan wajib v2) |

Chat (opsi A/B/C di `chat-tab-navigation-options.md`): **decide setelah v2 Step 4**; desktop Pola 1 = tanpa tab Chat, Pola 2 = tab Chat master–detail — **keduanya kompatibel** dengan wizard mobile-only.

---

## State & routing (kontrak implementasi)

### Fase navigasi mobile (baru)

```ts
type MobileScopePhase = "org" | "project" | "workspace";
```

| Fase | UI | Set state |
|------|-----|-----------|
| `org` | Daftar organisasi user | `canonicalOrgId`; hapus/abaikan `project` sampai dipilih |
| `project` | Daftar project di org | `selectedProjectId` |
| `workspace` | Tab + bottom bar + konten | — |

Persistensi: URL + `sessionStorage` opsional (ingat fase terakhir) agar refresh tidak mengulang wizard jika scope lengkap.

### Stack dalam tab Tabel (baru)

```ts
type MobileTableStack =
  | { level: "tables" }
  | { level: "rows"; tableSlug: string }
  | { level: "row-detail"; tableSlug: string; rowId: string };
```

Desktop: tetap `activeVirtualTableSlug` overlay + grid, tanpa stack ini.

---

## Step implementasi (urutan eksekusi)

Centang `[ ]` → `[x]` saat selesai. Jangan loncat step tanpa acceptance terpenuhi.

---

### Step 1 — Wizard organisasi & proyek (mobile only)

**Tujuan:** Setelah login, user mobile tidak melihat workspace penuh sebelum org + project dipilih.

| Task | File / area |
|------|-------------|
| [x] Komponen `WorkspaceMobileOrgPicker` (full screen, daftar org) | `workspace-mobile-org-picker.tsx` |
| [x] Komponen `WorkspaceMobileProjectPicker` (filter by org, ← org) | `workspace-mobile-project-picker.tsx` |
| [x] Orkestrasi fase di `workspace-client.tsx` (`MobileScopePhase`) | `workspace-mobile-scope.ts`, `workspace-client.tsx` |
| [x] Sembunyikan bottom bar + tab saat fase `org` / `project` | shell wizard menggantikan layout utama |
| [x] Sidebar mobile: tidak dipakai untuk pilih org/project saat wizard | layout workspace tidak di-render |
| [x] Sinkron URL: org tanpa auto-project; project → `commitScopeInUrl` | handlers mobile |
| [x] Auto-skip: 1 org → fase project; URL org+project valid → `workspace` | `useEffect` inisialisasi |
| [x] Tombol **← Kembali** org ← project | `WorkspaceMobileProjectPicker` |

**Acceptance:**

- [ ] DevTools 390px: login → org → project → tab bawah muncul. *(QA manual)*
- [x] Desktop 1280px: tidak ada wizard; sidebar pilih org/project seperti sekarang.
- [x] `?org=x&project=y` valid di mobile → masuk `workspace` tanpa wizard.

**Perkiraan:** 2–4 hari.

---

### Step 2 — Ganti proyek / organisasi dari workspace

**Tujuan:** Dari main mobile, user bisa naik lagi ke picker project (dan org).

| Task | File / area |
|------|-------------|
| [x] Header mobile: **Ganti proyek** → fase `project` (org tetap) | `workspace-client.tsx` |
| [x] **Ganti organisasi** di header (jika >1 org) | `workspace-client.tsx` |
| [x] Tutup overlay tabel / sheet chat saat naik fase | `resetMobileWorkspaceOverlays` |
| [ ] (Opsional Step 6) Swipe back untuk naik fase | gesture layer |

**Acceptance:**

- [ ] Dari tab Dashboard, ganti project tanpa logout; data scope ikut URL. *(QA manual)*
- [x] Overlay tabel + panel chat ditutup saat ganti proyek/organisasi.

**Perkiraan:** 1–2 hari (tanpa gesture).

---

### Step 3 — Tab Tabel: daftar baris (tanpa grid edit di mobile)

**Tujuan:** Tap kartu tabel → layar **baris**, bukan grid penuh.

| Task | File / area |
|------|-------------|
| [x] Stack baris via `activeVirtualTableSlug` + overlay mobile (setara `MobileTableStack` `rows`) | `workspace-client.tsx`, `workspace-mobile-virtual-table-overlay.tsx` |
| [x] Komponen daftar baris (kartu: judul baris, kolom ringkas, tombol chat) | `workspace-mobile-row-list.tsx` |
| [x] Mobile `< md`: overlay `WorkspaceMobileVirtualTableOverlay`, bukan `VirtualTableView` grid | `workspace-client.tsx` |
| [x] Grid tidak di-mount di mobile overlay → tidak ada inline edit sel di tab Tabel | (desktop-only grid) |
| [x] Header: ← Daftar tabel + Chat tabel | `workspace-mobile-virtual-table-overlay.tsx` |
| [x] Paginasi baris 50/halaman (`fetchVirtualRowsAction`) | `workspace-mobile-virtual-table-overlay.tsx` |

**Acceptance:**

- [x] Mobile: tidak ada scroll horizontal grid di tab Tabel (grid tidak di-mount).
- [x] Tap baris → panel detail/chat (sheet); tombol chat terpisah dari tap baris.
- [x] Desktop: overlay grid + inline edit tidak berubah.
- [ ] QA manual 390px: kartu tabel → daftar baris → detail/chat.

**Perkiraan:** 3–5 hari.

---

### Step 4 — Detail baris vertikal + simpan (mobile)

**Tujuan:** Edit field di form vertikal, bukan di grid.

| Task | File / area |
|------|-------------|
| [x] `WorkspaceMobileRowDetailForm` editable (non-geometry; tipe sesuai `data_type`) | `workspace-mobile-row-detail-form.tsx` |
| [x] Reuse `updateVirtualRowCellAction` via `saveVirtualRowCell` | `lib/virtual-table-row-cell.ts` |
| [x] Mobile: sheet detail **100dvh** full screen | `workspace-right-panel.tsx` |
| [x] Tab **Detail \| Chat** tetap di panel yang sama | `WorkspaceRightPanel` |
| [x] Validasi server + `toast.error` | action + form |
| [x] Geometry: read-only + petunjuk edit di Peta/desktop | form |
| [x] Event `VIRTUAL_TABLE_ROWS_MUTATED` → refresh daftar baris | overlay + `lib/workspace-virtual-table-mutations.ts` |
| [x] `patchRowPanel` sinkron payload panel setelah simpan | `workspace-right-panel-context.tsx` |

**Acceptance:**

- [x] Edit teks/number/date/select/checkbox/relation/user di detail → daftar baris di-refresh.
- [x] Desktop panel kanan: tetap read-only (`RowDetailPlaceholder`).
- [ ] QA manual 390px: ubah field → kembali ke daftar, judul/subtitle baris ikut.

**Perkiraan:** 4–7 hari.

---

### Step 5 — Rapikan chat di konteks v2

**Tujuan:** Chat selaras fase scope + alur tabel baru.

| Task | File / area |
|------|-------------|
| [x] Chat org: `hasOrgStaffAccess`, header mobile (`WorkspaceMobileHeaderChat`) | `workspace-mobile-header-chat.tsx` |
| [x] Sidebar mobile: tombol chat org/proyek disembunyikan | `workspace-client.tsx` |
| [x] Chat proyek: header setelah project dipilih | `WorkspaceMobileHeaderChat` |
| [x] Chat baris: detail baris tab Chat + tombol di daftar baris | Step 3–4 |
| [x] Guard: tutup panel chat di wizard / tanpa akses org | `workspace-right-panel-mobile-guard.tsx` |
| [x] Notifikasi mention → `workspace` + Map/Tabel + sheet | `navigateFromNotification` |
| [x] Opsi B sudah di `chat-tab-navigation-options.md` | inbox = **Step 5b** |

**Acceptance:**

- [x] Mention baris → Map + sheet chat baris (`navigateFromNotification` + `openVirtualRowChatPanel`).
- [x] Chat org tidak dibuka untuk non–tim inti (guard + cek di notifikasi).
- [ ] QA manual: header Chat Org/Proyek di workspace mobile.

**Perkiraan:** 1–3 hari (+ opsi inbox jika pilih B).

**Catatan:** Implementasi tab Chat inbox (opsi B) = **Step 5b** terpisah, lihat chat MD.

---

### Step 5b — Tab Chat inbox (Opsi B)

| Task | File / area |
|------|-------------|
| [x] `ViewId` Chat + URL `?view=chat` | `workspace-views.ts`, `workspace-url.ts` |
| [x] `WorkspaceChatInbox` — daftar room scope + unread | `workspace-chat-inbox.tsx` |
| [x] Mobile: tab Chat di bottom bar (slot ke-4); tap room → sheet obrolan | `workspace-mobile-tabs.tsx` |
| [x] Desktop: master–detail (daftar ~22rem + `ChatPanel`) | `workspace-chat-inbox.tsx` |
| [x] Panel kanan off saat tab Chat desktop | `workspace-client.tsx` |
| [x] Unread: konteks tabel/proyek + baris belum dibaca per tabel | `virtual-table-chat-unread-context`, `chat-actions` |
| [ ] QA manual: tab Chat, pilih room, kirim pesan |

---

### Step 6 — Polish & QA

| Task | |
|------|--|
| [x] Gesture swipe back project → org (tepi kiri) | `workspace-mobile-swipe-back.tsx` |
| [x] E2E: wizard + tabel + detail baris | `e2e/mobile-workspace.spec.ts`, `workspace-shell.ts` |
| [x] QA checklist v2 di `mobile-workspace-guide.md` | |
| [x] `sessionStorage` ingat fase scope | `workspace-mobile-scope.ts`, `workspace-client.tsx` |
| [x] `aria-label` kartu tabel / baris (E2E + a11y) | `workspace-virtual-table-list.tsx`, `workspace-mobile-row-list.tsx` |

---

## Dampak ke `chat-tab-navigation-options.md`

| Opsi | Setelah scope v2 |
|------|------------------|
| **A** (tombol/sheet) | Chat di bottom bar / header workspace; org chat setelah org terpilih |
| **B** (tab inbox) | Tab Chat hanya di fase `workspace`; filter room by org/project aktif |
| **C** | Sama; inbox di main mobile |

**Prasyarat:** Step 1–2 selesai sebelum memutuskan slot bottom bar untuk Chat.

Isi tabel **Keputusan** di chat MD setelah Step 5 review.

---

## File codebase (indeks)

| File | Step |
|------|------|
| `workspace-client.tsx` | 1, 2, 3 |
| `workspace-mobile-org-picker.tsx` | 1 (baru) |
| `workspace-mobile-project-picker.tsx` | 1 (baru) |
| `workspace-mobile-table-flow.tsx` | 3 (baru, opsional) |
| `workspace-mobile-row-list.tsx` | 3 (baru) |
| `workspace-virtual-table-list.tsx` | 3 (reuse kartu tabel) |
| `virtual-table-view.tsx` | 3, 4 (matikan edit mobile; extract save) |
| `workspace-right-panel.tsx` | 4, 5, 5b |
| `workspace-mobile-header-chat.tsx` | 5 |
| `workspace-right-panel-mobile-guard.tsx` | 5 |
| `workspace-mobile-tabs.tsx` | 1, 5, 5b |
| `workspace-chat-inbox.tsx` | 5b |
| `workspace-map.tsx` | 5 (notifikasi) |
| `e2e/mobile-workspace.spec.ts` | 6 |
| `workspace-mobile-swipe-back.tsx` | 6 |
| `workspace-mobile-scope.ts` | 1, 6 (sessionStorage) |
| `workspace-url.ts` | 1 (deep link) |

---

## Risiko & mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Dua UX (mobile wizard vs desktop sidebar) | Gate ketat `isBelowMd`; dokumentasi QA terpisah |
| State overlay/sheet bocor saat ganti scope | Reset stack & `closePanel()` di transisi fase |
| Duplikasi logic simpan sel | Extract `saveVirtualCell` shared |
| Performa daftar baris besar | Paginasi server-side (sudah ada pola di overlay) |
| User 1 org / 1 project | Auto-skip wizard |

---

## Di luar scope v2 (tetap v1 / nanti)

- PWA offline
- Edit geometri kompleks di peta touch
- Rich text chat
- Dua panel chat bersamaan
- Lazy fetch `page.tsx` per tab (lihat `performance-notes-workspace-scope.md`)
- Aktifkan kembali Kanban/Kalender/Gantt

---

## Keputusan produk (isi sebelum Step 1)

| Item | Keputusan | Tanggal |
|------|-----------|---------|
| Detail baris mobile: full screen vs sheet tinggi | | |
| Desktop detail: tetap read-only di panel atau ikut form | | |
| Auto-skip wizard (1 org / 1 project) | **ya** (1 org → langsung project) | 2026-06-04 |
| Gesture swipe di v2 atau fase 2 | **ya** — project → org (Step 6) | 2026-06-03 |
| Opsi chat (A/B/C) | **B** — inbox + desktop master–detail | 2026-06-04 |

---

## Changelog dokumen

| Tanggal | Perubahan |
|---------|-----------|
| 2026-06-04 | Draft rencana Step 1–6, kontrak state, dampak desktop & chat MD |
| 2026-06-04 | Step 1 diimplementasi; keputusan chat **Opsi B** |
| 2026-06-04 | Step 2 — ganti proyek/organisasi dari header mobile |
| 2026-06-03 | Step 6 — sessionStorage, swipe back, E2E v2, QA checklist |

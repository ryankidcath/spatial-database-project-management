# Notifikasi workspace — event matrix

**Status:** ~~Rencana fase 0–3~~ **Pivot (2026-06-16):** lonceng `user_notifications` diganti **tab «Aktivitas»** (timeline `audit_log`). Fan-out personal dinonaktifkan (`workspace-notification-dispatch.ts` no-op). File lonceng/preferensi masih ada di repo tetapi tidak dipakai UI.

**Tanggal:** 2026-06-15 (rencana) · **Pivot:** 2026-06-16  
**Tujuan:** Mendefinisikan aktivitas workspace untuk organisasi **mode virtual table**. Modul legacy (PLM, task/issue, keuangan, overlap peta) **di luar scope**.

### Tab «Aktivitas» (implementasi saat ini)

| Aspek | Perilaku |
|--------|----------|
| **Sumber data** | `audit_log` — satu baris per event, timeline bersama (tanpa `read_at` / preferensi per user) |
| **Scope hire** (`project_members`) | Hanya proyek yang sedang dibuka |
| **Scope tim inti org** (`hasOrgStaffAccess`) | Proyek aktif + baris org (`project_id IS NULL`) + toggle opsional «Semua proyek di org» |
| **Navigasi** | Klik event → buka tabel, baris, atau proyek terkait |
| **UI** | Tab sejajar Dashboard, Tabel, Chat, Map; ikon `History` di mobile |

Referensi implementasi: `workspace-activity-tab.tsx`, `audit-activity-display.ts`, `activity-log-types.ts`.

---

## Arsip desain lonceng (deprecated)

Desain di bawah ini menggambarkan fase 0–3 **lonceng notifikasi** sebelum pivot. Migration `0065–0067` tetap relevan untuk audit; RPC fan-out tidak lagi dipanggil dari UI.

Referensi terkait:

- `docs/mobile-notifications-sound-push.md` — bunyi in-app (Fase A) & Web Push (Fase B)
- `docs/chat-feature-decisions.md` — model chat & unread (§12 akan direvisi: mention tanpa lonceng)
- `docs/mobile-scope-flow-v2.md` — scope org/proyek mobile
- `app/src/app/notifications-bell.tsx` — UI lonceng saat ini
- `app/src/app/workspace-chat-inbox.tsx` — tab Obrolan
- `supabase/migrations/0016_core_pm_user_notifications_f6.sql` — tabel `user_notifications`
- `supabase/migrations/0015_core_pm_audit_log_f6.sql` — tabel `audit_log` (sumber audit)

---

## Ringkasan keputusan produk

| Saluran | Peran |
|--------|--------|
| **Tab Obrolan** | Pesan chat, badge unread per room, **ikon `@`** = ada mention belum dibaca di room itu |
| **Lonceng notifikasi** | Perubahan workspace (struktur, anggota, import, baris) — **hanya ke user yang subscribe kategori** |
| **Flag kolom** | PM tentukan kolom mana yang **boleh** memicu event perubahan nilai |
| **Tidak masuk lonceng** | Chat (termasuk mention), overlap peta, edit geometri kecil, modul legacy |

**Judul panel lonceng (target):** «Aktivitas» atau «Perubahan» — bukan «Kotak masuk».

**Filter daftar:** mengikuti **scope workspace aktif** (`organization_id` + `project_id` di header mobile / URL), sama seperti tab Obrolan.

---

## Mention chat — ikon `@` (Opsi A)

| Aspek | Keputusan |
|-------|-----------|
| Lonceng | **Tidak** membuat `kind = chat_mention` |
| Tab Obrolan | Tampilkan ikon **`@`** di baris room jika ada **mention belum dibaca** |
| Definisi «belum dibaca» | Pesan dengan token mention user (`@[user:…]`, `@email`, atau `@Nama` yang cocok) yang `created_at > last_read_at` room untuk user tersebut |
| Setelah dibaca | Ikon `@` hilang; badge angka unread pesan tetap independen |
| Sort inbox | Room dengan `@` belum dibaca boleh diutamakan (opsional fase 2) |

**Catatan implementasi:** hentikan `dispatch_chat_mention_notifications` menulis ke `user_notifications`; simpan deteksi mention di sisi klien +/atau RPC inbox (`has_unread_mention` per room).

---

## Prinsip notifikasi workspace

1. **Sinyal tinggi, frekuensi rendah** — lonceng untuk hal yang **beberapa** anggota tim perlu tahu; bukan semua orang mendapat semua detil.
2. **Manual, bukan tebak-tebakan** — tidak ada deteksi otomatis «kolom progres vs warna»; keputusan eksplisit lewat **flag kolom** + **preferensi user** (lihat § Gerbang ganda).
3. **Bukan setiap edit sel** — hanya kolom yang PM/admin nyalakan `notify_on_change`, dan hanya ke user yang subscribe kategori terkait.
4. **Satu ringkasan untuk operasi massal** — import CSV/GeoJSON, hapus banyak baris → **satu** baris notifikasi.
5. **Pengirim aksi tidak** menerima notifikasi sendiri.
6. **Sumber kebenaran audit** — `audit_log` append-only; `user_notifications` = fan-out per user yang lolos filter preferensi + `read_at`.
7. **Legacy** — event PLM/task/finance/issue **tidak** ditambahkan ke matrix ini.

---

## Gerbang ganda: flag kolom + preferensi user

Dua pertanyaan terpisah:

| Lapisan | Siapa memilih | Pertanyaan |
|---------|---------------|------------|
| **Flag kolom** | PM / admin yang mendesain tabel | *Apakah perubahan kolom ini **layak** menjadi event untuk tim?* |
| **Preferensi user** | Setiap user login | *Apakah **saya** mau menerima event jenis ini di lonceng?* |

**Contoh:** Kolom «Status» (`select`: To do / On progress / Done) punya `notify_on_change: true`. Admin lapangan mengubah progres → event terjadi. **PM** (subscribe kategori «perubahan nilai kolom») → dapat lonceng. **Surveyor** (kategori itu mati) → **tidak** dapat, meski masih bisa mengedit tabel.

Kolom «Warna» (`select`: Merah / Biru) **selevel teknis** dengan «Status» (keduanya `select`). Perbedaan hanya flag: warna biasanya `notify_on_change: false` kecuali sengaja dinyalakan.

### Alur keputusan (edit sel)

```
Perubahan nilai sel
  1. Kolom.config.notify_on_change === true ?
       tidak → stop (tidak ada event)
  2. Kandidat penerima = anggota scope (proyek/org), kecuali actor
  3. Untuk setiap kandidat:
       user subscribe kategori «cell_value_changed» ?
         tidak → skip user
         ya  → insert user_notifications
```

Event lain (proyek baru, anggota, import, baris baru/hapus, struktur tabel/kolom) memakai **kategori** masing-masing (lihat § Preferensi per user), bukan flag kolom.

---

## Flag kolom: `notify_on_change`

Disimpan di `virtual_columns.config` (JSON), **semua tipe kolom** (default mati):

```json
{
  "options": ["To do", "On progress", "Done"],
  "notify_on_change": true
}
```

| Aturan | Nilai |
|--------|--------|
| Default | `false` untuk setiap kolom baru |
| Tanpa deteksi otomatis | Tidak membedakan progres vs warna dari isi `options` atau slug |
| UI (fase 2) | Checkbox «Kolom ini boleh memicu notifikasi saat nilainya berubah» saat buat/edit kolom |
| Siapa mengatur | PM / admin org — kebijakan **tim**, bukan per user |

**Bukan** berarti semua anggota dapat notifikasi; flag hanya membuka **izin event**. Siapa yang menerima ditentukan preferensi user.

### Aturan notifikasi per jenis perubahan

| Jenis perubahan | Butuh flag kolom? | Kategori preferensi user |
|-----------------|-------------------|---------------------------|
| Baris **baru** (bukan import) | Tidak | `row_lifecycle` |
| Baris **dihapus** | Tidak | `row_lifecycle` |
| Baris **dipulihkan** | Tidak | `row_lifecycle` (fase 2) |
| Edit sel | **Ya** (`notify_on_change`) | `cell_value_changed` |
| Import massal | Tidak | `import_summary` |
| Tabel / kolom (struktur) | Tidak | `schema_changes` |
| Proyek & anggota | Tidak | `workspace_membership` |

| Detail edit sel | Notifikasi event? |
|-----------------|-------------------|
| Kolom tanpa flag | Tidak |
| Kolom dengan flag | Ya (lalu filter preferensi user) |
| `select` / `checkbox` / `text` / dll. | Sama — hanya flag yang membedakan |
| Beberapa edit sel sama baris ≤2 menit | **Gabung** (nilai terakhir per kolom) |

### Contoh notifikasi perubahan nilai

Judul memakai **nama kolom** (`display_name`), bukan asumsi «progres»:

| Judul | Isi |
|-------|-----|
| *Status* diubah — *Plot A* | On progress → Done · Tabel *Bidang* · oleh Budi |

`payload` minimal:

```json
{
  "event_id": "vrow.cell_changed",
  "virtual_table_id": "…",
  "virtual_row_id": "…",
  "column_slug": "status",
  "column_display_name": "Status",
  "old_value": "On progress",
  "new_value": "Done",
  "row_label": "Plot A"
}
```

`row_label` = nilai kolom `title` atau slug `title` / `nama` / baris pertama teks, sama seperti label chat baris.

---

## Preferensi per user

### Masalah yang diselesaikan

Hanya **user tertentu** (mis. PM) yang ingin detil perubahan progres atau kolom ber-flag lain. User lain (admin lapangan, surveyor) **tidak perlu** lonceng itu karena bukan urusan mereka — tanpa harus mematikan flag di tabel.

### Kategori preferensi

| `category` | Label UI (ID) | Default | Event matrix |
|------------|---------------|---------|--------------|
| `workspace_membership` | Proyek & anggota | **on** | `project.*` |
| `schema_changes` | Tabel & kolom (struktur) | **off** | `vtable.*`, `vcolumn.*` (kecuali import) |
| `row_lifecycle` | Baris baru / dihapus | **off** | `vrow.created`, `vrow.deleted`, `vrow.deleted_bulk` |
| `cell_value_changed` | Perubahan nilai kolom ber-flag | **off** (opt-in) | `vrow.cell_changed` |
| `import_summary` | Import selesai (ringkasan) | **on** | `vtable.import_*` |

Default **opt-in** untuk kategori «ramai» (`cell_value_changed`, `row_lifecycle`, `schema_changes`) agar surveyor tidak kaget; PM menyalakan sekali di **Atur notifikasi**.

**Opsional nanti:** default per `project_members.role` (owner/admin → beberapa kategori on); tetap bisa di-override manual per user.

### Skema (konsep)

```sql
-- core_pm.user_notification_preferences
-- user_id uuid, category text, enabled boolean, updated_at
-- primary key (user_id, category)
```

Fan-out (`dispatch_workspace_notifications`) memfilter:

```sql
insert into user_notifications (...)
select ...
from candidate_recipients r
where r.user_id <> actor_id
  and coalesce(
    (select enabled from user_notification_preferences p
     where p.user_id = r.user_id and p.category = :category),
    :default_for_category
  ) = true;
```

### UI

- Tautan **«Atur notifikasi»** dari panel lonceng (footer atau header).
- Daftar checkbox per kategori + penjelasan satu baris.
- Simpan ke `user_notification_preferences` (server action).
- Tidak perlu UI per kolom per user di fase awal (granularitas itu fase 3 opsional).

### Granularitas lanjutan (opsional fase 3)

| Level | Kegunaan |
|-------|----------|
| Per tabel | «Hanya tabel *Bidang*» |
| Per kolom | PM subscribe «Status» saja |

Tidak wajib untuk rilis pertama; kategori sudah menyelesaikan kasus PM vs surveyor.

---

## Jenis (`kind`) di `user_notifications`

Perluas constraint `user_notifications_kind_check` (ganti `chat_mention` untuk arah baru):

| `kind` | Deskripsi |
|--------|-----------|
| `workspace_member` | Keanggotaan proyek / org |
| `workspace_project` | Proyek dibuat / dihapus / diarsipkan |
| `virtual_table` | Tabel virtual dibuat / diubah nama / dihapus |
| `virtual_column` | Kolom ditambah / diubah / dihapus |
| `virtual_row` | Baris dibuat / dihapus / edit sel penting |
| `virtual_import` | Import massal selesai (ringkasan) |
| `system` | Cadangan (mis. pengumuman platform) |

**Dihapus dari produksi baru:** `chat_mention` (data lama boleh diarsipkan atau diabaikan).  
**Tidak dipakai:** `spatial_overlap` untuk org virtual-table-only.

`severity`: `info` (default), `warning` (gagal sebagian saat import), `error` (jarang).

---

## Event matrix

Kolom: **ID** · **Pemicu** · **kind** · **Kategori preferensi** · **Penerima (kandidat)** · **Judul (template)** · **Navigasi klik** · **Audit hari ini** · **Fase**

Setelah fan-out: kandidat difilter **preferensi user** + bukan actor.

### Proyek & anggota

| ID | Pemicu | kind | Kategori | Kandidat | Judul | Navigasi | Audit? | Fase |
|----|--------|------|----------|----------|-------|----------|--------|------|
| `project.created` | Proyek baru di org | `workspace_project` | `workspace_membership` | Staff org + anggota baru | Proyek *{name}* dibuat | Scope proyek | Ya (`project_created`) | 1 |
| `project.member_added` | User ditambah ke proyek | `workspace_member` | `workspace_membership` | Anggota proyek lain | {actor} ditambahkan ke *{project}* | Proyek / anggota | Ya (`project_member_added`) | 1 |
| `project.deleted` | Proyek soft-delete | `workspace_project` | `workspace_membership` | Anggota proyek | Proyek *{name}* dihapus | — | Ya (`project_deleted`) | 2 |

### Tabel virtual

| ID | Pemicu | kind | Kategori | Kandidat | Judul | Navigasi | Audit? | Fase |
|----|--------|------|----------|----------|-------|----------|--------|------|
| `vtable.created` | Tabel baru (proyek atau org) | `virtual_table` | `schema_changes` | Anggota scope tabel | Tabel *{display_name}* dibuat | Tab Tabel | Ya (proyek saja) | 1 |
| `vtable.updated` | Rename / deskripsi tabel | `virtual_table` | `schema_changes` | Anggota scope | Tabel *{display_name}* diperbarui | Tab Tabel | Belum | 2 |
| `vtable.deleted` | Soft-delete tabel | `virtual_table` | `schema_changes` | Anggota scope | Tabel *{display_name}* dihapus | — | Ya (proyek) | 1 |

### Kolom

| ID | Pemicu | kind | Kategori | Kandidat | Judul | Navigasi | Audit? | Fase |
|----|--------|------|----------|----------|-------|----------|--------|------|
| `vcolumn.created` | Kolom baru | `virtual_column` | `schema_changes` | Anggota scope | Kolom *{display_name}* ditambahkan di *{table}* | Tab Tabel | Belum | 1 |
| `vcolumn.updated` | Rename / tipe / opsi / flag notify | `virtual_column` | `schema_changes` | Anggota scope | Kolom *{display_name}* diubah di *{table}* | Tab Tabel | Belum | 2 |
| `vcolumn.deleted` | Hapus kolom | `virtual_column` | `schema_changes` | Anggota scope | Kolom *{display_name}* dihapus dari *{table}* | Tab Tabel | Belum | 1 |

### Baris

| ID | Pemicu | kind | Kategori | Kandidat | Judul | Navigasi | Audit? | Fase |
|----|--------|------|----------|----------|-------|----------|--------|------|
| `vrow.created` | Baris baru (bukan import) | `virtual_row` | `row_lifecycle` | Anggota scope | Baris baru di *{table}* | Detail baris / Tabel | Belum | 2 |
| `vrow.deleted` | Soft-delete satu baris | `virtual_row` | `row_lifecycle` | Anggota scope | Baris dihapus dari *{table}* | Tabel | Belum | 2 |
| `vrow.deleted_bulk` | Hapus banyak baris | `virtual_row` | `row_lifecycle` | Anggota scope | {n} baris dihapus dari *{table}* | Tabel | Belum | 2 |
| `vrow.cell_changed` | Edit sel, kolom `notify_on_change` | `virtual_row` | `cell_value_changed` | Anggota scope | *{column}* diubah — *{row_label}* | Detail baris | Belum | 2 |

### Import massal

| ID | Pemicu | kind | Kategori | Kandidat | Judul | Navigasi | Audit? | Fase |
|----|--------|------|----------|----------|-------|----------|--------|------|
| `vtable.import_csv` | Import CSV selesai | `virtual_import` | `import_summary` | Anggota scope | Import CSV *{table}*: {inserted} baris | Tab Tabel | Ya | 1 |
| `vtable.import_geojson` | Import GeoJSON selesai | `virtual_import` | `import_summary` | Anggota scope | Import GeoJSON *{table}*: {inserted} fitur | Tab Tabel / Map | Ya | 1 |
| `vtable.import_partial` | Import dengan `failed > 0` | `virtual_import` | `import_summary` | Anggota scope | Import *{table}*: {inserted} ok, {failed} gagal | Tab Tabel | Ya | 1 |

**Isi body import (contoh):** «120 baris ditambahkan, 3 dilewati, 2 gagal.»

`payload` notifikasi disarankan menyertakan `event_id` + `preference_category` agar UI dan filter konsisten.

---

## Penerima notifikasi (fan-out)

### Kandidat scope

```
scope = proyek (virtual_tables.project_id IS NOT NULL)
  → semua project_members kecuali actor

scope = organisasi (virtual_tables.organization_id, project_id NULL)
  → organization_members role owner | admin | staff kecuali actor
```

Tidak mengirim ke user yang tidak punya akses baca tabel terkait (selaras RLS).

### Filter preferensi

Setelah daftar kandidat, untuk setiap event:

1. Tentukan `preference_category` dari matrix.
2. Skip user jika `user_notification_preferences.enabled = false` untuk kategori itu (atau default kategori = off dan belum pernah opt-in).
3. Insert `user_notifications` hanya untuk user yang lolos.

**Badge lonceng:** jumlah `read_at IS NULL` untuk `user_id` saat ini dalam **scope aktif** (org/proyek header).

---

## Alur teknis (target)

```
Server action / RPC
  → tulis audit_log (append)
  → resolve event_id + preference_category + kandidat penerima
  → filter kandidat by user_notification_preferences (security definer)
  → insert user_notifications per penerima yang lolos
  → Realtime INSERT → notifications-bell refresh
```

Fungsi pusat (konsep): `core_pm.dispatch_workspace_notification(...)` dengan parameter `p_category`, `p_kind`, `p_title`, `p_body`, `p_payload`, `p_actor_id`, `p_organization_id`, `p_project_id`.

**Debounce `vrow.cell_changed`:** buffer server TTL 2 menit keyed `(table_id, row_id, column_slug)` — flush satu notifikasi per kolom.

**Org-level audit:** `writeOrgAuditLog` paralel `writeProjectAuditLog` agar tabel tingkat org ikut fan-out.

---

## Perubahan UI lonceng

| Saat ini | Target |
|----------|--------|
| `kind === "chat_mention"` → label «· chat» | Hapus |
| Navigasi mention → Chat / panel | Navigasi per `kind` + `payload` (Tabel, detail baris, proyek) |
| Judul «Kotak masuk» | «Aktivitas» |
| `spatial_overlap` | Tidak ditampilkan / tidak dibuat untuk org baru |
| — | Tautan **«Atur notifikasi»** → checkbox kategori preferensi user |

---

## Perubahan tab Obrolan (mention)

| Elemen | Target |
|--------|--------|
| Badge angka | Tetap = unread pesan (bukan mention saja) |
| Ikon `@` | Muncul jika `has_unread_mention` untuk room |
| RPC inbox | Perluas `get_chat_inbox_*` atau query terpisah untuk flag mention |
| DB | Opsional: kolom denormalized di `chat_room_reads` (`has_unread_mention`) di-update trigger saat INSERT pesan + saat mark read |

---

## Fase implementasi

| Fase | Cakupan |
|------|---------|
| **0** | Dokumen ini disetujui ✓ |
| **1** | Matikan `chat_mention` → lonceng; migration `user_notification_preferences` + filter default kategori; fan-out event dengan audit yang sudah ada (`project_*`, `vtable.create/delete`, import); UI lonceng + navigasi dasar; ikon `@` di Obrolan ✓ |
| **2** | UI «Atur notifikasi»; `notify_on_change` di config kolom + UI toggle; audit + fan-out kolom/baris/`vrow.cell_changed` + debounce; org-level audit ✓ |
| **3** | `vtable.updated`, bulk delete baris; granularitas opsional per tabel/kolom ✓ |

---

## Di luar scope (eksplisit)

- Notifikasi PLM (berkas, legalisasi, pengukuran)
- Task / issue / Kanban
- Keuangan (invoice, pembayaran)
- Overlap peta & perubahan geometri kecil
- Mention di lonceng (`chat_mention`)
- Deteksi otomatis kolom progres (slug, isi `options`, dll.)
- Email / push eksternal

---

## Checklist sebelum coding fase 1

- [x] Migration: perluas `kind` check, deprecate insert `chat_mention`
- [x] Migration: `user_notification_preferences` + seed default per user (lazy on first open)
- [x] Fungsi `dispatch_workspace_notification(...)` + filter kategori
- [x] Hook fan-out di `virtual-table-actions` + `auth/actions` (member/project)
- [x] `notifications-bell.tsx`: judul, navigasi, filter scope, tautan atur preferensi
- [x] `workspace-chat-inbox.tsx`: ikon `@` + RPC mention
- [x] Hapus / nonaktifkan navigasi `chat_mention` di `navigateFromNotification`
- [x] Update `docs/chat-feature-decisions.md` §12 (mention → Obrolan saja)

---

## Checklist fase 2

- [x] Migration `0066`: debounce `vrow.cell_changed` (pending + flush/enqueue RPC)
- [x] `writeOrgAuditLog` + audit org untuk tabel tingkat organisasi
- [x] Fan-out + audit: `vcolumn.*`, `vrow.*`, `vtable.updated`, `vrow.cell_changed`
- [x] UI «Atur notifikasi» (checkbox kategori → `user_notification_preferences`)
- [x] UI toggle `notify_on_change` saat buat/edit kolom
- [x] Navigasi lonceng → detail baris untuk `virtual_row` / `vrow.cell_changed`

---

## Checklist fase 3

- [x] Migration `0067`: `user_notification_scopes` + `user_wants_notification_scoped`
- [x] `dispatch_workspace_notification` memfilter per tabel/kolom dari payload
- [x] UI filter opsional per tabel/kolom di «Atur notifikasi»
- [x] `project.deleted` fan-out + audit
- [x] Polish `vtable.updated` (hanya rename/deskripsi, bukan ikon saja)
- [x] Polish `vrow.deleted_bulk` (body ringkasan)
- [x] Obrolan: sort room dengan mention `@` belum dibaca di atas

---

*Terakhir diperbarui: 2026-06-16 — pivot tab Aktivitas; lonceng deprecated.*

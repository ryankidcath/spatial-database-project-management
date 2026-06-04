# Keputusan fitur Chat — catatan sebelum implementasi

Dokumen ini mencatat keputusan produk dan teknis untuk fitur chat bertingkat (room organisasi, project, virtual row, peta).  
**Status:** diimplementasi (migration `0055_chat_schema.sql`+, UI panel kanan workspace + sidebar; tanpa tab Chat).

Referensi diskusi: pilihan bernomor dari analisis awal (§1–§21).  
Opsi tab Chat / inbox (belum diputuskan): `docs/chat-tab-navigation-options.md`.  
Rencana navigasi mobile v2 (wizard scope, edit di detail): `docs/mobile-scope-flow-v2.md`.

---

## Ringkasan keputusan (quick reference)

| # | Topik | Keputusan |
|---|--------|-----------|
| 1 | Ruang lingkup | **C** — implementasi lengkap (realtime, unread, mention, lampiran) |
| 2 | Jenis room | Org, project, virtual row — **bukan** issue/berkas; **peta = UI ke `virtual_row`** |
| 2b | Room peta | **A** — klik peta → drawer chat baris yang sama (tanpa `scope_type` terpisah) |
| 3 | Room organisasi | **A** — hanya tim inti (`organization_members`) |
| 4 | Room project | **C** — admin org = super admin (akses semua project di org) |
| 5 | Room per baris | **A** — akses = sama dengan akses baca baris |
| 6 | Pembuatan room | **A** — lazy (saat pesan pertama) |
| 7 | UI | **D** (revisi) — panel kanan `WorkspaceRightPanel`; chat org/proyek/tabel/baris dari sidebar & konteks peta |
| 8 | Isi pesan | **A** — plain text |
| 9 | Thread | **A** — linear (daftar kronologis) |
| 10 | Hapus pesan | **Hard delete** — penulis **atau** admin org (owner/admin) |
| 10b | Edit pesan | **Tidak** — hanya hapus |
| 11 | Realtime | **B** — Supabase Realtime |
| 12 | Unread + mention | **B** — badge per room; mention → **notifikasi in-app** (`user_notifications`) |
| 4b | Room organisasi | **1 room per org** (tanpa channel terpisah) |
| 6b | Rate limit | **Tanpa batas** (mungkin ditambah nanti) |
| 13 | Lampiran | **B** — link ke file di kolom virtual table (bukan upload baru) |
| 14 | Pencarian | **A** — scroll / load older saja |
| 15 | Retensi | Hapus chat saat org/project di-soft-delete |
| 16 | Audit | Tanpa log khusus |
| 17 | Bahasa UI | Indonesia saja |
| 18 | Batas pesan | Tanpa batas panjang |
| 19 | Integrasi data | **Chat mandiri** (schema `chat_*` terpisah) |
| 20 | Kebijakan hire | Lihat § Kebijakan hire |

---

## 1. Ruang lingkup — pilihan C (lengkap)

Fitur target sejak awal (bukan MVP minimal):

- Kirim/baca pesan teks (plain)
- Supabase Realtime
- Badge unread per room
- Mention (`@nama`, `@project`, `@baris` — detail di §12)
- Lampiran via link ke file virtual table
- Room DB: organisasi, project, virtual row (peta hanya pintu masuk UI ke room baris)

**Implikasi:** perlu migration schema chat, RLS, komponen UI (tab + drawer), subscription Realtime, tabel `room_reads` / `last_read_at`, dan parser mention sederhana.

---

## 2. Jenis room — tanpa issue/berkas

### Tidak dipakai lagi

- `core_pm.issues`, modul Berkas/PLM lama, `spatial.issue_geometry_features` — **tidak** menjadi target room chat.
- Obrolan terpusat pada model **virtual tables** dan workspace baru.

### Room yang dipakai

| `scope_type` | Satu room per | Catatan |
|--------------|---------------|---------|
| `organization` | `organizations.id` | **Satu room per org**; hanya tim inti |
| `project` | `projects.id` | Anggota project + super admin org |
| `virtual_row` | `virtual_rows.id` | Diskusi per baris; juga dipakai dari tab Peta |
| `virtual_table` | `virtual_tables.id` | Diskusi umum per tabel (migration `0061`) |

Tidak ada `scope_type = 'map'` di database.

### UI chat tabel (2026)

- Tombol **Chat tabel** di header `VirtualTableView`; panel kanan workspace (`WorkspaceRightPanel`, lebar `24rem` / `w-96`).
- Chat baris: panel yang sama, tab **Detail | Chat** (bukan dialog).
- Badge sidebar tabel = unread **room tabel + semua baris**; badge tombol = unread **room tabel saja**.
- Akses room tabel = mirror akses baca `virtual_tables` (`can_read_virtual_table`).

---

## Peta vs virtual row — keputusan A (final)

### Kondisi di codebase

- Tab **Peta** menampilkan geometri dari **`virtual_rows.payload`** (kolom `geometry`).
- Satu baris bisa punya beberapa kolom geometry → beberapa layer (`vtable:{rowId}:{columnSlug}`).
- Geometri legacy issue/spatial tidak dipakai.

### Keputusan

**Klik fitur / popup di peta → buka drawer chat `virtual_row` yang sama** seperti dari tab Tabel.

- Satu thread per baris, tidak duplikasi room.
- Tidak ada room “diskusi peta umum” per project (bisa ditambah nanti jika perlu).
- Jika satu baris punya banyak kolom geometry, diskusi tetap **satu room per baris** (bukan per kolom geometry).

---

## 3. Room organisasi — hanya tim inti (A), satu room per org

- Hanya user dengan baris di `core_pm.organization_members` (owner / admin / staff).
- **Hire** (`project_members` saja) **tidak** boleh akses room organisasi.
- **Satu room chat per organisasi** — tanpa channel terpisah (mis. tidak ada `#umum` vs `#admin`).

---

## 4. Room project — admin org super admin (C)

- Anggota project (`project_members`) boleh baca/tulis.
- **Owner/admin organisasi** boleh akses **semua** room project di org tersebut **tanpa** harus menjadi `project_members` (selaras `can_administer_project` / kebijakan super admin).

---

## 5. Room virtual row — mirror akses baca (A)

- Siapa pun yang boleh **membaca** baris (RLS `virtual_rows` + parent `virtual_tables` project/org) boleh ikut room baris itu.
- Tidak ada aturan lebih ketat (mis. hanya assignee).

---

## 6. Pembuatan room — lazy (A)

- Room dibuat otomatis saat **pesan pertama** (RPC `get_or_create_room`).
- Tidak membuat ribuan room kosong di DB.

---

## 7. UI — panel kanan workspace (revisi 2026)

- **Tidak ada tab Chat** di area utama; URL `?view=chat` dialihkan ke Dashboard.
- **Panel kanan** (`WorkspaceRightPanel`, `w-96`): satu kolom untuk semua scope chat.
- **Sidebar:** ikon chat organisasi (tim inti); ikon chat per baris project; badge unread tabel/proyek seperti sebelumnya.
- **Tabel:** sidebar → overlay grid di `main` (`position: relative` agar overlay tidak menutupi panel kanan); tombol **Chat tabel** / chat baris → panel kanan (`w-96`, `z-30`) **sejajar** dengan overlay.
- Tutup overlay (← Kembali) menutup chat **baris** saja; chat **tabel** boleh tetap di panel kanan.
- Ganti tabel di sidebar menutup panel baris/chat tabel yang tidak sesuai tabel overlay aktif.
- **Peta:** popup → panel baris (tab Chat), sama dengan tabel.
- **Notifikasi mention:** baris → Map + panel; org/project → panel tanpa ganti tab Chat.

Tidak menambah kolom chat di setiap sel grid.

---

## 8. Isi pesan — plain text (A)

- Tanpa Markdown/WYSIWYG di v1.
- Sanitasi tampilan (escape HTML) di UI.

---

## 9. Thread — linear (A)

- Satu daftar pesan kronologis per room.
- Tanpa reply bertingkat / sub-thread terpisah.

---

## 10. Hapus pesan — hard delete; tanpa edit

- Pesan dihapus **permanen** dari DB (bukan soft delete / placeholder “pesan dihapus”).
- **Siapa boleh hapus:**
  - **Penulis** pesan, atau
  - **Admin organisasi** (`organization_members.role` = `owner` atau `admin`).
- Admin **project** (bukan admin org) **tidak** otomatis boleh hapus pesan orang lain kecuali dia penulis.
- **Tidak ada fitur edit pesan** — hanya kirim dan hapus.

---

## 11. Realtime — Supabase Realtime (B)

- Subscribe per `room_id` pada tabel `chat_messages`.
- RLS harus mengizinkan `select` untuk anggota room yang sah.

---

## 12. Unread (B) + mention

### Unread

- Badge unread **per room**.
- Perlu: `chat_room_reads` (`user_id`, `room_id`, `last_read_at`) atau setara.

### Mention (diminta user)

Disetujui untuk disertakan; format usulan:

| Mention | Contoh | Perilaku |
|---------|--------|----------|
| User | `@rizki` atau `@email` / picker | **Notifikasi in-app** ke user tersebut |
| Project | `@project:TKD` atau picker | Link ke project; notifikasi ke anggota project (atau subset — lihat implementasi) |
| Baris | `@baris:{id}` atau picker | Link buka drawer baris; notifikasi ke peserta room baris yang relevan |

**Plain text:** mention disimpan sebagai teks di `body`; parsing saat kirim pesan (server) untuk membuat baris di **`user_notifications`** (sistem yang sudah ada di app).

- **In-app:** ya (wajib).
- **Email / push:** tidak di v1.
- Unread badge room tetap berjalan terpisah dari notifikasi mention.

---

## 13. Lampiran — link file virtual table (B)

- Pesan bisa menyertakan referensi ke file yang sudah ada di kolom tipe `file` pada virtual table (URL/path sesuai implementasi storage).
- Tidak ada upload file baru dari composer chat di v1.

---

## 14. Pencarian — scroll saja (A)

- Pagination / “Muat pesan lebih lama”.
- Tanpa full-text search global di v1.

---

## 15. Retensi — ikut soft-delete parent

- Saat `organizations.deleted_at` atau `projects.deleted_at` diset → hapus (atau cascade hard-delete) semua room & pesan di scope tersebut.
- Saat `virtual_rows.deleted_at` → hapus room baris terkait.
- Konsisten dengan keputusan hard delete pesan.

---

## 16. Audit — tanpa log khusus

- Hanya kolom standar pada pesan (`created_at`, `author_id`, dll.).
- Tidak ada tabel audit terpisah untuk edit/hapus chat.

---

## 17. Bahasa UI — Indonesia

- Semua label, error, empty state dalam Bahasa Indonesia.

---

## 18. Batas pesan & rate limit

- **Tanpa batas** panjang karakter pesan.
- **Tanpa rate limit** kirim pesan di v1 (anti-spam bisa ditambah nanti).

---

## 19. Schema — chat mandiri

Usulan tabel (konsep, belum final):

```
core_pm.chat_rooms (
  id,
  scope_type,  -- 'organization' | 'project' | 'virtual_row'
  organization_id?,
  project_id?,
  virtual_row_id?,
  created_at
)

core_pm.chat_messages (
  id, room_id, author_id, body text, created_at
)

core_pm.chat_room_reads (
  user_id, room_id, last_read_at
)
```

- Unique: satu room per kombinasi scope (mis. satu room per `virtual_row_id`).
- Issue/berkas: tidak ada FK.

---

## 20. Kebijakan hire & super admin

| # | Pertanyaan | Keputusan |
|---|------------|-----------|
| 1 | Hire boleh room organisasi? | **Tidak** |
| 2 | Hire boleh chat baris tabel **tingkat organisasi**? | **Tidak** |
| 3 | Hire yang di-remove dari project masih baca chat project lama? | **Tidak** jika sudah bukan anggota; **ya** jika masih `project_members` |
| 4 | Admin org melihat semua room project di org tanpa jadi anggota? | **Ya** |

---

## Entitas yang di-deprecate (tidak ada room)

- `core_pm.issues`
- Modul Berkas / PLM lama di UI
- `spatial.issue_geometry_features` untuk chat baru

---

## Keputusan tambahan (final, 2026-05-21)

| # | Topik | Keputusan |
|---|--------|-----------|
| 1 | Room peta | **A** — sama dengan `virtual_row` (UI peta saja) |
| 2 | Hard delete | Penulis + **admin org** (owner/admin organisasi) |
| 3 | Mention | Masuk **`user_notifications`** (in-app) |
| 4 | Room organisasi | **1 room per org** |
| 5 | Edit pesan | **Tidak** — hanya hapus |
| 6 | Rate limit | **Tanpa batas** (mungkin nanti) |

---

## Urutan implementasi yang disarankan

1. Migration `chat_rooms`, `chat_messages`, `chat_room_reads` + RLS + helper akses (org staff, project member, super admin org, virtual row read).
2. RPC `get_or_create_room`, `send_message`, `mark_room_read`, `delete_message`.
3. Realtime publication + policy.
4. UI: tab chat project + drawer virtual row.
5. Unread badges.
6. Mention parsing + picker (user, project, baris).
7. Link lampiran ke kolom file.
8. Integrasi peta: aksi di popup → buka drawer chat `virtual_row` (tanpa schema tambahan).
9. Cascade delete saat soft-delete org/project/row.

---

## Changelog catatan

| Tanggal | Perubahan |
|---------|-----------|
| 2026-05-21 | Dokumen awal dari keputusan user (pilihan 1–20) |
| 2026-05-21 | Keputusan tambahan final: peta=A, hapus=penulis+admin org, mention=in-app, 1 room/org, no edit, no rate limit |
| 2026-05-26 | Implementasi awal: DB + tab Chat + chat per baris + tombol peta |

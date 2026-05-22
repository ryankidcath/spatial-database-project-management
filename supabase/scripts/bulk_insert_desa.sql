-- Bulk insert Desa (kecamatan = kolom select, bukan relasi)
-- Jalankan di Supabase SQL Editor
-- Script ini idempotent: tidak akan menduplikat data yang sudah ada

DO $$
DECLARE
  v_desa_table_id uuid;
  v_title_slug text;
  v_kec_slug text;
  v_kec_col_id uuid;
  v_user_id uuid;
  v_sort_order int;
  v_existing_config jsonb;
  v_existing_options jsonb;
  v_all_kec text[];
  v_rec record;
BEGIN
  -- Ganti UUID di bawah dengan user ID Anda (jalankan: SELECT id, email FROM auth.users LIMIT 10;)
  v_user_id := 'afb958d7-600c-4b80-b35d-508745a860f7'::uuid;

  -- Tabel "Progres" (slug: desa)
  v_desa_table_id := '2466795e-259f-4c72-9622-e14e5d78a028'::uuid;

  v_title_slug := 'title';

  -- Find the kecamatan select column
  SELECT id, slug, COALESCE(config, '{}'::jsonb)
  INTO v_kec_col_id, v_kec_slug, v_existing_config
  FROM core_pm.virtual_columns
  WHERE table_id = v_desa_table_id
    AND slug = 'kecamatan'
  LIMIT 1;

  IF v_kec_slug IS NULL THEN
    RAISE EXCEPTION 'Kolom "kecamatan" tidak ditemukan.';
  END IF;

  RAISE NOTICE 'Desa table: %, title slug: %, kecamatan slug: %', v_desa_table_id, v_title_slug, v_kec_slug;

  -- =========================================================================
  -- Step 1: Update select options to include all kecamatan
  -- =========================================================================

  v_all_kec := ARRAY[
    'Ciwaringin', 'Depok', 'Dukupuntang', 'Gempol',
    'Jamblang', 'Kedawung', 'Klangenan', 'Panguragan',
    'Plered', 'Plumbon', 'Suranenggala', 'Talun',
    'Tengahtani', 'Weru'
  ];

  -- Merge with existing options
  v_existing_options := COALESCE(v_existing_config->'options', '[]'::jsonb);

  -- Add new kecamatan that don't exist yet
  FOR i IN 1..array_length(v_all_kec, 1) LOOP
    IF NOT v_existing_options ? v_all_kec[i]
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(v_existing_options) AS t
         WHERE t = v_all_kec[i]
       )
    THEN
      v_existing_options := v_existing_options || to_jsonb(v_all_kec[i]);
      RAISE NOTICE 'Added select option: %', v_all_kec[i];
    END IF;
  END LOOP;

  -- Update the column config with merged options
  UPDATE core_pm.virtual_columns
  SET config = v_existing_config || jsonb_build_object('options', v_existing_options),
      updated_at = now()
  WHERE id = v_kec_col_id;

  RAISE NOTICE 'Select options updated.';

  -- =========================================================================
  -- Step 2: Insert desa rows
  -- =========================================================================

  SELECT COALESCE(MAX(sort_order), -1) INTO v_sort_order
  FROM core_pm.virtual_rows
  WHERE table_id = v_desa_table_id AND deleted_at IS NULL;

  FOR v_rec IN
    SELECT desa, kecamatan FROM (VALUES
      ('Babakan', 'Ciwaringin'),
      ('Bringin', 'Ciwaringin'),
      ('Budur', 'Ciwaringin'),
      ('Ciwaringin', 'Ciwaringin'),
      ('Galagamba', 'Ciwaringin'),
      ('Gintung Kidul', 'Ciwaringin'),
      ('Gintung Tengah', 'Ciwaringin'),
      ('Gintungranjeng', 'Ciwaringin'),
      ('Cikeduk', 'Depok'),
      ('Depok', 'Depok'),
      ('Getasan', 'Depok'),
      ('Karangwangi', 'Depok'),
      ('Kasugengan Kidul', 'Depok'),
      ('Kasugengan Lor', 'Depok'),
      ('Keduanan', 'Depok'),
      ('Kejuden', 'Depok'),
      ('Warugede', 'Depok'),
      ('Warujaya', 'Depok'),
      ('Warukawung', 'Depok'),
      ('Waruroyom', 'Depok'),
      ('Balad', 'Dukupuntang'),
      ('Bobos', 'Dukupuntang'),
      ('Cangkoak', 'Dukupuntang'),
      ('Cikalahang', 'Dukupuntang'),
      ('Cipanas', 'Dukupuntang'),
      ('Cisaat', 'Dukupuntang'),
      ('Dukupuntang', 'Dukupuntang'),
      ('Girinata', 'Dukupuntang'),
      ('Kedongdong Kidul', 'Dukupuntang'),
      ('Kepunduan', 'Dukupuntang'),
      ('Mandala', 'Dukupuntang'),
      ('Sindangjaya', 'Dukupuntang'),
      ('Sindangmekar', 'Dukupuntang'),
      ('Cupang', 'Gempol'),
      ('Cikeusal', 'Gempol'),
      ('Gempol', 'Gempol'),
      ('Kedungbunder', 'Gempol'),
      ('Kempek', 'Gempol'),
      ('Palimanan Barat', 'Gempol'),
      ('Walahar', 'Gempol'),
      ('Winong', 'Gempol'),
      ('Bakung Kidul', 'Jamblang'),
      ('Bakung Lor', 'Jamblang'),
      ('Bojong Lor', 'Jamblang'),
      ('Bojong Wetan', 'Jamblang'),
      ('Jamblang', 'Jamblang'),
      ('Orimalang', 'Jamblang'),
      ('Sitiwinangun', 'Jamblang'),
      ('Wangunharja', 'Jamblang'),
      ('Kalikoa', 'Kedawung'),
      ('Kedawung', 'Kedawung'),
      ('Kedungdawa', 'Kedawung'),
      ('Kedungjaya', 'Kedawung'),
      ('Kertawinangun', 'Kedawung'),
      ('Pilangsari', 'Kedawung'),
      ('Sutawinangun', 'Kedawung'),
      ('Tuk', 'Kedawung'),
      ('Bangodua', 'Klangenan'),
      ('Danawinangun', 'Klangenan'),
      ('Jemaras Kidul', 'Klangenan'),
      ('Jemaras Lor', 'Klangenan'),
      ('Klangenan', 'Klangenan'),
      ('Kreyo', 'Klangenan'),
      ('Pekantingan', 'Klangenan'),
      ('Serang', 'Klangenan'),
      ('Slangit', 'Klangenan'),
      ('Gujeg', 'Panguragan'),
      ('Kalianyar', 'Panguragan'),
      ('Karanganyar', 'Panguragan'),
      ('Kroya', 'Panguragan'),
      ('Lemahtamba', 'Panguragan'),
      ('Panguragan', 'Panguragan'),
      ('Panguragan Kulon', 'Panguragan'),
      ('Panguragan Lor', 'Panguragan'),
      ('Panguragan Wetan', 'Panguragan'),
      ('Cangkring', 'Plered'),
      ('Gamel', 'Plered'),
      ('Kaliwulu', 'Plered'),
      ('Panembahan', 'Plered'),
      ('Pangkalan', 'Plered'),
      ('Sarabau', 'Plered'),
      ('Tegalsari', 'Plered'),
      ('Trusmi Kulon', 'Plered'),
      ('Trusmi Wetan', 'Plered'),
      ('Wotgali', 'Plered'),
      ('Bodelor', 'Plumbon'),
      ('Bodesari', 'Plumbon'),
      ('Cempaka', 'Plumbon'),
      ('Danamulya', 'Plumbon'),
      ('Gombang', 'Plumbon'),
      ('Karangasem', 'Plumbon'),
      ('Karangmulya', 'Plumbon'),
      ('Kebarepan', 'Plumbon'),
      ('Kedungsana', 'Plumbon'),
      ('Lurah', 'Plumbon'),
      ('Marikangen', 'Plumbon'),
      ('Pamijahan', 'Plumbon'),
      ('Pasanggrahan', 'Plumbon'),
      ('Plumbon', 'Plumbon'),
      ('Purbawinangun', 'Plumbon'),
      ('Karangreja', 'Suranenggala'),
      ('Keraton', 'Suranenggala'),
      ('Muara', 'Suranenggala'),
      ('Purwawinangun', 'Suranenggala'),
      ('Surakarta', 'Suranenggala'),
      ('Suranenggala', 'Suranenggala'),
      ('Suranenggala Kidul', 'Suranenggala'),
      ('Suranenggala Lor', 'Suranenggala'),
      ('Suranenggala Kulon', 'Suranenggala'),
      ('Cempaka', 'Talun'),
      ('Ciperna', 'Talun'),
      ('Cirebon Girang', 'Talun'),
      ('Kecomberan', 'Talun'),
      ('Kepongpongan', 'Talun'),
      ('Kerandon', 'Talun'),
      ('Kubang', 'Talun'),
      ('Sampiran', 'Talun'),
      ('Sarwadadi', 'Talun'),
      ('Wanasaba Kidul', 'Talun'),
      ('Wanasaba Lor', 'Talun'),
      ('Astapada', 'Tengahtani'),
      ('Battembat', 'Tengahtani'),
      ('Dawuan', 'Tengahtani'),
      ('Gesik', 'Tengahtani'),
      ('Kalibaru', 'Tengahtani'),
      ('Kalitengah', 'Tengahtani'),
      ('Kemlakagede', 'Tengahtani'),
      ('Palir', 'Tengahtani'),
      ('Karangsari', 'Weru'),
      ('Kertasari', 'Weru'),
      ('Megu Cilik', 'Weru'),
      ('Megu Gede', 'Weru'),
      ('Setu Kulon', 'Weru'),
      ('Setu Wetan', 'Weru'),
      ('Tegalwangi', 'Weru'),
      ('Weru Kidul', 'Weru'),
      ('Weru Lor', 'Weru')
    ) AS t(desa, kecamatan)
  LOOP
    -- Skip if desa already exists with same kecamatan
    IF EXISTS (
      SELECT 1 FROM core_pm.virtual_rows
      WHERE table_id = v_desa_table_id
        AND deleted_at IS NULL
        AND payload->>v_title_slug = v_rec.desa
        AND payload->>v_kec_slug = v_rec.kecamatan
    ) THEN
      RAISE NOTICE 'Sudah ada: % (%)', v_rec.desa, v_rec.kecamatan;
      CONTINUE;
    END IF;

    v_sort_order := v_sort_order + 1;

    INSERT INTO core_pm.virtual_rows (table_id, payload, sort_order, created_by)
    VALUES (
      v_desa_table_id,
      jsonb_build_object(
        v_title_slug, v_rec.desa,
        v_kec_slug, v_rec.kecamatan,
        'cek', 'To Do',
        'koordinasi_copy', 'To Do',
        'daftar_tkd_copy', 'To Do',
        'invoice_pembayaran_copy', 'To Do',
        'pemasangan_patok_copy', 'To Do',
        'penjadwalan_pengukuran_copy', 'To Do',
        'pengukuran_copy', 'To Do',
        'pemetaan_copy', 'To Do'
      ),
      v_sort_order,
      v_user_id
    );

    RAISE NOTICE 'Inserted: % (%)', v_rec.desa, v_rec.kecamatan;
  END LOOP;

  -- =========================================================================
  -- Step 3: Set status "To Do" untuk baris yang sudah ada tapi belum punya status
  -- =========================================================================

  UPDATE core_pm.virtual_rows
  SET payload = payload
    || CASE WHEN payload->>'cek' IS NULL OR payload->>'cek' NOT IN ('To Do','On Progress','Done') THEN '{"cek":"To Do"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN payload->>'koordinasi_copy' IS NULL OR payload->>'koordinasi_copy' NOT IN ('To Do','On Progress','Done') THEN '{"koordinasi_copy":"To Do"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN payload->>'daftar_tkd_copy' IS NULL OR payload->>'daftar_tkd_copy' NOT IN ('To Do','On Progress','Done') THEN '{"daftar_tkd_copy":"To Do"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN payload->>'invoice_pembayaran_copy' IS NULL OR payload->>'invoice_pembayaran_copy' NOT IN ('To Do','On Progress','Done') THEN '{"invoice_pembayaran_copy":"To Do"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN payload->>'pemasangan_patok_copy' IS NULL OR payload->>'pemasangan_patok_copy' NOT IN ('To Do','On Progress','Done') THEN '{"pemasangan_patok_copy":"To Do"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN payload->>'penjadwalan_pengukuran_copy' IS NULL OR payload->>'penjadwalan_pengukuran_copy' NOT IN ('To Do','On Progress','Done') THEN '{"penjadwalan_pengukuran_copy":"To Do"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN payload->>'pengukuran_copy' IS NULL OR payload->>'pengukuran_copy' NOT IN ('To Do','On Progress','Done') THEN '{"pengukuran_copy":"To Do"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN payload->>'pemetaan_copy' IS NULL OR payload->>'pemetaan_copy' NOT IN ('To Do','On Progress','Done') THEN '{"pemetaan_copy":"To Do"}'::jsonb ELSE '{}'::jsonb END,
    updated_at = now()
  WHERE table_id = v_desa_table_id
    AND deleted_at IS NULL;

  RAISE NOTICE 'Status "To Do" di-set untuk baris yang belum punya status.';
  RAISE NOTICE '=== Selesai! ===';
END $$;

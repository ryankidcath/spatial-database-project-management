-- GHDEMO: pakai deteksi otomatis (profil kosong), bukan seed eksplisit G-H4.

update core_pm.projects
set entity_360_profile = '{}'::jsonb
where id = '22222222-2222-4222-8222-222222222223';

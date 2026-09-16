-- Tes migrasi skema `bot` di Postgres kosong (bukan project Supabase).
-- Jalankan dari root repo:
--
--   docker run -d --rm --name bot-test -e POSTGRES_HOST_AUTH_METHOD=trust -v "$PWD/supabase:/supabase" postgres:17
--   docker exec bot-test psql -U postgres -v ON_ERROR_STOP=1 -f /supabase/tests/bot_schema.test.sql
--   docker stop bot-test
--
-- Gagal = psql berhenti dengan ERROR/ASSERT; lolos = baris terakhir "SEMUA TES LOLOS".

\set QUIET on
-- Tiruan objek bawaan Supabase yang dirujuk baseline.
create role anon;
create role authenticated;
create role service_role;
create publication supabase_realtime;
\ir ../migrations/20260916000000_baseline_schema.sql
\ir ../migrations/20260916222322_bot_schema.sql
set search_path = public;
create extension dblink;

insert into barbers (name, created_at, archived) values
  ('Irfan', '2026-01-01', false),
  ('Renol', '2026-01-02', false),
  ('Budi', '2026-01-03', true),
  ('Ari', '2026-01-04', false),
  ('Arif', '2026-01-05', false);
insert into services (name, price, duration_minutes) values
  ('Potong', 50000, 30),
  ('Creambath', 75001, 45);

-- resolve_date: 2026-09-17 = Kamis.
do $$
begin
  assert bot.resolve_date('besok', '2026-09-17') = '2026-09-18';
  assert bot.resolve_date('lusa', '2026-09-17') = '2026-09-19';
  assert bot.resolve_date('Kamis', '2026-09-17') = '2026-09-17';
  assert bot.resolve_date('Rabu', '2026-09-17') = '2026-09-23';
  assert bot.resolve_date('Minggu', '2026-09-17') = '2026-09-20';
  assert bot.resolve_date('hari ini', '2026-09-17') = '2026-09-17';
  assert bot.resolve_date(null, '2026-09-17') = '2026-09-17';
end $$;

-- append_history menyisakan 6 baris terakhir.
do $$
declare h text[];
begin
  for i in 1..8 loop
    perform bot.append_history('628@c.us', 'baris ' || i);
  end loop;
  select history into h from bot.conversations where chat_id = '628@c.us';
  assert h = array['baris 3', 'baris 4', 'baris 5', 'baris 6', 'baris 7', 'baris 8'], h::text;
end $$;

-- Booking dan bentrok slot. Kursi aktif: Irfan, Renol, Ari, Arif (Budi archived).
do $$
declare
  r jsonb;
  d date := bot.resolve_date('hari ini');
  rec whatsapp_requests;
begin
  r := bot.create_booking('a@c.us', '6281', 'Andi', 'hari ini', '14:00', 'potong', null, 'ya');
  assert r ->> 'barber' = 'Irfan', r::text;
  assert (r ->> 'dp_amount')::numeric = 25000, r::text;
  select * into rec from whatsapp_requests where id = (r ->> 'request_id')::uuid;
  assert rec.scheduled_date = d and rec.extracted_service = 'potong|BARBER:Irfan'
    and rec.xendit_reference_id like 'wa-%' and rec.payment_expires_at > now(), rec::text;

  r := bot.create_booking('b@c.us', '6282', 'Beni', 'hari ini', '14:00', 'potong', 'irfan', 'ya');
  assert not (r ->> 'available')::boolean, r::text;
  assert r ->> 'message' = 'Mohon maaf, Kak, kapster irfan sudah memiliki jadwal pada jam 14:00. Kapster yang tersedia pada jam tersebut: Renol, Ari, Arif. Apakah Kak ingin mengganti kapster atau memilih jam lain?', r::text;

  -- Nama persis diprioritaskan: "arif" tidak jatuh ke "Ari".
  r := bot.create_booking('c@c.us', '6283', 'Caca', 'hari ini', '14:00', 'creambath', 'arif', 'ya');
  assert r ->> 'barber' = 'Arif', r::text;
  assert (r ->> 'dp_amount')::numeric = 37501, r::text;

  -- Layanan tak dikenal: tersimpan tanpa DP.
  r := bot.create_booking('d@c.us', '6284', 'Dodi', 'hari ini', '14:00', 'semir', null, 'ya');
  assert r ->> 'barber' = 'Renol' and r -> 'dp_amount' = 'null' and r -> 'reference_id' = 'null', r::text;

  r := bot.create_booking('e@c.us', '6285', 'Eka', 'hari ini', '14:00', 'potong', null, 'ya');
  assert r ->> 'barber' = 'Ari', r::text;

  -- Kursi habis (Budi yang archived tidak dihitung).
  r := bot.create_booking('f@c.us', '6286', 'Fajar', 'hari ini', '14:00', 'potong', null, 'ya');
  assert r ->> 'message' = 'Mohon maaf, Kak, seluruh kapster sudah penuh untuk jam 14:00. Silakan pilih jam lain.', r::text;

  -- DP expired membebaskan kursi Irfan.
  update whatsapp_requests set payment_status = 'expired' where sender_phone = '6281';
  assert bot.check_slot(d, '14:00', null) ->> 'barber' = 'Irfan';

  -- Peringatan booking ganda di hari yang sama.
  assert bot.find_same_day_booking('6283', d) = '14:00';
  assert bot.find_same_day_booking('6281', d) is null;
  assert bot.find_same_day_booking('6283', d + 1) is null;
end $$;

-- queue_entries: completed tidak dihitung, entri tanpa kapster memakan kursi.
do $$
declare
  d date := bot.resolve_date('hari ini');
  svc uuid := (select id from services where name = 'Potong');
begin
  insert into queue_entries (customer_name, phone, status, scheduled_date, scheduled_time, barber_id, service_id)
  values ('Lama', '6290', 'completed', d, '15:00', (select id from barbers where name = 'Irfan'), svc);
  assert bot.check_slot(d, '15:00', 'irfan') ->> 'barber' = 'Irfan';

  insert into queue_entries (customer_name, phone, status, scheduled_date, scheduled_time, barber_id, service_id)
  select 'Tanpa kapster ' || i, '629' || i, 'confirmed', d, '15:00', null, svc from generate_series(1, 4) i;
  assert not (bot.check_slot(d, '15:00', null) ->> 'available')::boolean;
  assert bot.find_same_day_booking('6291', d) = '15:00';
end $$;

-- Balapan: sesi lain menyimpan booking Renol jam 17:00 lalu menahan
-- transaksinya 2 detik. Booking kita untuk slot yang sama harus menunggu lock
-- dan melihat slot itu sudah terisi, bukan ikut tersimpan.
select dblink_connect('lain', 'dbname=postgres user=postgres');
select dblink_send_query('lain', $q$
  do $$ begin
    perform bot.create_booking('x@c.us', '6271', 'Xavi', 'hari ini', '17:00', 'potong', 'renol', 'ya');
    perform pg_sleep(2);
  end $$
$q$);
do $$
declare r jsonb;
begin
  perform pg_sleep(0.5);
  r := bot.create_booking('y@c.us', '6272', 'Yudi', 'hari ini', '17:00', 'potong', 'renol', 'ya');
  assert not (r ->> 'available')::boolean, 'booking ganda lolos: ' || r::text;
end $$;
select * from dblink_get_result('lain') as t(status text);
select dblink_disconnect('lain');
do $$
begin
  assert (select count(*) from whatsapp_requests where extracted_time = '17:00') = 1;
end $$;

\echo SEMUA TES LOLOS

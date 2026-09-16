-- Skema `bot`: state percakapan dan fungsi booking untuk workflow n8n
-- (pengganti Map in-memory dan withBookingLock di server/index.js).
-- Rancangan lengkap: n8n-stack/RANCANGAN.md.
--
-- Sengaja di skema terpisah, bukan `public`: PostgREST hanya mengekspos
-- `public`, dan baseline memberi anon GRANT ALL + EXECUTE default di sana.
-- Tanpa USAGE di skema ini, anon/authenticated tidak bisa menyentuhnya; hanya
-- n8n (koneksi Postgres langsung sebagai role postgres) yang memakainya.
-- Karena itu tabel di sini tidak memakai RLS.
--
-- Aman diterapkan ke produksi: tidak mengubah tabel yang sudah ada.

create schema if not exists bot;
revoke all on schema bot from anon, authenticated;

-- Satu baris per chat WhatsApp. `state` = sesi booking yang sedang berjalan
-- ({nama, hari, jam, servis, kapster, awaitingConfirmation}), dianggap kosong
-- bila state_updated_at lebih tua dari 30 menit. Baris yang updated_at-nya
-- lebih tua dari 24 jam dihapus oleh workflow tiap menit.
create table bot.conversations (
  chat_id text primary key,
  state jsonb,
  state_updated_at timestamptz,
  history text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Dedup pesan: WAHA bisa mengirim ulang webhook (retry/reconnect). Workflow
-- meng-insert message_id dengan ON CONFLICT DO NOTHING; 0 baris = sudah diproses.
create table bot.processed_messages (
  message_id text primary key,
  received_at timestamptz not null default now()
);

-- Menambah satu baris riwayat ("Customer: ..." / "Bot: ...") dan menyisakan
-- 6 baris terakhir, atomik terhadap eksekusi paralel.
create function bot.append_history(p_chat_id text, p_line text)
returns void
language sql
set search_path = ''
as $$
  insert into bot.conversations as c (chat_id, history)
  values (p_chat_id, array[p_line])
  on conflict (chat_id) do update
    set history = (c.history || p_line)[greatest(cardinality(c.history) - 4, 1):],
        updated_at = now();
$$;

-- Port getTargetDateStr(): "besok"/"Sabtu"/dst -> tanggal absolut WIB.
-- Selalu Asia/Jakarta, tidak bergantung zona waktu server. Hari yang sama
-- dengan hari ini = hari ini; teks tak dikenal = hari ini.
create function bot.resolve_date(
  p_hari text,
  p_today date default (now() at time zone 'Asia/Jakarta')::date
)
returns date
language sql
stable
set search_path = ''
as $$
  select p_today + ((idx - extract(dow from p_today)::int + 7) % 7)
  from (
    select case
      when d like '%besok%' then (extract(dow from p_today)::int + 1) % 7
      when d like '%lusa%' then (extract(dow from p_today)::int + 2) % 7
      when d like '%senin%' then 1
      when d like '%selasa%' then 2
      when d like '%rabu%' then 3
      when d like '%kamis%' then 4
      when d like '%jumat%' then 5
      when d like '%sabtu%' then 6
      when d like '%minggu%' then 0
      else extract(dow from p_today)::int
    end as idx
    from (select lower(coalesce(p_hari, '')) as d) x
  ) t;
$$;

-- Port checkAvailability(). Mengembalikan
--   {available: true, barber: "<nama>"} atau
--   {available: false, barber: null, message: "<balasan untuk pelanggan>"}.
-- Jam dicocokkan persis pada jam mulai (durasi layanan diabaikan, sama
-- seperti bot lama).
create function bot.check_slot(p_date date, p_jam text, p_kapster text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_total int;
  v_busy uuid[];
  v_unassigned int;
  v_free text[];
  v_req_id uuid;
  v_req_name text;
begin
  -- Kapster aktif = belum di-archive, bukan berdasarkan kolom status.
  select count(*) into v_total from public.barbers where not archived;

  select coalesce(array_agg(distinct barber_id), '{}') into v_busy
  from (
    select q.barber_id
    from public.queue_entries q
    join public.barbers b on b.id = q.barber_id and not b.archived
    where q.scheduled_date = p_date
      and left(q.scheduled_time::text, length(p_jam)) = p_jam
      and q.status <> 'completed'
    union all
    select m.id
    from public.whatsapp_requests r
    cross join lateral (
      select b.id from public.barbers b
      where not b.archived
        and strpos(lower(b.name), lower(split_part(r.extracted_service, '|BARBER:', 2))) > 0
      order by b.created_at, b.id
      limit 1
    ) m
    where r.status = 'pending'
      and r.scheduled_date = p_date
      and r.extracted_time = p_jam
      and split_part(r.extracted_service, '|BARBER:', 2) <> ''
      and r.payment_status not in ('expired', 'failed')
  ) busy;

  -- Booking tanpa kapster tetap memakan satu kursi.
  select
    (select count(*) from public.queue_entries q
      where q.scheduled_date = p_date
        and q.barber_id is null
        and left(q.scheduled_time::text, length(p_jam)) = p_jam
        and q.status <> 'completed')
    + (select count(*) from public.whatsapp_requests r
      where r.status = 'pending'
        and r.scheduled_date = p_date
        and r.extracted_time = p_jam
        and split_part(coalesce(r.extracted_service, ''), '|BARBER:', 2) = ''
        and r.payment_status not in ('expired', 'failed'))
  into v_unassigned;

  select coalesce(array_agg(name order by created_at, id), '{}') into v_free
  from public.barbers
  where not archived and id <> all (v_busy);

  if coalesce(p_kapster, '') <> '' then
    select b.id, b.name into v_req_id, v_req_name
    from public.barbers b
    where not b.archived
      and (strpos(lower(b.name), lower(p_kapster)) > 0 or strpos(lower(p_kapster), lower(b.name)) > 0)
    order by lower(b.name) = lower(p_kapster) desc, b.created_at, b.id
    limit 1;
  end if;

  if v_req_id is not null then
    if v_req_id = any (v_busy) then
      return jsonb_build_object(
        'available', false,
        'barber', null,
        'message', format('Mohon maaf, Kak, kapster %s sudah memiliki jadwal pada jam %s. ', p_kapster, p_jam)
          || case when cardinality(v_free) > 0
               then format('Kapster yang tersedia pada jam tersebut: %s. Apakah Kak ingin mengganti kapster atau memilih jam lain?', array_to_string(v_free, ', '))
               else 'Seluruh kapster juga penuh pada jam tersebut. Silakan pilih jam lain.'
             end
      );
    end if;
    return jsonb_build_object('available', true, 'barber', v_req_name);
  end if;

  if cardinality(v_busy) + v_unassigned >= v_total then
    return jsonb_build_object(
      'available', false,
      'barber', null,
      'message', format('Mohon maaf, Kak, seluruh kapster sudah penuh untuk jam %s. Silakan pilih jam lain.', p_jam)
    );
  end if;
  return jsonb_build_object('available', true, 'barber', v_free[1]);
end;
$$;

-- Port checkExistingBookingSameDay(): jam (HH:MM) booking lain milik nomor ini
-- pada tanggal yang sama, atau null. Hanya untuk peringatan, bukan pemblokir.
create function bot.find_same_day_booking(p_phone text, p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select left(r.extracted_time, 5) from public.whatsapp_requests r
      where r.sender_phone = p_phone
        and r.status = 'pending'
        and r.scheduled_date = p_date
        and r.payment_status not in ('expired', 'failed')
      limit 1),
    (select left(q.scheduled_time::text, 5) from public.queue_entries q
      where q.phone = p_phone
        and q.scheduled_date = p_date
        and q.status <> 'completed'
      limit 1)
  );
$$;

-- Cek slot + simpan booking secara atomik. Hasil check_slot() digabung dengan
-- {request_id, dp_amount, reference_id} bila tersimpan. dp_amount null = harga
-- layanan tidak ditemukan, booking disimpan tanpa DP (fail open, sama seperti
-- bot lama).
create function bot.create_booking(
  p_chat_id text,
  p_phone text,
  p_nama text,
  p_hari text,
  p_jam text,
  p_servis text,
  p_kapster text,
  p_raw_message text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_date date := bot.resolve_date(p_hari);
  v_slot jsonb;
  v_price numeric;
  v_row public.whatsapp_requests;
begin
  -- Eksekusi n8n berjalan paralel: tanpa lock ini dua pelanggan yang
  -- konfirmasi bersamaan bisa mendapat kapster yang sama. Lock per tanggal,
  -- dilepas otomatis saat transaksi selesai. Fungsi ini sengaja VOLATILE
  -- supaya check_slot di bawah membaca snapshot baru SETELAH lock didapat.
  perform pg_advisory_xact_lock(hashtextextended('bot.create_booking:' || v_date, 0));

  v_slot := bot.check_slot(v_date, p_jam, p_kapster);
  if not (v_slot ->> 'available')::boolean then
    return v_slot;
  end if;

  -- Port getServicePrice(): nama persis dulu, lalu cocok sebagian.
  select s.price into v_price
  from public.services s
  where not s.archived
    and coalesce(p_servis, '') <> ''
    and (strpos(lower(s.name), lower(p_servis)) > 0 or strpos(lower(p_servis), lower(s.name)) > 0)
  order by lower(s.name) = lower(p_servis) desc, s.created_at, s.id
  limit 1;

  insert into public.whatsapp_requests (
    sender_name, sender_phone, sender_wa_id, raw_message,
    extracted_day, extracted_time, extracted_service, scheduled_date, is_booking_intent,
    dp_amount, xendit_reference_id, payment_expires_at
  ) values (
    p_nama, p_phone, p_chat_id, p_raw_message,
    p_hari, p_jam, p_servis || '|BARBER:' || (v_slot ->> 'barber'), v_date, true,
    round(v_price * 0.5),
    case when v_price is not null then 'wa-' || gen_random_uuid() end,
    case when v_price is not null then now() + interval '30 minutes' end
  )
  returning * into v_row;

  return v_slot || jsonb_build_object(
    'request_id', v_row.id,
    'dp_amount', v_row.dp_amount,
    'reference_id', v_row.xendit_reference_id
  );
end;
$$;

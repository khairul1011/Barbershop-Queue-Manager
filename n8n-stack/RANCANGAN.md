# Rancangan Workflow n8n + WAHA

Rancangan pengganti bot `server/` (whatsapp-web.js) dengan n8n dan WAHA engine
GOWS. Status: **keenam workflow sudah dibangun dan diuji di Mac** (2026-09-17). Acuan perilaku adalah kode bot
produksi: `server/index.js`, `server/webhookServer.js`, dan `server/services/`.

Ekspor workflow (bisa di-import ulang dan di-review lewat PR) ada di
[`workflows/`](workflows/). Tes Code node membaca kode langsung dari file ekspor
itu. Jalankan dari root repo setelah `cd server && npm install`:

```bash
node n8n-stack/workflows/code.test.cjs
```

```
WhatsApp ──> WAHA ──webhook──> n8n ──Postgres──> Supabase <──realtime── Dashboard
                  <──HTTP API──     <──webhook── Xendit
                                    <──HTTP───── Dashboard (QR sisa bayar)
```

## Prinsip

1. **Database lewat node Postgres**, bukan node Supabase (PostgREST). Koneksi
   langsung ke Supabase lewat pooler mode session (port 5432). Alasannya, query
   yang dibutuhkan harus atomik (`INSERT ... ON CONFLICT`, `UPDATE ... RETURNING`,
   advisory lock), dan fungsi di skema `bot` sengaja tidak diekspos ke `anon`.
   Hak aksesnya setara `SUPABASE_SERVICE_ROLE_KEY` yang dipakai bot sekarang.
   Parameter query **wajib** berbentuk array (`={{ [a, b, null] }}`), karena
   n8n memotong daftar parameter di setiap koma, termasuk koma di dalam teks
   pesan pelanggan.
2. **WAHA lewat Webhook + HTTP Request biasa**, tanpa community node
   `@devlikeapro/n8n-nodes-waha`. API yang dipakai hanya enam endpoint, jadi
   satu dependensi pihak ketiga bisa dihindari.
3. **Logika yang harus konsisten ada di SQL** (cek slot, simpan booking, resolusi
   tanggal) dan diuji. **Logika percakapan ada di satu Code node** yang di-port
   dari `index.js`.

## Database

Migrasi `supabase/migrations/20260916222322_bot_schema.sql` membuat skema `bot`.
Skema ini aman diterapkan ke produksi karena tidak mengubah tabel yang sudah ada.

| Objek | Pengganti | Isi |
|---|---|---|
| `bot.conversations` | `conversationState` + `chatHistory` (Map) | `state` jsonb (kedaluwarsa 30 menit), `history` 6 baris terakhir |
| `bot.processed_messages` | `processedMessageIds` (Set) | ID pesan yang sudah diproses |
| `bot.append_history(chat_id, baris)` | `history.push` + `shift` | Tambah riwayat, sisakan 6, atomik |
| `bot.resolve_date(hari)` | `getTargetDateStr()` | "besok"/"Sabtu" → tanggal WIB |
| `bot.check_slot(tanggal, jam, kapster)` | `checkAvailability()` | `{available, barber, message}` |
| `bot.find_same_day_booking(nomor, tanggal)` | `checkExistingBookingSameDay()` | Jam booking lain di hari yang sama |
| `bot.create_booking(...)` | `withBookingLock` + insert | Lock per tanggal, cek slot, hitung DP, insert |

Tes (butuh Docker, sekitar 3 detik), termasuk uji dua pelanggan yang
konfirmasi slot yang sama bersamaan:

```bash
docker run -d --rm --name bot-test -e POSTGRES_HOST_AUTH_METHOD=trust -v "$PWD/supabase:/supabase" postgres:17
docker exec bot-test psql -U postgres -v ON_ERROR_STOP=1 -f /supabase/tests/bot_schema.test.sql
docker stop bot-test
```

## Credential n8n

| Nama | Tipe | Isi |
|---|---|---|
| Supabase DB | Postgres | Host pooler, port 5432, database `postgres`, user `postgres.<ref>`, password DB, SSL |
| WAHA API | Header Auth | `X-Api-Key` = `WAHA_API_KEY` |
| WAHA Webhook | Header Auth | Header rahasia baru yang dikirim WAHA ke n8n (`customHeaders` di konfigurasi session) |
| Xendit Callback | Header Auth | `x-callback-token` = token verifikasi dari dashboard Xendit |
| Xendit API | Basic Auth | User = secret key Xendit, password kosong |
| Gemini | Google Gemini (PaLM) API | API key |

## Workflow

Enam workflow: dua sub-workflow yang dipakai bersama dan empat workflow utama.

### `sub: Kirim WA`

Pengganti `replyAndSaveHistory` / `sendMessageWithDelay` / `sendMediaWithDelay`.
Input: `chatId`, `text`, `replyTo` (opsional), `imageBase64` (opsional).

1. HTTP `POST /api/sendSeen`, seperti whatsapp-web.js yang menandai chat terbaca saat membalas
2. HTTP `POST /api/startTyping` (indikator hilang sendiri saat pesan terkirim, jadi tidak perlu `stopTyping`)
3. Wait: `min(1,5–3 detik acak + 30 ms × panjang teks, 7 detik)`
4. IF ada gambar → `POST /api/sendImage` (caption = `text`), selain itu `POST /api/sendText` (`reply_to` = `replyTo`)

Error tidak ditangkap di sini, tetapi diteruskan ke pemanggil.

### `sub: Buat QRIS`

Pengganti `createQrisPaymentRequest` + `QRCode.toDataURL`. Input: `referenceId`, `amount`.

1. HTTP `POST https://api.xendit.co/payment_requests`. Body wajib snake_case, `reusability: ONE_TIME_USE`, `channel_code: QRIS`
2. Code: ambil `payment_method.qr_code.channel_properties.qr_string`, ubah ke PNG base64 dengan package `qrcode`
3. Output `{ paymentRequestId, qrPngBase64 }`

### 1. `WA Masuk`

1. **Webhook** `POST /webhook/waha`, credential *WAHA Webhook*. Opsi `onlyRunIf`:
   `event = message`, bukan `fromMe`, dan `from` tidak berakhiran `@g.us`,
   `@broadcast`, atau `@newsletter`. Request yang tidak lolos dibalas 200 tanpa
   membuat eksekusi
2. **IF** umur pesan (`payload.timestamp`) ≤ 5 menit, pengganti `BOT_START_TIME`
3. **Postgres** `INSERT INTO bot.processed_messages ... ON CONFLICT DO NOTHING RETURNING`: 0 baris = berhenti
4. **HTTP** `GET /api/default/lids/{from}` (tanpa error bila tidak ditemukan)
   untuk nomor asli; bila kosong, nomor = `from` tanpa akhiran `@...`. `chatId`
   untuk membalas tetap `from` mentah
5. **Postgres** muat `state` (null bila lebih dari 30 menit) dan `history`, selalu 1 baris
6. **IF** aturan pesan pendek: body kosong, atau kurang dari 5 karakter tanpa `state` dan bukan sapaan → berhenti
7. **Postgres** `bot.append_history(chatId, 'Customer: ...')`
8. **Postgres** konteks bisnis: kapster aktif, layanan belum di-archive, jam buka, nama toko, cuti hari ini/besok
9. **Code** susun prompt, di-port apa adanya dari `services/gemini.js`. Daftar model: pesan lebih dari 80 karakter mulai dari model ke-3
10. **Loop Gemini**: node Google Gemini (temperature 0.1, `maxOutputTokens` diisi
    eksplisit karena default node hanya 16) + Code parse JSON. Bila error atau
    JSON tidak valid, coba model berikutnya. Semua gagal = berhenti tanpa balasan
11. **Code `Tentukan langkah`**, port percabangan `index.js`: sinyal booking baru,
    interupsi natural reply, merge dengan guard `mentionsDay`, field kurang, kata
    konfirmasi. Output: `action`, `text`, `state` baru, `merged`, `kapsterDisetujui`
12. **Switch** `action`:
    - `balas` → Postgres simpan `state` → `sub: Kirim WA` → `append_history('Bot: ...')`
    - `ringkasan` → Postgres `check_slot(resolve_date(hari), jam, kapster)` +
      `find_same_day_booking` → Code susun pesan bentrok (state: jam & kapster
      dikosongkan) atau ringkasan + peringatan booking ganda (state:
      `awaitingConfirmation`, kapster = hasil cek) → simpan state → kirim → riwayat
    - `konfirmasi` → Postgres `create_booking(..., kapsterDisetujui, ...)`:
      - error DB → balas "kendala saat menyimpan", hapus state
      - `available = false` → balas "baru saja diambil pelanggan lain" + `message`, state: jam & kapster dikosongkan
      - `dp_amount` null → balas rincian booking lengkap, hapus state
      - ada DP → `sub: Buat QRIS` → Postgres simpan `xendit_qr_id` → kirim gambar QR + caption DP (tidak masuk riwayat, sama dengan bot lama), hapus state.
        Bila QRIS gagal: `payment_status = failed`, balas "kendala menyiapkan pembayaran DP"
    - `diam` → selesai

State selalu disimpan **sebelum** mengirim WA, supaya kegagalan kirim tidak menghilangkan state.

### 2. `Webhook Xendit`

Pengganti `POST /webhooks/xendit`.

1. **Webhook** `POST /webhook/xendit`, credential *Xendit Callback* (token salah = 403, tanpa eksekusi), `responseMode: responseNode`
2. **IF** `data.payment_request_id` ada dan status `SUCCEEDED` (atau event `*.succeeded`); selain itu balas 200
3. **Postgres**, satu query: `UPDATE whatsapp_requests SET payment_status='paid', dp_paid_at=now() WHERE xendit_qr_id=$1 AND payment_status<>'paid' RETURNING ...`.
   Bila tidak ada yang cocok dengan `whatsapp_requests`, tandai `queue_entries.payment_method='qris'` untuk `payment_xendit_qr_id` yang sama
4. **Respond 200** setelah database diperbarui. Bila database gagal, n8n membalas 500 dan Xendit mengirim ulang
5. **IF** baris WA baru berubah jadi paid, ada `sender_wa_id`, dan `payment_notified` masih false → `sub: Kirim WA` "DP diterima" → set `payment_notified`

Transisi ke `paid` di langkah 3 atomik, jadi retry Xendit yang datang bersamaan tidak mengirim notifikasi dua kali.

### 3. `QR Sisa Bayar Dashboard`

Pengganti `POST /api/session-payment`.

1. **Webhook** `POST /webhook/session-payment`, opsi `allowedOrigins` = origin dashboard, `responseMode: responseNode`
2. **IF** `amount` angka > 0; selain itu balas 400
3. `sub: Buat QRIS` dengan `referenceId = qe-<uuid>`. Bila error, balas 502
4. **Respond** `{ paymentRequestId, qrPngDataUrl: 'data:image/png;base64,...' }`

### 4. `Tugas Tiap Menit`

Pengganti sweep `setInterval` dan notifikasi approve/reject lewat Realtime. Setelan
workflow: eksekusi sukses tidak disimpan (1.440 eksekusi per hari akan
membengkakkan SQLite).

1. **Schedule** tiap 1 menit
2. **Postgres** (lanjut walau error): `unpaid` yang lewat `payment_expires_at` →
   `expired`; hapus `processed_messages` lebih dari 1 hari; hapus `conversations`
   yang `updated_at`-nya lebih dari 24 jam
3. **Postgres** klaim notifikasi: `UPDATE ... SET status_notified = true WHERE id IN (SELECT ... status IN ('approved','rejected') AND NOT status_notified FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING *`
4. Per baris: Code susun teks approve/reject (port `notifyStatusChange`, termasuk
   `sender_wa_id` diprioritaskan) → `sub: Kirim WA`. Bila kirim gagal, error
   output → `status_notified = false` supaya dicoba lagi menit berikutnya

Klaim dilakukan sebelum mengirim karena eksekusi tiap menit bisa tumpang tindih
bila ada banyak notifikasi. Tanpa klaim, satu notifikasi bisa terkirim dua kali.

Workflow ini **sengaja belum di-publish** selama bot lama masih jalan di database
yang sama. Bot lama juga mengirim notifikasi approve/reject lewat Realtime, jadi
pelanggan akan menerimanya dua kali dari dua nomor berbeda. Publish saat cutover.

Halaman `/demo` tidak dipindahkan. Simulasi pembayaran Test Mode cukup lewat
API simulate Xendit.

## Pemetaan penjagaan bot lama

| Penjagaan | Tempat di rancangan |
|---|---|
| Zona waktu WIB | `bot.resolve_date` memakai `Asia/Jakarta`, tidak bergantung zona server |
| Guard halusinasi hari (`mentionsDay`) | Code `Tentukan langkah` |
| Guard halusinasi kapster saat "ya" | `create_booking` menerima kapster dari state lama, bukan hasil parsing ulang |
| Serialisasi cek-lalu-simpan | `pg_advisory_xact_lock` per tanggal di `create_booking` (teruji) |
| Filter kapster archived | `check_slot` hanya menghitung `archived = false` |
| Dedup pesan saat restart | `onlyRunIf` + batas umur 5 menit + `bot.processed_messages` |
| Tanggal absolut | `create_booking` menyimpan `scheduled_date`; `check_slot` dan `find_same_day_booking` hanya memakai kolom itu |
| Jeda ala manusia + indikator mengetik | `sub: Kirim WA` |
| Nomor asli dari `@lid` | Langkah 4 `WA Masuk` |
| Sinyal booking baru, interupsi natural reply | Code `Tentukan langkah` |

## Perubahan perilaku yang disengaja

Semua poin di bawah adalah perbaikan bug di bot lama yang ditemukan saat
menyusun rancangan ini:

1. **DP yang `expired`/`failed` tidak lagi menahan slot.** Bot lama tetap
   menghitungnya sibuk karena `status` baris itu tetap `pending`.
2. **Cek slot memakai `scheduled_date`.** `checkAvailability` lama masih
   menerjemahkan ulang `extracted_day`, bug yang sama dengan insiden peringatan
   booking ganda: booking "besok" dari tiga hari lalu ikut memblokir slot "besok"
   hari ini.
3. **Antrian `completed` tidak dihitung sibuk.** Kode lama membandingkan dengan
   `'Completed'` berhuruf kapital, yang tidak pernah cocok dengan enum.
4. **Setiap antrian tanpa kapster memakan satu kursi.** Kode lama menghitung
   semuanya sebagai satu, karena `null` hanya masuk sekali ke `Set`.
5. **Nama kapster yang persis diprioritaskan.** Dulu "arif" bisa jatuh ke "Ari"
   bila Ari terdaftar lebih dulu.
6. **Antrian milik kapster yang sudah di-archive tidak dihitung.**
7. **Lock per tanggal**, bukan satu lock global.
8. **Konteks Gemini hanya berisi layanan yang belum di-archive.**
9. **Riwayat chat bertahan 24 jam.** Dulu bertahan sampai proses restart.
10. **Notifikasi approve/reject terlambat paling lama sekitar 1 menit** (polling, bukan Realtime).
11. **Webhook Xendit membalas setelah database diperbarui, tanpa menunggu WA terkirim.**
12. **Kata hari menerima salah ketik/singkatan umum** (`hri ini`, `hr ini`, `bsk`,
    `besuk`, `jum'at`, `senen`, `rebo`). Ditemukan saat uji nyata: "hri ini" dibuang
    sehingga bot menanyakan hari dua kali.
13. **Pesan yang dinilai pertanyaan di tengah sesi booking tetap melengkapi field
    kosong** (nama, hari, jam, servis). Field yang sudah terisi tetap tidak ditimpa,
    dan kapster tidak ikut diisi. Ditemukan saat uji nyata: nama dan jam dari "hri ini
    kak jam 2 yaa kak atas nama khairul" hilang.

## Batasan yang dibawa dari bot lama

- Slot dicocokkan hanya pada jam mulai persis; durasi layanan diabaikan (booking
  14:00 layanan 45 menit tidak memblokir 14:30).
- Kapster berstatus `off`/`break` dan data cuti tidak memblokir slot. Cuti hanya
  diinformasikan ke Gemini.
- Dua pesan dari chat yang sama yang tiba hampir bersamaan diproses paralel, dan
  state yang terakhir disimpan yang menang. Bot lama punya celah yang sama, tetapi
  di n8n peluangnya lebih besar. Perbaikannya nanti: kolom versi di
  `bot.conversations` + simpan bersyarat.

## Diverifikasi paling awal saat build

1. **PNG QR di Code node: terverifikasi 2026-09-17.** Image custom `n8n/Dockerfile`
   (n8n 2.36.8 + `qrcode` di `/usr/local/lib/node_modules`) dan
   `NODE_FUNCTION_ALLOW_EXTERNAL=qrcode`. Code node menghasilkan PNG valid dalam 70 ms.
2. **Endpoint WAHA GOWS: terverifikasi.** Kirim teks balasan (`reply_to`),
   gambar QR, mengetik, tandai terbaca, dan `lids` (chat pelanggan masuk sebagai
   `@lid`, nomor asli berhasil diambil) teruji dengan pesan sungguhan.
3. **Preflight CORS: terverifikasi.** Origin dashboard mendapat izin; origin lain
   hanya mendapat header domain dashboard sehingga diblokir browser.
4. **Model Gemini: terverifikasi.** Keempat model di `MODEL_CHAIN` tersedia lewat credential n8n.

## Tambahan checklist cutover

- Terapkan migrasi `bot_schema` ke produksi. Sudah diterapkan 2026-09-17 di project `sdlpnlgkbhtxypsgnlaa`.
- Credential Postgres saat uji coba memakai "Ignore SSL Issues". Di server, pasang CA Supabase lewat
  `NODE_EXTRA_CA_CERTS` lalu matikan opsi itu.
- Ingress cloudflared untuk `n8n.takhtabarber.shop` hanya path `^/webhook/`.
  Editor n8n cukup diakses lewat SSH port forward, sama seperti dashboard WAHA.
- `src/components/Overview.tsx`: `PAYMENT_BACKEND_URL` dan path berubah menjadi
  `https://n8n.takhtabarber.shop/webhook/session-payment`.
- Ganti callback URL Xendit (Payment Request) di dashboard Xendit ke
  `https://n8n.takhtabarber.shop/webhook/xendit`. Selama masih ke bot lama,
  pembayaran booking dari n8n ditandai lunas oleh bot lama dan notifikasinya
  dikirim nomor bot lama (terbukti gagal sampai ke chat `@lid`).
- Publish workflow `Tugas Tiap Menit` setelah bot lama dimatikan.
- Pindahkan workflow ke n8n server: import dari `workflows/` lalu sambungkan ulang
  credential (ID credential berbeda di instance baru), atau salin volume `n8n_data`
  dengan `N8N_ENCRYPTION_KEY` yang sama.
- Setelah perubahan workflow di n8n, ekspor ulang ke `workflows/` dan jalankan
  `code.test.cjs` sebelum PR.

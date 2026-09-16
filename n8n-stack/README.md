# Stack n8n + WAHA

Pengganti bot booking WhatsApp di `server/`, dibangun dengan n8n (orkestrasi
alur + AI) dan [WAHA](https://waha.devlike.pro) (WhatsApp HTTP API, jembatan
WhatsApp non-resmi) dengan engine GOWS.

Status saat ini: workflow sudah dibangun dan diuji di lokal, menunggu cutover ke
VPS yang sama dengan bot lama (bot lama lalu dihapus). Progres dan langkah
berikutnya: [PROGRES.md](PROGRES.md). Desain workflow: [RANCANGAN.md](RANCANGAN.md).

## Perbandingan dengan bot produksi

| | `server/` (bot lama) | Stack ini (pengganti) |
|---|---|---|
| Jembatan WhatsApp | `whatsapp-web.js` + Puppeteer (Chromium) | WAHA engine GOWS (Go, WebSocket, tanpa browser) |
| Logika booking | Kode Node.js | Alur visual n8n |
| Parsing pesan | Gemini via `services/gemini.js` | Node AI n8n |
| Penyimpanan | Supabase | Supabase (sama) |

## Prasyarat server

- Arsitektur ARM64 atau AMD64. Image WAHA GOWS dibuat terpisah per arsitektur:
  isi `WAHA_IMAGE_TAG` di `.env` dengan `gows` (x86_64) atau `gows-arm`
  (aarch64/arm64) sesuai hasil `uname -m`
- RAM: setelah workflow dipakai terukur sekitar 755 MB (n8n ~460 MB, WAHA
  ~300 MB, diukur di Docker Mac). Server dengan RAM 1 GB butuh swap; 2 GB ke atas lebih aman
- Docker dan Docker Compose terpasang
- Cloudflare Tunnel untuk akses publik (tidak ada port masuk yang dibuka)

## Cara menjalankan

```bash
cp .env.example .env
```

Isi `.env`. Untuk nilai acak:

```bash
openssl rand -hex 32
```

Jalankan stack (image n8n di-build dari `n8n/Dockerfile` pada run pertama; setelah
Dockerfile berubah, tambahkan `--build`):

```bash
docker compose up -d
```

Cek status:

```bash
docker compose ps
docker compose logs -f
```

## Akses

Seluruh port hanya di-bind ke `127.0.0.1`, jadi tidak bisa diakses langsung
dari internet. Hanya n8n yang dibuka lewat Cloudflare Tunnel, karena webhook
Xendit perlu URL publik:

| Hostname | Service lokal |
|---|---|
| `n8n.takhtabarber.shop` | `http://localhost:5678` |

WAHA sengaja tidak dibuka ke publik. Dashboard-nya ada di
`http://localhost:3001/dashboard` (login `WAHA_DASHBOARD_USERNAME` /
`WAHA_DASHBOARD_PASSWORD`). Di server, akses lewat SSH port forward:

```bash
ssh -L 3001:localhost:3001 <user>@<server>
```

## Menghubungkan WAHA ke n8n

1. Di dashboard WAHA, buat/jalankan session lalu scan QR dengan nomor WhatsApp
   percobaan.
2. Di konfigurasi webhook session tersebut, isi URL `http://n8n:5678/webhook/waha`
   (jaringan internal Docker, bukan `localhost`), event `message`, dan custom
   header rahasia yang sama dengan credential *WAHA Webhook* di n8n.
3. n8n memanggil WAHA di `http://waha:3000` dengan credential *WAHA API*
   (header `X-Api-Key` = `WAHA_API_KEY`). Tidak perlu community node WAHA.

Daftar lengkap credential dan workflow ada di [RANCANGAN.md](RANCANGAN.md).

## Catatan penting

- **`N8N_ENCRYPTION_KEY` jangan diubah** setelah ada kredensial tersimpan di
  n8n. Mengubahnya membuat seluruh kredensial lama tidak dapat dibaca.
- **`WAHA_API_KEY` adalah satu-satunya pelindung API WAHA.** Siapa pun yang
  memilikinya dapat mengirim pesan atas nama nomor WhatsApp yang tersambung.
  Wajib acak dan panjang.
- **GOWS adalah engine terbaru WAHA.** Sebelum dipakai untuk nomor produksi,
  pastikan kirim gambar (QR DP), indikator mengetik, dan resolusi nomor dari
  `@lid` berjalan dengan nomor percobaan. Kalau bermasalah, engine bisa diganti
  lewat `WHATSAPP_DEFAULT_ENGINE` (mis. `WEBJS`) dengan tag image yang sesuai.
- Gunakan **nomor WhatsApp berbeda** dari bot produksi selama masa eksperimen,
  agar dua bot tidak saling berebut sesi pada nomor yang sama.
- Pertimbangkan memakai project Supabase terpisah untuk eksperimen, supaya data
  booking percobaan tidak bercampur dengan data pelanggan asli.

## Logika yang perlu dipindahkan

Bot produksi memuat sejumlah penjagaan yang lahir dari insiden nyata (zona waktu
WIB, guard halusinasi Gemini, serialisasi booking, dedup pesan, tanggal absolut,
dan lain-lain). Pemetaan tiap penjagaan ke workflow n8n dan skema `bot` ada di
[RANCANGAN.md](RANCANGAN.md#pemetaan-penjagaan-bot-lama).

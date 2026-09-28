# Stack n8n (bot WhatsApp produksi)

Awalnya dibangun sebagai eksperimen pengganti bot `server/`. Sejak cutover
(lihat commit `4172a0d`), **bot WhatsApp produksi berjalan di n8n** dan bot
lama `server/` sudah dimatikan.

> **Isi folder ini belum sama dengan produksi.** `docker-compose.yml` di sini
> masih versi eksperimen awal yang memakai **Evolution API**, sedangkan
> produksi memakai **WAHA**. Workflow n8n-nya juga belum tersimpan di repo.
> Lihat [Menyimpan workflow ke repo](#menyimpan-workflow-ke-repo).

## Perbandingan dengan bot lama

| | `server/` (lama, sudah dimatikan) | n8n (produksi) |
|---|---|---|
| Jembatan WhatsApp | `whatsapp-web.js` + Puppeteer (Chromium) | WAHA (compose di folder ini masih Evolution API) |
| Logika booking | Kode Node.js | Workflow visual n8n |
| Parsing pesan | Gemini via `services/gemini.js` | Node AI n8n |
| Penyimpanan | Supabase | Supabase (sama) |

Workflow yang dirujuk langsung oleh dashboard:

| Workflow | Dipanggil dari | Fungsi |
|---|---|---|
| `QR Sisa Bayar Dashboard` | `src/components/Overview.tsx` (`POST /webhook/session-payment`) | Membuat QR QRIS Xendit untuk sisa pembayaran sesi |
| `Webhook Xendit` | Xendit | Menandai `queue_entries.payment_method = 'qris'` setelah QR lunas |

## Prasyarat server

- Arsitektur ARM64 atau AMD64 (kedua image mendukung keduanya, sudah diverifikasi)
- RAM minimal 2 GB, disarankan 4 GB ke atas
- Docker dan Docker Compose terpasang
- Cloudflare Tunnel untuk akses publik (tidak ada port masuk yang dibuka)

## Cara menjalankan (versi eksperimen di folder ini)

```bash
cp .env.example .env
```

Isi `.env`. Untuk nilai acak:

```bash
openssl rand -hex 32
```

Jalankan stack:

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
dari internet. Akses publik lewat Cloudflare Tunnel dengan ingress:

| Hostname | Service lokal |
|---|---|
| `n8n.takhtabarber.shop` | `http://localhost:5678` |
| `evo.takhtabarber.shop` | `http://localhost:8080` (Evolution API, versi eksperimen) |

Manager Evolution API tersedia di `https://evo.takhtabarber.shop/manager`,
dan login memakai `EVOLUTION_API_KEY`.

## Catatan penting

- **`N8N_ENCRYPTION_KEY` jangan diubah** setelah ada kredensial tersimpan di
  n8n. Mengubahnya membuat seluruh kredensial lama tidak dapat dibaca.
- **API key jembatan WhatsApp (WAHA / Evolution API) adalah satu-satunya
  pelindungnya.** Siapa pun yang memilikinya dapat mengirim pesan atas nama
  nomor WhatsApp yang tersambung. Wajib acak dan panjang.
- **Jangan menyalakan bot lama `server/`** dengan nomor WhatsApp yang sama
  dengan bot produksi, karena dua bot akan saling berebut sesi dan membalas
  pelanggan dobel. Workflow deploy-nya sudah tidak terpicu otomatis (lihat
  `.github/workflows/deploy-backend.yml`).
- **Webhook n8n yang dipanggil dari browser bersifat publik.** URL
  `/webhook/session-payment` terlihat di bundle JavaScript dashboard, sehingga
  siapa pun bisa memanggilnya. Pastikan workflow-nya memverifikasi pemanggil
  (misalnya header rahasia atau JWT Supabase milik staff yang login), bukan
  hanya mengandalkan CORS.

## Menyimpan workflow ke repo

Selama workflow hanya ada di database n8n, logika bot produksi tidak punya
riwayat versi, tidak bisa di-review, dan hilang kalau volume Postgres rusak.
Ekspor secara berkala dari server produksi:

```bash
docker compose exec n8n n8n export:workflow --all --separate --pretty --output=/home/node/.n8n/export/
docker compose cp n8n:/home/node/.n8n/export/. ./workflows/
```

Sebelum commit folder `workflows/`, periksa isinya:

- **Rahasia yang diketik langsung di node.** Ekspor tidak menyertakan isi
  kredensial n8n (hanya ID dan namanya), tetapi nilai yang diketik langsung di
  parameter node, misalnya API key di header node HTTP Request, ikut terekspor
  apa adanya. Cari dengan
  `grep -rniE 'key|token|secret|password|authorization' workflows/`, lalu
  pindahkan nilai tersebut ke kredensial n8n.
- **`pinData`.** Data eksekusi yang di-pin di editor ikut terekspor dan bisa
  berisi nomor telepon serta pesan pelanggan asli. Hapus sebelum commit.

Simpan juga `docker-compose.yml` produksi (versi WAHA) ke folder ini, tanpa
file `.env`.

## Penjagaan yang wajib ada di workflow n8n

Bot lama memuat sejumlah penjagaan yang lahir dari insiden nyata. Workflow
n8n perlu punya penjagaan yang setara — seluruhnya terdokumentasi di
`server/services/bookingDomain.js` dan `server/index.js`:

1. **Zona waktu WIB** — server berjalan pada UTC; perhitungan "hari ini"/"besok"
   harus digeser +7 jam, jika tidak tanggalnya mundur satu hari selama
   17:00-23:59 UTC.
2. **Guard halusinasi hari** — nilai `hari` dari model AI hanya dipercaya bila
   pesan asli benar-benar menyebut kata terkait hari.
3. **Guard halusinasi kapster** — saat pelanggan hanya membalas "ya", pakai
   kapster yang sudah disetujui sebelumnya, bukan hasil parsing ulang.
4. **Serialisasi cek-lalu-simpan** — dua pelanggan yang konfirmasi bersamaan
   dapat teralokasi ke kapster yang sama. Di n8n perlu penguncian tingkat
   database, karena eksekusi alur bisa berjalan paralel.
5. **Filter kapster archived** — kapster yang sudah dihapus tidak boleh ikut
   terhitung sebagai pilihan yang tersedia.
6. **Dedup pesan saat restart** — jembatan WhatsApp dapat mengirim ulang pesan
   lama ketika sesi tersambung kembali.
7. **Tanggal absolut, bukan relatif** — simpan tanggal hasil resolusi di
   database. Menyimpan string relatif ("besok") lalu menerjemahkannya ulang saat
   query membuat baris lama ikut cocok selamanya.
8. **Cek ketersediaan slot mengabaikan booking yang DP-nya gagal** — request
   `pending` dengan `payment_status` `expired`/`failed` tidak boleh menahan
   slot, dan pencocokan tanggalnya lewat `scheduled_date`. Baris seperti itu
   disembunyikan dari dashboard, jadi barber tidak bisa menolaknya; tanpa
   filter ini slot kapster terkunci permanen.
9. **Kapster yang tidak bertugas tidak ditugaskan** — kapster yang cuti di
   `barber_time_off` pada tanggal tersebut, atau berstatus `off` untuk booking
   hari ini (kolom `status` adalah toggle harian). Jadwal mereka juga tidak
   boleh mengurangi kapasitas slot.
10. **Konfirmasi harus persetujuan murni** — balasan yang berisi angka, nama
    hari, atau kata koreksi ("ganti jam 4 ya", "bukan, rabu aja ya") bukan
    konfirmasi, dan harus dijawab dengan ringkasan baru. Yang disimpan adalah
    isi ringkasan terakhir yang dilihat pelanggan, bukan hasil parsing ulang
    pesan "ya".

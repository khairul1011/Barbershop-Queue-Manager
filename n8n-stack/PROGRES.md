# Progres Migrasi Bot ke n8n + WAHA

Catatan serah terima antar sesi kerja. Terakhir diperbarui **2026-09-17**.
Detail desain (node per workflow, penjagaan, perubahan perilaku, batasan) ada di
[RANCANGAN.md](RANCANGAN.md); dokumen ini hanya mencatat status, keputusan, dan
langkah berikutnya.

## Ringkasan

Keenam workflow pengganti bot `server/` **sudah dibangun dan diuji di Mac**
(stack lokal: n8n + WAHA GOWS di Docker/Colima, database Supabase yang sama
dengan dashboard). Uji ujung ke ujung dengan WA sungguhan lolos: chat pelanggan →
ringkasan booking → konfirmasi → QR DP terkirim. Yang belum: **cutover ke VPS**.
Semua perubahan **belum di-commit**.

## Keputusan

| Tanggal | Keputusan |
|---|---|
| 2026-09-17 | Backend `server/` (whatsapp-web.js) diganti n8n + WAHA engine GOWS. Evolution API ditinggalkan. |
| 2026-09-17 | Uji coba memakai project Supabase yang sama (`sdlpnlgkbhtxypsgnlaa`), karena aplikasi masih tahap pengembangan dan belum dipakai barbershop mana pun. |
| 2026-09-17 | Stack dipasang di VPS Azure yang sama (842 MB RAM) tanpa resize dulu. Resize hanya kalau terbukti lambat. |
| 2026-09-17 | **Bot lama dihapus**: proses PM2 dan kode bot di VPS, serta folder `server/` di repo, setelah n8n jalan di VPS. |
| 2026-09-17 | Dua perbaikan logika dari uji nyata: kata hari menerima salah ketik (`hri ini`, `bsk`, dll) dan pesan "pertanyaan" tetap melengkapi field booking yang kosong. |

## Yang sudah selesai

### Database

- Migrasi [`supabase/migrations/20260916222322_bot_schema.sql`](../supabase/migrations/20260916222322_bot_schema.sql)
  **sudah diterapkan** ke Supabase lewat MCP. Nama file sengaja sama dengan versi
  yang tercatat di Supabase. Skema `bot` tidak bisa diakses `anon`/`authenticated`.
- Tes SQL [`supabase/tests/bot_schema.test.sql`](../supabase/tests/bot_schema.test.sql)
  lolos, termasuk uji balapan dua booking bersamaan (terbukti gagal tanpa lock).

### Stack lokal (`n8n-stack/`)

- **Image n8n custom:** [`n8n/Dockerfile`](n8n/Dockerfile), n8n dipatok ke 2.36.8
  + package `qrcode`. `docker-compose.yml` memakai `build: ./n8n` dan
  `NODE_FUNCTION_ALLOW_EXTERNAL=qrcode`.
- **`.env`:** menambah `WAHA_WEBHOOK_SECRET` (placeholder di `.env.example`).
- **Sesi WAHA `default`:** status WORKING dengan **nomor WA percobaan**. Webhook
  diarahkan ke `http://n8n:5678/webhook/waha` dengan header `X-Webhook-Secret`.
  Nomor percobaan membalas otomatis siapa pun yang chat.
- **Credential n8n:** `Postgres account` (Ignore SSL Issues aktif), `Gemini`,
  `Xendit API` (test mode), `Xendit Callback`, `WAHA API`, `WAHA Webhook`. Dua
  terakhir diimpor lewat `n8n import:credentials` di container.

### Workflow

| Workflow | ID lokal | Status | Uji |
|---|---|---|---|
| `sub: Kirim WA` | `cod8lmSOmyc6I6pl` | publish | teks, gambar, mengetik, tandai terbaca ke chat sendiri |
| `sub: Buat QRIS` | `geSlBU8DV2Tf3r26` | publish | payment request Xendit test mode + PNG |
| `WA Masuk` | `dLZ1LsNL4J1Emx8k` | publish | E2E nyata dari WA pribadi (chat `@lid`) |
| `Webhook Xendit` | `TVDTToJMU2GZd1JI` | publish | callback buatan: token salah 403, pending diabaikan, lunas + 1 notifikasi, retry tanpa notifikasi dobel |
| `QR Sisa Bayar Dashboard` | `GTwaB6qo3yib0zpo` | publish | preflight CORS, nominal salah 400, respons cocok dengan `Overview.tsx` |
| `Tugas Tiap Menit` | `wCMuLNCpTOKelzEB` | **belum publish** (bentrok notifikasi dengan bot lama) | manual: sweep + notifikasi approve terkirim |

- **Ekspor semua workflow:** [`workflows/`](workflows/), sudah dicek bersih dari
  nomor telepon dan kunci.
- **Tes Code node:** [`workflows/code.test.cjs`](workflows/code.test.cjs) membaca kode
  langsung dari file ekspor. Isinya: paritas prompt byte per byte dengan bot lama,
  skenario logika percakapan, dan teks balasan. Jalankan dari root repo setelah
  `cd server && npm install`:

  ```bash
  node n8n-stack/workflows/code.test.cjs
  ```

### Data uji yang tertinggal di Supabase

- Booking `Khairul` Kamis 14:00 (`e05efac8-…`, status pending, DP paid).
- Booking `Khairul (uji n8n)` (`7a26e726-…`, status approved), dibuat untuk menguji notifikasi.
- Isi tabel `bot.conversations` dan `bot.processed_messages` dari chat uji.

Boleh dihapus lewat dashboard atau SQL sebelum dipakai sungguhan.

## Jebakan yang sudah terbukti

- **Parameter query Postgres di n8n wajib berbentuk array** (`={{ [a, b] }}`). Bentuk
  daftar dipotong di setiap koma, termasuk koma di dalam teks pesan.
- **Output node Gemini** ada di `content.parts[].text`. `maxOutputTokens` bawaan
  node hanya 16, jadi wajib diisi.
- **Sub-workflow tidak bisa dijalankan langsung lewat MCP.** Uji lewat workflow
  pemanggil bertrigger manual, lalu arsipkan.
- **Mac ini tidak punya Docker `buildx`**, jadi `dockerfile_inline` gagal; pakai file Dockerfile.
- **Dashboard WAHA** perlu API key diisi di form Server (tersimpan di localStorage browser).
- **Supabase pooler** memakai sertifikat CA Supabase sendiri. Di n8n muncul
  "self-signed certificate", jadi di lokal pakai Ignore SSL Issues. Di server,
  pakai `NODE_EXTRA_CA_CERTS`.
- **MCP `create_workflow_from_code`** melaporkan "credentials skipped" untuk node
  HTTP, padahal credential yang ditulis dengan ID tetap terpasang. Cek lewat
  ekspor, jangan percaya pesannya.
- **Cara ekspor workflow:**
  `docker-compose exec -T n8n n8n export:workflow --id=<ID> --pretty --output=/tmp/x.json`,
  lalu `cat` file itu.
- **MCP `supabase`** di `.mcp.json` terkunci ke project `sdlpnlgkbhtxypsgnlaa`
  (tidak bisa membuat project baru).

## Langkah berikutnya: cutover ke VPS

Urutan yang disarankan. Langkah 4 butuh user memegang HP nomor produksi.

1. **Siapkan VPS** (bot lama tetap jalan):
   - Pasang Docker Engine + plugin compose.
   - Salin `n8n-stack/` ke folder terpisah, misalnya `~/n8n-stack`. Jangan di
     folder repo yang di-`git reset --hard` oleh deploy.
   - Buat `.env` server: `WAHA_IMAGE_TAG=gows` (amd64); secret **baru** untuk
     `WAHA_API_KEY`, `WAHA_DASHBOARD_*`, `WAHA_WEBHOOK_SECRET`, `N8N_ENCRYPTION_KEY`;
     `N8N_PUBLIC_URL=https://n8n.takhtabarber.shop`.
   - Hemat memori n8n: `N8N_DIAGNOSTICS_ENABLED=false`,
     `N8N_VERSION_NOTIFICATIONS_ENABLED=false`, `N8N_TEMPLATES_ENABLED=false`.
2. **Pindahkan workflow:**
   - Import `workflows/*.json` ke n8n server.
   - Buat ulang keenam credential. Untuk Postgres, pakai CA Supabase lewat
     `NODE_EXTRA_CA_CERTS`, tanpa Ignore SSL.
   - Sambungkan ulang credential di tiap node, karena ID credential di server berbeda.
   - Pembuatan owner n8n dan MCP n8n server dilakukan user.
3. **Cloudflare Tunnel:** ingress `n8n.takhtabarber.shop` → `localhost:5678`, **hanya
   path `^/webhook/`**. Editor n8n dan dashboard WAHA diakses lewat SSH port forward.
4. **Pindah (downtime beberapa menit):**
   - `pm2 stop barberflow-wa`;
   - di HP nomor produksi, lepas perangkat tertaut lama;
   - jalankan stack;
   - buat sesi WAHA + webhook, lalu scan QR;
   - publish semua workflow, **termasuk `Tugas Tiap Menit`**.
5. **Xendit:** ganti callback URL Payment Request ke
   `https://n8n.takhtabarber.shop/webhook/xendit`.
6. **Dashboard:** di `src/components/Overview.tsx`, ubah `PAYMENT_BACKEND_URL` dan path
   menjadi `https://n8n.takhtabarber.shop/webhook/session-payment` (lewat PR).
7. **Stack lokal di Mac:** hentikan (`docker-compose down`), atau unpublish workflow
   dan lepas webhook WAHA. Stack lokal menulis ke database yang sama.
8. **Pantau** `free -m`, `docker stats`, dan waktu balasan beberapa hari. Resize
   VPS kalau terlalu lambat.
9. **Bersih-bersih bot lama** (keputusan user). Sarannya setelah langkah 8 stabil,
   karena setelah ini rollback ke bot lama tidak bisa lagi:
   - `pm2 delete barberflow-wa` + `pm2 save`; hapus folder bot di VPS, termasuk
     sesi `.wwebjs_auth`;
   - hapus ingress cloudflared `wa-webhook.takhtabarber.shop`;
   - hapus `server/` dan `.github/workflows/deploy-backend.yml` dari repo. **Ubah
     required check CI backend di ruleset `main`**, kalau tidak semua PR terblokir.
     Hapus juga secret GitHub yang khusus deploy backend;
   - hapus bagian uji paritas di `workflows/code.test.cjs` (bagian itu memuat
     `server/services/*`);
   - perbarui `CLAUDE.md`, `README.md`, `PROJECT.md`, dan `CONTRIBUTING.md`, yang
     masih menjelaskan arsitektur `server/`.

## File yang belum di-commit

Dari pekerjaan migrasi ini:

- `supabase/` (baseline, migrasi `bot_schema`, tes SQL)
- `n8n-stack/RANCANGAN.md`, `n8n-stack/PROGRES.md`, `n8n-stack/workflows/`, `n8n-stack/n8n/Dockerfile`
- `n8n-stack/docker-compose.yml`, `n8n-stack/.env.example`, `n8n-stack/README.md`, penghapusan `n8n-stack/postgres-init/`

Dari sesi sebelumnya (onboarding kolaborator), juga belum di-commit:
`CONTRIBUTING.md`, `CLAUDE.md`, `PROJECT.md`, `README.md`, `.gitignore`,
`.github/workflows/deploy-backend.yml`, `src/components/Schedule.tsx`.

Commit dan PR hanya dilakukan atas instruksi user.

## Memulai sesi baru

1. Baca dokumen ini dan [RANCANGAN.md](RANCANGAN.md).
2. Nyalakan stack lokal kalau perlu: `colima start`, lalu di `n8n-stack/` jalankan
   `DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" docker-compose up -d`.
3. Cek tool MCP `n8n` dan `supabase` tersedia, lalu lanjut dari "Langkah berikutnya".

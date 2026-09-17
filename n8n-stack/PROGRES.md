# Progres Migrasi Bot ke n8n + WAHA

Catatan serah terima antar sesi kerja. Terakhir diperbarui **2026-09-17 (akhir sesi)**.
Detail desain (node per workflow, penjagaan, perubahan perilaku, batasan) ada di
[RANCANGAN.md](RANCANGAN.md); dokumen ini mencatat status, cara operasional,
keputusan, dan rencana berikutnya.

## Status singkat (baca ini dulu)

**Bot baru LIVE sejak 2026-09-17 13:32 WIB.** n8n (VM baru) + WAHA/cloudflared
(VM lama) sudah melayani nomor WhatsApp produksi. Bot lama (`server/`,
whatsapp-web.js) sudah **dimatikan tapi belum dihapus**, jadi rollback masih bisa.

Terverifikasi di produksi:
- Chat dari nomor lain dibalas, alur booking berjalan sampai QR DP terkirim.
- Simulasi QRIS lunas (Xendit Test Mode) → `Webhook Xendit` → `payment_status = paid`
  → pesan "DP diterima" terkirim.
- Callback Xendit sudah diganti user ke `https://n8n.takhtabarber.shop/webhook/xendit`
  ("Tes dan simpan" sukses).
- `Tugas Tiap Menit` jalan tiap menit, sukses.
- Halaman demo `bayar.takhtabarber.shop` hidup lagi (kode akses sama seperti dulu);
  403 kode salah dan 200 kode benar terbukti.

Yang **belum beres / rusak** saat ini:
- ❌ **QR sisa bayar di dashboard ("Selesaikan Sesi") rusak**: `src/components/Overview.tsx:30`
  masih memanggil `https://wa-webhook.takhtabarber.shop/api/session-payment` (bot lama, mati).
  Perbaikan = rencana #1.
- ⏳ Jalur "bayar sukses" dari halaman demo belum dicoba user.
- ⏳ Editor n8n & dashboard WAHA hanya bisa dibuka lewat SSH tunnel (subdomain +
  Cloudflare Access belum dibuat).
- ⏳ Belum ada PR; branch `feat/migrasi-n8n-waha` belum masuk `main` (lihat "Status git").

> ⚠️ **Peringatan keras**
> - Nomor "percobaan" …6919 **adalah nomor produksi**. Jangan pernah menjalankan
>   n8n lokal (Mac) selagi WAHA lokal hidup → pelanggan dapat balasan dobel.
> - `colima start` **menyalakan ulang WAHA lokal** kalau restart policy-nya
>   `unless-stopped` (sudah diubah ke `no`, tapi `docker-compose up` akan
>   mengembalikannya). Jangan `docker-compose up` di `n8n-stack/` lokal.
> - Jangan `pm2 start barberflow-wa` kecuali rollback. Bot lama + n8n bersamaan =
>   balasan dobel.
> - `.github/workflows/deploy-backend.yml` masih aktif: push ke `main` yang menyentuh
>   `server/**` akan `pm2 restart barberflow-wa` → **bot lama hidup lagi**. Lihat
>   rencana #8.

## Rencana berikutnya (urut prioritas)

1. **Perbaiki QR sisa bayar dashboard (langkah 6, lewat PR).**
   `src/components/Overview.tsx`: ganti `PAYMENT_BACKEND_URL` + path
   `/api/session-payment` menjadi `https://n8n.takhtabarber.shop/webhook/session-payment`.
   Workflow `QR Sisa Bayar Dashboard` sudah mengizinkan origin
   `https://dashboard.takhtabarber.shop` dan `http://localhost:3000` (CORS
   terverifikasi sebelumnya), dan respons JSON-nya sudah dicocokkan dengan
   `Overview.tsx`. PR ini tidak menyentuh `server/**`, jadi tidak memicu deploy backend.
   Uji setelah deploy Vercel: dialog "Selesaikan Sesi" → QR muncul → simulasi → lunas.
2. **User menguji halaman demo sampai bayar sukses.** Chat booking baru dari nomor
   lain → buka https://bayar.takhtabarber.shop → kode akses → "Tandai lunas manual"
   atau scan QR → "DP diterima" masuk ke WA.
3. **Subdomain admin + Cloudflare Access** (sudah disepakati user, dikerjakan
   setelah cutover):
   - `n8n-admin.takhtabarber.shop` → `http://172.16.0.5:5678` (editor n8n) dan
     `waha.takhtabarber.shop` → `http://localhost:3001` (dashboard WAHA), keduanya
     ingress baru di cloudflared VM lama + `cloudflared tunnel route dns …`.
   - **Wajib** dilindungi Cloudflare Access sebelum DNS aktif: user mengaktifkan
     Zero Trust (paket Free, mungkin minta metode pembayaran) dan membuat Access
     Application untuk kedua hostname dengan policy Allow hanya email milik owner
     (login OTP email). Webhook tetap di `n8n.takhtabarber.shop/webhook/*` tanpa
     Access (Xendit tidak bisa melewati Access).
   - Yang perlu dicek saat itu: editor n8n di host berbeda dari `N8N_HOST`
     (koneksi push/websocket & cookie), dashboard WAHA di balik Access.
   - Opsional: aktifkan MFA akun owner n8n.
4. **Hapus perangkat WAHA lokal dari HP nomor produksi** (WhatsApp → Perangkat
   tertaut → yang *bukan* "aktif sekarang"), lalu di Mac hapus sesi/volume WAHA
   lokal supaya stack lokal tidak pernah lagi tersambung ke nomor produksi.
5. **Cek kuota gratis VM baru (2026-09-18 atau sesudahnya):** Azure portal →
   Subscriptions → Azure for Students → Free services → pastikan ada baris
   *Virtual Machines, Bpsv2 Series, B2pts v2* dengan pemakaian jam > 0. Kalau tidak
   ada, VM baru memotong kredit ±$7,74/bulan → pertimbangkan pindah ke `B1s`.
6. **Pantau beberapa hari:** `free -m`, `docker stats`, waktu balasan, eksekusi
   error di n8n (lihat "Operasional"). Kalau runner bermasalah saat start, baru
   pertimbangkan `N8N_RUNNERS_GRANT_TOKEN_TTL`.
7. **PR (hanya atas instruksi user).** Semua perubahan sudah di-commit & di-push. Rencana awal: 2 PR terpisah (`chore/setup-kolaborasi`, lalu
   `feat/migrasi-n8n-waha`), ruleset `main` squash-only.
8. **Bersih-bersih bot lama (langkah 9)** setelah #6 stabil. Setelah ini rollback
   ke bot lama tidak bisa lagi:
   - VM lama: `pm2 delete barberflow-wa` (+ `barberflow-api`, `barberflow-tunnel`
     yang sudah lama mati) lalu `pm2 save`; hapus `~/Barbershop-Queue-Manager`
     (termasuk sesi `server/.wwebjs_auth`). **Simpan dulu nilai `DEMO_SECRET`**
     kalau masih dibutuhkan (sudah tersimpan di credential n8n `Demo Kode`).
   - cloudflared: hapus ingress `wa-webhook.takhtabarber.shop` + CNAME-nya.
     **`bayar.takhtabarber.shop` tetap dipakai** (halaman demo baru).
   - VM lama: hapus sisa n8n yang tidak terpakai — image `n8n-stack-n8n` (2,4 GB)
     dan volume `n8n-stack_n8n_data` (cadangan DB n8n dari percobaan 1).
   - Repo: hapus `server/` **dan** `.github/workflows/deploy-backend.yml` dalam
     commit yang sama (workflow yang dihapus di commit itu tidak ikut jalan).
     **Ubah required check CI backend di ruleset `main`**, kalau tidak semua PR
     terblokir. Hapus secret environment `vps-production` yang khusus deploy.
   - `workflows/code.test.cjs`: hapus bagian uji paritas yang memuat
     `server/services/*`.
   - Perbarui `CLAUDE.md`, `README.md`, `PROJECT.md`, `CONTRIBUTING.md`,
     `n8n-stack/README.md` yang masih menjelaskan arsitektur `server/` / stack lokal.
9. **Opsional / nanti:**
   - Hapus data uji di Supabase (lihat "Data uji").
   - Hapus eksekusi "running" palsu di n8n (sisa percobaan 1, tidak berbahaya).
   - Di Mac: hapus container/volume `n8n-vps-prep` / `n8n_vps_prep` (sudah tidak dipakai).
   - Xendit Live Mode (butuh verifikasi bisnis/KYC, biaya transaksi asli) — terpisah.

## Arsitektur produksi sekarang

| | VM lama `barberflow-backend` | VM baru `barberflow-n8n` |
|---|---|---|
| Ukuran | `Standard_B2ats_v2` x86, 2 vCPU, 1 GiB, disk P4 30 GB | `Standard_B2pts_v2` **ARM64**, 2 vCPU, 1 GiB, disk P6 64 GiB |
| IP | publik `<IP-publik-VM-lama>`, privat `172.16.0.4` | **tanpa IP publik**, privat `172.16.0.5` (keluar lewat default outbound) |
| Jalan | cloudflared (systemd), container `waha`, container `demo` | container `n8n` |
| Mati | PM2 `barberflow-wa` (stopped + `pm2 save`), `barberflow-api`, `barberflow-tunnel` | — |
| Folder stack | `~/n8n-stack` (`.env` chmod 600, `docker-compose.override.yml` = `vps-waha.override.yml`) | `~/n8n-stack` (`.env` sama, `docker-compose.override.yml` = `vps-n8n.override.yml`) |
| Memori (akhir sesi) | ±395 MB tersedia | ±392 MB tersedia, swapfile 1 GiB, `vm.swappiness=10` |

- Keduanya di Azure for Students, region Southeast Asia, resource group `barberflow-rg`,
  VNet `vnet-southeastasia-1`, subnet `snet-southeastasia-1` 172.16.0.0/24.
  VM baru tanpa NSG NIC — **kalau suatu saat diberi IP publik, pasang NSG dulu.**
- Docker dari paket Ubuntu (`docker.io`, `docker-compose-v2`, `docker-buildx`),
  `/etc/docker/daemon.json` log driver `local` 10m × 3. Perintah di server:
  `sudo docker compose …` (plugin, bukan binary `docker-compose`).
- **Nama host antar-VM:** workflow memanggil `http://waha:3000`, webhook sesi WAHA
  memanggil `http://n8n:5678/webhook/waha`; keduanya diarahkan ke IP privat lewat
  `extra_hosts` di file override, jadi isi workflow tidak diubah. Port container
  di-bind ke IP privat: WAHA `172.16.0.4:3000`, n8n `172.16.0.5:5678`
  (+ `127.0.0.1` untuk akses lokal).
- **Postgres dari n8n:** credential `ssl=require` + Ignore SSL mati, CA Supabase
  (`supabase-ca.crt`, Supabase Root 2021 CA) lewat `NODE_EXTRA_CA_CERTS`.

### Rute publik (cloudflared di VM lama, `/etc/cloudflared/config.yml`)

| Hostname + path | Tujuan | Keterangan |
|---|---|---|
| `wa-webhook.takhtabarber.shop` | `http://localhost:3002` | bot lama (mati) — dihapus di rencana #8 |
| `bayar.takhtabarber.shop` `^/webhook/demo/` | `http://172.16.0.5:5678` | API halaman demo (workflow `Demo Bayar`) |
| `bayar.takhtabarber.shop` (sisanya) | `http://localhost:8081` | HTML statis halaman demo (container `demo`) |
| `n8n.takhtabarber.shop` `^/webhook/` | `http://172.16.0.5:5678` | webhook Xendit, dashboard, WAHA-tidak-lewat-sini |
| lainnya | `http_status:404` | editor n8n `/`, `/rest/*`, `/webhook-test/*` tertutup |

Backup config: `config.yml.bak-20260917` (sebelum ada n8n),
`config.yml.bak-pre-split` (n8n masih localhost), `config.yml.bak-pre-demo`
(sebelum rute demo).

### Halaman demo `bayar.takhtabarber.shop`

- HTML statis [`demo/index.html`](demo/index.html), disajikan service `demo`
  (`busybox:1.37` httpd, RAM <1 MB) di `127.0.0.1:8081` VM lama. **Sengaja tidak**
  dari webhook n8n: n8n 2.36.8 membungkus HTML webhook dengan CSP sandbox (tanpa
  `allow-same-origin`) yang memblokir fetch dan kamera. Env
  `N8N_INSECURE_DISABLE_WEBHOOK_IFRAME_SANDBOX` sengaja tidak dipakai.
- API: workflow `Demo Bayar` — `GET /webhook/demo/list`, `POST /webhook/demo/pay`
  (`{id, type: 'wa'|'queue'}`), header `X-Demo-Kode` dicek credential `Demo Kode`
  (= `DEMO_SECRET` bot lama). Respons: 403 kode salah, 404 tagihan tidak ditemukan,
  409 sudah lunas, 502 Xendit gagal, 200 `{"ok":true}`.
- Diperbaiki dari versi lama: nama pelanggan WhatsApp di-escape (dulu rentan XSS),
  `?kode=` di URL tetap didukung.

## Operasional

**SSH** (IP publik VM lama sengaja tidak ditulis karena repo publik; ada di memori
lokal Claude / portal Azure → VM `barberflow-backend` → Overview)
```bash
ssh -i ~/.ssh/barberflow-backend_key.pem azureuser@<IP-publik-VM-lama>
```
```bash
ssh -i ~/.ssh/barberflow-backend_key.pem -o ProxyCommand="ssh -i ~/.ssh/barberflow-backend_key.pem -W %h:%p azureuser@<IP-publik-VM-lama>" azureuser@172.16.0.5
```
`pm2` di VM lama butuh `export PATH=$PATH:/home/azureuser/.nvm/versions/node/v24.18.0/bin`.

**Buka editor n8n & dashboard WAHA (SSH tunnel, biarkan terminal terbuka)**
```bash
ssh -i ~/.ssh/barberflow-backend_key.pem -N -L 5681:172.16.0.5:5678 -L 3011:127.0.0.1:3001 azureuser@<IP-publik-VM-lama>
```
- n8n: http://localhost:5681 (login owner buatan user).
- WAHA: http://localhost:3011/dashboard — basic auth `admin` / `WAHA_DASHBOARD_PASSWORD`;
  di form Server isi URL `http://localhost:3011` + `WAHA_API_KEY`. Nilai secret
  dilihat user sendiri: `ssh … 'grep -E "^WAHA_(API_KEY|DASHBOARD_PASSWORD)=" ~/n8n-stack/.env'`
  (jangan ditempel ke chat).

**Perintah umum**
- Status: `cd ~/n8n-stack && sudo docker compose ps` (tiap VM), `free -m`,
  `sudo docker stats --no-stream`.
- Log: `sudo docker compose logs --since 10m n8n` / `waha`.
- Sesi WAHA: `curl -H "X-Api-Key: $K" http://127.0.0.1:3001/api/sessions/default`
  di VM lama (`K` dari `.env`).
- Restart n8n (±50–70 detik bot tidak membalas; pesan < 5 menit tetap diproses
  kalau WAHA mengirim ulang): `sudo docker compose up -d n8n` / `restart n8n`.
- **Publish/unpublish lewat CLI butuh n8n berhenti lalu dinyalakan lagi:**
  `sudo docker compose stop n8n && sudo docker compose run --rm --no-deps n8n publish:workflow --id=<ID> && sudo docker compose up -d n8n`.
  Alternatif tanpa restart: publish dari editor (tunnel).
- Impor workflow/credential ke n8n yang sedang jalan: `docker cp` file ke
  container (chown `node`) lalu `n8n import:workflow|import:credentials --input=…`.
  Credential boleh `data` plaintext (dienkripsi saat impor). Hapus file sesudahnya.
- Cek eksekusi tanpa editor (di VM baru):
  `sudo docker exec n8n-stack-n8n-1 node -e '…node:sqlite… select … from execution_entity …'`
  — ingat kolom `deletedAt` (lihat Jebakan).
- File repo berubah → salin ke server: `rsync -a --exclude .env <file> …:n8n-stack/`
  (VM baru lewat `-e "ssh -o ProxyCommand=…"`).

## Workflow produksi (n8n VM baru)

| Workflow | ID | Pemicu | Catatan |
|---|---|---|---|
| `sub: Kirim WA` | `cod8lmSOmyc6I6pl` | dipanggil workflow lain | tandai terbaca, mengetik, jeda 1,5–7 dtk, kirim teks/gambar via WAHA |
| `sub: Buat QRIS` | `geSlBU8DV2Tf3r26` | dipanggil | payment request Xendit + PNG QR (`qrcode`) |
| `WA Masuk` | `dLZ1LsNL4J1Emx8k` | `POST /webhook/waha` (header `X-Webhook-Secret`) | abaikan pesan > 5 menit, dedup `bot.processed_messages` |
| `Webhook Xendit` | `TVDTToJMU2GZd1JI` | `POST /webhook/xendit` (header `x-callback-token`) | lunas DP WA / sisa bayar dashboard, notifikasi sekali |
| `QR Sisa Bayar Dashboard` | `GTwaB6qo3yib0zpo` | `POST /webhook/session-payment` (CORS dashboard) | **belum dipakai dashboard** (rencana #1) |
| `Tugas Tiap Menit` | `wCMuLNCpTOKelzEB` | cron detik ke-14 tiap menit | sweep DP kedaluwarsa, bersihkan state bot, notifikasi approve/reject |
| `Demo Bayar` | `DmBayarDemo00001` | `GET /webhook/demo/list`, `POST /webhook/demo/pay` (header `X-Demo-Kode`) | halaman demo |

Ekspor semua ada di [`workflows/`](workflows/) (bersih dari nomor & kunci).
Tes Code node: `node n8n-stack/workflows/code.test.cjs` dari root repo (butuh
`cd server && npm install`; bagian paritasnya bergantung pada `server/`).

**Credential n8n produksi** (ID sama dengan lokal): `Postgres account`
`bzISw2QfqVYUFsSu`, `Gemini` `D11aOgNFqnM6BaJT`, `Xendit API` `FuzyjwPbX9K51WqK`
(Test Mode, `xnd_development_…`), `Xendit Callback` `CClaHunudh8bTRty`, `WAHA API`
`h54RLIgLQ6DUgfIk`, `WAHA Webhook` `GVQrF8ORDycoHRiH`, `Demo Kode` `DmK0deBayarDemo1`.
Nilai WAHA di server = secret server (beda dengan lokal). `N8N_ENCRYPTION_KEY`
server ada di `.env` kedua VM — **jangan diubah**.

## Rollback ke bot lama

1. VM lama: `sudo docker compose stop waha`; VM baru: `sudo docker compose stop n8n`.
2. (Opsional) kembalikan `/etc/cloudflared/config.yml.bak-pre-split` lalu
   `sudo systemctl restart cloudflared`. Rute `wa-webhook` masih ada di config sekarang,
   jadi untuk webhook bot lama langkah ini tidak wajib.
3. `pm2 start barberflow-wa && pm2 save` → "Client is ready!" tanpa scan selama
   `.wwebjs_auth` belum dihapus.
4. Xendit: kembalikan callback "Pembayaran Berhasil" ke URL bot lama
   (`https://wa-webhook.takhtabarber.shop/webhooks…`, lihat Log Webhook Xendit).

## Riwayat 2026-09-17 (ringkas)

1. **Siapkan VPS lama:** Docker, `~/n8n-stack`, `.env` dengan secret acak baru, image.
2. **Database n8n disiapkan di Mac** (container `n8n-vps-prep` dengan kunci enkripsi
   server) karena n8n di VPS 842 MB berdampingan dengan bot membuat swap thrashing.
   Credential diimpor dengan ID sama, WAL digabung, file DB disalin.
3. **Cloudflare Tunnel** `n8n.takhtabarber.shop` hanya `^/webhook/`.
4. **Percobaan cutover 1 (04:38–04:48 UTC) di-rollback:** n8n + WAHA di satu VM
   1 GiB → runner JS ter-swap, burst "Offer expired", editor tidak merespons, swap
   770 MB. (Klaim waktu itu "semua eksekusi berikutnya menggantung" kemungkinan
   besar tertipu artefak `saveDataSuccessExecution: none` — lihat Jebakan.)
5. **Keputusan dua VM:** resize ke `B1ms` dibatalkan (menguras kredit Students);
   VM kedua gratis `B2pts_v2` dibuat user; n8n dipindah ke sana dan diuji (Code node
   37–510 ms, lolos uji idle 10 menit tanpa "Offer expired").
6. **Cutover 2 (06:31:47–06:32:55 UTC, ±70 detik)** sukses tanpa scan QR, lalu dua
   restart n8n singkat untuk diagnosis. Uji E2E + simulasi pembayaran lolos.
7. **Halaman demo `bayar` dibuat ulang** (static + workflow `Demo Bayar`), diuji di
   n8n lokal lalu dipasang (satu restart n8n ±1 menit).

## Keputusan

| Tanggal | Keputusan |
|---|---|
| 2026-09-17 | Backend `server/` (whatsapp-web.js) diganti n8n + WAHA engine GOWS. Evolution API ditinggalkan. |
| 2026-09-17 | Uji coba & produksi memakai project Supabase yang sama (`sdlpnlgkbhtxypsgnlaa`); aplikasi belum dipakai barbershop mana pun. |
| 2026-09-17 | **Bot lama dihapus** (PM2, kode di VPS, folder `server/` di repo) setelah n8n stabil di VPS. |
| 2026-09-17 | Dua perbaikan logika dari uji nyata: kata hari menerima salah ketik (`hri ini`, `bsk`, dll) dan pesan "pertanyaan" tetap melengkapi field booking yang kosong. |
| 2026-09-17 | Langganan **Azure for Students**: tidak resize ke `B1ms` (kredit habis ±4 bulan → langganan & bot mati). Pakai **dua VM gratis**: n8n di `B2pts_v2` (ARM, tanpa IP publik), WAHA + cloudflared di VM lama. |
| 2026-09-17 | Editor n8n & dashboard WAHA tidak dibuka publik tanpa proteksi; sementara SSH tunnel, berikutnya subdomain + **Cloudflare Access** (setelah cutover). |
| 2026-09-17 | Halaman demo `bayar.takhtabarber.shop` **dibuat ulang** (user memilih opsi A): HTML statis + workflow n8n, passcode `DEMO_SECRET` lama. |

## Data uji di Supabase

- Booking `Khairul` Kamis 14:00 (`e05efac8-…`, pending, DP paid).
- Booking `Khairul (uji n8n)` (`7a26e726-…`, approved), uji notifikasi.
- Booking `dani` (`7a42fd75-…`, pending, DP paid via simulasi 2026-09-17) — chat uji cutover.
- Isi `bot.conversations` dan `bot.processed_messages` dari chat uji.

Boleh dihapus sebelum dipakai sungguhan.

## Jebakan yang sudah terbukti

**n8n**
- **Eksekusi `Tugas Tiap Menit` terlihat `running` padahal sukses.** Workflow itu
  `saveDataSuccessExecution: none` → eksekusi sukses di-*soft delete* (`deletedAt`
  terisi) dengan status tetap `running`. Cek `deletedAt` / log "Execution finalized"
  sebelum menyimpulkan macet.
- **HTML dari Respond to Webhook dibungkus CSP sandbox** (n8n-core `html-sandbox.js`),
  jadi halaman interaktif (fetch, kamera) harus disajikan di luar n8n.
- **Publish/unpublish lewat CLI tidak berlaku sebelum n8n di-restart.**
- **Postgres credential tanpa `ssl=require` tersambung TANPA SSL** begitu Ignore SSL
  dimatikan; pooler Supabase butuh CA Supabase (`NODE_EXTRA_CA_CERTS`).
- **Parameter query Postgres wajib array** (`={{ [a, b] }}`); bentuk daftar dipotong
  di setiap koma.
- **Output node Gemini** di `content.parts[].text`; `maxOutputTokens` bawaan 16, wajib diisi.
- **Sub-workflow tidak bisa dijalankan langsung lewat MCP**; uji lewat pemanggil.
- **MCP `create_workflow_from_code`** bilang "credentials skipped" padahal credential
  ber-ID tetap terpasang; cek lewat ekspor.
- **SQLite n8n memakai WAL**: menyalin `database.sqlite` saja bisa kehilangan data;
  hentikan n8n lalu `PRAGMA wal_checkpoint(TRUNCATE)` dulu, atau salin seluruh volume.
- Log "Task runner connection attempt failed: invalid or expired grant token" kadang
  muncul saat start; sejauh ini runner tetap terdaftar dan normal.
- n8n di VM 1 GiB bersama WAHA → runner ter-swap → "Offer expired". Pisahkan VM.
- `N8N_PROTOCOL=https` tanpa `N8N_SSL_KEY/CERT` tetap melayani HTTP (aman di balik tunnel).

**Server / Azure**
- PM2 punya `pm2-azureuser.service` (autostart saat boot): setiap `pm2 stop/start`
  wajib diikuti `pm2 save`.
- `deploy-backend.yml` (push `main` + `server/**`) menjalankan `pm2 restart barberflow-wa`.
- VM tanpa IP publik tetap bisa internet keluar di subnet ini (bukan private subnet).
- Resize Linux antara ukuran tanpa/dengan temp disk didukung; `B1ms` tidak mendukung
  Accelerated Networking. Kuota gratis Students per ukuran VM hanya cukup untuk 1 VM.
- `apt-get install` di VPS: pakai `NEEDRESTART_MODE=l NEEDRESTART_SUSPEND=1` agar
  tidak me-restart layanan.

**Mac / Docker lokal**
- Docker lewat Colima, binary `docker-compose`, tanpa `buildx` (`dockerfile_inline` gagal).
- Colima hanya me-mount folder home: bind mount dari `/tmp` jadi folder kosong (EISDIR).
- `colima start` menghidupkan container yang sebelumnya hidup (WAHA lokal = nomor produksi!).

**Lainnya**
- Dashboard WAHA perlu API key di form Server (tersimpan localStorage browser).
- Xendit: simulasi QRIS lunas `POST /v3/payment_requests/{id}/simulate` (header
  `api-version: 2024-11-11`, body `{"amount": …}`); callback di section
  "REQUEST PAYMENT V2 → Pembayaran Berhasil".
- MCP `supabase` di `.mcp.json` terkunci ke project `sdlpnlgkbhtxypsgnlaa`.

## Status git

- Branch `feat/migrasi-n8n-waha` (bertumpuk di atas `chore/setup-kolaborasi`).
  Hasil sesi 2026-09-17 sudah di-commit dan di-push: `docker-compose.yml` (env
  penghemat memori, CA Supabase, service `demo`), `supabase-ca.crt`,
  `vps-n8n.override.yml`, `vps-waha.override.yml`, `demo/index.html`,
  `workflows/demo-bayar.json`, dan dokumen ini. Belum ada PR.
- Repo **publik**: jangan menulis IP publik VM, email, nomor telepon lengkap, atau
  secret di file yang di-commit.
- Commit dan PR hanya atas instruksi user.

## Memulai sesi baru

1. Baca dokumen ini (terutama "Status singkat" dan "Rencana berikutnya"). Detail
   desain di [RANCANGAN.md](RANCANGAN.md).
2. **Jangan** menyalakan stack lokal (`docker-compose up`) — WAHA lokal tersambung
   ke nomor produksi. Kalau butuh n8n lokal untuk uji, nyalakan **hanya** service
   `n8n` dan pastikan container `waha` lokal mati lebih dulu.
3. Cek kesehatan produksi lewat SSH (lihat "Operasional"): container `waha` + `demo`
   di VM lama, `n8n` di VM baru, sesi WAHA `WORKING`, bot lama `stopped`.
4. MCP `n8n` di Claude Code menunjuk n8n **lokal** (`localhost:5678`), bukan produksi.
   MCP `supabase` langsung ke database produksi.
5. Lanjut dari rencana #1.

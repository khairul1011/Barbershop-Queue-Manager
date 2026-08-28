# BarberFlow Queue Manager — Dokumentasi Proyek

> Gabungan Product Requirements Document + Known Issues, biar nggak berserakan jadi banyak file `.md` di root. Untuk gambaran umum & cara jalanin project, lihat [README.md](README.md).

## Daftar Isi

**[Bagian 1 — Product Requirements Document](#bagian-1--product-requirements-document)**
1. [Latar Belakang & Masalah](#1-latar-belakang--masalah)
2. [Tujuan (Goals)](#2-tujuan-goals)
3. [Non-Goals](#3-non-goals-sengaja-tidak-dikerjakan-dulu)
4. [Pengguna & Konteks Pemakaian](#4-pengguna--konteks-pemakaian)
5. [Alur Utama (Core Flow)](#5-alur-utama-core-flow)
6. [Model Data Inti](#6-model-data-inti)
7. [Kebutuhan Non-Fungsional](#7-kebutuhan-non-fungsional)
8. [Status Implementasi Saat Ini](#8-status-implementasi-saat-ini-per-review-terakhir)
9. [Roadmap Bertahap](#9-roadmap-bertahap)
10. [Metrik Keberhasilan](#10-metrik-keberhasilan-definisi-berhasil-untuk-experiment-ini)
11. [Batasan Desain & Relasi Data](#11-batasan-desain--relasi-data-by-design)

**[Bagian 2 — Known Issues](#bagian-2--known-issues)**
- [✅ Sudah Diselesaikan](#-sudah-diselesaikan)
- [🔴 Kritis](#-kritis-blocker-fungsional)
- [🟢 Rendah](#-rendah-nice-to-have-bukan-prioritas-sekarang)
- [Checklist sebelum pemakaian harian](#checklist-sebelum-pemakaian-harian-oleh-kapster-asli-dimulai)
- [🔵 Batasan Desain](#-batasan-desain-by-design)

---

# Bagian 1 — Product Requirements Document

## 1. Latar Belakang & Masalah

Barbershop dengan 1-3 kapster, tanpa admin/kasir terpisah, kesulitan mengelola:

- Booking masuk lewat WhatsApp yang sering **tidak menyebutkan jam pasti** (misal "mau ke sana hari Senin"), sehingga kapster kesulitan tahu kapan dia benar-benar free.
- Tidak ada cara memberi tahu customer **estimasi waktu tunggu** yang akurat.
- Tidak ada sistem pencatatan siapa yang sudah janji, kapan, dan status kedatangannya.
- Kapster tidak sempat melakukan input data manual di sela memotong rambut.

Proyek ini adalah **experiment pribadi** (bukan produk komersial saat ini), dibangun tanpa biaya recurring, dengan tujuan membantu 1 barbershop kenalan. Berpotensi dikembangkan lebih jauh jika terbukti membantu.

## 2. Tujuan (Goals)

1. Kapster tahu **siapa sedang dikerjakan** dan **siapa berikutnya**, tanpa perlu mengingat manual.
2. Booking WhatsApp masuk otomatis tercatat sebagai "permintaan" yang tinggal disetujui/ditolak — bukan hilang di tumpukan chat.
3. Sistem membedakan booking dengan **jam pasti** vs **estimasi urutan** vs **menunggu balasan jam dari customer** — tidak memaksakan jam palsu untuk data yang sebenarnya tidak pasti.
4. Interaksi manual kapster diminimalkan menjadi **tap sekali** per event penting (mulai servis, selesai servis).
5. Berjalan gratis — tanpa biaya API/hosting berbayar di tahap experiment ini.

## 3. Non-Goals (Sengaja Tidak Dikerjakan Dulu)

- Integrasi Instagram DM (approval Meta terlalu berat untuk tahap experiment; booking IG tetap dicatat manual).
- ~~Sistem pembayaran/invoicing.~~ **Update:** direvisi — DP 50% via QRIS (Xendit) sedang dikerjakan, lihat §🟡 Sedang Berjalan di Bagian 2. Bukan invoicing penuh, cuma gerbang pembayaran di depan alur booking WA untuk cegah no-show.
- Multi-cabang / multi-tenant.
- Native mobile app (cukup web responsive, diakses dari browser HP).

## 4. Pengguna & Konteks Pemakaian

- **Kapster** (1-2 orang), mengoperasikan sendiri lewat HP, di sela waktu kerja.
- Tidak ada admin/kasir terpisah — kapster sendiri yang tap tombol "Mulai"/"Selesai" saat memanggil/menyelesaikan customer.
- Volume booking rendah-menengah (puluhan pesan WA per hari), sehingga rate limit free-tier tools (Gemini API, dsb) masih realistis dipakai.

## 5. Alur Utama (Core Flow)

### 5.1 Booking masuk via WhatsApp
1. Customer kirim pesan WA (bahasa natural, sering tanpa jam pasti).
2. Sistem membaca pesan (lewat `whatsapp-web.js`, dijalankan di mesin/server milik pemilik sistem — bukan WhatsApp Business API resmi, karena berbayar).
3. Pesan dikirim ke **Gemini API** untuk ekstraksi terstruktur: nama, hari, jam (jika ada), jenis servis, dan apakah ini benar niat booking.
4. Jika jam tidak disebutkan, sistem otomatis membalas menanyakan jam (pagi/siang/sore atau jam spesifik).
5. Hasil ekstraksi masuk ke dashboard sebagai **"Request"** berstatus pending — **tidak pernah auto-assign ke antrian resmi** tanpa approval manual kapster.

### 5.2 Review & approval
- Kapster melihat kartu request: nama, hari/jam hasil ekstraksi, kutipan pesan asli.
- Kapster bisa **Setujui**, **Tolak**, atau **Edit manual** (jika ekstraksi AI salah).
- Setelah disetujui, entri masuk ke antrian resmi dengan salah satu dari 3 status:
  - **Confirmed** — jam pasti disebutkan/dikonfirmasi.
  - **Estimated** — hanya hari yang diketahui, ditampilkan sebagai nomor urut antrian.
  - **Pending Reply** — sistem sudah tanya jam, customer belum membalas.

### 5.3 Operasional harian
- Kapster tap **"Mulai"** saat memanggil customer ke kursi.
- Kapster tap **"Selesai"** saat servis selesai → sistem otomatis memanggil antrian berikutnya (hari yang sama, berdasarkan tanggal aktual, bukan hardcode).
- Statistik harian (total customer, rata-rata waktu tunggu, pendapatan) ter-update otomatis dari data ini.

## 6. Model Data Inti

- **QueueEntry**: id, nama customer, status (Confirmed/Estimated/Pending Reply), rentang waktu/nomor antrian, hari, layanan, kapster, telepon, durasi.
- **WhatsAppRequest**: id, nama & telepon pengirim, waktu diterima, isi pesan asli, hasil ekstraksi (hari/jam/servis), status (pending/approved/rejected).
- **Barber**: id, nama, status (active/break/off), spesialisasi.
- **Service**: id, nama, harga, durasi (menit).

## 7. Kebutuhan Non-Fungsional

- **Biaya**: $0 di tahap experiment. Gunakan Gemini API free tier + `whatsapp-web.js` (unofficial, gratis) — bukan WhatsApp Business API resmi (berbayar).
- **Risiko yang diterima secara sadar**: nomor WA bisa logout/ke-ban sewaktu-waktu karena `whatsapp-web.js` tidak resmi didukung Meta/WhatsApp. Ini risiko yang secara eksplisit diterima untuk versi experiment, dan harus dikomunikasikan ke kapster sebelum dipakai serius.
- **Device**: dioptimalkan untuk layar HP (mobile-first), diakses lewat browser, bukan aplikasi native. Telah divalidasi berfungsi di Safari iOS.
- **Tanpa akun/login kompleks**: 1 device/browser session cukup untuk tahap ini (bukan multi-user dengan auth).

## 8. Status Implementasi Saat Ini (per review terakhir)

✅ Sudah ada:
- UI dashboard lengkap (Overview, Queue, Requests, Schedule, Settings) — React + Tailwind, sudah interaktif dengan state management asli (bukan cuma statis).
- Logika status Confirmed/Estimated/Pending Reply sudah diimplementasi di level data, bukan cuma visual.
- Perhitungan durasi servis dinamis berdasarkan jenis layanan.
- **Schedule Daily View berfungsi sangat presisi** — layout telah dirombak penuh. Grid merentang tanpa kolaps menggunakan pola Hybrid Page-Scroll (commit `ca5713e`), dan header kapster kini dibungkus dalam satu kolom yang sama dengan grid jadwal sehingga keselarasan (alignment) kolom dijamin 100% presisi secara struktural, termasuk padding top/bottom dan whitespace yang optimal.
- Navigasi kalender (*Monthly* ke *Daily*) secara presisi langsung pindah ke minggu yang relevan.
- **Backend nyata sudah berjalan** (`server/index.js`): koneksi WhatsApp asli lewat `whatsapp-web.js` (scan QR sekali, sesi tersimpan lokal), pesan masuk diteruskan ke **Gemini API asli** (`server/gemini.js`, dengan fallback berjenjang antar model Gemini) untuk ekstraksi nama/hari/jam/servis, lalu ditulis langsung ke tabel Supabase `whatsapp_requests`.
- **Auto-reply WA menanyakan jam** ketika tidak disebutkan sudah berjalan — bot menjalankan state machine tanya-jawab per nomor pengirim (tanya hari/jam/servis/nama yang belum lengkap, cek ketersediaan jadwal, minta konfirmasi eksplisit "ya") sebelum menyimpan sebagai request.
- **Persistensi data sudah migrasi ke Supabase (Postgres)** — seluruh data inti (queue, requests, barbers, services, business hours) tersimpan di Supabase dengan realtime subscription dari frontend (`useSupabase*` hooks), bukan localStorage lagi. `localStorage` sekarang hanya dipakai untuk preferensi bahasa UI (`useLocalStorageState` di `src/i18n`).
- Review & approval request WhatsApp di dashboard sudah tersambung ke Supabase asli (`approveRequest`/`rejectRequest` di `useSupabaseRequests.ts`), bukan simulasi.
- **Backend di-deploy otomatis ke VPS** lewat GitHub Actions (`.github/workflows/deploy-backend.yml`) — push ke `main` yang nyentuh `server/**` langsung SSH-deploy + restart bot, nggak perlu `git pull` manual.
- **Bot WhatsApp sudah kebal dari spam balasan dobel saat restart**, dan punya jeda balasan natural (bukan instan) — lihat [Bagian 2 §✅ Sudah Diselesaikan](#-sudah-diselesaikan).
- **Customer otomatis dikasih tau via WhatsApp** saat kapster approve/reject booking-nya di dashboard — sebelumnya bot cuma bisa bales dalam percakapan aktif, sekarang bisa kirim pesan duluan lewat Supabase Realtime subscription.
- Perbaikan bug hardcode `'Wed'` sudah selesai, sistem kini dinamis mengikuti `todayKey`.
- **Dashboard sekarang punya sistem login** (Supabase Auth, satu akun staff bersama) — akses data lewat RLS juga sudah dibatasi khusus staff yang login (`authenticated`-only, `anon` dicabut total), bot WhatsApp jalan pakai `service_role` key terpisah yang bypass RLS. Lihat [Bagian 2 §✅ Sudah Diselesaikan — RLS](#-sudah-diselesaikan).
- Komponen `DataPagination` reusable sudah dipasang di Riwayat, siap dipakai ulang di halaman lain tanpa nulis ulang logic nomor halaman.

❌ Belum ada / masih dummy:
- Integrasi Instagram DM (memang sengaja belum dikerjakan — lihat §3 Non-Goals & Fase 5 di roadmap).
- Belum ada validasi lapangan nyata dari kapster (lihat §10 Metrik Keberhasilan) — implementasi teknis backend sudah jalan, tapi belum terbukti dipakai harian oleh kapster sungguhan.

Lihat [Bagian 2 — Known Issues](#bagian-2--known-issues) untuk detail teknis dan prioritas perbaikan.

## 9. Roadmap Bertahap

| Fase | Cakupan | Status |
|---|---|---|
| **Fase 1** | Perbaiki bug hardcode hari, tambah persistensi data | ✅ Selesai (kini pakai Supabase, bukan sekadar localStorage) |
| **Fase 2** | Bangun backend nyata: `whatsapp-web.js` untuk baca pesan masuk + panggilan Gemini API untuk ekstraksi terstruktur | ✅ Selesai (`server/index.js` + `server/gemini.js`) |
| **Fase 3** | Auto-reply WA untuk menanyakan jam ketika tidak disebutkan | ✅ Selesai (state machine tanya-jawab di `server/index.js`) |
| **Fase 4** | Auto-deploy backend + bot tahan restart tanpa spam balasan dobel | ✅ Selesai (GitHub Actions + fix `BOT_START_TIME`/dedup di `server/index.js`) |
| **Fase 5 (sekarang)** | Demo ke kapster asli, validasi alur UX & kumpulkan feedback pemakaian harian | ⏳ Belum dimulai |
| **Fase 6 (opsional)** | Integrasi Instagram DM, jika volume booking dari IG terbukti signifikan | Belum dikerjakan (by design) |

## 10. Metrik Keberhasilan (Definisi "Berhasil" untuk Experiment Ini)

- Kapster benar-benar memakainya setiap hari kerja tanpa merasa "ribet", diukur dari observasi/tanya langsung, bukan asumsi.
- Berkurangnya kejadian kapster lupa/bingung siapa yang sudah janji.
- Waktu yang dihabiskan kapster untuk cek WA manual berkurang secara nyata.

## 11. Batasan Desain & Relasi Data (By Design)

### Barber Duty Status Edge Case
- **Kapster Berubah Status ke 'Off' Saat Sedang Melayani**: Saat ini, jika kapster memiliki sesi pelanggan yang sedang berjalan (di kursi aktif) dan statusnya diubah dari 'Active' menjadi 'Off' via menu Settings, sistem tidak akan secara otomatis menghentikan atau menghapus sesi tersebut.
- **Perilaku (Behavior)**: Sesi akan dibiarkan tetap berjalan hingga selesai secara natural (hingga ditekan tombol 'Complete Session'). Ini adalah **keputusan desain yang sadar (by design)** untuk mencegah hilangnya data pelanggan yang terlanjur duduk di kursi secara tidak sengaja (misalnya karena salah klik), dan bukan merupakan bug yang terlewat.

### Relasi Data & Penghapusan Kapster (Soft Delete)
- **Foreign Key Constraint**: Mengingat tabel kapster saling berelasi dengan tabel `queue_entries`, penghapusan profil kapster secara permanen (hard delete) dari database tidak diizinkan jika kapster tersebut telah memiliki riwayat layanan pelanggan.
- **Solusi**: Diterapkan mekanisme **Soft Delete** lewat kolom `archived boolean` (bukan reuse kolom `status` yang dipakai buat toggle harian Active/Break/Off) — tombol hapus kapster di Settings sekarang selalu `UPDATE archived = true`, nggak pernah hard-delete lagi, jadi riwayat transaksi lama tetap utuh dan nggak ada lagi *error foreign key violation* (`Code 23503`). Kapster yang `archived = true` difilter di level query (`fetchBarbers`), jadi otomatis nggak muncul di Settings, kalender antrian, maupun dropdown form manapun.

---

# Bagian 2 — Known Issues

Dokumen ini mencatat gap teknis yang ditemukan saat review kode per commit terakhir di `main`. Urutkan berdasarkan prioritas sebelum project ini dipakai lebih dari sekadar demo.

---

## 🟡 Sedang Berjalan (Belum Live)

### Gerbang DP 50% via QRIS (Xendit) sebelum booking WA masuk Requests
**File:** `server/index.js`, `server/xenditClient.js` (baru), `server/priceLookup.js` (baru), `src/components/Requests.tsx`, `src/hooks/useSupabaseRequests.ts`, `src/types.ts`, `src/lib/paymentStatus.ts` (baru). Tabel `whatsapp_requests` dapet kolom baru (`payment_status` enum `unpaid|paid|expired|failed`, `dp_amount`, `xendit_reference_id`, `xendit_qr_id`, `payment_expires_at`, `dp_paid_at`, `payment_notified`).

**Kenapa:** barbernya minta customer bayar DP 50% dulu sebelum booking dianggap pasti, buat nekan risiko no-show/telat. Bukan sistem invoicing penuh — cuma satu gerbang pembayaran di depan alur approve/reject yang udah ada (yang tetap nggak berubah sama sekali).

**Cara kerja:** customer selesai isi data booking di WA → bot hitung DP 50% dari harga servis → generate QRIS lewat Xendit (**mode Test/Sandbox**, bukan uang asli) → kirim gambar QR ke customer + langsung `INSERT` ke `whatsapp_requests` dengan `payment_status: 'unpaid'` (jadi kelihatan di dashboard sebagai "Menunggu Pembayaran", walau belum bisa di-approve). Begitu Xendit kirim webhook konfirmasi bayar (`POST /webhooks/xendit`, di-verifikasi pakai `x-callback-token`), baris itu di-update `payment_status: 'paid'` dan baru "naik kelas" ke section "Menunggu Persetujuan" (alur approve/reject lama). Booking yang nggak dibayar dalam 30 menit otomatis ditandai `expired` (disembunyikan dari dashboard, tetap ada di database).

**Webhook endpoint** — dijalanin nebeng di proses bot yang sama (`pm2` app `barberflow-wa`, bukan proses terpisah), listen di `127.0.0.1:3002` (env `WEBHOOK_PORT`), diakses publik lewat **Cloudflare Tunnel** (`https://wa-webhook.takhtabarber.shop/webhooks/xendit`) — bukan buka port langsung ke VPS. Satu-satunya route, token-checked di baris pertama sebelum nyentuh apapun lain. Ini didesain sengaja hati-hati karena proyek ini pernah kena insiden API yang lupa dikasih otentikasi (lihat entri "Kode mati: REST API Express..." di bawah) — **kalau nanti mau nyentuh file ini, jangan tambah route baru tanpa mikir ulang soal otentikasinya.**

**Status implementasi (per sesi terakhir):**
- ✅ Kode backend & frontend selesai ditulis, `tsc --noEmit` bersih, sintaks backend udah dicek.
- ✅ Migrasi Supabase udah diterapkan ke database asli.
- ✅ Domain `takhtabarber.shop` udah dibeli (Niagahoster/Hostinger), udah ditambahin sebagai zone di Cloudflare, nameserver domain udah diganti ke `brenna.ns.cloudflare.com` / `dakota.ns.cloudflare.com` — **lagi nunggu propagasi** (Cloudflare bilang normalnya 1-2 jam, maksimal 24 jam; dicek berkala lewat `dig NS takhtabarber.shop`, per sesi terakhir masih nunjuk ke nameserver lama).
- ✅ Akun Xendit Test Mode udah dibuat, Secret Key mode Test & Verification Token webhook udah didapat (nilai asli cuma ada di `server/.env` VPS nanti — belum dipasang, VPS masih pakai kode lama sampai tunnel siap).
- ✅ URL webhook (`https://wa-webhook.takhtabarber.shop/webhooks/xendit`) udah didaftarin di Xendit Dashboard untuk dua event Payment Request v3 (`payment.capture` & `payment_request.expiry`). Tes kirim dari Xendit gagal `ENOTFOUND` — **wajar**, karena domainnya belum aktif; Xendit auto-retry webhook yang gagal jadi nggak perlu didaftar ulang begitu tunnel-nya hidup.
- ✅ **Bentuk payload webhook Xendit sekarang TERKONFIRMASI** (bukan tebakan lagi) — didapat langsung dari contoh payload asli di fitur "Tes dan simpan" Xendit Dashboard. Bentuknya: `{ event: "payment.capture", data: { reference_id, status: "SUCCEEDED", ... } }` untuk sukses, `{ event: "payment_request.expiry", data: { reference_id, status: "EXPIRED", ... } }` untuk kedaluwarsa di sisi Xendit sendiri. Kode `extractWebhookPayload()` di `xenditClient.js` udah dicek cocok persis tanpa perlu diubah — komentar "belum pasti"-nya udah diupdate jadi "terverifikasi".
- ⏳ Bentuk response saat **bikin** QR (`POST /payment_requests`, lokasi field QR string-nya) masih belum dikonfirmasi — beda dari webhook yang udah dikonfirmasi di atas. Kode di `xenditClient.js` (`extractQrString()`) masih defensif (nyoba beberapa kemungkinan field), baru bisa dipastikan pas tes end-to-end pertama.
- ⏳ **Belum live-tested end-to-end** — sisa langkah: tunggu propagasi domain kelar → setup Cloudflare Tunnel di VPS → pasang env vars asli di `server/.env` VPS → (minta izin user) deploy kode → tes webhook isolasi via curl → tes booking WA asli pakai simulator pembayaran Xendit.

---

## ✅ Sudah Diselesaikan

### Safari iOS — Grid Daily View Kolaps (Viewport Height Bug)
**Commit:** `ca5713e` — `fix(ui): implement hybrid page-scroll for Schedule grid to prevent Safari iOS toolbar layout collapse`

Grid time-axis di tab **Schedule → Daily View** menampilkan area yang sangat kecil (hanya 1 baris jam) saat dibuka di Safari iOS menggunakan URL production Vercel. Ini disebabkan oleh kalkulasi `h-[calc(100dvh-120px)]` yang gagal ketika address bar Safari muncul/hilang secara dinamis, sehingga Safari WebKit menciutkan kontainer `flex` ke tinggi minimum-content.

**Solusi yang diterapkan (Hybrid Page-Scroll):**
- Hapus seluruh batas tinggi `h-[calc(100dvh-...)]` dari root container `Schedule.tsx`.
- Grid dibiarkan merentang ke tinggi alami konten (~1170px untuk jam 09:00–21:00).
- Scroll diserahkan ke level halaman (bukan container internal), sehingga tidak ada lagi ketergantungan pada kalkulasi viewport yang berubah-ubah.
- Header kapster diberi `sticky top-[64px] md:top-[72px] z-30` agar tetap terlihat saat halaman di-scroll, menempel tepat di bawah top bar aplikasi.
- Sel pojok kiri atas (perpotongan header kapster & sumbu waktu) diberi `sticky left-0 z-40` sebagai jangkar dua-arah.

### [UI/UX] Grid Daily View — Alignment Header & Kolom
Grid pada **Schedule → Daily View** sebelumnya mengalami mis-alignment antara barisan nama kapster (Header) dan kotak jadwal (Grid) ketika layar digeser secara horizontal. Garis batas kolom juga tidak simetris dan kotak jadwal "mepet" dengan batas atas.

**Solusi yang diterapkan:**
- Mengubah struktur layout secara fundamental: menghapus *row* Header yang terpisah.
- Sekarang, setiap kapster memiliki **satu kolom vertikal utuh** (berisi Header di atas dan Grid di bawah), menjamin 100% keselarasan (*alignment*) presisi.
- Menambahkan padding top/bottom pada grid untuk ruang bernapas (UI/UX whitespace balance), serta memperbaiki margin kiri/kanan antar kotak jadwal menjadi simetris (8px).

### [Fungsionalitas] Monthly View — Navigasi ke Daily View yang salah minggu
**Status:** FIXED.
- Sebelumnya, jika mengklik sebuah tanggal di tampilan *Monthly View*, kalender berpindah ke *Daily View* tetapi mempertahankan *weekOffset* (minggu saat ini), sehingga menavigasi ke hari yang salah.
- **Solusi:** Menambahkan fungsi `jumpToDate` yang secara akurat menghitung selisih minggu dan menyesuaikan state `weekOffset` sebelum mengubah mode ke *Daily View*.

### [TERTINGGI] Reset harian untuk completedCount dan revenueToday
**Status:** FIXED.
- Menambahkan `lastResetDate` ke `localStorage` dan melakukan reset ke 0 untuk `completedCount` dan `revenueToday` jika tanggal saat ini berbeda dengan tanggal reset terakhir, memastikan statistik tidak menumpuk lintas hari.

### [TINGGI] Walk-in tidak divalidasi bentrok jadwal (double-booking)
**Status:** FIXED.
- Memisahkan logika `checkOverlap` dari `handleAddBooking` menjadi fungsi helper mandiri, dan menggunakannya di `handleAddWalkIn`. Mencegah terjadinya *double booking* jika jam yang diestimasikan bertabrakan.

### [SEDANG] ID collision risk pada approve WhatsApp request
**Status:** FIXED.
- ID `QueueEntry` yang dihasilkan dari *Approve WhatsApp Booking* kini menggunakan format random string `Date.now()` (e.g. `approved-12345678-abcde`), menggantikan format statis `approved- + id` yang rawan tabrakan data.

### [SEDANG] Tidak ada konfirmasi untuk aksi destruktif
**Status:** FIXED.
- Menambahkan modal dialog bawaan browser (`window.confirm`) khusus pada aksi destruktif: pembatalan *booking*, penghapusan jadwal dari kalender antrian, dan penghapusan profil *barber*.

### Hari "hari ini" di-hardcode sebagai `'Wed'`
**Status:** FIXED.
- Semua string statis `'Wed'` telah dinamis mengikuti live clock `todayKey`.

### Kesalahan logika balasan WhatsApp (Natural Reply AI)
**Status:** FIXED.
- Sebelumnya, AI membalas *chat* dengan struktur yang salah atau teks berantakan (tidak sesuai dengan format di server vs di layar).
- Logika ekstraksi dan *prompt* diperbaiki sehingga balasan lebih rapi dan terbaca alami (*natural reply*).

### Tidak ada backend
**Status:** FIXED.
- `server/index.js` kini menjalankan bot WhatsApp asli lewat `whatsapp-web.js` (sesi login tersimpan via `LocalAuth`, QR code discan sekali), meneruskan pesan masuk ke **Gemini API asli** (`server/gemini.js`, `@google/genai`, dengan fallback berjenjang antar beberapa model Gemini) untuk ekstraksi terstruktur, lalu menulis hasilnya langsung ke tabel Supabase `whatsapp_requests` lewat `server/supabaseClient.js`.
- Jalankan dengan `cd server && npm install && npm start`. Environment yang dibutuhkan: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (lihat `server/.env.example`).

### Data persistensi masih localStorage
**Status:** FIXED — bahkan sudah dilangkahi (superseded).
- Awalnya data inti (`queue`, `requests`, `barbers`, `services`) disimpan di localStorage lewat `useLocalStorageState`. Sejak itu seluruh data inti sudah **dimigrasi ke Supabase (Postgres)** dengan realtime subscription (`src/hooks/useSupabase*.ts`) — refresh di device/browser berbeda kini sinkron. `useLocalStorageState` masih ada di repo tapi sekarang hanya dipakai untuk preferensi bahasa UI (`src/i18n/index.tsx`), bukan data inti lagi.

### Kode mati: REST API Express + SQLite lokal yang tidak pernah dipanggil
**File (dihapus):** `server/api.js`, `server/db.js`, `server/server.js`
**Status:** FIXED (dibersihkan).
- Repo sempat punya API Express terpisah yang membuka `server/data.db` (SQLite lokal, skema `requests` berbeda dari tabel Supabase `whatsapp_requests`) lewat endpoint `GET/POST /requests` dan `PATCH /requests/:id`. Baik bot WhatsApp (`index.js`, yang menulis langsung ke Supabase) maupun frontend (yang membaca langsung dari Supabase) **tidak pernah memanggil API ini** — kemungkinan besar sisa scaffold awal sebelum bot ditulis ulang untuk langsung pakai Supabase. Ternyata di VPS masih nyala 22 hari, listening di port 3001, dan diekspos ke publik lewat Cloudflare quick tunnel tanpa autentikasi.
- **Perbaikan:** Ketiga file dihapus, dependency `express`/`cors`/`better-sqlite3` yang hanya dipakai di sana juga dibuang dari `server/package.json`, `server/package-lock.json` diregenerasi (66 package terkait ikut terpangkas), dan proses `barberflow-api` + `barberflow-tunnel` di VPS dimatikan via PM2.

### Kode mati: `src/data/mockData.ts` diimpor tapi tidak pernah dipakai
**Status:** FIXED (dibersihkan).
- Data asli (termasuk `WhatsAppRequest`) sudah datang dari Supabase lewat backend nyata (`server/`), bukan dari `mockData.ts`. File itu ternyata hanya di-*import* di `App.tsx` tanpa pernah dipakai (*dead import*) — file dan import-nya sudah dihapus.

### Boilerplate AI Studio basi di root `.env.example`
**Status:** FIXED.
- Baris `GEMINI_API_KEY`/`APP_URL` (sisa boilerplate template AI Studio, tidak pernah dibaca di frontend manapun) sudah dibuang dari root `.env.example`. Key Gemini yang asli tetap hanya hidup di `server/.env` (backend). Root `.env.example` sekarang cuma berisi `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` yang memang dipakai `src/lib/supabaseClient.ts`.

### Tidak ada deploy otomatis untuk backend
**Status:** FIXED.
- Sebelumnya tiap ubah `server/`, harus SSH manual ke VPS + `git pull` + restart PM2 sendiri. Sekarang ada `.github/workflows/deploy-backend.yml`: push ke `main` yang nyentuh `server/**` otomatis SSH ke VPS, `git reset --hard origin/main`, `npm install`, `pm2 restart barberflow-wa`. Sudah diverifikasi jalan sukses di production (2 kali berturut-turut).

### Bot WhatsApp spam balasan dobel setiap kali restart
**File:** `server/index.js`
**Status:** FIXED.
- `conversationState`/`chatHistory` cuma disimpan di memori — tiap kali proses restart, `whatsapp-web.js` "membaca ulang" pesan terakhir yang belum lama masuk pas sesi reconnect, memicu bot memproses & membalas pesan yang sama dari awal lagi. Karena tiap panggilan Gemini nggak deterministik, hasilnya beberapa balasan berbeda kalimat buat 1 pesan yang sama — kejadian nyata & kelihatan seperti spam ke customer, berisiko nomor WA kena flag/banned.
- **Solusi:** (1) pesan dengan timestamp lebih tua dari waktu proses mulai jalan (`BOT_START_TIME`) langsung diabaikan, (2) ID pesan yang sudah diproses dilacak sebagai jaring pengaman tambahan, (3) `replyAndSaveHistory` sekarang nunjukin indikator "mengetik" + jeda acak 1.5–7 detik (skala sesuai panjang teks) sebelum benar-benar kirim, biar nggak kelihatan kayak bot yang balas instan. Sudah dites langsung lewat chat WA nyata — cuma satu balasan per pesan, tidak spam lagi.
- **Catatan:** indikator "mengetik" (`sendStateTyping()`) kadang nggak kelihatan di sisi customer meski nggak error — kemungkinan keterbatasan `whatsapp-web.js` (library nggak resmi) terhadap kontak berformat `@lid` (fitur privasi WhatsApp lebih baru). Jeda balasannya sendiri tetap jalan normal; ini cuma soal visual "mengetik"-nya, bukan fungsi utamanya.

### `sender_phone` di `whatsapp_requests` kadang tersimpan sebagai ID `@lid`, bukan nomor asli
**File:** `server/index.js`
**Status:** FIXED.
- `msg.getContact().number` cuma baca dari cache kontak lokal `whatsapp-web.js`, yang buat kontak yang belum "dikenal" sebelumnya (khususnya ber-`@lid`) sering belum terisi — diam-diam fallback ke ID `@lid` mentah yang tersimpan sebagai `sender_phone`, bikin booking itu nggak bisa ditelepon balik. Dikonfirmasi lewat query langsung ke Supabase: sekitar separuh entri `whatsapp_requests` terakhir kena masalah ini.
- **Solusi:** ganti ke `client.getContactLidAndPhone()` (method yang ditambahin khusus untuk kasus ini di `whatsapp-web.js` 1.34.x) — dia maksa query ulang ke server WhatsApp (`window.Store.QueryExist`) kalau nomornya belum ke-cache, alih-alih langsung nyerah. Logika strip manual yang lama tetap dipertahankan sebagai fallback terakhir kalau method ini somehow gagal juga.

### Customer nggak pernah dikasih tau saat kapster Approve/Reject booking
**File:** `server/index.js`
**Status:** FIXED (fitur baru).
- Sebelumnya bot cuma bisa `msg.reply()` di dalam percakapan aktif — nggak pernah kirim pesan duluan. Kapster approve/reject request di dashboard cuma `UPDATE status` ke Supabase; customer nggak pernah dikasih tau, terutama parah buat reject (nunggu tanpa kepastian sampai nanya sendiri).
- **Solusi:** bot subscribe ke perubahan tabel `whatsapp_requests` lewat **Supabase Realtime** (bukan bikin REST API baru — pola ini sengaja dihindari setelah insiden API mati yang bocor publik). Begitu status berubah jadi `approved`/`rejected`, bot kirim WhatsApp otomatis ke `sender_phone` (nomor bersih berkat fix di atas) lewat `sendMessageWithDelay()` (jeda natural + typing indicator, sama kayak balasan biasa).
- Idempotency-nya sengaja disimpan di **kolom database baru** (`status_notified boolean`), bukan state in-memory — pelajaran langsung dari insiden spam balasan dobel sebelumnya, di mana state in-memory nggak tahan restart. Ada juga **catch-up scan** saat bot baru nyala (`client.on('ready')`) buat nyusulin notifikasi kalau kebetulan bot lagi mati pas kapster approve/reject.
- Migrasi tambah kolom `status_notified` dijalankan manual lewat Supabase SQL Editor (anon key nggak bisa DDL), termasuk backfill `status_notified = true` untuk semua riwayat approved/rejected lama biar nggak ke-notifikasi ulang secara nggak sengaja.
- Sudah dites langsung end-to-end: approve & reject dari dashboard, keduanya berhasil kirim WhatsApp ke nomor asli dalam hitungan detik.
- **Update:** ditemukan 1 kasus gagal kirim di log produksi — `[NOTIFY ERROR] No LID for user`, walau `sender_phone`-nya valid. Root cause: rekonstruksi `${sender_phone}@c.us` nggak selalu bisa dipakai buat kirim pesan BARU (beda dari `msg.reply()` yang jalan di dalam thread chat yang sudah ada) — sebagian kontak cuma bisa dikirimi lewat ID chat yang PERSIS sama dengan yang dipakai pas percakapan pertama kali. **Solusi:** tambah kolom `sender_wa_id` yang menyimpan `msg.from` mentah pas booking pertama disimpan ke DB, lalu `notifyStatusChange()` prioritaskan kolom ini sebagai target kirim (fallback ke rekonstruksi `@c.us` buat baris lama dari sebelum kolom ini ada).

### Gagal Menghapus Kapster (Foreign Key Constraint `queue_entries`)
**File:** `src/hooks/useSupabaseBarbers.ts`, `src/App.tsx`
**Status:** FIXED.
- `removeBarber()` sebelumnya `.delete()` langsung ke tabel `barbers`. Kapster yang udah pernah dijadwalkan (punya baris di `queue_entries`) bikin Postgres nolak dengan error `23503` (foreign key violation), dan yang dilakuin cuma nangkep error itu terus nyuruh user manual ubah status kapster ke "Off" lewat toast — bukan fix beneran, cuma workaround yang harus diinget manual tiap kali.
- **Solusi:** soft delete permanen (bukan hard-delete-lalu-fallback). Tambah kolom `archived boolean default false` di tabel `barbers`; `removeBarber()` sekarang selalu `UPDATE barbers SET archived = true` (nggak pernah `.delete()` lagi), dan `fetchBarbers()` filter `.eq('archived', false)` biar kapster yang udah "dihapus" nggak nongol lagi di mana pun (Settings, Schedule, dropdown). Riwayat lama di `queue_entries` tetap utuh karena baris kapsternya nggak pernah beneran ilang dari database.
- **Catatan:** field ini beda dari `status` ('active'/'break'/'off') yang udah ada — itu toggle harian (kapster libur hari ini), `archived` khusus buat "kapster udah nggak dipakai lagi / dihapus permanen". Jangan disatuin, biar nggak ketuker kapster yang cuma libur sehari dengan yang beneran keluar.

### Row Level Security (RLS) mati di semua tabel Supabase
**File:** Database Supabase (`public.*`), `src/App.tsx`, `src/components/Login.tsx`, `server/supabaseClient.js`.
**Status:** FIXED (tuntas, dua fase).

**Fase 1 — RLS least-privilege per operasi (riwayat lama):** Semua 6 tabel (`barbers`, `services`, `whatsapp_requests`, `queue_entries`, `business_hours`, `barber_time_off`) awalnya nggak punya RLS aktif — ketauan dari Supabase security advisor (level `ERROR`). RLS diaktifkan dengan policy per role `anon` yang dipetain dari operasi yang beneran dipakai kode. Ini nutup celah "operasi yang nggak semestinya" (mis. hapus massal data pelanggan), tapi BELUM nutup celah "siapa aja bisa baca data pelanggan" karena dashboard-nya emang belum ada sistem login.

**Fase 2 — Login dashboard + tutup total akses `anon` (baru):**
- **Login dashboard**: ditambahkan sistem login pakai Supabase Auth — satu akun staff bersama (email+password, bukan multi-user per kapster, sesuai skala toko kecil), lewat komponen baru `src/components/Login.tsx`. `App.tsx` sekarang nge-gate seluruh dashboard di belakang `supabase.auth.getSession()`/`onAuthStateChange`; tombol logout ada di header desktop & top bar mobile.
- **Bot WhatsApp pindah ke `service_role` key**: `server/supabaseClient.js` sekarang prioritas baca `SUPABASE_SERVICE_ROLE_KEY` (fallback ke anon key kalau env var belum ke-set, biar nggak hard-crash), jadi bot bypass RLS sepenuhnya sebagai backend terpercaya — nggak lagi gantungan sama akses `anon` yang sama dengan browser publik. Key ditambahkan ke `server/.env` di VPS lewat SSH, dideploy lewat pipeline auto-deploy yang udah ada (1x restart, diverifikasi lewat PM2 log — uptime jalan normal, nggak ada crash loop).
- **Policy `authenticated` ditambahkan** (mirror persis dari operasi yang tadinya `anon`), lalu **semua policy `anon` dicabut total** di keenam tabel. Diverifikasi langsung pakai `curl` dengan publishable key murni (tanpa login): baca data pelanggan → 0 baris (padahal ada data asli), tulis data → `401` `"row-level security policy violation"`. Dashboard yang login (`authenticated` role) dan bot (`service_role`) tetap jalan normal — dicek ulang setelahnya, keduanya nggak kepengaruh.
- Sekarang celah "siapa aja yang nemu anon key publik bisa baca nomor WA pelanggan tanpa login" sudah benar-benar tertutup — bukan cuma "sebagian" lagi kayak sebelumnya.

### Gagal Menghapus Layanan (Foreign Key Constraint `queue_entries`) — bug yang sama kayak kapster
**File:** `src/hooks/useSupabaseServices.ts`
**Status:** FIXED.
- Ketauan pas audit struktur database: `removeService()` masih `.delete()` langsung ke tabel `services`, persis pola bug kapster sebelum diperbaiki. Dikonfirmasi 100% reproducible — ketiga layanan yang ada sekarang (Potong Rambut, Potong + Cuci, Cukur Jenggot) semuanya udah dipakai di riwayat `queue_entries` (55 baris), jadi coba hapus layanan apa pun dari Settings pasti kena error `23503`, dan nggak ada penanganan khusus buat itu (cuma toast generik "Gagal menghapus layanan" tanpa penjelasan).
- **Solusi:** pola soft delete yang sama kayak kapster — kolom `archived boolean default false` di tabel `services`, `removeService()` sekarang `UPDATE archived = true` (bukan `.delete()`), `fetchServices()` filter `.eq('archived', false)`. RLS policy `services` juga disesuaikan (`DELETE` dicabut karena udah nggak kepake, ganti jadi `UPDATE`).
- Dites langsung: soft-delete salah satu dari 3 layanan yang beneran dipakai 55 booking — berhasil, ilang dari listing, riwayat `queue_entries` lama tetap utuh tanpa error.

### Edit request WhatsApp sebelum approve nggak beneran tersimpan ke database
**File:** `src/App.tsx`, `src/hooks/useSupabaseRequests.ts`
**Status:** FIXED.
- `handleEditRequest` sebelumnya cuma `setRequests(...)` — ngubah state lokal browser doang, nggak pernah nulis ke tabel `whatsapp_requests`. Padahal bot (`server/index.js`) ngirim konfirmasi WA ke customer berdasarkan kolom `extracted_day`/`extracted_time`/`extracted_service` **langsung dari baris database**, bukan dari yang kapster lihat/edit di dashboard. Jadi kalau kapster koreksi jam booking sebelum approve, entri antrean internal udah bener, tapi WA yang dikirim ke customer bisa masih pakai data lama.
- **Solusi:** fungsi baru `updateRequestDetails` di `useSupabaseRequests.ts` nulis perubahan (nama/hari/jam/servis) ke Supabase beneran, termasuk njaga encoding `"Servis|BARBER:NamaKapster"` di kolom `extracted_service` biar kapster hasil ekstraksi AI nggak ketimpa. `handleEditRequest` sekarang `async`, nunggu tulisan berhasil sebelum kasih toast sukses.
- Dicek logic listener bot: aman dari notifikasi WA prematur, karena dia cuma trigger di status `approved`/`rejected` (nggak react ke edit-doang selagi status masih `pending`) dan idempoten lewat `status_notified` — nggak perlu ubah kode server sama sekali.

### Card request WhatsApp bisa diedit hari/jam/servis — risiko kapster diam-diam pindahin jadwal customer
**File:** `src/components/Requests.tsx`
**Status:** DIHAPUS BY DESIGN (bukan bug fix, keputusan produk).
- Form edit hari/servis sebenarnya rusak duluan: dropdown HARI cuma punya opsi `Mon`–`Sun`, sementara data dari AI berupa string mentah kayak `"besok"` — nggak pernah match, jadi selalu tampil kosong. Sama halnya dropdown LAYANAN cuma punya nama servis satuan, sementara AI kadang gabungin jadi satu string (`"Potong Rambut + Cukur Jenggot"`).
- Di luar bug tampilan itu, ada masalah yang lebih mendasar: approve otomatis ngirim WA konfirmasi ke customer berdasarkan apa pun yang di-approve — jadi kalau kapster bebas ubah hari/jam/servis sebelum approve, itu sama aja kapster diam-diam mindahin jadwal customer ke waktu lain tanpa persetujuan customer, terus sistem bilang ke customer "udah dikonfirmasi" seolah itu emang yang diminta.
- **Keputusan:** kemampuan edit hari/jam/servis dihapus total dari card. Kapster cuma bisa approve (persis sesuai hasil ekstraksi AI) atau reject (customer diminta klarifikasi ulang lewat WA langsung — percakapan asli, bukan diputuskan sepihak dari dashboard). Nama pengirim tetap bisa diedit (nggak ada implikasi komitmen jadwal, cuma benerin typo hasil ekstraksi AI).

### Timestamp mentah ISO string di card request WhatsApp
**File:** `src/components/Requests.tsx`
**Status:** FIXED.
- Kolom waktu terima pesan nampilin string ISO mentah apa adanya (`2026-08-19T07:53:59.445178+00:00`), susah dibaca kapster sekilas.
- **Solusi:** fungsi `formatReceivedTime` — format `"dd MMM, HH:mm"` locale Indonesia (mis. `19 Agu, 14.53`), tanggal selalu ditampilkan (nggak disembunyiin walau pesannya diterima hari ini) biar kapster nggak perlu nebak-nebak.

### Model `gemini-3.1-flash` di fallback chain bot nggak pernah ada (404)
**File:** `server/gemini.js`
**Status:** FIXED.
- `MODEL_CHAIN` punya 4 model (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.1-flash`, `gemini-3.5-flash`), tapi `gemini-3.1-flash` (tanpa akhiran `-lite`) ternyata nggak pernah eksis sebagai model — dikonfirmasi lewat panggilan API langsung, hasilnya `404 NOT_FOUND` ("keluarga 3.1 cuma ada varian lite"). Dampaknya nggak kelihatan kalau pesan pendek (chain mulai dari index 0), tapi `getStartingIndex()` bikin pesan customer yang panjang (>80 karakter) langsung lompat ke index 2 — model rusak itu duluan — jadi praktiknya cuma ada **1 model cadangan asli** buat pesan panjang, bukan 2. Kalau model terakhir itu kena hambatan sesaat, customer nggak dapat balasan sama sekali, dan log-nya nggak jelas kenapa karena `catch (err)` sebelumnya nggak pernah nyatet `err.message`.
- **Solusi:** ganti `gemini-3.1-flash` → `gemini-3.6-flash` (dites langsung lewat API, beneran jalan), dan log fallback sekarang nyatet pesan error asli biar diagnosa ke depannya nggak perlu reproduksi manual lagi.
- Dites end-to-end lewat pesan WA beneran (bukan cuma unit test) — pesan panjang yang tadinya bikin chain gagal total sekarang langsung berhasil di percobaan pertama.

### Mismatch angka pendapatan antara toast notifikasi dan dashboard
**File:** `src/App.tsx`
**Status:** FIXED.
- `handleCompleteSession` (toast "sesi selesai") dan `revenueToday` (angka di dashboard Ringkasan) pakai strategi lookup harga yang beda — toast cocokkan by `id` ATAU `name` dengan fallback hardcode `Rp 120.000`, sementara `revenueToday` cuma cocokkan by `name` dengan fallback `0`. Kalau servis nggak ketemu, dua angka itu bisa nggak sinkron (toast nunjukin angka fiktif, dashboard nunjukin 0).
- **Solusi:** toast sekarang pakai lookup & fallback yang persis sama dengan `revenueToday` (`services.find(s => s.name === session.service)?.price || 0`), jadi dua angka itu nggak akan pernah beda lagi.

### Fuzzy-match servis/kapster dari WhatsApp diam-diam salah tebak tanpa peringatan
**File:** `src/App.tsx`
**Status:** FIXED.
- `fuzzyMatchService`/`fuzzyMatchBarber` kalau gagal cocokkan nama servis/kapster hasil ekstraksi AI secara persis/parsial, diam-diam fallback ke servis/kapster pertama di list — kapster nggak pernah dikasih tau bahwa itu cuma tebakan, jadi booking bisa nyasar ke servis/kapster yang salah tanpa terdeteksi.
- **Solusi:** kedua fungsi sekarang balikin `{ id/barber, matched: boolean }`. Di `handleApproveRequest`, kalau salah satu `matched: false`, muncul toast tambahan "Perlu Verifikasi" yang bilang spesifik apa yang ditebak sistem — booking tetap jalan (nggak diblokir), tapi kapster dikasih sinyal jelas buat cek ulang.

### Duplikasi logic warna status antar komponen — QueueList nggak kenali status "sedang dilayani"
**File:** `src/lib/queueStatus.ts` (baru), `src/components/Schedule.tsx`, `src/components/QueueList.tsx`
**Status:** FIXED.
- Mapping status → warna badge diimplementasi ulang di 2 tempat berbeda dengan perilaku yang geser: `QueueList.tsx` cuma switch berdasarkan `item.status` (nggak ngecek `startedAt`, jadi kapster yang lagi ngerjain customer keliatan sama kayak booking yang masih nunggu), sementara `Schedule.tsx` udah lebih lengkap (ngecek prioritas completedAt/startedAt dulu baru status). Status `'Completed'` di `QueueList` juga jatuh ke variant `'default'` (abu-abu), bukan biru kayak di tempat lain.
- **Solusi:** logic keputusan warna ditarik jadi satu fungsi `getQueueStatusVariant()` di `src/lib/queueStatus.ts` (satu-satunya sumber kebenaran, prioritas completedAt → startedAt → status), dipakai oleh `Schedule.tsx` (lewat mapping ke className penuh) dan `QueueList.tsx` (langsung sebagai variant prop `<Badge>`, sekarang otomatis dapet `'blue'` yang bener buat status Completed).
- Juga ditemukan & dibenerin sekalian: warna entri jadwal di `Schedule.tsx` sebelumnya pakai palet pastel terang (`bg-emerald-200 text-emerald-950`, dst) yang beda treatment sama badge legenda status di toolbar (`bg-emerald-500/10 text-emerald-400`, tint transparan gelap) — sama-sama hijau tapi kelihatan kayak warna berbeda. Disamakan ke treatment tint transparan yang konsisten di seluruh app.

### Komponen Pagination reusable (`DataPagination`)
**File:** `src/components/ui/pagination.tsx` (baru), `src/components/ui/DataPagination.tsx` (baru), `src/components/History.tsx`
**Status:** Fitur baru.
- Dibangun sebagai elemen siap-pakai di atas primitif shadcn/ui pagination — `DataPagination` menghitung sendiri nomor halaman + ellipsis (`1 … 4 5 6 … 20`), disable Previous/Next di ujung, tanpa perlu nulis ulang logic-nya tiap kali dipasang di halaman baru. Cukup pass `page`/`totalPages`/`onPageChange`.
- Dipasang pertama kali di **Riwayat** (`History.tsx`, 9 item per halaman, grid & table view keduanya kepasang, reset ke halaman 1 otomatis saat filter/mode berubah). Siap dipasang ulang di halaman lain (misal Booking WhatsApp) tanpa perlu bikin logic baru.

### Legenda warna status & format ribuan di dashboard
**File:** `src/components/Schedule.tsx`, `src/components/Settings.tsx`, `src/i18n/*.ts`
**Status:** Peningkatan UI.
- **Legenda warna** ditambahkan di toolbar Schedule (`PANDUAN WARNA STATUS: Terkonfirmasi/Estimasi/Menunggu Balasan/Berlangsung/Selesai`) — sebelumnya warna entri jadwal nggak ada penjelasannya sama sekali di UI mana pun.
- **Format ribuan** pada input harga di form tambah layanan (Settings) — sebelumnya `type="number"` nampilin angka mentah (`100000`), sekarang `type="text"` dengan format live pakai `toLocaleString('id-ID')` (`100.000`), parsing tetap ke `number` biasa saat disimpan.
- Section "Template Notifikasi WhatsApp" yang nggak pernah kepake (state/handler-nya cuma lokal, nggak ada satu pun kode lain yang baca) dihapus dari Settings sekalian beres-beres.

### Nama & logo toko hardcode "Golden Shears" di 10+ tempat (frontend & bot)
**File:** `src/hooks/useSupabaseBusinessHours.ts`, `src/App.tsx`, `src/components/{Login,Sidebar,QueueList,Schedule,Settings}.tsx`, `server/index.js`, `server/gemini.js`, Database Supabase (`business_hours`).
**Status:** FIXED (fitur baru — Profil Toko).
- "Golden Shears"/logo huruf "G" ditulis literal di banyak tempat: sidebar, header desktop, top bar mobile, splash loading screen, halaman Login, judul halaman Jadwal, 2 template pesan WhatsApp ke customer (`QueueList.tsx`, `Schedule.tsx`) — **dan juga di backend bot** (`server/gemini.js` system prompt Gemini, `server/index.js` pesan konfirmasi approve). Ganti nama toko lewat dashboard sebelumnya cuma nyampe ke frontend — bot WA masih balas pakai nama lama karena hardcode-nya kepisah total dari database.
- **Solusi:** kolom baru `shop_name`/`logo_url` ditambahkan ke tabel `business_hours` (satu baris config yang sama dengan jam operasional). Kartu baru **"Profil Toko"** di Settings (nama + upload logo, pola base64 sama kayak foto kapster). Semua 8 titik hardcode di frontend diganti baca dari `businessHours.shopName`/`logoUrl`. Di backend, `getBusinessContext()`/`getShopName()` di `server/index.js` sekarang query `shop_name` dari `business_hours` dan diteruskan ke `parseBookingMessage()` (`server/gemini.js`) dan `notifyStatusChange()`, gantiin string hardcode.
- **RLS**: `business_hours` sengaja dibuka lagi read-only (`SELECT`) untuk role `anon` — beda dari tabel lain yang udah dikunci `authenticated`-only (lihat entri RLS di atas) — karena nama/jam toko bukan data sensitif, dan halaman Login butuh nampilin nama/logo toko SEBELUM staff login (belum ada sesi `authenticated`). Write tetap `authenticated`-only.
- Dites end-to-end: ganti nama lewat Settings → langsung berubah di semua tempat frontend (real-time, tanpa refresh) termasuk halaman Login sebelum sesi login ada. Bug backend-nya ketauan justru dari tes manual: setelah nama toko diganti di dashboard, bot WA masih balas pakai nama lama ("Golden Shears") pas ditanya kapster — fix di atas nutup celah itu, diverifikasi ulang lewat WA beneran setelah deploy.

---

## 🔴 Kritis (blocker fungsional)

Tidak ada saat ini.

---

## 🟢 Rendah (nice-to-have, bukan prioritas sekarang)

### 2. `handleAddWalkIn` — estimasi waktu mulai antrian jalan sederhana (gap tetap 15 menit)
Logika `startMinutes = ... + 15` antar walk-in mengasumsikan gap tetap 15 menit tanpa mempertimbangkan durasi servis sebelumnya secara akurat di semua kasus. Cukup untuk MVP, tapi perlu direview kalau kompleksitas antrian bertambah (multi-kapster paralel, dll).

---

## Checklist sebelum pemakaian harian oleh kapster asli dimulai

- [x] Perbaiki bug hardcode `'Wed'`
- [x] Tambahkan persistensi data (kini Supabase, bukan sekadar localStorage)
- [x] Bangun backend nyata: koneksi WhatsApp + ekstraksi Gemini API (`server/`)
- [x] Auto-reply WA menanyakan jam yang belum disebutkan
- [x] Konfirmasi `.gitignore` mengabaikan file `.env*` — API key asli (Gemini, Supabase) tidak pernah ter-commit ke repo publik
- [x] Bersihkan kode mati (`server/api.js`+`db.js`+`server.js`, `mockData.ts`, boilerplate `.env.example`)
- [x] Auto-deploy backend ke VPS lewat GitHub Actions — nggak perlu `git pull` manual lagi tiap ubah `server/`
- [x] Perbaiki bot spam balasan dobel saat restart + tambah jeda balasan natural
- [x] Notifikasi WhatsApp otomatis ke customer saat kapster approve/reject booking
- [x] Perbaiki `sender_phone` yang kadang tersimpan sebagai `@lid`
- [x] Perbaiki gagal hapus kapster (foreign key constraint) lewat soft delete
- [x] Aktifkan Row Level Security di semua tabel Supabase (least-privilege per operasi)
- [x] Perbaiki gagal hapus layanan (foreign key constraint) lewat soft delete
- [x] Tambahkan sistem login dashboard (Supabase Auth) + kunci RLS ke `authenticated`-only, bot pindah ke `service_role` key
- [ ] Demo ke kapster asli, kumpulkan feedback alur UX (lihat [§10 Bagian 1](#10-metrik-keberhasilan-definisi-berhasil-untuk-experiment-ini) — belum divalidasi di lapangan)

---

## 🔵 Batasan Desain (By Design)

### 3. Barber Duty Status Edge Case
- **Kapster Berubah Status ke 'Off' Saat Sedang Melayani**: Saat ini, jika kapster memiliki sesi pelanggan yang sedang berjalan (di kursi aktif) dan statusnya diubah dari 'Active' menjadi 'Off' via menu Settings, sistem tidak akan secara otomatis menghentikan atau menghapus sesi tersebut.
- **Perilaku (Behavior)**: Sesi akan dibiarkan tetap berjalan hingga selesai secara natural (hingga ditekan tombol 'Complete Session'). Ini adalah **keputusan desain yang sadar (by design)** untuk mencegah hilangnya data pelanggan yang terlanjur duduk di kursi secara tidak sengaja (misalnya karena salah klik), dan bukan merupakan bug yang terlewat.

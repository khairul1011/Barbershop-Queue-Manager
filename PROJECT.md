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
- Sistem pembayaran/invoicing.
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
**File:** Database Supabase (`public.*`), bukan kode aplikasi.
**Status:** FIXED (sebagian).
- Semua 6 tabel (`barbers`, `services`, `whatsapp_requests`, `queue_entries`, `business_hours`, `barber_time_off`) nggak punya RLS aktif — ketauan dari Supabase security advisor (level `ERROR`). Karena frontend ngobrol langsung ke Supabase pakai anon/publishable key yang emang secara desain nempel publik di JS bundle browser, RLS mati berarti siapa pun yang nemu URL dashboard-nya bisa baca DAN tulis/hapus SEMUA baris di SEMUA tabel lewat DevTools, termasuk data pribadi pelanggan (nama, nomor WA) di `whatsapp_requests`, tanpa perlu login (dashboard-nya emang belum ada sistem login).
- **Solusi:** RLS diaktifkan di keenam tabel, dengan policy per role `anon` yang dipetain persis dari operasi yang beneran dipakai kode (dicek semua `.from()` call di `src/hooks/*.ts` dan `server/index.js`) — misal `whatsapp_requests` cuma dikasih SELECT/INSERT/UPDATE (nggak ada DELETE, karena nggak ada kode yang butuh itu), `services` cuma SELECT/INSERT/DELETE (nggak ada UPDATE, UI-nya emang nggak punya edit inline). Prinsipnya least-privilege di level operasi, bukan di level identitas pengguna (karena belum ada auth).
- **Kenapa cuma "sebagian" fixed:** ini nutup celah "operasi yang nggak semestinya" (mis. hapus massal data pelanggan), tapi BELUM nutup celah "siapa aja bisa baca data pelanggan" — itu butuh sistem login/auth beneran di dashboard yang membedakan staff vs publik, yang belum ada sama sekali di aplikasi ini. Ini perbaikan pertama yang aman diterapkan tanpa bikin app/bot berhenti fungsi, bukan solusi privasi data yang final.
- Migrasi `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` dijalankan manual lewat Supabase SQL Editor (DDL security setting, di luar kewenangan otomatis Claude Code). Diverifikasi lewat Supabase advisor (`get_advisors` nol temuan security setelahnya) dan tes langsung di dashboard + cek log bot — keduanya tetap jalan normal.

### Gagal Menghapus Layanan (Foreign Key Constraint `queue_entries`) — bug yang sama kayak kapster
**File:** `src/hooks/useSupabaseServices.ts`
**Status:** FIXED.
- Ketauan pas audit struktur database: `removeService()` masih `.delete()` langsung ke tabel `services`, persis pola bug kapster sebelum diperbaiki. Dikonfirmasi 100% reproducible — ketiga layanan yang ada sekarang (Potong Rambut, Potong + Cuci, Cukur Jenggot) semuanya udah dipakai di riwayat `queue_entries` (55 baris), jadi coba hapus layanan apa pun dari Settings pasti kena error `23503`, dan nggak ada penanganan khusus buat itu (cuma toast generik "Gagal menghapus layanan" tanpa penjelasan).
- **Solusi:** pola soft delete yang sama kayak kapster — kolom `archived boolean default false` di tabel `services`, `removeService()` sekarang `UPDATE archived = true` (bukan `.delete()`), `fetchServices()` filter `.eq('archived', false)`. RLS policy `services` juga disesuaikan (`DELETE` dicabut karena udah nggak kepake, ganti jadi `UPDATE`).
- Dites langsung: soft-delete salah satu dari 3 layanan yang beneran dipakai 55 booking — berhasil, ilang dari listing, riwayat `queue_entries` lama tetap utuh tanpa error.

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
- [x] Aktifkan Row Level Security di semua tabel Supabase (least-privilege, belum ada auth dashboard)
- [x] Perbaiki gagal hapus layanan (foreign key constraint) lewat soft delete
- [ ] Demo ke kapster asli, kumpulkan feedback alur UX (lihat [§10 Bagian 1](#10-metrik-keberhasilan-definisi-berhasil-untuk-experiment-ini) — belum divalidasi di lapangan)

---

## 🔵 Batasan Desain (By Design)

### 3. Barber Duty Status Edge Case
- **Kapster Berubah Status ke 'Off' Saat Sedang Melayani**: Saat ini, jika kapster memiliki sesi pelanggan yang sedang berjalan (di kursi aktif) dan statusnya diubah dari 'Active' menjadi 'Off' via menu Settings, sistem tidak akan secara otomatis menghentikan atau menghapus sesi tersebut.
- **Perilaku (Behavior)**: Sesi akan dibiarkan tetap berjalan hingga selesai secara natural (hingga ditekan tombol 'Complete Session'). Ini adalah **keputusan desain yang sadar (by design)** untuk mencegah hilangnya data pelanggan yang terlanjur duduk di kursi secara tidak sengaja (misalnya karena salah klik), dan bukan merupakan bug yang terlewat.

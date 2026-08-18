# PRD — BarberFlow Queue Manager

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
- Perbaikan bug hardcode `'Wed'` sudah selesai, sistem kini dinamis mengikuti `todayKey`.

❌ Belum ada / masih dummy:
- Integrasi Instagram DM (memang sengaja belum dikerjakan — lihat §3 Non-Goals & Fase 4 di roadmap).
- Belum ada validasi lapangan nyata dari kapster (lihat §10 Metrik Keberhasilan) — implementasi teknis backend sudah jalan, tapi belum terbukti dipakai harian oleh kapster sungguhan.

Lihat `KNOWN_ISSUES.md` untuk detail teknis dan prioritas perbaikan.

## 9. Roadmap Bertahap

| Fase | Cakupan | Status |
|---|---|---|
| **Fase 1** | Perbaiki bug hardcode hari, tambah persistensi data | ✅ Selesai (kini pakai Supabase, bukan sekadar localStorage) |
| **Fase 2** | Bangun backend nyata: `whatsapp-web.js` untuk baca pesan masuk + panggilan Gemini API untuk ekstraksi terstruktur | ✅ Selesai (`server/index.js` + `server/gemini.js`) |
| **Fase 3** | Auto-reply WA untuk menanyakan jam ketika tidak disebutkan | ✅ Selesai (state machine tanya-jawab di `server/index.js`) |
| **Fase 4 (sekarang)** | Demo ke kapster asli, validasi alur UX & kumpulkan feedback pemakaian harian | ⏳ Belum dimulai |
| **Fase 5 (opsional)** | Integrasi Instagram DM, jika volume booking dari IG terbukti signifikan | Belum dikerjakan (by design) |

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
- **Solusi**: Diterapkan mekanisme **Soft Delete** (mengubah status menjadi 'off' atau 'hidden' di sisi UI) untuk menjaga integritas data riwayat transaksi lama kapster tersebut dan menghindari *error foreign key violation* (seperti `Code 23503`). Kapster yang berstatus 'off' tidak akan muncul lagi di kalender antrian maupun pilihan dropdown form.

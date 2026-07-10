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
- **Device**: dioptimalkan untuk layar HP (mobile-first), diakses lewat browser, bukan aplikasi native.
- **Tanpa akun/login kompleks**: 1 device/browser session cukup untuk tahap ini (bukan multi-user dengan auth).

## 8. Status Implementasi Saat Ini (per review terakhir)

✅ Sudah ada:
- UI dashboard lengkap (Overview, Queue, Requests, Schedule, Settings) — React + Tailwind, sudah interaktif dengan state management asli (bukan cuma statis).
- Logika status Confirmed/Estimated/Pending Reply sudah diimplementasi di level data, bukan cuma visual.
- Perhitungan durasi servis dinamis berdasarkan jenis layanan.

❌ Belum ada / masih dummy:
- Tidak ada backend (`server.js` tidak ada meski `express`/`dotenv` tercantum di `package.json` sebagai dependency nganggur).
- Tidak ada koneksi WhatsApp nyata — data request masih hardcoded di `mockData.ts`.
- Tidak ada pemanggilan Gemini API nyata untuk parsing pesan.
- Tidak ada persistensi data — refresh browser = data kembali ke mock awal.
- Bug: hari "hari ini" di-hardcode sebagai `'Wed'` di beberapa fungsi (`handleCompleteServing`, `handleAddWalkIn`, `handleAddBooking`), bukan dihitung dari tanggal aktual.

Lihat `KNOWN_ISSUES.md` untuk detail teknis dan prioritas perbaikan.

## 9. Roadmap Bertahap

| Fase | Cakupan |
|---|---|
| **Fase 1 (sekarang)** | Perbaiki bug hardcode hari, tambah persistensi data (minimal localStorage), demo ke kapster untuk validasi alur UX |
| **Fase 2** | Bangun `server.js` nyata: `whatsapp-web.js` untuk baca pesan masuk + panggilan Gemini API untuk ekstraksi terstruktur |
| **Fase 3** | Auto-reply WA untuk menanyakan jam ketika tidak disebutkan |
| **Fase 4 (opsional)** | Integrasi Instagram DM, jika volume booking dari IG terbukti signifikan |

## 10. Metrik Keberhasilan (Definisi "Berhasil" untuk Experiment Ini)

- Kapster benar-benar memakainya setiap hari kerja tanpa merasa "ribet", diukur dari observasi/tanya langsung, bukan asumsi.
- Berkurangnya kejadian kapster lupa/bingung siapa yang sudah janji.
- Waktu yang dihabiskan kapster untuk cek WA manual berkurang secara nyata.

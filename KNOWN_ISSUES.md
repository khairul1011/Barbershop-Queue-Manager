# Known Issues — BarberFlow Queue Manager

Dokumen ini mencatat gap teknis yang ditemukan saat review kode per commit terakhir di `main`. Urutkan berdasarkan prioritas sebelum project ini dipakai lebih dari sekadar demo.

---

## ✅ Sudah Diselesaikan

### Safari iOS — Grid Daily View Kolaps (Viewport Height Bug)
**Commit:** `ca5713e` — `fix(ui): implement hybrid page-scroll for Schedule grid to prevent Safari iOS toolbar layout collapse`

Grid time-axis di tab **Schedule → Daily View** menampilkan area yang sangat kecil (hanya 1 baris jam) saat dibuka di Safari iOS menggunakan URL production Vercel. Ini disebabkan oleh kalkulasi `h-[calc(100dvh-120px)]` yang gagal ketika address bar Safari muncul/hilang secara dinamis, sehingga Safari WebKit menci­utkan kontainer `flex` ke tinggi minimum-content.

**Solusi yang diterapkan (Hybrid Page-Scroll):**
- Hapus seluruh batas tinggi `h-[calc(100dvh-...)]` dari root container `Schedule.tsx`.
- Grid dibiarkan merentang ke tinggi alami konten (~1170px untuk jam 09:00–21:00).
- Scroll diserahkan ke level halaman (bukan container internal), sehingga tidak ada lagi ketergantungan pada kalkulasi viewport yang berubah-ubah.
- Header kapster diberi `sticky top-[64px] md:top-[72px] z-30` agar tetap terlihat saat halaman di-scroll, menempel tepat di bawah top bar aplikasi.
- Sel pojok kiri atas (perpotongan header kapster & sumbu waktu) diberi `sticky left-0 z-40` sebagai jangkar dua-arah.

### [UI/UX] Grid Daily View — Alignment Header & Kolom
**Commit:** `(terbaru)`
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
- Repo sempat punya API Express terpisah yang membuka `server/data.db` (SQLite lokal, skema `requests` berbeda dari tabel Supabase `whatsapp_requests`) lewat endpoint `GET/POST /requests` dan `PATCH /requests/:id`. Baik bot WhatsApp (`index.js`, yang menulis langsung ke Supabase) maupun frontend (yang membaca langsung dari Supabase) **tidak pernah memanggil API ini** — kemungkinan besar sisa scaffold awal sebelum bot ditulis ulang untuk langsung pakai Supabase.
- **Perbaikan:** Ketiga file dihapus, dependency `express`/`cors`/`better-sqlite3` yang hanya dipakai di sana juga dibuang dari `server/package.json`, dan `server/package-lock.json` diregenerasi (66 package terkait ikut terpangkas dari `node_modules`).

### Kode mati: `src/data/mockData.ts` diimpor tapi tidak pernah dipakai
**Status:** FIXED (dibersihkan).
- Data asli (termasuk `WhatsAppRequest`) sudah datang dari Supabase lewat backend nyata (`server/`), bukan dari `mockData.ts`. File itu ternyata hanya di-*import* di `App.tsx` tanpa pernah dipakai (*dead import*) — file dan import-nya sudah dihapus.

### Boilerplate AI Studio basi di root `.env.example`
**Status:** FIXED.
- Baris `GEMINI_API_KEY`/`APP_URL` (sisa boilerplate template AI Studio, tidak pernah dibaca di frontend manapun) sudah dibuang dari root `.env.example`. Key Gemini yang asli tetap hanya hidup di `server/.env` (backend). Root `.env.example` sekarang cuma berisi `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` yang memang dipakai `src/lib/supabaseClient.ts`.

---

## 🔴 Kritis (blocker fungsional)

### 1. Gagal Menghapus Kapster (Foreign Key Constraint `queue_entries`)
**Error Code:** `23503` (update or delete on table "barbers" violates foreign key constraint "queue_entries_barber_id_fkey" on table "queue_entries")
**Dampak:** Pengguna tidak bisa menghapus kapster dari *database* (Supabase/Postgres) jika kapster tersebut masih terkait/dijadikan referensi oleh data antrian (`queue_entries`).
**Solusi (Opsi Terpilih):** Menerapkan mekanisme **Soft Delete** (opsi 3 pada pembahasan sebelumnya) dengan mengubah status kapster menjadi `off` atau disembunyikan di UI, alih-alih menghapus baris dari *database*, untuk menjaga integritas riwayat antrian dan mencegah error.

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
- [ ] Demo ke kapster asli, kumpulkan feedback alur UX (lihat §10 PRD.md — belum divalidasi di lapangan)

---

## 🔵 Batasan Desain (By Design)

### 3. Barber Duty Status Edge Case
- **Kapster Berubah Status ke 'Off' Saat Sedang Melayani**: Saat ini, jika kapster memiliki sesi pelanggan yang sedang berjalan (di kursi aktif) dan statusnya diubah dari 'Active' menjadi 'Off' via menu Settings, sistem tidak akan secara otomatis menghentikan atau menghapus sesi tersebut. 
- **Perilaku (Behavior)**: Sesi akan dibiarkan tetap berjalan hingga selesai secara natural (hingga ditekan tombol 'Complete Session'). Ini adalah **keputusan desain yang sadar (by design)** untuk mencegah hilangnya data pelanggan yang terlanjur duduk di kursi secara tidak sengaja (misalnya karena salah klik), dan bukan merupakan bug yang terlewat.

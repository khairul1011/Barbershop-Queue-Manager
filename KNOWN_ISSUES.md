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

---

## 🔴 Kritis (blocker fungsional)

### 1. Hari "hari ini" di-hardcode sebagai `'Wed'`
**File:** `App.tsx` — `handleCompleteServing`, `handleAddWalkIn`, `handleAddBooking`

Fungsi-fungsi ini memfilter antrian dengan `queue.filter(q => q.day === 'Wed')` untuk menentukan "antrian hari ini", padahal `currentTime` (live clock) sudah ada di state dan tidak dipakai untuk ini.

**Dampak:** Aplikasi hanya berfungsi benar jika dijalankan hari Rabu. Di hari lain, customer baru akan masuk ke bucket `'Wed'` yang salah, dan antrian hari sebenarnya tidak ter-update.

**Perbaikan:** Ganti `'Wed'` dengan hasil kalkulasi dari `currentTime`, misal:
```ts
const todayKey = currentTime.toLocaleDateString('en-US', { weekday: 'short' }) as
  'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
```
lalu ganti semua literal `'Wed'` dengan `todayKey`.

---

### 2. Tidak ada backend — `express`/`dotenv` adalah dependency nganggur
**File:** `package.json`

Tidak ada `server.js` atau file backend apa pun di struktur repo. `express` dan `dotenv` tercantum sebagai dependency tapi tidak dipakai di mana pun.

**Dampak:** Tidak ada jalur untuk memanggil Gemini API dengan aman (server-side), dan tidak ada jalur integrasi WhatsApp sama sekali.

**Perbaikan:** Bangun `server.js` terpisah yang menjalankan `whatsapp-web.js` + endpoint untuk memanggil Gemini API, dijalankan di mesin/server milik pemilik sistem (tidak bisa jalan di AI Studio/hosting statis).

---

### 3. Tidak ada persistensi data
**File:** `App.tsx` (semua state pakai `useState` tanpa storage)

Refresh browser = seluruh antrian dan request kembali ke `mockData.ts`.

**Dampak:** Tidak bisa dipakai operasional harian sama sekali — data hilang kapan saja.

**Perbaikan minimal (Fase 1):** localStorage untuk single-device usage.
**Perbaikan jangka panjang:** backend database (misal Supabase free tier) begitu ada `server.js`.

---

## 🟡 Penting (belum blocker, tapi harus dikerjakan sebelum Fase 2)

### 4. `WhatsAppRequest` di `mockData.ts` adalah data karangan, bukan hasil parsing AI
Field `extractedDay`, `extractedTime`, `extractedService` di 4 entri mock sudah ditulis manual — tidak merepresentasikan bagaimana hasil ekstraksi Gemini API yang sebenarnya akan terlihat (termasuk kasus ambigu/gagal parsing).

**Dampak:** Tidak ada test case untuk skenario pesan ambigu tanpa jam sama sekali, atau pesan yang gagal di-parse.

**Rekomendasi:** Saat backend nyata dibangun, tambahkan mock/test case untuk pesan yang benar-benar ambigu (tanpa hari, tanpa jam, bahasa campur aduk) untuk memastikan fallback ke status "Pending Reply" atau folder review manual bekerja.

---

### 5. `.env.example` ada tapi tidak dipakai di kode manapun
Kemungkinan sisa boilerplate template AI Studio. Perlu dikonfirmasi ulang begitu `server.js` dibangun — pastikan API key Gemini **hanya** dibaca di server, tidak pernah masuk ke bundle client (`vite build` output).

---

## 🟢 Rendah (nice-to-have, bukan prioritas sekarang)

### 6. `handleAddWalkIn` — estimasi waktu mulai antrian jalan sederhana (gap tetap 15 menit)
Logika `startMinutes = ... + 15` antar walk-in mengasumsikan gap tetap 15 menit tanpa mempertimbangkan durasi servis sebelumnya secara akurat di semua kasus. Cukup untuk MVP, tapi perlu direview kalau kompleksitas antrian bertambah (multi-kapster paralel, dll).

---

## Checklist sebelum Fase 2 (backend) dimulai

- [ ] Perbaiki bug hardcode `'Wed'`
- [ ] Tambahkan persistensi minimal (localStorage)
- [ ] Demo ke kapster, kumpulkan feedback alur UX
- [ ] Konfirmasi `.gitignore` mengabaikan `.env.local` — pastikan API key asli tidak pernah ter-commit ke repo publik

---

## 🔵 Batasan Desain (By Design)

### 7. Barber Duty Status Edge Case
- **Kapster Berubah Status ke 'Off' Saat Sedang Melayani**: Saat ini, jika kapster memiliki sesi pelanggan yang sedang berjalan (di kursi aktif) dan statusnya diubah dari 'Active' menjadi 'Off' via menu Settings, sistem tidak akan secara otomatis menghentikan atau menghapus sesi tersebut. 
- **Perilaku (Behavior)**: Sesi akan dibiarkan tetap berjalan hingga selesai secara natural (hingga ditekan tombol 'Complete Session'). Ini adalah **keputusan desain yang sadar (by design)** untuk mencegah hilangnya data pelanggan yang terlanjur duduk di kursi secara tidak sengaja (misalnya karena salah klik), dan bukan merupakan bug yang terlewat.

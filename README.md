<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BarberFlow Queue Manager

BarberFlow adalah sebuah purwarupa (prototype) aplikasi _dashboard_ antrian barbershop modern yang dirancang untuk memecahkan masalah pencatatan manual pada barbershop skala kecil (1-3 kapster).

## 🚀 Latar Belakang & Fitur Utama

Banyak barbershop kecil kesulitan mengatur _booking_ via WhatsApp karena pelanggan sering kali memberikan jam yang ambigu, dan kapster kesulitan mencatat di sela-sela memotong rambut.

BarberFlow mengusung konsep manajemen cerdas:
- **Smart Queueing:** Memisahkan _booking_ dengan jam pasti (Confirmed) dan _walk-in_ (Estimated) dalam satu tampilan jadwal harian yang dinamis.
- **WhatsApp Request Parsing:** Bot WhatsApp (`whatsapp-web.js`) membaca pesan _booking_ masuk, meneruskannya ke Gemini API untuk mengekstrak nama/hari/jam/layanan secara terstruktur (termasuk bertanya balik lewat WA kalau jam belum disebutkan), lalu masuk ke dashboard sebagai _request_ yang tinggal di-_review_ dan _approve_ kapster.
- **One-Tap Operations:** Interaksi minimalis. Cukup satu _tap_ untuk memanggil pelanggan ("Mulai") dan mengakhiri sesi ("Selesai").
- **Mobile-First & Safari iOS Ready:** UI dioptimalkan untuk penggunaan harian via HP. Schedule Daily View menggunakan pola _Hybrid Page-Scroll_ yang terbukti berfungsi normal di Safari iOS tanpa grid kolaps.

## 🛠 Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Motion (Framer Motion)
- **Database:** Supabase (Postgres), dengan realtime subscription ke frontend — bukan localStorage.
- **Backend (`server/`):** Node.js — `whatsapp-web.js` untuk koneksi WhatsApp, Gemini API (`@google/genai`) untuk ekstraksi pesan, menulis langsung ke Supabase.

## 💻 Cara Menjalankan Secara Lokal

**Persiapan:** Pastikan Anda telah menginstal Node.js v18+.

### 1. Frontend (dashboard)

```bash
git clone https://github.com/khairul1011/Barbershop-Queue-Manager.git
cd Barbershop-Queue-Manager
npm install
cp .env.example .env.local
```

Isi `.env.local` dengan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari project Supabase Anda.

```bash
npm run dev
```

Aplikasi dapat diakses melalui browser di `http://localhost:3000/`.

### 2. Backend (bot WhatsApp + parsing Gemini)

Jalankan di terminal terpisah — ini proses Node.js yang berjalan terus-menerus (long-running), bukan bagian dari `npm run dev` di atas:

```bash
cd server
npm install
cp .env.example .env
```

Isi `server/.env` dengan `GEMINI_API_KEY`, `SUPABASE_URL`, dan `SUPABASE_ANON_KEY` (nilai Supabase-nya sama dengan yang dipakai frontend).

```bash
npm start
```

Scan QR code yang muncul di terminal dengan WhatsApp di HP Anda (Linked Devices). Sesi login tersimpan lokal di `.wwebjs_auth/`, jadi tidak perlu scan ulang setiap kali dijalankan.

## 📜 Dokumentasi Proyek
- [PRD.md](PRD.md): Dokumen Kebutuhan Produk (_Product Requirements Document_) lengkap.
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md): Daftar kendala teknis, bug yang sudah diselesaikan, dan item _backlog_ yang direncanakan.

---
_Proyek ini adalah eksperimen pribadi. UI dashboard dan backend (WhatsApp + Gemini + Supabase) sudah berjalan; tahap sekarang adalah validasi pemakaian harian oleh kapster asli — lihat KNOWN_ISSUES.md._
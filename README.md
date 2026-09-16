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

## 🏗 Arsitektur
Aplikasi ini memiliki dua runtime independen: frontend yang di-deploy di Vercel, dan backend (bot WhatsApp) yang berjalan di VPS Azure menggunakan PM2. Keduanya tidak saling memanggil secara langsung, melainkan dihubungkan melalui Supabase secara realtime. Webhook Xendit masuk melalui Cloudflare Tunnel langsung ke proses bot. Untuk detail arsitektur, lihat [CLAUDE.md](CLAUDE.md).

## 🛠 Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Motion (Framer Motion)
- **Database:** Supabase (Postgres), dengan realtime subscription ke frontend — bukan localStorage.
- **Backend (`server/`):** Node.js — `whatsapp-web.js` untuk koneksi WhatsApp, Gemini API (`@google/genai`) untuk ekstraksi pesan, menulis langsung ke Supabase.
- **Pembayaran:** Xendit (DP 50% via QRIS, mode test)
- **Hosting & Infra:** Vercel (Frontend), VPS Azure + PM2 (Backend), Cloudflare Tunnel (Webhook)

## 💻 Cara Menjalankan Secara Lokal

**Persiapan:** Node.js 22 (sama dengan versi yang dipakai CI).

### 1. Frontend (dashboard)

```bash
git clone https://github.com/khairul1011/Barbershop-Queue-Manager.git
cd Barbershop-Queue-Manager
npm install
cp .env.example .env.local
```

Isi `.env.local` dengan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari project Supabase yang dipakai. Kolaborator meminta nilainya ke Khairul lewat jalur privat (lihat [CONTRIBUTING.md](CONTRIBUTING.md)).

```bash
npm run dev
```

Aplikasi dapat diakses melalui browser di `http://localhost:3000/`.

**Perintah Pengembangan:**
- `npm run lint` (ESLint)
- `npm run typecheck` (TypeScript)
- `npm test` (Vitest)
- `npm run build` (Vite build)
- `cd server && npm test` (Testing backend)

### 2. Backend (bot WhatsApp + parsing Gemini)

> **⚠️ PERINGATAN PENTING:**
> JANGAN menggunakan nomor WhatsApp produksi atau menjalankan perintah ini terhadap database produksi di lokal. Dua bot yang berjalan pada nomor yang sama akan saling bertabrakan, dan perubahan di lokal akan langsung mengubah data pelanggan asli. Gunakan nomor WA terpisah dan database percobaan. Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk detailnya.

Jalankan di terminal terpisah — ini proses Node.js yang berjalan terus-menerus (long-running), bukan bagian dari `npm run dev` di atas:

```bash
cd server
npm install
cp .env.example .env
```

Isi `server/.env` (penjelasan tiap variabel ada di komentar `server/.env.example`):

- `GEMINI_API_KEY` dan `SUPABASE_URL` (sama dengan yang dipakai frontend).
- `SUPABASE_SERVICE_ROLE_KEY` — **wajib**. RLS di semua tabel sudah menutup akses `anon`, sehingga bot yang hanya menggunakan `SUPABASE_ANON_KEY` tidak dapat membaca atau menulis data booking.
- `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`, `WEBHOOK_PORT` — dibutuhkan alur DP 50% via QRIS (bot membuat QR pembayaran sebelum booking masuk dashboard).
- `DEMO_SECRET`, `DASHBOARD_ORIGINS` — untuk halaman demo `/demo` dan CORS endpoint pembayaran yang dipanggil dashboard.

```bash
npm start
```

Scan QR code yang muncul di terminal memakai aplikasi WhatsApp di HP (menu Perangkat Tertaut / Linked Devices). Sesi login tersimpan lokal di `.wwebjs_auth/`, jadi tidak perlu scan ulang setiap kali dijalankan.

## 📜 Dokumentasi Proyek
- [PROJECT.md](PROJECT.md): Dokumen Kebutuhan Produk (_PRD_) + daftar kendala teknis (_known issues_) — digabung menjadi satu agar tidak tersebar.
- [CLAUDE.md](CLAUDE.md): Panduan teknis untuk AI coding agent yang bekerja di repo ini — arsitektur, gotcha kode, cara deploy.
- [CONTRIBUTING.md](CONTRIBUTING.md): Panduan kontribusi, aturan main, dan alur kerja repositori.
- [n8n-stack/README.md](n8n-stack/README.md): Dokumentasi untuk eksperimen bot menggunakan n8n dan WAHA.

## 🤝 Kontribusi & Deploy
Setiap perubahan yang di-merge ke branch `main` akan langsung di-deploy ke produksi. Silakan baca [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan lengkap sebelum berkontribusi.

---
_Proyek ini adalah eksperimen pribadi. UI dashboard dan backend (WhatsApp + Gemini + Supabase) sudah berjalan; tahap sekarang adalah validasi pemakaian harian oleh kapster asli — lihat [PROJECT.md](PROJECT.md)._
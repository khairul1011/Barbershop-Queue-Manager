<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BarberFlow Queue Manager

BarberFlow adalah sebuah purwarupa (prototype) aplikasi _dashboard_ antrian barbershop modern yang dirancang untuk memecahkan masalah pencatatan manual pada barbershop skala kecil (1-3 kapster).

## 🚀 Latar Belakang & Fitur Utama

Banyak barbershop kecil kesulitan mengatur _booking_ via WhatsApp karena pelanggan sering kali memberikan jam yang ambigu, dan kapster kesulitan mencatat di sela-sela memotong rambut.

BarberFlow mengusung konsep manajemen cerdas:
- **Smart Queueing:** Memisahkan _booking_ dengan jam pasti (Confirmed) dan _walk-in_ (Estimated) dalam satu tampilan jadwal harian yang dinamis.
- **WhatsApp Request Parsing:** Bot WhatsApp membaca pesan _booking_ masuk, mengekstrak nama/hari/jam/layanan secara terstruktur lewat AI (termasuk bertanya balik lewat WA kalau jam belum disebutkan), lalu memasukkannya ke dashboard sebagai _request_ yang tinggal di-_review_ dan _approve_ kapster.
- **One-Tap Operations:** Interaksi minimalis. Cukup satu _tap_ untuk memanggil pelanggan ("Mulai") dan mengakhiri sesi ("Selesai").
- **Mobile-First & Safari iOS Ready:** UI dioptimalkan untuk penggunaan harian via HP. Schedule Daily View menggunakan pola _Hybrid Page-Scroll_ yang terbukti berfungsi normal di Safari iOS tanpa grid kolaps.

## 🛠 Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Motion (Framer Motion)
- **Database:** Supabase (Postgres), dengan realtime subscription ke frontend — bukan localStorage.
- **Bot WhatsApp (produksi):** workflow n8n + WAHA (jembatan WhatsApp non-resmi), menulis langsung ke Supabase. Workflow-nya belum tersimpan di repo ini — lihat [n8n-stack/README.md](n8n-stack/README.md).
- **Bot WhatsApp lama (`server/`, sudah dimatikan):** Node.js — `whatsapp-web.js` + Gemini API (`@google/genai`). Disimpan sebagai referensi, bukan yang melayani pelanggan sekarang.

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

### 2. Bot WhatsApp lama (`server/`, opsional)

> Bot ini **sudah tidak dipakai di produksi** (diganti n8n + WAHA). Jalankan hanya untuk eksperimen lokal, dan **jangan pakai nomor WhatsApp yang sedang dipakai bot produksi** — dua bot di satu nomor akan saling rebut sesi dan membalas pelanggan dobel.

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
- [PROJECT.md](PROJECT.md): Dokumen Kebutuhan Produk (_PRD_) + daftar kendala teknis (_known issues_) — digabung jadi satu biar nggak berserakan.
- [CLAUDE.md](CLAUDE.md): Panduan teknis untuk AI coding agent yang kerja di repo ini — arsitektur, gotcha kode, cara deploy.

---
_Proyek ini adalah eksperimen pribadi. UI dashboard dan bot WhatsApp (n8n + WAHA + Supabase) sudah berjalan; tahap sekarang adalah validasi pemakaian harian oleh kapster asli — lihat [PROJECT.md](PROJECT.md)._
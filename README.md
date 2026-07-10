<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BarberFlow Queue Manager

BarberFlow adalah sebuah purwarupa (prototype) aplikasi _dashboard_ antrian barbershop modern yang dirancang untuk memecahkan masalah pencatatan manual pada barbershop skala kecil (1-3 kapster).

## 🚀 Latar Belakang & Fitur Utama

Banyak barbershop kecil kesulitan mengatur _booking_ via WhatsApp karena pelanggan sering kali memberikan jam yang ambigu, dan kapster kesulitan mencatat di sela-sela memotong rambut.

BarberFlow mengusung konsep manajemen cerdas:
- **Smart Queueing:** Memisahkan _booking_ dengan jam pasti (Confirmed) dan _walk-in_ (Estimated) dalam satu tampilan jadwal harian yang dinamis.
- **WhatsApp Request Parsing (Roadmap):** Membaca pesan _booking_ via WA, lalu menggunakan Gemini API untuk mengekstrak hari, jam, dan layanan secara terstruktur sehingga kapster cukup me-_review_ dan _approve_.
- **One-Tap Operations:** Interaksi minimalis. Cukup satu _tap_ untuk memanggil pelanggan ("Mulai") dan mengakhiri sesi ("Selesai").
- **Local Persistence:** Data antrian yang sedang berjalan saat ini disimpan dengan aman di _localStorage_ browser.

## 🛠 Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Motion (Framer Motion)
- **Backend (Roadmap Fase 2):** Node.js / Express untuk Whatsapp-web.js dan pemanggilan Gemini AI API.

## 💻 Cara Menjalankan Secara Lokal

**Persiapan:** Pastikan Anda telah menginstal Node.js v18+.

1. **Kloning Repositori & Instalasi Dependensi**
   ```bash
   git clone https://github.com/khairul1011/Barbershop-Queue-Manager.git
   cd Barbershop-Queue-Manager
   npm install
   ```

2. **Konfigurasi Environment**
   Salin file konfigurasi lingkungan:
   ```bash
   cp .env.example .env.local
   ```
   Buka file `.env.local` dan masukkan `GEMINI_API_KEY` Anda (akan diperlukan saat backend AI dijalankan di fase selanjutnya).

3. **Jalankan Aplikasi**
   ```bash
   npm run dev
   ```
   Aplikasi dapat diakses melalui browser di `http://localhost:3000/`.

## 📜 Dokumentasi Proyek
- [PRD.md](PRD.md): Dokumen Kebutuhan Produk (_Product Requirements Document_) lengkap.
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md): Daftar kendala, bug, dan _roadmap_ yang direncanakan.

---
_Proyek ini adalah eksperimen pribadi dan masih dalam tahap pengembangan (Fase 1)._
# Panduan Kontribusi

Sebelum memulai: kredensial (`.env` frontend, akun login dashboard) diminta ke Khairul lewat jalur privat, bukan lewat issue/PR. Baca `README.md` dan bagian area rapuh di `CLAUDE.md` (khususnya `Schedule.tsx` dan penjaga pesan dobel di `server/index.js`) sebelum mengubah file tersebut.

## Alur Kerja

1. Buat branch dari `main` dengan awalan `feat/`, `fix/`, `docs/`, atau `chore/`.
2. Buka Pull Request (PR) ke `main`.
3. Pastikan semua CI hijau dan mendapatkan minimal 1 approval.
4. Merge akan menggunakan metode squash merge.
5. Push langsung ke `main` diblokir oleh ruleset.

**Penting:** Merge ke `main` sama dengan deploy ke produksi (Vercel untuk frontend; ditambah restart bot WhatsApp di VPS jika menyentuh `server/**` atau workflow deploy).

## Format Commit dan Judul PR

Gunakan conventional commits berbahasa Indonesia: `tipe(scope): ringkasan`. Tipe yang dipakai di repo ini: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`. Scope bersifat opsional dan menunjuk area yang diubah (mis. `bot`, `ui`, `history`, `dashboard`). Contoh dari riwayat commit:
- `fix(bot): peringatan booking ganda kepicu baris basi berumur berhari-hari`
- `feat(n8n-stack): stack eksperimen n8n + Evolution API`

## Sebelum Membuka PR

Jalankan perintah berikut di lokal:
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Jika menyentuh direktori `server/`, jalankan juga `cd server && npm test`.

## Data & Keamanan

- **Satu Database:** Database Supabase hanya satu dan berisi data pelanggan asli. Frontend lokal pun terhubung ke database produksi. Hati-hati dengan aksi tulis/hapus saat mencoba di lokal.
- **Bot WhatsApp:** JANGAN menjalankan `server/` (bot) di lokal dengan nomor WhatsApp produksi atau terhadap database produksi. Dua bot di satu nomor akan sama-sama membalas customer (pernah terjadi: balasan dobel), dan bot lokal menulis ke data asli. Pekerjaan bot butuh nomor WA terpisah + project Supabase terpisah (lihat [Menyiapkan Project Supabase Dev](#menyiapkan-project-supabase-dev)) + GEMINI_API_KEY dan Xendit test key sendiri.
- **Repo Publik:** Repo ini bersifat publik. Issue, PR, dan komentar bisa dibaca siapa pun. Jangan tempel log produksi, nomor HP pelanggan, atau screenshot dashboard berisi data asli.
- **Environment:** Jangan commit file `.env` apa pun.

## Menyiapkan Project Supabase Dev

Dibutuhkan untuk pekerjaan bot atau untuk mencoba perubahan yang menulis data tanpa menyentuh data pelanggan asli.

1. Buat project baru di [supabase.com](https://supabase.com) (free tier cukup).
2. Buka **SQL Editor**, tempel dan jalankan seluruh isi `supabase/migrations/20260916000000_baseline_schema.sql`, lalu jalankan file migrasi lain di folder itu (kalau ada) berurutan sesuai nama file.
3. Jalankan `INSERT INTO public.business_hours DEFAULT VALUES;` — dashboard hanya meng-update baris `id = 1`, tidak pernah membuatnya.
4. Buka **Authentication → Users → Add user**, buat user email + password untuk login dashboard.
5. Ambil URL dan key dari **Project Settings → API** project dev tersebut: isi `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` di `.env.local`, dan kalau menjalankan bot, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` di `server/.env`.
6. Jalankan `npm run dev`, login, lalu tambahkan kapster dan layanan lewat menu **Pengaturan**.

## Perubahan Skema Database

Wajib berupa file SQL baru di `supabase/migrations/` dalam PR yang sama dengan kode yang membutuhkannya. File migrasi diterapkan ke produksi hanya oleh Khairul setelah PR di-merge. File baseline tidak boleh dijalankan ke produksi.

## Bahasa dan AI

- String UI baru menggunakan bahasa Indonesia lewat `src/i18n/`. Dokumentasi dan balasan bot juga dalam Bahasa Indonesia.
- AI coding agent (Claude Code, Antigravity, dll) wajib mengikuti `CLAUDE.md` dan aturan yang sama di atas.

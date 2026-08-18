# CLAUDE.md

File ini kasih panduan ke Claude Code (claude.ai/code) saat kerja di kode dalam repo ini.

Untuk requirements produk & known issues, lihat [PROJECT.md](PROJECT.md). Untuk instruksi setup, lihat [README.md](README.md).

## Perintah

**Frontend** (direktori root):
```bash
npm run dev      # Dev server Vite di port 3000, host 0.0.0.0
npm run build    # Production build (vite build)
npm run lint      # Cuma type-check — tsc --noEmit (nggak ada ESLint)
```
Nggak ada test suite untuk frontend.

**Backend** (`server/` — `package.json`/`node_modules` terpisah, bukan workspace):
```bash
cd server && npm start   # node index.js — proses bot WhatsApp yang jalan terus-menerus (long-running)
```
Juga nggak ada test suite di sini (`npm test` cuma placeholder).

## Arsitektur

**Dua runtime independen, satu database Supabase yang dipakai bareng:**
1. **Frontend** (`src/`) — React 19 + Vite + TypeScript, di-deploy ke Vercel. Ngobrol langsung ke Supabase dari browser (`src/lib/supabaseClient.ts`); nggak ada lapisan REST API di antaranya.
2. **Backend** (`server/`) — proses Node.js mandiri (`index.js`) yang menjalankan `whatsapp-web.js` (otomasi WhatsApp Web nggak resmi berbasis Puppeteer, bukan Business API berbayar). Dia baca pesan WhatsApp masuk, ekstrak niat booking lewat Gemini (`gemini.js`, `@google/genai`), lalu nulis langsung ke tabel Supabase `whatsapp_requests` lewat `supabaseClient.js`. Dia nggak pernah ngobrol ke frontend atau sebaliknya — realtime subscription Supabase adalah satu-satunya penghubung antara kedua runtime ini. Di-deploy ke VPS Azure, dikelola PM2 (nama proses `barberflow-wa`), auto-deploy lewat `.github/workflows/deploy-backend.yml` tiap push ke `main` yang nyentuh `server/**`.

**Lapisan data frontend:** tiap hook domain (`src/hooks/useSupabase*.ts`) punya satu tabel Supabase sendiri (`queue_entries`, `whatsapp_requests`, `barbers`, `services`, `business_hours`) dan bikin realtime subscription-nya sendiri (`supabase.channel(...).on('postgres_changes', ...)`) — nggak ada central store. `useSupabaseQueue.ts` jalanin dua query terpisah (entri aktif dalam jendela ±7 hari, entri selesai tanpa batas hingga 1000 baris) alih-alih satu query, supaya tampilan History/kalender nggak kepotong artifisial. `useLocalStorageState` sekarang cuma dipakai untuk preferensi bahasa UI, bukan data domain — jangan balikin localStorage jadi data store lagi, Supabase adalah satu-satunya sumber kebenaran.

**Primitif UI** (`src/components/ui/`) ngikutin pola shadcn/ui (Radix UI + `class-variance-authority` + `cn()` dari `src/lib/utils.ts`), tapi project ini nggak punya `components.json` dan nggak pernah di-inisialisasi lewat `npx shadcn add` — primitif baru di-port manual dari clone referensi, bukan ditarik lewat CLI. Tailwind v4 di sini CSS-first: semua token (palet warna OKLCH, skala radius) ada di blok `@theme` dalam `src/index.css`, nggak ada `tailwind.config.js`. Warna status (badge status antrian, tipe toast) sengaja dikecualikan dari palet token netral — mereka punya makna semantik dan harus tetap khas/berwarna; jangan diratain ke sistem token abu-abu pas restyle.

**`src/components/Schedule.tsx` adalah file paling rapuh di codebase ini.** Dia render tiga tampilan (Daily/Weekly/Monthly) untuk grid antrian per-kolom-kapster. Beberapa mekanisme di sini krusial dan gampang rusak kalau di-refactor sembarangan:
- Konstanta `PIXELS_PER_MINUTE` menentukan semua matematika posisi vertikal time-slot — jangan hardcode nilai piksel lain yang seharusnya ikut skala ini.
- Root Daily view **sengaja nggak dikasih batas tinggi** (commit `ca5713e`) — seluruh halaman yang scroll, bukan container internal, karena Safari iOS mengciutkan container `h-[calc(100dvh-...)]` saat address bar muncul/hilang. Nambahin batas tinggi lagi di sini bakal munculin bug itu lagi.
- Tiap kapster punya satu kolom gabungan header+grid (bukan row header terpisah + row grid) — ini yang menjamin alignment kolom; jangan dipisah lagi.
- Tab kapster mobile (`sticky top-[64px] md:top-[72px]`) dan sumbu waktu (`sticky left-0`) punya offset hardcode yang harus persis sama dengan tinggi header shell aplikasi (top bar mobile di `App.tsx` itu `h-[64px]`, header desktop `min-h-[72px]`). Kalau ubah tinggi salah satu header, update juga offset-offset ini.
- `getStatusBadgeStyles()` adalah satu-satunya sumber kebenaran untuk styling warna status di ketiga tampilan — jangan duplikasi logika warna status di tempat lain.
- `<div>` pembungkus apa pun yang ditaruh di antara elemen sticky ini dan scroll container-nya jangan pakai `overflow-hidden` — itu diam-diam merusak `position: sticky` untuk descendant-nya, walaupun ancestor itu sendiri nggak pernah scroll. Kalau wrapper card butuh rounded corner, bulatkan langsung child yang non-sticky-nya (lihat cara card Daily-view melakukan ini).

**Penanganan pesan di `server/index.js`:** `conversationState` dan `chatHistory` itu `Map` di memori, ke-wipe tiap kali proses restart. `whatsapp-web.js` nge-sync ulang pesan terbaru/belum-dibaca pas sesi reconnect, jadi tanpa dijaga, restart bakal ngulang proses pesan lama lewat seluruh pipeline Gemini lagi — ini pernah beneran bikin balasan dobel ke customer. Fix yang sudah diterapkan: pesan yang lebih tua dari `BOT_START_TIME` (waktu proses mulai) di-skip, dan ID pesan yang udah diproses dilacak sebagai jaring pengaman kedua. Pertahankan kedua penjagaan ini kalau nyentuh file ini. Balasan juga lewat `replyAndSaveHistory()`, yang nambahin jeda ala-manusia acak sebelum ngirim — jangan bypass ini dengan manggil `msg.reply()` langsung, ntar balasannya kelihatan instan-kayak-bot lagi.

## Konvensi bahasa & komunikasi

Dokumentasi project dan balasan bot yang user-facing pakai Bahasa Indonesia; jaga string UI baru dan update dokumentasi tetap konsisten sama itu (lihat `src/i18n/`).

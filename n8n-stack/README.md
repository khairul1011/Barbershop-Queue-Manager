# Stack Eksperimen n8n + Evolution API

Versi eksperimen dari bot booking WhatsApp, dibangun dengan n8n (orkestrasi
alur + AI) dan Evolution API (jembatan WhatsApp non-resmi berbasis Baileys).

Stack ini **terpisah penuh** dari bot produksi di `server/`. Bot produksi tetap
berjalan di VPS Azure dan terus melayani booking pelanggan; stack ini berjalan
di server lain sehingga eksperimen tidak dapat mengganggu operasional.

## Perbandingan dengan bot produksi

| | `server/` (produksi) | Stack ini (eksperimen) |
|---|---|---|
| Jembatan WhatsApp | `whatsapp-web.js` + Puppeteer (Chromium) | Evolution API (Baileys, tanpa browser) |
| Logika booking | Kode Node.js | Alur visual n8n |
| Parsing pesan | Gemini via `services/gemini.js` | Node AI n8n |
| Penyimpanan | Supabase | Supabase (sama) |

## Prasyarat server

- Arsitektur ARM64 atau AMD64 (kedua image mendukung keduanya, sudah diverifikasi)
- RAM minimal 2 GB, disarankan 4 GB ke atas
- Docker dan Docker Compose terpasang
- Cloudflare Tunnel untuk akses publik (tidak ada port masuk yang dibuka)

## Cara menjalankan

```bash
cp .env.example .env
```

Isi `.env`. Untuk nilai acak:

```bash
openssl rand -hex 32
```

Jalankan stack:

```bash
docker compose up -d
```

Cek status:

```bash
docker compose ps
docker compose logs -f
```

## Akses

Seluruh port hanya di-bind ke `127.0.0.1`, jadi tidak bisa diakses langsung
dari internet. Akses publik lewat Cloudflare Tunnel dengan ingress:

| Hostname | Service lokal |
|---|---|
| `n8n.takhtabarber.shop` | `http://localhost:5678` |
| `evo.takhtabarber.shop` | `http://localhost:8080` |

Manager Evolution API tersedia di `https://evo.takhtabarber.shop/manager`,
dan login memakai `EVOLUTION_API_KEY`.

## Catatan penting

- **`N8N_ENCRYPTION_KEY` jangan diubah** setelah ada kredensial tersimpan di
  n8n. Mengubahnya membuat seluruh kredensial lama tidak dapat dibaca.
- **`EVOLUTION_API_KEY` adalah satu-satunya pelindung Evolution API.** Siapa pun
  yang memilikinya dapat mengirim pesan atas nama nomor WhatsApp yang
  tersambung. Wajib acak dan panjang.
- Gunakan **nomor WhatsApp berbeda** dari bot produksi selama masa eksperimen,
  agar dua bot tidak saling berebut sesi pada nomor yang sama.
- Pertimbangkan memakai project Supabase terpisah untuk eksperimen, supaya data
  booking percobaan tidak bercampur dengan data pelanggan asli.

## Logika yang perlu dipindahkan

Bot produksi memuat sejumlah penjagaan yang lahir dari insiden nyata. Saat
membangun ulang alurnya di n8n, penjagaan berikut sebaiknya ikut dipindahkan —
seluruhnya terdokumentasi di `server/services/bookingDomain.js` dan
`server/index.js`:

1. **Zona waktu WIB** — server berjalan pada UTC; perhitungan "hari ini"/"besok"
   harus digeser +7 jam, jika tidak tanggalnya mundur satu hari selama
   17:00-23:59 UTC.
2. **Guard halusinasi hari** — nilai `hari` dari model AI hanya dipercaya bila
   pesan asli benar-benar menyebut kata terkait hari.
3. **Guard halusinasi kapster** — saat pelanggan hanya membalas "ya", pakai
   kapster yang sudah disetujui sebelumnya, bukan hasil parsing ulang.
4. **Serialisasi cek-lalu-simpan** — dua pelanggan yang konfirmasi bersamaan
   dapat teralokasi ke kapster yang sama. Di n8n perlu penguncian tingkat
   database, karena eksekusi alur bisa berjalan paralel.
5. **Filter kapster archived** — kapster yang sudah dihapus tidak boleh ikut
   terhitung sebagai pilihan yang tersedia.
6. **Dedup pesan saat restart** — jembatan WhatsApp dapat mengirim ulang pesan
   lama ketika sesi tersambung kembali.
7. **Tanggal absolut, bukan relatif** — simpan tanggal hasil resolusi di
   database. Menyimpan string relatif ("besok") lalu menerjemahkannya ulang saat
   query membuat baris lama ikut cocok selamanya.

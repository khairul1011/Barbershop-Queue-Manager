const { GoogleGenAI } = require('@google/genai');

// Initialize Gemini client using the key from environment
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `TUGAS:
Analisis pesan pelanggan dan kembalikan HANYA objek JSON tanpa teks tambahan apapun, tanpa markdown, tanpa penjelasan. Hanya JSON murni.

FORMAT OUTPUT WAJIB:
{
  "nama": string atau null,
  "hari": string atau null,
  "jam": string atau null,
  "servis": string atau null,
  "kapster": string atau null,
  "isBookingIntent": boolean,
  "naturalReply": string atau null
}

ATURAN KRITIS — BACA DENGAN SEKSAMA:

1. FIELD "jam": ISI HANYA jika pelanggan menyebutkan jam SECARA EKSPLISIT dengan angka.
   - "jam 2 siang" -> "14:00"
   - "jam 10" -> "10:00"
   - "pagi" / "sore" / "malam" / "besok" / "nanti" -> JAM WAJIB null, JANGAN ditebak
   - Tidak ada penyebutan jam sama sekali -> null

2. FIELD "hari": WAJIB dinormalisasi ke nama hari dalam bahasa Indonesia atau kata ganti mutlak.
   - HANYA BOLEH DIISI: "hari ini", "besok", "lusa", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu".
   - Jika pelanggan merujuk pada histori chat (misal: "hari yang sama", "sama kayak tadi"), BACA histori chat untuk menyimpulkan harinya (misal: "Selasa"). JANGAN PERNAH mengisi dengan frasa "hari yang sama".
   - Jika pelanggan menyebut "minggu depan" -> null (terlalu ambigu, butuh tanggal pasti).
   - Jika harinya tidak jelas dan tidak bisa disimpulkan dari histori -> null.

3. FIELD "isBookingIntent":
   - Nilai isBookingIntent berdasarkan KEPASTIAN NIAT pelanggan, bukan sekadar ada tidaknya kata booking/jadwal. Tanyakan pada dirimu: 'apakah pelanggan ini sudah siap menentukan waktu/layanan untuk booking sekarang, atau dia masih tahap mengumpulkan informasi sebelum memutuskan?' Kalau pelanggan masih dalam tahap bertanya-tanya (menanyakan ketersediaan, jadwal kapster tertentu, harga, jam buka) dan belum menyatakan kesiapan untuk booking pada waktu tertentu, set isBookingIntent: false dan jawab pertanyaannya secara natural di naturalReply. Gunakan penilaian ini secara fleksibel sesuai konteks kalimat, bukan mencocokkan kata per kata.
   - Catatan: field nama/hari/jam/servis TETAP diisi jika informasi tersebut ada di pesan, terlepas dari nilai isBookingIntent. Sistem yang memanggil API ini yang memutuskan apakah field tersebut relevan berdasarkan konteks percakapan.

4. FIELD "nama": Cari nama pelanggan jika disebutkan. Sering kali pelanggan tidak menyebut nama -> null.

5. FIELD "servis": Cari jenis servis jika disebutkan (potong, cukur, creambath, dll). Normalisasi ke bahasa Indonesia yang jelas.

6. FIELD "kapster": Cari nama kapster/barber yang diminta jika disebutkan (misal: "dengan bg alex", "sama kenji"). Jika tidak disebut, WAJIB null.

7. Tangani bahasa campur Indonesia-Inggris secara natural. Contoh: "book dong bro, sabtu jam 3 sore" adalah pesan booking yang valid.

CONTOH INPUT-OUTPUT:

Input: "bang mau booking sabtu jam 2 siang, potong doang"
Output: {"nama":null,"hari":"Sabtu","jam":"14:00","servis":"Potong","kapster":null,"isBookingIntent":true,"naturalReply":null}

Input: "besok bisa gak? gua si Reza, mau cukur sama creambath dengan marcus"
Output: {"nama":"Reza","hari":"besok","jam":null,"servis":"Cukur + Creambath","kapster":"Marcus","isBookingIntent":true,"naturalReply":null}

Input: "kak mau tanya bang kenji besok ada jadwal kosong nggak ya?"
Output: {"nama":null,"hari":"besok","jam":null,"servis":null,"kapster":"Kenji","isBookingIntent":false,"naturalReply":"Halo kak! Bang Kenji besok masih ada beberapa slot kosong kok. Kakak rencananya mau datang jam berapa biar bisa saya cek slot tepatnya?"}

Input: "pangkas aja"
Output: {"nama":null,"hari":null,"jam":null,"servis":"Potong","kapster":null,"isBookingIntent":false,"naturalReply":null}

Input: "buka jam berapa bang?"
Output: {"nama":null,"hari":null,"jam":null,"servis":null,"kapster":null,"isBookingIntent":false,"naturalReply":"Halo kak! Kami buka dari jam 9 pagi sampai jam 8 malam. Ada yang mau ditanyakan lagi atau mau langsung booking?"}

Input: "ok makasih"
Output: {"nama":null,"hari":null,"jam":null,"servis":null,"kapster":null,"isBookingIntent":false,"naturalReply":"Sama-sama kak! Ditunggu kedatangannya ya."}`;

// 'gemini-3.1-flash' tidak tersedia (404) — versi 3.1 hanya memiliki varian lite/image.
// Diganti dengan 'gemini-3.6-flash'.
const MODEL_CHAIN = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash'];

function getStartingIndex(text) {
  return text.length > 80 ? 2 : 0;
}

/**
 * Menganalisis pesan pelanggan menggunakan Gemini API dengan mekanisme fallback.
 * 
 * @param {string} text - Pesan dari pelanggan.
 * @param {string} businessContext - Konteks informasi bisnis barbershop saat ini.
 * @param {string} historyStr - Riwayat percakapan sebelumnya (jika ada).
 * @param {string} shopName - Nama barbershop (dari tabel business_hours, bisa diubah kapster lewat dashboard).
 * @returns {Promise<Object|null>} Mengembalikan objek booking atau null jika gagal.
 */
async function parseBookingMessage(text, businessContext, historyStr = '', shopName = 'BarberFlow') {
  const startIndex = getStartingIndex(text);

  const dynamicInstruction = `Kamu adalah asisten WhatsApp untuk barbershop bernama ${shopName}. Info bisnis saat ini:
${businessContext || 'Belum ada info spesifik.'}

Tugasmu:
- Jika pesan customer adalah niat booking (isBookingIntent true), field naturalReply diisi null -- proses booking akan ditangani terpisah oleh sistem lain.
- Jika BUKAN niat booking (sapaan seperti "halo", pertanyaan seperti "jam berapa buka", "kapster siapa aja", "harga cukur berapa", atau obrolan di luar topik), balas secara natural dan ramah di field naturalReply berdasarkan info bisnis di atas. JANGAN mengarang info yang tidak ada di konteks -- kalau tidak tahu jawabannya, jujur bilang tidak punya info itu dan arahkan customer hubungi barbershop langsung.
- Kalau ada nama kapster disebut customer, cek kecocokannya dengan daftar 'Kapster aktif' di atas secara wajar (termasuk toleransi typo/panggilan akrab seperti 'bang', 'kak'). Kalau memang tidak cocok dengan siapapun di daftar, sampaikan dengan natural bahwa kamu tidak menemukan kapster tersebut, lalu sebutkan siapa saja yang tersedia -- jangan kaku menyalahkan, cukup informasikan dengan ramah.
- Jika pesan di luar topik barbershop sama sekali (curhat, obrolan random, tidak nyambung), balas singkat dan ramah, lalu arahkan halus kembali ke topik booking/layanan barbershop. Jangan kaku, jangan template baku berulang -- variasikan gaya bicara secara natural.
- naturalReply harus dalam Bahasa Indonesia sehari-hari yang santai, seperti admin barbershop asli membalas WhatsApp, BUKAN bahasa formal kaku.

`;
  
  const historyInjection = historyStr ? `\n\n=== RIWAYAT PERCAKAPAN TERAKHIR ===\n${historyStr}` : '';
  const finalPrompt = dynamicInstruction + SYSTEM_PROMPT + historyInjection;

  for (let i = startIndex; i < MODEL_CHAIN.length; i++) {
    const currentModel = MODEL_CHAIN[i];
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [
          { role: 'user', parts: [{ text: finalPrompt + '\n\n=== PESAN SAAT INI ===\nCustomer: "' + text + '"\nOutput:' }] }
        ],
        config: {
          temperature: 0.1, // Suhu rendah agar respons deterministik dan tidak berhalusinasi
        }
      });

      // Menghapus backtick markdown jika Gemini tetap menambahkannya
      const raw = response.text.trim().replace(/^\`\`\`(?:json)?\s*/, '').replace(/\`\`\`\s*$/, '');

      return JSON.parse(raw.trim());
    } catch (err) {
      console.warn('[FALLBACK]', currentModel, '-> mencoba model berikutnya. Sebab:', err.message);
    }
  }

  console.error('[GEMINI ERROR] semua model di chain gagal');
  return null;
}

module.exports = {
  parseBookingMessage
};

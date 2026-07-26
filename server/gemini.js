const { GoogleGenAI } = require('@google/genai');

// Initialize Gemini client using the key from environment
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `Kamu adalah asisten yang bertugas mengekstrak informasi booking dari pesan WhatsApp pelanggan barbershop.

TUGAS:
Analisis pesan pelanggan dan kembalikan HANYA objek JSON tanpa teks tambahan apapun, tanpa markdown, tanpa penjelasan. Hanya JSON murni.

FORMAT OUTPUT WAJIB:
{
  "nama": string atau null,
  "hari": string atau null,
  "jam": string atau null,
  "servis": string atau null,
  "isBookingIntent": boolean
}

ATURAN KRITIS — BACA DENGAN SEKSAMA:

1. FIELD "jam": ISI HANYA jika pelanggan menyebutkan jam SECARA EKSPLISIT dengan angka.
   - "jam 2 siang" -> "14:00"
   - "jam 10" -> "10:00"
   - "pagi" / "sore" / "malam" / "besok" / "nanti" -> JAM WAJIB null, JANGAN ditebak
   - Tidak ada penyebutan jam sama sekali -> null

2. FIELD "hari": Normalisasi ke nama hari dalam bahasa Indonesia.
   - "besok" -> evaluasi relatif dari konteks, tapi jika tidak ada konteks tanggal, isi "besok" saja
   - "minggu depan" -> null (terlalu ambigu)
   - "senin" / "selasa" / "senin depan" -> isi nama hari yang dimaksud

3. FIELD "isBookingIntent": true HANYA jika pesan jelas menunjukkan niat untuk booking/janji/datang.
   - Pertanyaan saja ("ada promo?", "buka jam berapa?") -> false
   - Pesan random/salah kirim -> false

4. FIELD "nama": Cari nama pelanggan jika disebutkan. Sering kali pelanggan tidak menyebut nama -> null.

5. FIELD "servis": Cari jenis servis jika disebutkan (potong, cukur, creambath, dll). Normalisasi ke bahasa Indonesia yang jelas.

6. Tangani bahasa campur Indonesia-Inggris secara natural. Contoh: "book dong bro, sabtu jam 3 sore" adalah pesan booking yang valid.

CONTOH INPUT-OUTPUT:

Input: "bang mau booking sabtu jam 2 siang, potong doang"
Output: {"nama":null,"hari":"Sabtu","jam":"14:00","servis":"Potong","isBookingIntent":true}

Input: "besok bisa gak? gua si Reza, mau cukur sama creambath"
Output: {"nama":"Reza","hari":"besok","jam":null,"servis":"Cukur + Creambath","isBookingIntent":true}

Input: "buka jam berapa bang?"
Output: {"nama":null,"hari":null,"jam":null,"servis":null,"isBookingIntent":false}

Input: "ok makasih"
Output: {"nama":null,"hari":null,"jam":null,"servis":null,"isBookingIntent":false}`;

/**
 * Menganalisis pesan pelanggan menggunakan Gemini API.
 * 
 * @param {string} text - Pesan dari pelanggan.
 * @returns {Promise<Object|null>} Mengembalikan objek booking atau null jika gagal.
 */
async function parseBookingMessage(text) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\\n\\nInput: "' + text + '"\\nOutput:' }] }
      ],
      config: {
        temperature: 0.1, // Suhu rendah agar respons deterministik dan tidak berhalusinasi
      }
    });

    let raw = response.text.trim();
    
    // Menghapus backtick markdown jika Gemini tetap menambahkannya
    if (raw.startsWith('\`\`\`json')) {
      raw = raw.replace(/^\`\`\`json/, '');
    }
    if (raw.startsWith('\`\`\`')) {
      raw = raw.replace(/^\`\`\`/, '');
    }
    if (raw.endsWith('\`\`\`')) {
      raw = raw.replace(/\`\`\`$/, '');
    }
    
    return JSON.parse(raw.trim());
  } catch (err) {
    console.error('[GEMINI ERROR]', err.message, '| Pesan:', text);
    return null;
  }
}

module.exports = {
  parseBookingMessage
};

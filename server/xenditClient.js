const crypto = require('crypto');
const axios = require('axios');

const XENDIT_API_BASE = 'https://api.xendit.co';

// Bikin QR code QRIS sekali-pakai lewat Payment Requests API (bukan legacy
// "QR Codes" API yang lama). Auth Basic pakai secret key sebagai username,
// password kosong (pola standar Xendit).
//
// CATATAN VERIFIKASI: bentuk request body ini udah dicek ulang lewat
// dokumentasi resmi SDK Node Xendit (docs/PaymentRequest.md) jadi cukup
// yakin bener. Bentuk RESPONSE-nya (di mana persis QR string-nya) kurang
// pasti dari riset via web search doang -- makanya extractQrString() di
// bawah nyoba beberapa kemungkinan path sekaligus. Begitu API key beneran
// udah ada, tes panggilan ini SEKALI lewat curl/log dulu (lihat §5 fase
// verifikasi di rencana), console.log(JSON.stringify(response.data)) penuh,
// baru kalau ternyata extractQrString() salah tebak, tinggal tambah 1 baris
// di situ -- bukan nulis ulang fungsi ini.
async function createQrisPaymentRequest({ referenceId, amount }) {
  const response = await axios.post(
    `${XENDIT_API_BASE}/payment_requests`,
    {
      referenceId,
      amount,
      currency: 'IDR',
      country: 'ID',
      paymentMethod: {
        type: 'QR_CODE',
        qrCode: { channelCode: 'QRIS' },
        reusability: 'ONE_TIME_USE'
      }
    },
    {
      auth: { username: process.env.XENDIT_SECRET_KEY, password: '' }
    }
  );

  const qrString = extractQrString(response.data);
  if (!qrString) {
    throw new Error('Xendit response tidak mengandung QR string yang dikenali -- cek bentuk response.data terbaru dan update extractQrString().');
  }

  return { id: response.data.id, qrString };
}

// Coba beberapa kemungkinan lokasi QR string dalam response, karena
// dokumentasi publik yang ditemukan nggak konsisten (beda produk Xendit
// pakai struktur beda -- lihat catatan di atas).
function extractQrString(data) {
  if (!data) return null;
  if (data.qr_string) return data.qr_string;
  if (data.qrString) return data.qrString;

  const actions = data.actions;
  if (Array.isArray(actions)) {
    for (const action of actions) {
      if (action.qrCode) return action.qrCode;
      if (action.qr_checkout_string) return action.qr_checkout_string;
      if (action.qrCheckoutString) return action.qrCheckoutString;
    }
  }
  return null;
}

// Bandingkan token webhook dengan constant-time compare (bukan `===`) buat
// hindari timing side-channel -- risikonya rendah di kasus sandbox, tapi
// murah buat dilakuin dengan benar dari awal.
function verifyCallbackToken(headerValue) {
  const expected = process.env.XENDIT_CALLBACK_TOKEN || '';
  if (!headerValue || !expected) return false;
  const a = Buffer.from(String(headerValue));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// TERVERIFIKASI lewat contoh payload asli dari tombol "Tes dan simpan" di
// Xendit Dashboard (bukan tebakan dari dokumentasi lagi). Bentuk aslinya:
// { event: "payment.capture", data: { reference_id, status: "SUCCEEDED", ... } }
// untuk pembayaran berhasil, dan { event: "payment_request.expiry",
// data: { reference_id, status: "EXPIRED", ... } } untuk QR yang kedaluwarsa
// di sisi Xendit sendiri (independen dari sweep 30-menit kita sendiri di
// index.js). Field selalu dibungkus di `data`, bukan flat di root -- cabang
// flat di bawah dipertahankan cuma sebagai jaring pengaman murah, bukan
// karena masih dipakai.
function extractWebhookPayload(body) {
  if (!body) return { referenceId: null, isSucceeded: false };
  const flat = body.data && typeof body.data === 'object' ? body.data : body;
  const referenceId = flat.reference_id || flat.referenceId || null;
  const status = flat.status || '';
  const event = body.event || '';
  const isSucceeded = status === 'SUCCEEDED' || event.endsWith('.succeeded');
  return { referenceId, isSucceeded };
}

module.exports = { createQrisPaymentRequest, verifyCallbackToken, extractWebhookPayload };

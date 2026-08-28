const crypto = require('crypto');
const axios = require('axios');

const XENDIT_API_BASE = 'https://api.xendit.co';

// Bikin QR code QRIS sekali-pakai lewat Payment Requests API (bukan legacy
// "QR Codes" API yang lama). Auth Basic pakai secret key sebagai username,
// password kosong (pola standar Xendit).
//
// TERVERIFIKASI lewat panggilan curl langsung ke sandbox (bukan tebakan
// lagi). API-nya butuh snake_case murni di body request -- SDK resmi Xendit
// (Node/PHP) pakai camelCase di kode, tapi itu di-convert ke snake_case oleh
// SDK-nya sendiri sebelum dikirim lewat HTTP. Kode ini pakai axios polos
// (sengaja, biar minim dependency), jadi field HARUS ditulis snake_case
// dari awal -- versi camelCase sebelumnya gagal dengan error dari Xendit:
// "Only one of 'payment_method' or 'payment_method_id' should be present"
// (field paymentMethod camelCase-nya nggak dikenali sama sekali).
async function createQrisPaymentRequest({ referenceId, amount }) {
  const response = await axios.post(
    `${XENDIT_API_BASE}/payment_requests`,
    {
      reference_id: referenceId,
      amount,
      currency: 'IDR',
      country: 'ID',
      payment_method: {
        type: 'QR_CODE',
        reusability: 'ONE_TIME_USE',
        qr_code: { channel_code: 'QRIS' }
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

// Lokasi asli QR string, TERVERIFIKASI dari response curl sandbox:
// data.payment_method.qr_code.channel_properties.qr_string
// Cabang lain di bawah dipertahankan cuma sebagai jaring pengaman murah
// (mis. kalau Xendit ubah bentuk response di masa depan), bukan karena
// pernah kepake.
function extractQrString(data) {
  if (!data) return null;

  const channelProps = data.payment_method && data.payment_method.qr_code
    && data.payment_method.qr_code.channel_properties;
  if (channelProps && channelProps.qr_string) return channelProps.qr_string;

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

// Sama pola constant-time compare-nya, dipakai buat halaman demo
// "/demo" (lihat index.js) -- bukan token Xendit, tapi passcode kita
// sendiri buat ngelindungin data test customer dari akses sembarangan.
function verifyDemoPasscode(value) {
  const expected = process.env.DEMO_SECRET || '';
  if (!value || !expected) return false;
  const a = Buffer.from(String(value));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Simulasi pembayaran QRIS berhasil -- endpoint resmi Xendit khusus Test
// Mode, dipakai buat halaman demo "/demo" (lihat index.js) supaya bisa
// "bayar" dari HP tanpa laptop pas demo ke barber, gantiin manual curl.
// TERVERIFIKASI lewat panggilan curl langsung ke sandbox. Header
// `api-version` WAJIB, endpoint ini gagal tanpa itu.
async function simulatePayment({ paymentRequestId, amount }) {
  await axios.post(
    `${XENDIT_API_BASE}/v3/payment_requests/${paymentRequestId}/simulate`,
    { amount },
    {
      headers: { 'api-version': '2024-11-11' },
      auth: { username: process.env.XENDIT_SECRET_KEY, password: '' }
    }
  );
}

// TERVERIFIKASI lewat webhook ASLI (bukan sample generik "Tes dan simpan"
// lagi -- itu ternyata pakai data dummy yang menyesatkan). Event yang beneran
// terpicu saat QRIS lunas adalah "payment.succeeded", bentuknya:
// { event: "payment.succeeded", data: { reference_id, payment_request_id,
// status: "SUCCEEDED", ... } }.
//
// JEBAKAN PENTING: `data.reference_id` di event ini BUKAN reference_id yang
// kita generate sendiri pas bikin payment request (`wa-xxxx`) -- itu
// reference_id milik payment_method di dalamnya (UUID acak dari Xendit,
// beda tiap kali, nggak ada hubungannya sama kita). Field yang BENERAN cocok
// buat dikorelasikan balik ke baris kita adalah `data.payment_request_id`,
// yang nilainya sama persis dengan `id` yang dibalikin createQrisPaymentRequest()
// pas bikin QR -- makanya id itu WAJIB disimpan ke kolom xendit_qr_id pas
// insert (lihat index.js), bukan cuma xendit_reference_id.
function extractWebhookPayload(body) {
  if (!body) return { paymentRequestId: null, isSucceeded: false };
  const flat = body.data && typeof body.data === 'object' ? body.data : body;
  const paymentRequestId = flat.payment_request_id || flat.paymentRequestId || null;
  const status = flat.status || '';
  const event = body.event || '';
  const isSucceeded = status === 'SUCCEEDED' || event.endsWith('.succeeded');
  return { paymentRequestId, isSucceeded };
}

module.exports = { createQrisPaymentRequest, verifyCallbackToken, extractWebhookPayload, verifyDemoPasscode, simulatePayment };

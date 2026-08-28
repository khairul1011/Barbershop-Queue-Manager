const crypto = require('crypto');

const XENDIT_API_BASE = 'https://api.xendit.co';

// POST ke Xendit pakai fetch bawaan Node (bukan axios) -- cuma 2 panggilan
// simpel di file ini, nggak perlu dependency tambahan buat itu. Bentuk error
// disamain kayak axios (err.response.data) biar caller di index.js yang
// udah nge-log err.response.data nggak perlu berubah.
async function xenditPost(path, body, extraHeaders) {
  const auth = Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString('base64');
  const response = await fetch(`${XENDIT_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}`, ...extraHeaders },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(`Request failed with status code ${response.status}`);
    err.response = { data };
    throw err;
  }
  return data;
}

// Bikin QR code QRIS sekali-pakai lewat Payment Requests API (bukan legacy
// "QR Codes" API yang lama). Auth Basic pakai secret key sebagai username,
// password kosong (pola standar Xendit).
//
// TERVERIFIKASI lewat panggilan curl langsung ke sandbox (bukan tebakan
// lagi). API-nya butuh snake_case murni di body request -- SDK resmi Xendit
// (Node/PHP) pakai camelCase di kode, tapi itu di-convert ke snake_case oleh
// SDK-nya sendiri sebelum dikirim lewat HTTP. Field HARUS ditulis snake_case
// dari awal -- versi camelCase sebelumnya gagal dengan error dari Xendit:
// "Only one of 'payment_method' or 'payment_method_id' should be present"
// (field paymentMethod camelCase-nya nggak dikenali sama sekali).
async function createQrisPaymentRequest({ referenceId, amount }) {
  const data = await xenditPost('/payment_requests', {
    reference_id: referenceId,
    amount,
    currency: 'IDR',
    country: 'ID',
    payment_method: {
      type: 'QR_CODE',
      reusability: 'ONE_TIME_USE',
      qr_code: { channel_code: 'QRIS' }
    }
  });

  const qrString = extractQrString(data);
  if (!qrString) {
    throw new Error('Xendit response tidak mengandung QR string yang dikenali -- cek bentuk response.data terbaru dan update extractQrString().');
  }

  return { id: data.id, qrString };
}

// Lokasi asli QR string, TERVERIFIKASI dari response curl sandbox.
function extractQrString(data) {
  if (!data) return null;
  const channelProps = data.payment_method && data.payment_method.qr_code
    && data.payment_method.qr_code.channel_properties;
  return (channelProps && channelProps.qr_string) || null;
}

// Constant-time string compare (bukan `===`) buat hindari timing side-channel
// -- dipakai buat verifikasi token webhook Xendit DAN passcode halaman demo
// "/demo" (lihat index.js), dua-duanya butuh pola yang sama.
function constantTimeEquals(value, expected) {
  if (!value || !expected) return false;
  const a = Buffer.from(String(value));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyCallbackToken(headerValue) {
  return constantTimeEquals(headerValue, process.env.XENDIT_CALLBACK_TOKEN || '');
}

function verifyDemoPasscode(value) {
  return constantTimeEquals(value, process.env.DEMO_SECRET || '');
}

// Simulasi pembayaran QRIS berhasil -- endpoint resmi Xendit khusus Test
// Mode, dipakai buat halaman demo "/demo" (lihat index.js) supaya bisa
// "bayar" dari HP tanpa laptop pas demo ke barber, gantiin manual curl.
// TERVERIFIKASI lewat panggilan curl langsung ke sandbox. Header
// `api-version` WAJIB, endpoint ini gagal tanpa itu.
async function simulatePayment({ paymentRequestId, amount }) {
  await xenditPost(`/v3/payment_requests/${paymentRequestId}/simulate`, { amount }, { 'api-version': '2024-11-11' });
}

// TERVERIFIKASI lewat webhook ASLI (bukan sample generik "Tes dan simpan" --
// itu ternyata pakai data dummy yang menyesatkan). Event yang beneran terpicu
// saat QRIS lunas adalah "payment.succeeded", selalu nested di `data`,
// snake_case:  { event: "payment.succeeded", data: { payment_request_id,
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
  if (!body || !body.data) return { paymentRequestId: null, isSucceeded: false };
  const { payment_request_id: paymentRequestId, status } = body.data;
  const isSucceeded = status === 'SUCCEEDED' || (body.event || '').endsWith('.succeeded');
  return { paymentRequestId: paymentRequestId || null, isSucceeded };
}

module.exports = { createQrisPaymentRequest, verifyCallbackToken, extractWebhookPayload, verifyDemoPasscode, simulatePayment };

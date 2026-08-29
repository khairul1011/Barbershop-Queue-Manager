const crypto = require('crypto');

const XENDIT_API_BASE = 'https://api.xendit.co';

// Menggunakan fetch bawaan Node (bukan axios). Struktur error disesuaikan dengan axios (err.response.data)
// agar pemanggil yang sudah mengasumsikan bentuk tersebut tidak perlu diubah.
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

// Membuat QR QRIS sekali pakai melalui Payment Requests API. Body request wajib
// menggunakan snake_case murni (bukan camelCase seperti pada SDK resmi) — Xendit
// menolak field yang ditulis dalam camelCase.
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
    throw new Error('Xendit response tidak mengandung QR string yang dikenali. Periksa bentuk response.data terbaru dan perbarui extractQrString().');
  }

  return { id: data.id, qrString };
}

// Lokasi field QR string, telah diverifikasi melalui pengujian curl langsung ke sandbox.
function extractQrString(data) {
  if (!data) return null;
  const channelProps = data.payment_method && data.payment_method.qr_code
    && data.payment_method.qr_code.channel_properties;
  return (channelProps && channelProps.qr_string) || null;
}

// Perbandingan constant-time, digunakan untuk verifikasi token webhook dan passcode halaman demo.
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

// Simulasi pembayaran QRIS berhasil (khusus Test Mode), digunakan oleh halaman /demo.
// Header api-version bersifat wajib.
async function simulatePayment({ paymentRequestId, amount }) {
  await xenditPost(`/v3/payment_requests/${paymentRequestId}/simulate`, { amount }, { 'api-version': '2024-11-11' });
}

// Event webhook yang sebenarnya adalah "payment.succeeded", nested di dalam `data`.
// Perhatian: `data.reference_id` BUKAN reference_id yang kita buat sendiri — field
// yang tepat untuk korelasi adalah `data.payment_request_id`.
function extractWebhookPayload(body) {
  if (!body || !body.data) return { paymentRequestId: null, isSucceeded: false };
  const { payment_request_id: paymentRequestId, status } = body.data;
  const isSucceeded = status === 'SUCCEEDED' || (body.event || '').endsWith('.succeeded');
  return { paymentRequestId: paymentRequestId || null, isSucceeded };
}

module.exports = { createQrisPaymentRequest, verifyCallbackToken, extractWebhookPayload, verifyDemoPasscode, simulatePayment };

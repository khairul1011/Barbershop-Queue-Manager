const crypto = require('crypto');

const XENDIT_API_BASE = 'https://api.xendit.co';

// Pakai fetch bawaan Node (bukan axios). Bentuk error disamain kayak axios (err.response.data).
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

// Bikin QR QRIS sekali-pakai lewat Payment Requests API. Body WAJIB snake_case murni
// (bukan camelCase kayak SDK resmi) -- Xendit nolak field camelCase mentah-mentah.
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

// Constant-time compare -- dipakai buat verifikasi token webhook & passcode demo.
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

// Simulasi pembayaran QRIS sukses (Test Mode only), dipakai halaman /demo. Header api-version wajib.
async function simulatePayment({ paymentRequestId, amount }) {
  await xenditPost(`/v3/payment_requests/${paymentRequestId}/simulate`, { amount }, { 'api-version': '2024-11-11' });
}

// Event webhook asli: "payment.succeeded", nested di `data`. JEBAKAN:
// `data.reference_id` BUKAN reference_id kita -- yang cocok buat korelasi cuma `data.payment_request_id`.
function extractWebhookPayload(body) {
  if (!body || !body.data) return { paymentRequestId: null, isSucceeded: false };
  const { payment_request_id: paymentRequestId, status } = body.data;
  const isSucceeded = status === 'SUCCEEDED' || (body.event || '').endsWith('.succeeded');
  return { paymentRequestId: paymentRequestId || null, isSucceeded };
}

module.exports = { createQrisPaymentRequest, verifyCallbackToken, extractWebhookPayload, verifyDemoPasscode, simulatePayment };

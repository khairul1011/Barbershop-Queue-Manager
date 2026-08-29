const test = require('node:test');
const assert = require('node:assert/strict');
const { extractWebhookPayload, verifyCallbackToken, verifyDemoPasscode } = require('./xenditClient');

test('extractWebhookPayload korelasi pakai payment_request_id, bukan reference_id', () => {
  // data.reference_id di payload asli Xendit itu UUID milik payment_method (bukan
  // punya kita) -- kalau extractWebhookPayload salah pakai field ini, webhook
  // nggak bakal pernah nemu baris yang cocok di DB.
  const payload = {
    event: 'payment.succeeded',
    data: {
      payment_request_id: 'pr-abc123',
      reference_id: 'some-unrelated-uuid-from-xendit',
      status: 'SUCCEEDED'
    }
  };
  const result = extractWebhookPayload(payload);
  assert.equal(result.paymentRequestId, 'pr-abc123');
  assert.equal(result.isSucceeded, true);
});

test('extractWebhookPayload tidak menganggap sukses apabila status bukan SUCCEEDED', () => {
  const payload = { event: 'payment.failed', data: { payment_request_id: 'pr-abc123', status: 'FAILED' } };
  assert.equal(extractWebhookPayload(payload).isSucceeded, false);
});

test('extractWebhookPayload aman terhadap body yang kosong/rusak', () => {
  assert.deepEqual(extractWebhookPayload(null), { paymentRequestId: null, isSucceeded: false });
  assert.deepEqual(extractWebhookPayload({}), { paymentRequestId: null, isSucceeded: false });
});

test('verifyCallbackToken & verifyDemoPasscode menolak token yang salah/kosong', () => {
  process.env.XENDIT_CALLBACK_TOKEN = 'rahasia-123';
  process.env.DEMO_SECRET = 'demo-456';

  assert.equal(verifyCallbackToken('rahasia-123'), true);
  assert.equal(verifyCallbackToken('salah'), false);
  assert.equal(verifyCallbackToken(''), false);
  assert.equal(verifyCallbackToken(undefined), false);

  assert.equal(verifyDemoPasscode('demo-456'), true);
  assert.equal(verifyDemoPasscode('salah'), false);
});

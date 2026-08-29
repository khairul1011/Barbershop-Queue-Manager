const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const supabase = require('./supabaseClient');
const { createQrisPaymentRequest, verifyCallbackToken, extractWebhookPayload, verifyDemoPasscode, simulatePayment } = require('./services/xenditClient');

// Server webhook dan halaman demo, berjalan pada proses bot yang sama.
// `sendMessageWithDelay` disuntikkan dari index.js karena membutuhkan `client` WhatsApp.
function startWebhookServer({ sendMessageWithDelay }) {
  // Sweep setiap menit: booking berstatus 'unpaid' yang telah melewati payment_expires_at ditandai 'expired'.
  setInterval(async () => {
    const { error } = await supabase
      .from('whatsapp_requests')
      .update({ payment_status: 'expired' })
      .eq('payment_status', 'unpaid')
      .lt('payment_expires_at', new Date().toISOString());
    if (error) console.error('[EXPIRY SWEEP ERROR]', error.message);
  }, 60 * 1000);

  // Diakses publik melalui Cloudflare Tunnel -> localhost:3002. Server ini hanya
  // di-bind ke 127.0.0.1, dan verifikasi token dilakukan pada baris pertama tiap handler.
  const webhookApp = express();
  webhookApp.use(express.json());

  webhookApp.post('/webhooks/xendit', async (req, res) => {
    const token = req.header('x-callback-token');
    if (!verifyCallbackToken(token)) {
      console.error('[WEBHOOK REJECTED] x-callback-token tidak valid.');
      return res.status(401).end();
    }

    console.log('[WEBHOOK RECEIVED]', JSON.stringify(req.body));

    const { paymentRequestId, isSucceeded } = extractWebhookPayload(req.body);
    if (!paymentRequestId || !isSucceeded) {
      return res.status(200).end();
    }

    const { data: row, error: fetchError } = await supabase
      .from('whatsapp_requests')
      .select('*')
      .eq('xendit_qr_id', paymentRequestId)
      .maybeSingle();

    if (!fetchError && row) {
      if (row.payment_status === 'paid') {
        // Idempotency guard — webhook Xendit dapat dikirim ulang (retry), dan ini aman diproses berulang kali.
        return res.status(200).end();
      }

      await supabase
        .from('whatsapp_requests')
        .update({ payment_status: 'paid', dp_paid_at: new Date().toISOString() })
        .eq('id', row.id);
      console.log('[PAYMENT CONFIRMED]', row.sender_wa_id, '| payment_request_id:', paymentRequestId);

      if (!row.payment_notified && row.sender_wa_id) {
        try {
          const text = `Sip kak ${row.sender_name || ''}! Pembayaran DP kamu udah kami terima. Booking-nya udah dikonfirmasi, ditunggu kedatangannya ya!`;
          await sendMessageWithDelay(row.sender_wa_id, text);
          await supabase.from('whatsapp_requests').update({ payment_notified: true }).eq('id', row.id);
        } catch (err) {
          console.error('[PAYMENT NOTIFY ERROR]', err.message, '| id:', row.id);
        }
      }

      return res.status(200).end();
    }

    // Bukan pembayaran DP WhatsApp — periksa queue_entries (sisa pembayaran QRIS dari dashboard).
    const { data: qe } = await supabase
      .from('queue_entries')
      .select('id, payment_method')
      .eq('payment_xendit_qr_id', paymentRequestId)
      .maybeSingle();

    if (qe && qe.payment_method !== 'qris') {
      await supabase.from('queue_entries').update({ payment_method: 'qris' }).eq('id', qe.id);
      console.log('[PAYMENT CONFIRMED] sisa bayar QRIS dashboard |', qe.id, '| payment_request_id:', paymentRequestId);
    } else if (!qe) {
      console.error('[WEBHOOK] payment_request_id tidak dikenali:', paymentRequestId);
    }

    res.status(200).end();
  });

  // QR pembayaran sisa untuk dashboard (dialog "Selesaikan Sesi"). Akses CORS
  // dibatasi hanya pada origin dashboard (DASHBOARD_ORIGINS, dipisahkan koma).
  const DASHBOARD_ORIGINS = (process.env.DASHBOARD_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  function dashboardCors(req, res, next) {
    const origin = req.header('origin');
    const allowed = origin && DASHBOARD_ORIGINS.includes(origin);
    if (allowed) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!allowed) return res.status(403).end();
    next();
  }

  webhookApp.options('/api/session-payment', dashboardCors);
  webhookApp.post('/api/session-payment', dashboardCors, async (req, res) => {
    const { amount } = req.body || {};
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount tidak valid' });
    }

    try {
      const referenceId = `qe-${crypto.randomUUID()}`;
      const { id: paymentRequestId, qrString } = await createQrisPaymentRequest({ referenceId, amount });
      const qrPngDataUrl = await QRCode.toDataURL(qrString);
      res.json({ paymentRequestId, qrPngDataUrl });
    } catch (err) {
      console.error('[SESSION PAYMENT ERROR]', err.message);
      if (err.response && err.response.data) console.error('[SESSION PAYMENT ERROR DETAIL]', JSON.stringify(err.response.data));
      res.status(502).json({ error: 'gagal membuat QR pembayaran' });
    }
  });

  // Halaman demo yang menyerupai e-wallet, digunakan untuk simulasi pembayaran
  // Test Mode (bukan bagian dari alur produk sebenarnya). Dilindungi passcode
  // DEMO_SECRET, dan hanya menyentuh data sandbox.
  webhookApp.get('/demo', (req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>BarberFlow Pay</title>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
    min-height: 100vh; color: #f1f5f9; padding: 20px 16px 40px;
  }
  header { text-align: center; margin-bottom: 24px; }
  header h1 { font-size: 20px; margin: 0 0 4px; }
  header p { font-size: 12px; color: #94a3b8; margin: 0; }
  .badge { display: inline-block; background: #f59e0b; color: #1e293b; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-top: 8px; }
  #passGate { max-width: 360px; margin: 60px auto 0; text-align: center; }
  #passGate input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #334155; background: #1e293b; color: #f1f5f9; font-size: 16px; margin-bottom: 10px; }
  #passGate button { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #22c55e; color: #052e16; font-weight: 700; font-size: 15px; }
  #app { max-width: 420px; margin: 0 auto; display: none; }
  #scanBtn { width: 100%; padding: 16px; border-radius: 14px; border: none; background: #22c55e; color: #052e16; font-weight: 800; font-size: 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 16px; margin-bottom: 12px; }
  .card .name { font-weight: 700; font-size: 15px; }
  .card .meta { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .card .amount { font-size: 22px; font-weight: 800; color: #22c55e; margin: 10px 0; }
  .card button { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #334155; color: #f1f5f9; font-weight: 700; font-size: 13px; }
  .card button:disabled { background: #334155; color: #94a3b8; }
  .card button.done { background: #16a34a; color: white; }
  .empty { text-align: center; color: #64748b; font-size: 13px; margin-top: 20px; }
  #scanOverlay { display: none; position: fixed; inset: 0; background: #000; z-index: 50; flex-direction: column; align-items: center; justify-content: center; }
  #scanOverlay.active { display: flex; }
  #scanVideo { width: 100%; max-width: 480px; }
  #scanFrame { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 240px; height: 240px; border: 3px solid #22c55e; border-radius: 16px; box-shadow: 0 0 0 2000px rgba(0,0,0,0.5); }
  #scanStatus { position: absolute; bottom: 90px; color: #fff; font-size: 14px; text-align: center; padding: 0 20px; }
  #scanCancel { position: absolute; bottom: 30px; padding: 12px 28px; border-radius: 999px; border: none; background: #334155; color: #fff; font-weight: 700; }
</style>
</head>
<body>
  <header>
    <h1>💳 BarberFlow Pay</h1>
    <p>Simulasi pembayaran QRIS -- Xendit Test Mode</p>
    <span class="badge">MODE TES · BUKAN UANG ASLI</span>
  </header>

  <div id="passGate">
    <input id="passInput" type="text" placeholder="Masukin kode akses">
    <button onclick="unlock()">Buka</button>
  </div>

  <div id="app">
    <button id="scanBtn" onclick="startScan()">📷 Scan QR untuk Bayar</button>
    <div id="list"></div>
  </div>

  <div id="scanOverlay">
    <video id="scanVideo" playsinline autoplay muted></video>
    <div id="scanFrame"></div>
    <div id="scanStatus">Arahin kamera ke QR pembayaran</div>
    <button id="scanCancel" onclick="stopScan()">Batal</button>
  </div>

<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
<script>
  const params = new URLSearchParams(location.search);
  let kode = params.get('kode') || '';
  let currentRows = [];
  let scanStream = null;
  let scanRAF = null;

  function unlock() {
    kode = document.getElementById('passInput').value.trim();
    tryLoad();
  }

  async function tryLoad() {
    const res = await fetch('/demo/api/list?kode=' + encodeURIComponent(kode));
    if (res.status === 401) {
      document.getElementById('passGate').style.display = 'block';
      document.getElementById('app').style.display = 'none';
      return;
    }
    document.getElementById('passGate').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    currentRows = await res.json();
    render(currentRows);
  }

  function render(rows) {
    const list = document.getElementById('list');
    if (rows.length === 0) {
      list.innerHTML = '<div class="empty">Belum ada booking yang nunggu dibayar.<br>Kirim booking dulu lewat WhatsApp.</div>';
      return;
    }
    list.innerHTML = rows.map(r => \`
      <div class="card">
        <div class="name">\${r.sender_name}</div>
        <div class="meta">\${r.type === 'queue' ? r.extracted_service : \`\${r.extracted_day}, \${r.extracted_time} -- \${(r.extracted_service || '').split('|')[0]}\`}</div>
        <div class="amount">Rp\${Number(r.dp_amount).toLocaleString('id-ID')}</div>
        <button onclick="pay('\${r.id}', '\${r.type}', this)">Tandai lunas manual</button>
      </div>
    \`).join('');
  }

  async function pay(id, type, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
    try {
      const res = await fetch('/demo/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type, kode })
      });
      if (!res.ok) throw new Error('gagal');
      if (btn) { btn.textContent = '✓ Berhasil dibayar'; btn.classList.add('done'); }
      return true;
    } catch (err) {
      if (btn) { btn.textContent = 'Gagal, coba lagi'; btn.disabled = false; }
      return false;
    }
  }

  // QR pada Test Mode berisi placeholder generik, sehingga deteksi QR apa pun sudah cukup sebagai trigger pembayaran.
  function startScan() {
    document.getElementById('scanOverlay').classList.add('active');
    document.getElementById('scanStatus').textContent = 'Arahin kamera ke QR pembayaran';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        scanStream = stream;
        const video = document.getElementById('scanVideo');
        video.srcObject = stream;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const tick = () => {
          if (!scanStream) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
              onScanSuccess();
              return;
            }
          }
          scanRAF = requestAnimationFrame(tick);
        };
        scanRAF = requestAnimationFrame(tick);
      })
      .catch(() => {
        document.getElementById('scanStatus').textContent = 'Nggak bisa akses kamera -- izinkan akses kamera di browser.';
      });
  }

  function stopScan() {
    if (scanRAF) cancelAnimationFrame(scanRAF);
    if (scanStream) scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
    document.getElementById('scanOverlay').classList.remove('active');
  }

  async function onScanSuccess() {
    document.getElementById('scanStatus').textContent = 'QR terdeteksi, memproses pembayaran...';
    if (currentRows.length === 0) {
      document.getElementById('scanStatus').textContent = 'Nggak ada booking yang perlu dibayar.';
      setTimeout(stopScan, 1500);
      return;
    }
    const ok = await pay(currentRows[0].id, currentRows[0].type, null);
    stopScan();
    if (ok) {
      tryLoad();
    } else {
      alert('Gagal memproses pembayaran, coba lagi.');
    }
  }

  tryLoad();
  setInterval(tryLoad, 5000);
</script>
</body>
</html>`);
  });

  // Daftar gabungan: DP WhatsApp dan sisa pembayaran QRIS dari dashboard, dibedakan melalui field `type`.
  webhookApp.get('/demo/api/list', async (req, res) => {
    if (!verifyDemoPasscode(req.query.kode)) return res.status(401).json({ error: 'unauthorized' });

    const { data: waRows, error: waError } = await supabase
      .from('whatsapp_requests')
      .select('id, sender_name, dp_amount, extracted_day, extracted_time, extracted_service')
      .eq('payment_status', 'unpaid')
      .not('xendit_qr_id', 'is', null) // mengecualikan booking lama pra-fitur DP (payment_status default 'unpaid' namun tidak pernah memiliki QR)
      .order('received_at', { ascending: false })
      .limit(10);
    if (waError) return res.status(500).json({ error: waError.message });

    const { data: qeRows, error: qeError } = await supabase
      .from('queue_entries')
      .select('id, customer_name, payment_qr_amount')
      .is('payment_method', null)
      .not('payment_xendit_qr_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    if (qeError) return res.status(500).json({ error: qeError.message });

    const waList = (waRows || []).map(r => ({
      id: r.id, type: 'wa', sender_name: r.sender_name, dp_amount: r.dp_amount,
      extracted_day: r.extracted_day, extracted_time: r.extracted_time, extracted_service: r.extracted_service
    }));
    const qeList = (qeRows || []).map(r => ({
      id: r.id, type: 'queue', sender_name: r.customer_name, dp_amount: r.payment_qr_amount,
      extracted_day: null, extracted_time: null, extracted_service: 'Sisa pembayaran sesi (dashboard)'
    }));

    res.json([...waList, ...qeList]);
  });

  webhookApp.post('/demo/api/pay', async (req, res) => {
    const { id, type, kode } = req.body || {};
    if (!verifyDemoPasscode(kode)) return res.status(401).json({ error: 'unauthorized' });
    if (!id) return res.status(400).json({ error: 'id wajib diisi' });

    let paymentRequestId, amount;

    if (type === 'queue') {
      const { data: row } = await supabase.from('queue_entries').select('payment_xendit_qr_id, payment_qr_amount, payment_method').eq('id', id).maybeSingle();
      if (!row || !row.payment_xendit_qr_id) return res.status(404).json({ error: 'booking tidak ditemukan atau belum ada QR' });
      if (row.payment_method === 'qris') return res.status(409).json({ error: 'booking ini sudah lunas' });
      paymentRequestId = row.payment_xendit_qr_id;
      amount = row.payment_qr_amount;
    } else {
      const { data: row } = await supabase.from('whatsapp_requests').select('xendit_qr_id, dp_amount, payment_status').eq('id', id).maybeSingle();
      if (!row || !row.xendit_qr_id) return res.status(404).json({ error: 'booking tidak ditemukan atau belum ada QR' });
      if (row.payment_status !== 'unpaid') return res.status(409).json({ error: 'booking ini sudah tidak berstatus unpaid' });
      paymentRequestId = row.xendit_qr_id;
      amount = row.dp_amount;
    }

    try {
      await simulatePayment({ paymentRequestId, amount });
      res.json({ ok: true });
    } catch (err) {
      console.error('[DEMO SIMULATE ERROR]', err.message, '| id:', id);
      res.status(502).json({ error: 'gagal memanggil Xendit' });
    }
  });

  webhookApp.listen(process.env.WEBHOOK_PORT || 3002, '127.0.0.1', () => {
    console.log('[WEBHOOK SERVER] listening on 127.0.0.1:', process.env.WEBHOOK_PORT || 3002);
  });

  return webhookApp;
}

module.exports = { startWebhookServer };

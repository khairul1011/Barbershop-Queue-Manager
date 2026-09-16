// Tes Code node workflow n8n, membaca kode langsung dari file ekspor di folder ini.
// Jalankan dari root repo (butuh `cd server && npm install` untuk uji paritas prompt):
//
//   node n8n-stack/workflows/code.test.cjs
//
// Uji paritas membandingkan prompt dengan server/services/gemini.js dan
// bookingDomain.js asli; hapus bagian itu setelah server/ dihapus saat cutover.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const REPO = path.resolve(__dirname, '../..');
const AsyncFunction = (async () => {}).constructor;

const NODE_WA = {
  'siapkan-pesan.js': 'Siapkan Pesan',
  'siapkan-prompt.js': 'Siapkan Prompt',
  'baca-json-gemini.js': 'Baca JSON Gemini',
  'tentukan-langkah.js': 'Tentukan Langkah',
  'susun-ringkasan.js': 'Susun Ringkasan',
  'olah-hasil-booking.js': 'Olah Hasil Booking'
};

function kodeNode(workflowFile, nodeName) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, workflowFile), 'utf8'));
  const node = (Array.isArray(wf) ? wf[0] : wf).nodes.find(n => n.name === nodeName);
  if (!node) throw new Error(`node "${nodeName}" tidak ada di ${workflowFile}`);
  return node.parameters.jsCode;
}

async function run(file, nodes, input) {
  const code = kodeNode('wa-masuk.json', NODE_WA[file]);
  const $ = name => { if (!(name in nodes)) throw new Error('node tidak ada: ' + name); return { first: () => ({ json: nodes[name] }) }; };
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  return new AsyncFunction('$', '$input', code)($, $input);
}

(async () => {
  // ---- Paritas prompt & konteks bisnis dengan bot lama ----
  let captured;
  require.cache[require.resolve('@google/genai', { paths: [REPO + '/server/services'] })] = { exports: { GoogleGenAI: class { constructor() { this.models = { generateContent: async (req) => { captured = req.contents[0].parts[0].text; return { text: '{"isBookingIntent":false}' }; } }; } } } };
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const tbl = {
    barbers: [{ name: 'Irfan', specialization: 'Fade', status: 'active' }, { name: 'Renol', specialization: null, status: 'active' }],
    services: [{ name: 'Potong', price: 50000, duration_minutes: 30 }, { name: 'Creambath', price: 75001, duration_minutes: 45 }],
    business_hours: { open_hour: 9, close_hour: 20, shop_name: 'Takhta Barber' },
    barber_time_off: [{ off_date: today, barbers: { name: 'Renol' } }]
  };
  const builder = (t) => { const b = { select: () => b, eq: () => b, in: () => b, limit: () => b, single: () => b, then: (res) => res({ data: tbl[t] }) }; return b; };
  require.cache[require.resolve(REPO + '/server/supabaseClient.js')] = { exports: { from: builder } };
  const { getBusinessContext } = require(REPO + '/server/services/bookingDomain.js');
  const { parseBookingMessage } = require(REPO + '/server/services/gemini.js');
  const history = ['Customer: halo, mau booking', 'Bot: Halo, Kak. Untuk booking jadwal, Mohon informasikan hari.'];
  const text = 'besok jam 2 siang ya bang, potong sama irfan';
  const lama = await getBusinessContext();
  await parseBookingMessage(text, lama.context, history.join('\n'), lama.shopName);
  const baru = await run('siapkan-prompt.js', { 'Siapkan Pesan': { body: text } }, {
    state: null, history,
    barbers: tbl.barbers, services: tbl.services, hours: tbl.business_hours,
    time_off: [{ name: 'Renol', besok: false }]
  });
  assert.strictEqual(baru[0].json.prompt, captured, 'prompt berbeda dari bot lama');
  assert.deepStrictEqual(baru[0].json.models, ['models/gemini-3.1-flash-lite', 'models/gemini-3.5-flash-lite', 'models/gemini-3.6-flash', 'models/gemini-3.5-flash']);
  const panjang = await run('siapkan-prompt.js', { 'Siapkan Pesan': { body: 'x'.repeat(81) } }, { state: null, history: [] });
  assert.deepStrictEqual(panjang[0].json.models, ['models/gemini-3.6-flash', 'models/gemini-3.5-flash']);
  // Tanpa history & tanpa data bisnis, konteks tetap sama seperti bot lama.
  captured = null;
  for (const k of Object.keys(tbl)) tbl[k] = k === 'business_hours' ? null : [];
  const lamaKosong = await getBusinessContext();
  await parseBookingMessage('halo', lamaKosong.context, '', lamaKosong.shopName);
  const baruKosong = await run('siapkan-prompt.js', { 'Siapkan Pesan': { body: 'halo' } }, { state: null, history: [], barbers: null, services: null, hours: null, time_off: null });
  assert.strictEqual(baruKosong[0].json.prompt, captured, 'prompt tanpa data berbeda');

  // ---- Aturan pesan pendek ----
  assert.deepStrictEqual(await run('siapkan-prompt.js', { 'Siapkan Pesan': { body: 'ok' } }, { state: null, history: [] }), []);
  assert.strictEqual((await run('siapkan-prompt.js', { 'Siapkan Pesan': { body: 'ya' } }, { state: { nama: 'A' }, history: [] })).length, 1);
  assert.strictEqual((await run('siapkan-prompt.js', { 'Siapkan Pesan': { body: 'hai' } }, { state: null, history: [] })).length, 1);
  assert.deepStrictEqual(await run('siapkan-prompt.js', { 'Siapkan Pesan': { body: '' } }, { state: null, history: [] }), []);

  // ---- Siapkan Pesan: batas umur ----
  const now = Math.floor(Date.now() / 1000);
  assert.deepStrictEqual(await run('siapkan-pesan.js', {}, { body: { payload: { from: 'a@c.us', id: 'm1', body: 'hai', timestamp: now - 301 } } }), []);
  assert.strictEqual((await run('siapkan-pesan.js', {}, { body: { payload: { from: 'a@c.us', id: 'm1', body: 'hai', timestamp: now - 10 } } }))[0].json.chatId, 'a@c.us');

  // ---- Baca JSON Gemini ----
  const bj = await run('baca-json-gemini.js', {}, { content: { parts: [{ text: '```json\n{"a":1}\n```' }] } });
  assert.deepStrictEqual(bj[0].json, { ok: true, parsed: { a: 1 } });
  assert.strictEqual((await run('baca-json-gemini.js', {}, { content: { parts: [{ text: 'maaf' }] } }))[0].json.ok, false);

  // ---- Tentukan Langkah ----
  const kosong = { nama: null, hari: null, jam: null, servis: null, kapster: null, isBookingIntent: false, naturalReply: null };
  const langkah = (body, state, parsed, pn) => run('tentukan-langkah.js', {
    'Siapkan Pesan': { chatId: '999@lid', messageId: 'm1', body },
    'Muat Konteks': { state },
    'Cari Nomor Asli': pn ? { pn } : { statusCode: 404 }
  }, { parsed: { ...kosong, ...parsed } }).then(r => r[0].json);

  let r = await langkah('sabtu jam 2 potong, atas nama Andi', null, { isBookingIntent: true, nama: 'Andi', hari: 'Sabtu', jam: '14:00', servis: 'Potong' }, '62812@c.us');
  assert.strictEqual(r.action, 'ringkasan'); assert.strictEqual(r.phone, '62812'); assert.strictEqual(r.chatId, '999@lid');
  assert.deepStrictEqual(r.merged, { nama: 'Andi', hari: 'Sabtu', jam: '14:00', servis: 'Potong', kapster: null });

  const menunggu = { nama: 'Andi', hari: 'Sabtu', jam: '14:00', servis: 'Potong', kapster: 'Irfan', awaitingConfirmation: true };
  r = await langkah('ya', menunggu, { isBookingIntent: true, kapster: 'Renol' });
  assert.strictEqual(r.action, 'konfirmasi'); assert.strictEqual(r.kapsterDisetujui, 'Irfan'); assert.strictEqual(r.phone, '999');

  r = await langkah('jam 3 aja deh', menunggu, { isBookingIntent: true, jam: '15:00' });
  assert.strictEqual(r.action, 'ringkasan'); assert.strictEqual(r.merged.jam, '15:00');

  // Guard hari: model mengarang "Senin" padahal pesan tidak menyebut hari.
  r = await langkah('jam 3 aja deh', menunggu, { isBookingIntent: true, jam: '15:00', hari: 'Senin' });
  assert.strictEqual(r.merged.hari, 'Sabtu');

  r = await langkah('mau booking sabtu', null, { isBookingIntent: true, hari: 'Sabtu' });
  assert.strictEqual(r.action, 'balas');
  assert.strictEqual(r.text, 'Baik, untuk hari Sabtu. Mohon informasikan jam yang diinginkan, jenis layanan yang diinginkan (misalnya: cukur, creambath), dan nama untuk booking.');
  assert.deepStrictEqual(r.state, { nama: null, hari: 'Sabtu', jam: null, servis: null, kapster: null, awaitingConfirmation: false });

  r = await langkah('mau booking', null, { isBookingIntent: true });
  assert.ok(r.text.startsWith('Halo, Kak. Untuk booking jadwal, Mohon informasikan hari yang diinginkan, jam'));

  // Perbaikan: salah ketik "hri ini" tetap dipercaya.
  r = await langkah('hri ini kak', { nama: 'Khairul', hari: null, jam: '14:00', servis: 'Pangkas', kapster: null, awaitingConfirmation: false }, { isBookingIntent: true, hari: 'hari ini' });
  assert.strictEqual(r.action, 'ringkasan'); assert.strictEqual(r.merged.hari, 'hari ini');

  // Perbaikan: pesan yang dinilai pertanyaan tetap melengkapi field kosong (kasus uji nyata), tanpa kapster.
  r = await langkah('hri ini kak jam 2 yaa kak atas nama khairul', { nama: null, hari: null, jam: null, servis: null, kapster: null, awaitingConfirmation: false },
    { isBookingIntent: false, nama: 'Khairul', hari: 'hari ini', jam: '14:00', kapster: 'Kenji', naturalReply: 'Layanannya apa, Kak?' });
  assert.strictEqual(r.action, 'balas');
  assert.deepStrictEqual(r.state, { nama: 'Khairul', hari: 'hari ini', jam: '14:00', servis: null, kapster: null, awaitingConfirmation: false });

  // Hari dari pertanyaan tanpa kata hari tetap tidak dipercaya.
  r = await langkah('jam 2 bisa?', { nama: null, hari: null, jam: null, servis: null, kapster: null, awaitingConfirmation: false }, { isBookingIntent: false, hari: 'Senin', jam: '14:00', naturalReply: 'Bisa, Kak.' });
  assert.strictEqual(r.state.hari, null); assert.strictEqual(r.state.jam, '14:00');

  // Interupsi pertanyaan: field lama tidak tertimpa.
  r = await langkah('bukannya tadi saya pakai nama pais?', menunggu, { isBookingIntent: false, nama: 'Pais', naturalReply: 'Tercatat atas nama Andi.' });
  assert.strictEqual(r.action, 'balas'); assert.strictEqual(r.state.nama, 'Andi'); assert.strictEqual(r.state.awaitingConfirmation, false);

  r = await langkah('buka jam berapa?', null, { naturalReply: 'Kami buka jam 9.' });
  assert.deepStrictEqual([r.action, r.state], ['balas', null]);

  r = await langkah('oke makasih', null, {});
  assert.deepStrictEqual([r.action, r.state], ['diam', null]);

  // Sinyal booking baru membuang sesi lama.
  r = await langkah('bisa booking lagi? atas nama Budi', menunggu, { isBookingIntent: true, nama: 'Budi' });
  assert.strictEqual(r.action, 'balas'); assert.deepStrictEqual(r.state, { nama: 'Budi', hari: null, jam: null, servis: null, kapster: null, awaitingConfirmation: false });

  // Kata konfirmasi di dalam kalimat, dan "ya" tanpa sesi menunggu.
  r = await langkah('oke siap bang', menunggu, { isBookingIntent: true });
  assert.strictEqual(r.action, 'konfirmasi');
  r = await langkah('ya', { ...menunggu, awaitingConfirmation: false }, { isBookingIntent: true });
  assert.strictEqual(r.action, 'ringkasan');

  // ---- Susun Ringkasan ----
  const m = { nama: 'Andi', hari: 'Sabtu', jam: '14:00', servis: 'Potong', kapster: null };
  let s = (await run('susun-ringkasan.js', { 'Tentukan Langkah': { merged: m } }, { slot: { available: true, barber: 'Irfan' }, jam_lain: '10:00' }))[0].json;
  assert.strictEqual(s.text, 'Perlu diketahui, Anda sudah memiliki booking pada jam 10:00 di hari yang sama. Baik, berikut ringkasan booking Anda: hari Sabtu, jam 14:00, layanan Potong dengan kapster *Irfan*, atas nama Andi. Apakah data tersebut sudah benar? Silakan balas "ya" untuk konfirmasi.');
  assert.deepStrictEqual(s.state, { ...m, kapster: 'Irfan', awaitingConfirmation: true });
  s = (await run('susun-ringkasan.js', { 'Tentukan Langkah': { merged: m } }, { slot: { available: false, message: 'Penuh.' }, jam_lain: null }))[0].json;
  assert.deepStrictEqual(s, { text: 'Penuh.', state: { ...m, jam: null, kapster: null, awaitingConfirmation: false } });

  // ---- Olah Hasil Booking ----
  let o = (await run('olah-hasil-booking.js', { 'Tentukan Langkah': { merged: m } }, { hasil: { available: true, barber: 'Irfan', request_id: 'r1', dp_amount: 37501, reference_id: 'wa-1' } }))[0].json;
  assert.strictEqual(o.jalur, 'dp'); assert.ok(o.text.includes('Rp37.501 (50% dari total)'));
  o = (await run('olah-hasil-booking.js', { 'Tentukan Langkah': { merged: m } }, { hasil: { available: true, barber: 'Irfan', request_id: 'r1', dp_amount: null, reference_id: null } }))[0].json;
  assert.strictEqual(o.text, 'Baik, Kak. Booking sudah lengkap:\n\nHari: Sabtu\nJam: 14:00\nServis: Potong\nKapster: Irfan\nNama: Andi\n\nTerima kasih, kami tunggu kedatangannya.');
  o = (await run('olah-hasil-booking.js', { 'Tentukan Langkah': { merged: m } }, { hasil: { available: false, barber: null, message: 'Penuh.' } }))[0].json;
  assert.strictEqual(o.text, 'Mohon maaf, Kak, jadwal tersebut baru saja diambil oleh pelanggan lain. Penuh.');

  // ---- Susun Notifikasi (Tugas Tiap Menit) ----
  const kodeNotif = kodeNode('tugas-tiap-menit.json', 'Susun Notifikasi');
  const runNotif = (rows) => new AsyncFunction('$input', kodeNotif)({ all: () => rows.map(json => ({ json })) });
  const out = await runNotif([
    { id: '1', status: 'approved', sender_wa_id: '99@lid', sender_phone: '628', sender_name: 'Andi', extracted_day: 'Sabtu', extracted_time: '14:00', extracted_service: 'Potong|BARBER:Irfan', shop_name: 'Takhta Barber' },
    { id: '2', status: 'rejected', sender_wa_id: null, sender_phone: '628', sender_name: null, extracted_day: 'besok', extracted_time: '10:00', extracted_service: 'Potong', shop_name: null },
    { id: '3', status: 'approved', sender_wa_id: null, sender_phone: null },
    { success: true }
  ]);
  assert.deepStrictEqual(out.map(o => o.json), [
    { id: '1', chatId: '99@lid', text: 'Halo Kak Andi, booking untuk Sabtu jam 14:00 (Potong, kapster Irfan) sudah dikonfirmasi. Kami tunggu kedatangannya di Takhta Barber.' },
    { id: '2', chatId: '628@c.us', text: 'Mohon maaf, Kak, slot besok jam 10:00 ternyata tidak tersedia. Silakan hubungi kami kembali apabila ingin mencari jadwal lain.' }
  ]);
  const barberTanpaNama = await runNotif([{ id: '4', status: 'approved', sender_phone: '62', extracted_day: 'Senin', extracted_time: '09:00', extracted_service: 'Cukur', shop_name: null }]);
  assert.strictEqual(barberTanpaNama[0].json.text, 'Halo Kak, booking untuk Senin jam 09:00 (Cukur) sudah dikonfirmasi. Kami tunggu kedatangannya di BarberFlow.');

  console.log('SEMUA TES LOLOS');
})().catch(e => { console.error(e); process.exit(1); });

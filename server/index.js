require('dotenv').config();
const crypto = require('crypto');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
// Nama beda dari `qrcode` (qrcode-terminal, di atas, buat QR login WA di
// terminal) -- package ini (`qrcode` di npm, diimpor sebagai QRCode) yang
// generate gambar PNG buat QR pembayaran yang dikirim ke customer.
const QRCode = require('qrcode');
const express = require('express');
const { parseBookingMessage } = require('./gemini');
const supabase = require('./supabaseClient');
const { getServicePrice, calculateDp } = require('./priceLookup');
const { createQrisPaymentRequest, verifyCallbackToken, extractWebhookPayload, verifyDemoPasscode, simulatePayment } = require('./xenditClient');

const conversationState = new Map();
const chatHistory = new Map();

// Waktu proses ini mulai jalan (detik, sama seperti format msg.timestamp).
// Dipakai buat menyaring pesan "lama" yang di-replay ulang oleh whatsapp-web.js
// saat sesi reconnect setelah restart, supaya tidak diproses & dibalas ulang.
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// Safety net tambahan: cegah 1 pesan diproses dua kali kalau event 'message'
// somehow fire lebih dari sekali untuk ID yang sama (di luar skenario restart).
const processedMessageIds = new Set();
const MAX_TRACKED_MESSAGE_IDS = 500;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Lock global sederhana buat serialize "cek ketersediaan -> insert booking".
// Tanpa ini, dua customer beda yang confirm ("ya") nyaris bersamaan bisa
// sama-sama lolos checkAvailability() SEBELUM salah satu sempat ke-insert
// baris ke whatsapp_requests -- jadi dua-duanya ke-assign kapster yang sama
// walau minta jam yang sama (harusnya customer kedua diarahin ke kapster
// lain yang kosong). Insiden nyata yang bikin ini ditambahin. Cukup lock
// in-memory (bukan DB lock) karena bot ini satu proses Node tunggal.
let bookingLock = Promise.resolve();
function withBookingLock(fn) {
  const run = bookingLock.then(fn, fn);
  bookingLock = run.then(() => {}, () => {}); // error di satu booking jangan macetin antrian booking berikutnya
  return run;
}

// Jeda "natural" sebelum kirim pesan — dasar 1.5-3 detik + tambahan mengikuti
// panjang teks (mirip kecepatan ngetik manusia), dibatasi maksimal ~7 detik.
function computeNaturalDelay(text) {
  const baseDelay = randomBetween(1500, 3000);
  const typingDelay = text.length * 30;
  return Math.min(baseDelay + typingDelay, 7000);
}

// Balasan "natural": tunjukin indikator sedang mengetik dan tunggu jeda
// acak sebelum benar-benar mengirim, supaya nggak kelihatan seperti bot
// yang balas instan. `getChat` dibungkus try/catch di sini (bukan cuma
// sendStateTyping-nya) karena pengambilan chat itu sendiri bisa gagal --
// tetap fail-open, lanjut kirim pesan tanpa indikator typing.
async function waitWithTypingIndicator(getChat, textForDelay) {
  try {
    const chat = await getChat();
    await chat.sendStateTyping();
  } catch (err) {
    // Non-fatal — lanjut tanpa indikator typing kalau gagal ambil chat.
  }
  await new Promise(resolve => setTimeout(resolve, computeNaturalDelay(textForDelay)));
}

async function replyAndSaveHistory(msg, text) {
  await waitWithTypingIndicator(() => msg.getChat(), text);
  await msg.reply(text);
  if (!chatHistory.has(msg.from)) chatHistory.set(msg.from, []);
  const history = chatHistory.get(msg.from);
  history.push(`Bot: ${text}`);
  if (history.length > 6) history.shift();
}

// Sama seperti replyAndSaveHistory, tapi buat pesan yang DIINISIASI bot
// sendiri (bukan balasan dalam percakapan aktif) — misalnya notifikasi
// approve/reject. Butuh chatId eksplisit karena nggak ada objek `msg` untuk
// dibalas.
async function sendMessageWithDelay(chatId, text) {
  await waitWithTypingIndicator(() => client.getChatById(chatId), text);
  await client.sendMessage(chatId, text);
}

// Sama seperti sendMessageWithDelay, tapi buat kirim media (gambar QR
// pembayaran) dengan caption teks -- pertama kali bot ini kirim media,
// bukan cuma teks.
async function sendMediaWithDelay(chatId, media, caption) {
  await waitWithTypingIndicator(() => client.getChatById(chatId), caption || '');
  await client.sendMessage(chatId, media, { caption });
}

// Barbershop-nya operasional di WIB (UTC+7), tapi VPS jalan di UTC (`Etc/UTC`,
// dikonfirmasi via timedatectl) -- pakai new Date() polos bikin "hari
// ini"/"besok" MUNDUR 1 HARI selama ~7 jam tiap hari (17:00-23:59 UTC =
// udah hari berikutnya di WIB). Insiden nyata: checkAvailability() ngecek
// tanggal yang salah (dateStr versi UTC, sementara baris queue_entries
// beneran kesimpen pakai tanggal versi WIB dari browser barber pas approve),
// query queue_entries selalu nemu KOSONG di tanggal yang dicek, conflict
// detection nggak pernah kena walau slot beneran udah penuh -- tiga customer
// beda ke-assign kapster+jam yang sama persis tanpa satupun ketauan bentrok.
// Fungsi ini balikin Date yang, kalau dibaca lewat method getUTC*, ngasih
// tanggal-kalender WIB yang bener -- independen dari timezone proses
// Node/VPS-nya sendiri. WIB nggak kenal DST, jadi offset tetap +7 jam aman
// dipakai sepanjang tahun.
function getWibNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function getTargetDateStr(dayStr) {
  const d = (dayStr || '').toLowerCase();
  const today = getWibNow();

  let targetIdx = today.getUTCDay();
  if (d.includes('besok')) {
    targetIdx = (today.getUTCDay() + 1) % 7;
  } else if (d.includes('lusa')) {
    targetIdx = (today.getUTCDay() + 2) % 7;
  } else if (d.includes('senin')) targetIdx = 1;
  else if (d.includes('selasa')) targetIdx = 2;
  else if (d.includes('rabu')) targetIdx = 3;
  else if (d.includes('kamis')) targetIdx = 4;
  else if (d.includes('jumat')) targetIdx = 5;
  else if (d.includes('sabtu')) targetIdx = 6;
  else if (d.includes('minggu')) targetIdx = 0;

  const diff = (targetIdx - today.getUTCDay() + 7) % 7;
  const target = new Date(today);
  target.setUTCDate(today.getUTCDate() + diff);

  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Insiden nyata: customer udah bilang "besok", terus balas lagi cuma soal
// jam ("jam 5?") -- Gemini di-panggil ULANG buat parse pesan itu (semua
// pesan selalu di-Gemini-in), dan kadang "ngarang" hari (mis. balikin
// "hari ini") walau pesannya nggak nyebut hari sama sekali. Kalau dipercaya
// langsung, itu nimpa hari yang udah BENER kesimpen dari turn sebelumnya --
// pola yang sama kayak bug kapster yang udah dibenerin duluan. Guard ini
// nolak update `hari` kecuali pesan ASLI customer beneran nyebut kata
// terkait hari -- sama kata kuncinya kayak getTargetDateStr() di atas.
const DAY_KEYWORDS = ['besok', 'lusa', 'hari ini', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
function mentionsDay(text) {
  const t = (text || '').toLowerCase();
  return DAY_KEYWORDS.some(k => t.includes(k));
}

async function checkAvailability(hariStr, jamStr, kapsterStr) {
  const dateStr = getTargetDateStr(hariStr);
  const { data: queue } = await supabase.from('queue_entries')
    .select('barber_id, scheduled_time, status')
    .eq('scheduled_date', dateStr);
    
  // archived=false WAJIB -- tanpa ini, kapster yang udah "dihapus" (archived,
  // tapi barisnya tetap ada di DB) masih ke-hitung sebagai opsi valid di sini,
  // jadi ambang "semua kapster penuh" nggak pernah kesentuh dan bot bisa
  // nawarin/nyimpen nama kapster yang udah nggak ada ke customer. Filter ini
  // harus sama persis kayak useSupabaseBarbers.ts di frontend (archived,
  // BUKAN status -- status itu shift hari ini, beda konsep, kapster yang
  // lagi off/break besok masih tetap valid buat dicek).
  const { data: barbers } = await supabase.from('barbers').select('id, name').eq('archived', false);
  
  const { data: waReqs } = await supabase.from('whatsapp_requests')
    .select('extracted_day, extracted_time, extracted_service')
    .in('status', ['pending']);

  let requestedBarberId = null;
  if (kapsterStr) {
    const k = kapsterStr.toLowerCase();
    const match = barbers.find(b => b.name.toLowerCase().includes(k) || k.includes(b.name.toLowerCase()));
    if (match) requestedBarberId = match.id;
  }

  const busyBarberIds = new Set(
    (queue || [])
      .filter(q => (q.scheduled_time || '').startsWith(jamStr) && q.status !== 'Completed' && q.status !== 'cancelled')
      .map(q => q.barber_id)
  );
    
  let anyCount = 0;
  (waReqs || []).forEach(r => {
    if (getTargetDateStr(r.extracted_day) === dateStr && r.extracted_time === jamStr) {
      const parts = (r.extracted_service || '').split('|BARBER:');
      const bName = parts[1];
      if (bName) {
         const match = barbers.find(b => b.name.toLowerCase().includes(bName.toLowerCase()));
         if (match) busyBarberIds.add(match.id);
      } else {
         anyCount++;
      }
    }
  });

  if (requestedBarberId) {
     if (busyBarberIds.has(requestedBarberId)) {
        const availableBarbers = barbers.filter(b => !busyBarberIds.has(b.id));
        return { 
           conflict: true, 
           msg: `Maaf kak, kapster ${kapsterStr} sudah ada jadwal jam ${jamStr}. ` + 
                (availableBarbers.length > 0 
                  ? `Yang kosong ada ${availableBarbers.map(b=>b.name).join(', ')}. Mau ganti kapster atau ganti jam?` 
                  : `Semua kapster juga penuh jam segitu. Boleh pilih jam lain?`)
        };
     }
     const match = barbers.find(b => b.id === requestedBarberId);
     return { conflict: false, assignedBarber: match.name };
  } else {
     if (busyBarberIds.size + anyCount >= barbers.length) {
        return {
           conflict: true,
           msg: `Maaf kak, semua kapster sudah penuh untuk jam ${jamStr}. Boleh pilih jam lain?`
        };
     }
     const availableBarbers = barbers.filter(b => !busyBarberIds.has(b.id));
     return { conflict: false, assignedBarber: availableBarbers[0].name };
  }
}

// Fallback name kalau baris business_hours belum ada / query gagal — dipakai
// juga sebagai default param di parseBookingMessage().
const DEFAULT_SHOP_NAME = 'BarberFlow';

async function getShopName() {
  try {
    const { data } = await supabase.from('business_hours').select('shop_name').limit(1).single();
    return (data && data.shop_name) || DEFAULT_SHOP_NAME;
  } catch (err) {
    return DEFAULT_SHOP_NAME;
  }
}

async function getBusinessContext() {
  try {
    // archived=false ditambah di sini juga -- kapster yang udah "dihapus"
    // ternyata status-nya tetap 'active' di DB (archived itu flag terpisah),
    // jadi tanpa ini dia masih bocor ke daftar "Kapster aktif" yang dikirim
    // ke Gemini, bikin AI ngira itu opsi kapster yang valid buat ditawarin.
    const { data: barbers } = await supabase.from('barbers').select('name, specialization, status').eq('status', 'active').eq('archived', false);
    const { data: services } = await supabase.from('services').select('name, price, duration_minutes');
    const { data: hours } = await supabase.from('business_hours').select('open_hour, close_hour, shop_name').limit(1).single();
    const shopName = (hours && hours.shop_name) || DEFAULT_SHOP_NAME;

    let context = '';

    if (hours) {
      context += `Jam operasional: ${String(hours.open_hour).padStart(2, '0')}:00 - ${String(hours.close_hour).padStart(2, '0')}:00 setiap hari.\n`;
    }
    
    if (barbers && barbers.length > 0) {
      const barberList = barbers.map(b => `${b.name} (${b.specialization || 'Umum'})`).join(', ');
      context += `Kapster aktif: ${barberList}.\n`;
    }

    if (services && services.length > 0) {
      const serviceList = services.map(s => `${s.name} (Rp${s.price.toLocaleString('id-ID')}, ${s.duration_minutes} menit)`).join(', ');
      context += `Layanan: ${serviceList}.`;
    }

    // Pakai getWibNow(), bukan new Date() polos -- bug timezone yang sama
    // kayak di getTargetDateStr() (lihat komentar di situ) juga bisa bikin
    // info "kapster libur hari ini/besok" salah tanggal selama VPS-nya
    // masih "kemarin" versi UTC padahal udah hari berikutnya di WIB.
    const today = getWibNow();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: timeOffs } = await supabase
      .from('barber_time_off')
      .select('off_date, barbers(name)')
      .in('off_date', [todayStr, tomorrowStr]);

    if (timeOffs && timeOffs.length > 0) {
      const offList = timeOffs.map(t => `${t.barbers.name} libur pada ${t.off_date === todayStr ? 'hari ini' : 'besok'}`).join(', ');
      context += `\nInfo cuti: ${offList}.`;
    } else {
      context += `\nInfo cuti: Tidak ada kapster yang libur hari ini atau besok (semua kapster aktif tersedia sesuai jam operasional).`;
    }

    return { context: context || "Info bisnis sedang tidak dapat diakses, mohon maaf.", shopName };
  } catch (err) {
    console.error('[BUSINESS CONTEXT ERROR]', err.message);
    return { context: "Info bisnis sedang tidak dapat diakses, mohon maaf.", shopName: DEFAULT_SHOP_NAME };
  }
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--single-process'
    ]
  }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => {
  console.log('Client is ready!');
  catchUpNotifications();
});
client.on('message', msg => console.log('[RAW EVENT]', msg.from, msg.type, msg.body));

// whatsapp-web.js bisa kehilangan koneksi ke WhatsApp secara diam-diam
// (HP offline lama, WiFi VPS sempat putus, atau sesi Puppeteer internal
// nge-stuck) tanpa proses Node-nya sendiri crash — PM2 tetap lihat proses
// "online" padahal bot udah nggak nerima pesan sama sekali. Insiden nyata:
// bot diam total 3 hari (24-27 Agustus 2026) tanpa satupun error ter-log,
// cuma ketahuan karena customer komplain nggak dibales. Exit eksplisit di
// sini biar PM2 (autorestart default-nya ON) yang re-launch proses dari
// nol dengan sesi Puppeteer baru, alih-alih diem tanpa jejak kayak kejadian itu.
client.on('disconnected', (reason) => {
  console.log('[DISCONNECTED]', reason, '- keluar biar PM2 restart proses ini.');
  process.exit(1);
});

// Resolve nomor telepon asli dari sebuah WA ID (bisa berupa @c.us atau @lid).
// contact.number/msg.getContact() cuma andalkan cache lokal, jadi untuk kontak
// yang belum pernah "dikenal" sebelumnya (khususnya kontak ber-@lid), dia
// sering gagal resolve dan balik ke @lid mentah. getContactLidAndPhone()
// memaksa query ulang ke server WhatsApp kalau nomornya belum diketahui,
// jadi hasilnya jauh lebih konsisten. Tetap ada fallback manual kalau
// method ini somehow gagal juga (mis. WhatsApp belum sempat resolve LID-nya).
async function resolveRealPhone(waId) {
  try {
    const [result] = await client.getContactLidAndPhone(waId);
    if (result && result.pn) {
      return result.pn.replace('@c.us', '').replace('@s.whatsapp.net', '');
    }
  } catch (err) {
    console.error('[RESOLVE PHONE ERROR]', err.message, '| target:', waId);
  }
  return waId.replace('@c.us', '').replace('@lid', '');
}

// Kirim notifikasi WhatsApp ke customer saat kapster approve/reject booking
// dari dashboard. Prioritaskan `sender_wa_id` (ID chat mentah persis yang
// dipakai pas percakapan awal, mis. "628xxx@c.us" ATAU "628xxx@lid") sebagai
// target kirim — beberapa kontak WhatsApp cuma bisa dikirimi lewat ID yang
// sama persis dengan yang dipakai chat pertama kali, rekonstruksi ulang
// "{sender_phone}@c.us" dari nomor bersih bisa gagal dengan error
// "No LID for user" walau nomornya valid. Fallback ke rekonstruksi @c.us
// tetap dipertahankan buat baris lama (sebelum kolom ini ada).
async function notifyStatusChange(row) {
  if (!row.sender_wa_id && !row.sender_phone) {
    console.error('[NOTIFY SKIP] sender_wa_id & sender_phone kosong, tidak bisa kirim notifikasi | id:', row.id);
    return;
  }

  const [servis, barber] = (row.extracted_service || '').split('|BARBER:');
  const nama = row.sender_name || 'kak';

  let text;
  if (row.status === 'approved') {
    const barberText = barber ? `, kapster ${barber}` : '';
    const shopName = await getShopName();
    text = `Halo kak ${nama}! Booking kamu buat ${row.extracted_day} jam ${row.extracted_time} (${servis}${barberText}) udah dikonfirmasi ya. Ditunggu kedatangannya di ${shopName}!`;
  } else if (row.status === 'rejected') {
    text = `Mohon maaf kak ${nama}, slot ${row.extracted_day} jam ${row.extracted_time} ternyata nggak bisa. Boleh chat lagi kalau mau cari jadwal lain ya.`;
  } else {
    return; // status lain (mis. 'pending') — bukan urusan fungsi ini
  }

  const chatId = row.sender_wa_id || `${row.sender_phone}@c.us`;

  try {
    await sendMessageWithDelay(chatId, text);
    console.log('[NOTIFY SENT]', row.status, '->', row.sender_phone, '| id:', row.id);
  } catch (err) {
    console.error('[NOTIFY ERROR]', err.message, '| id:', row.id, '| target:', chatId);
    return; // jangan tandai terkirim kalau gagal — biar bisa disusul lain waktu
  }

  const { error } = await supabase
    .from('whatsapp_requests')
    .update({ status_notified: true })
    .eq('id', row.id);
  if (error) {
    console.error('[NOTIFY DB UPDATE ERROR]', error.message, '| id:', row.id);
  }
}

// Cari & kirim ulang notifikasi untuk booking yang statusnya sudah
// approved/rejected tapi belum sempat dinotifikasi (mis. karena bot lagi
// mati pas kapster approve/reject-nya).
async function catchUpNotifications() {
  const { data, error } = await supabase
    .from('whatsapp_requests')
    .select('*')
    .in('status', ['approved', 'rejected'])
    .eq('status_notified', false);

  if (error) {
    console.error('[CATCH-UP ERROR]', error.message);
    return;
  }
  if (!data || data.length === 0) return;

  console.log(`[CATCH-UP] ${data.length} notifikasi tertunda ditemukan, mengirim...`);
  for (const row of data) {
    await notifyStatusChange(row);
  }
}

// Dengerin perubahan status booking (approve/reject dari dashboard) lewat
// Supabase Realtime, lalu kirim notifikasi WhatsApp ke customer terkait.
// Idempotent lewat kolom status_notified di DB (bukan state in-memory),
// supaya aman dari duplikat notifikasi walau bot restart atau event
// ke-replay — beda kasus dari dedup pesan masuk yang cukup in-memory.
supabase
  .channel('whatsapp_requests_status')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_requests' }, async payload => {
    const id = payload.new && payload.new.id;
    if (!id) return;

    // Re-fetch row lengkap by ID, jangan percaya isi payload realtime mentah
    // (bisa beda tergantung REPLICA IDENTITY config tabel).
    const { data: row, error } = await supabase
      .from('whatsapp_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[REALTIME FETCH ERROR]', error.message, '| id:', id);
      return;
    }
    if (!row || row.status_notified) return;
    if (row.status !== 'approved' && row.status !== 'rejected') return;

    await notifyStatusChange(row);
  })
  .subscribe();

client.on('message', async msg => {
  // Housekeeping: hapus state yang usianya lebih dari 30 menit
  const now = Date.now();
  for (const [key, state] of conversationState.entries()) {
    if (now - state.lastUpdated > 30 * 60 * 1000) {
      conversationState.delete(key);
    }
  }

  // 1. Skip pesan dari bot/diri sendiri
  if (msg.fromMe) return;

  // 2. Skip pesan dari grup WhatsApp
  if (msg.from.endsWith('@g.us')) return;

  // Skip update status WhatsApp
  if (msg.from === 'status@broadcast') return;

  // Skip pesan yang timestamp-nya sebelum proses ini mulai jalan — ini
  // mencegah pesan lama diproses & dibalas ulang saat whatsapp-web.js
  // "membaca ulang" pesan terakhir pas sesi reconnect setelah restart.
  if (msg.timestamp && msg.timestamp < BOT_START_TIME) {
    console.log('[SKIP STALE MESSAGE] pesan dari sebelum bot ini nyala, diabaikan:', msg.from);
    return;
  }

  // Skip pesan yang ID-nya sudah pernah diproses (safety net tambahan).
  const msgId = msg.id && msg.id._serialized;
  if (msgId) {
    if (processedMessageIds.has(msgId)) {
      console.log('[SKIP DUPLICATE MESSAGE] pesan ini sudah pernah diproses:', msgId);
      return;
    }
    processedMessageIds.add(msgId);
    if (processedMessageIds.size > MAX_TRACKED_MESSAGE_IDS) {
      const oldest = processedMessageIds.values().next().value;
      processedMessageIds.delete(oldest);
    }
  }

  // 3. Skip pesan yang terlalu pendek HANYA jika pengguna belum ada di state percakapan
  const GREETING_WORDS = ['halo', 'hallo', 'hai', 'hi', 'hey', 'min', 'bang', 'bg', 'kak', 'permisi', 'pagi', 'siang', 'sore', 'malam'];
  const bodyNormalized = (msg.body || '').trim().toLowerCase();
  const isGreeting = GREETING_WORDS.some(g => bodyNormalized === g || bodyNormalized.startsWith(g + ' ') || bodyNormalized.startsWith(g + ','));
  if (!msg.body || (msg.body.trim().length < 5 && !conversationState.has(msg.from) && !isGreeting)) return;

  console.log(`\n[NEW MESSAGE] ${msg.from}: ${msg.body}`);

  if (!chatHistory.has(msg.from)) chatHistory.set(msg.from, []);
  const history = chatHistory.get(msg.from);
  history.push(`Customer: ${msg.body}`);
  if (history.length > 6) history.shift();
  
  const historyStr = history.slice(0, -1).join('\n');

  // Kirim ke Gemini untuk di-parsing
  const { context: businessContext, shopName } = await getBusinessContext();
  const parsedData = await parseBookingMessage(msg.body, businessContext, historyStr, shopName);
  
  if (parsedData) {
    console.log('[GEMINI PARSED]', JSON.stringify(parsedData, null, 2));

    const hasActiveState = conversationState.has(msg.from);

    // [BUG FIX]: Intercept natural replies from Gemini even when in active state
    // so questions like "jam berapa bukanya?" get answered naturally instead of repeating the missing field prompt.
    if (!parsedData.isBookingIntent && parsedData.naturalReply && hasActiveState) {
      const oldState = conversationState.get(msg.from) || { nama: null, hari: null, jam: null, servis: null, kapster: null };
      
      const merged = {
        nama: parsedData.nama ?? oldState.nama,
        hari: mentionsDay(msg.body) ? (parsedData.hari ?? oldState.hari) : oldState.hari,
        jam: parsedData.jam ?? oldState.jam,
        servis: parsedData.servis ?? oldState.servis,
        kapster: parsedData.kapster ?? oldState.kapster
      };
      
      conversationState.set(msg.from, { ...merged, awaitingConfirmation: false, lastUpdated: Date.now() });

      try {
        console.log('[REPLY ATTEMPT] mencoba membalas natural reply (interupsi) ke', msg.from);
        await replyAndSaveHistory(msg, parsedData.naturalReply);
      } catch (err) {
        console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
      }
      return; // Stop here so it doesn't fall through to the booking form loop
    }

    const effectiveBookingIntent = parsedData.isBookingIntent || hasActiveState;

    if (effectiveBookingIntent === true) {
      const oldState = conversationState.get(msg.from) || { nama: null, hari: null, jam: null, servis: null, kapster: null };
      
      const merged = {
        nama: parsedData.nama ?? oldState.nama,
        hari: mentionsDay(msg.body) ? (parsedData.hari ?? oldState.hari) : oldState.hari,
        jam: parsedData.jam ?? oldState.jam,
        servis: parsedData.servis ?? oldState.servis,
        kapster: parsedData.kapster ?? oldState.kapster
      };
      
      conversationState.set(msg.from, { ...merged, awaitingConfirmation: oldState.awaitingConfirmation || false, lastUpdated: Date.now() });

      let missing = [];
      if (!merged.hari) missing.push('hari apa');
      if (!merged.jam) missing.push('jam berapa');
      if (!merged.servis) missing.push('mau potong apa (misal: cukur, creambath)');
      if (!merged.nama) missing.push('atas nama siapa');

      /*
       * Alur keputusan konfirmasi booking:
       *
       * (a) Ada field yang masih kosong (missing.length > 0):
       *     → Tanya field yang kurang, set awaitingConfirmation = false, JANGAN simpan ke Supabase.
       *
       * (b) Semua field sudah terisi DAN oldState.awaitingConfirmation === true
       *     (artinya bot sudah kirim ringkasan dan sedang menunggu jawaban customer):
       *     → Cek isi pesan: apakah mengandung kata konfirmasi ('ya', 'iya', 'oke', dst)?
       *       - YA  → insert ke Supabase, balas sukses, hapus state.
       *       - TIDAK → customer kemungkinan koreksi data; reset awaitingConfirmation = false,
       *                 lanjut ke cabang (c) untuk kirim ringkasan ulang dengan data baru.
       *
       * (c) Semua field sudah terisi DAN awaitingConfirmation belum/sudah di-reset ke false:
       *     → Kirim ringkasan data, minta konfirmasi eksplisit, set awaitingConfirmation = true.
       *       JANGAN insert ke Supabase dulu.
       */

      const KONFIRMASI_WORDS = ['ya', 'iya', 'benar', 'yes', 'oke', 'ok', 'betul', 'sip', 'siap'];
      const textNormalized = (msg.body || '').trim().toLowerCase();
      const isKonfirmasi = KONFIRMASI_WORDS.some(w => textNormalized === w || textNormalized.startsWith(w + ' ') || textNormalized.endsWith(' ' + w) || textNormalized.includes(' ' + w + ' '));

      if (missing.length > 0) {
        // (a) Ada field kosong — tanya, reset awaitingConfirmation
        let known = [];
        if (merged.hari) known.push(`hari ${merged.hari}`);
        if (merged.jam) known.push(`jam ${merged.jam}`);
        if (merged.servis) known.push(`servis ${merged.servis}`);
        if (merged.nama) known.push(`Kak ${merged.nama}`);

        let intro = known.length > 0 
          ? `Baik, untuk ${known.join(', ')} ya kak.` 
          : `Halo kak! Untuk booking jadwalnya,`;

        let missingStr = missing.length > 1 
          ? missing.slice(0, -1).join(', ') + ', dan ' + missing[missing.length - 1]
          : missing[0];

        conversationState.set(msg.from, { ...merged, awaitingConfirmation: false, lastUpdated: Date.now() });

        try {
          console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
          await replyAndSaveHistory(msg, `${intro} Boleh info ${missingStr}?`);
        } catch (err) {
          console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
        }

      } else if (oldState.awaitingConfirmation === true) {
        // (b) Semua terisi & sedang menunggu konfirmasi
        if (isKonfirmasi) {
          try {
            // CEK KETERSEDIAAN + INSERT dibungkus withBookingLock supaya
            // atomik terhadap customer LAIN yang confirm bersamaan -- tanpa
            // ini, dua booking bisa lolos checkAvailability() bareng
            // sebelum salah satu sempat ke-insert, jadi ke-assign kapster
            // yang sama. Semua langkah SETELAH insert (kirim balasan,
            // generate QR Xendit) sengaja di LUAR lock -- baris itu udah
            // kesimpen, customer berikutnya yang checkAvailability() bakal
            // lihat baris ini dengan benar walau QR-nya masih diproses.
            // Pakai oldState.kapster (bukan merged.kapster) buat cek+simpan --
            // insiden nyata: customer balas "ya" doang, tapi Gemini di-panggil
            // ULANG buat parse pesan itu (semua pesan selalu di-Gemini-in) dan
            // "ngarang" nama kapster dari daftar di system prompt walau "ya"
            // jelas nggak nyebut siapapun. Kalau dipakai merged.kapster,
            // karangan itu nimpa kapster yang udah BENER ditentuin & ditampilin
            // di ringkasan konfirmasi sebelumnya, bikin dua customer beda
            // ke-assign kapster yang sama walau checkAvailability() jalan
            // sempurna. oldState.kapster = persis apa yang customer udah liat
            // & setujui, satu-satunya sumber kebenaran pas "ya" doang.
            const lockResult = await withBookingLock(async () => {
              const { conflict, msg: conflictMsg, assignedBarber } = await checkAvailability(merged.hari, merged.jam, oldState.kapster);
              if (conflict) {
                return { outcome: 'conflict', conflictMsg };
              }

              const finalKapster = assignedBarber || oldState.kapster;
              const realPhone = await resolveRealPhone(msg.from);
              const finalService = `${merged.servis}|BARBER:${finalKapster}`;
              const price = await getServicePrice(merged.servis);

              if (price == null) {
                // Harga servis nggak ketemu — fail OPEN, jangan blokir booking
                // cuma gara-gara lookup harga gagal. Balik ke perilaku lama
                // (insert langsung, nggak ada DP).
                console.error('[DP SKIP] harga servis tidak ditemukan untuk', merged.servis, '— booking diproses tanpa DP.');
                const { error } = await supabase.from('whatsapp_requests').insert({
                  sender_name: merged.nama,
                  sender_phone: realPhone,
                  sender_wa_id: msg.from,
                  raw_message: msg.body,
                  extracted_day: merged.hari,
                  extracted_time: merged.jam,
                  extracted_service: finalService,
                  is_booking_intent: true
                });
                if (error) console.error('[DB SAVE ERROR]', error.message);
                else console.log('[DB SAVED] booking tersimpan ke database untuk', msg.from, '(tanpa DP)');
                return { outcome: 'noDp', finalKapster };
              }

              const dpAmount = calculateDp(price);
              const referenceId = `wa-${crypto.randomUUID()}`;
              const paymentExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

              // Insert DULU (status awal 'unpaid') supaya dashboard langsung
              // bisa nunjukin booking ini sebagai "menunggu pembayaran",
              // sebelum QR-nya bahkan sempat dikirim.
              const { data: insertedRow, error: insertError } = await supabase
                .from('whatsapp_requests')
                .insert({
                  sender_name: merged.nama,
                  sender_phone: realPhone,
                  sender_wa_id: msg.from,
                  raw_message: msg.body,
                  extracted_day: merged.hari,
                  extracted_time: merged.jam,
                  extracted_service: finalService,
                  is_booking_intent: true,
                  payment_status: 'unpaid',
                  dp_amount: dpAmount,
                  xendit_reference_id: referenceId,
                  payment_expires_at: paymentExpiresAt
                })
                .select()
                .single();

              if (insertError || !insertedRow) {
                console.error('[DB SAVE ERROR]', insertError && insertError.message);
                return { outcome: 'insertError' };
              }
              console.log('[DB SAVED] booking (unpaid) tersimpan ke database untuk', msg.from);
              return { outcome: 'dp', insertedRow, dpAmount, referenceId };
            });

            if (lockResult.outcome === 'conflict') {
              conversationState.set(msg.from, { ...merged, jam: null, kapster: null, awaitingConfirmation: false, lastUpdated: Date.now() });
              console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
              await replyAndSaveHistory(msg, `Waduh kak, barusan saja jadwalnya diambil orang lain. ${lockResult.conflictMsg}`);
              return;
            }

            if (lockResult.outcome === 'insertError') {
              await replyAndSaveHistory(msg, 'Waduh kak, ada gangguan pas nyimpen booking-nya. Boleh dicoba lagi sebentar lagi ya.');
              conversationState.delete(msg.from);
              return;
            }

            if (lockResult.outcome === 'noDp') {
              await replyAndSaveHistory(msg, `Sip kak! Booking sudah lengkap:\n\nHari: ${merged.hari}\nJam: ${merged.jam}\nServis: ${merged.servis}\nKapster: ${lockResult.finalKapster}\nNama: ${merged.nama}\n\nTerima kasih, ditunggu kedatangannya!`);
              conversationState.delete(msg.from);
              return;
            }

            // outcome === 'dp'
            const { insertedRow, dpAmount, referenceId } = lockResult;
            try {
              const { id: xenditQrId, qrString } = await createQrisPaymentRequest({ referenceId, amount: dpAmount });
              // xendit_qr_id (id payment request) disimpan di sini karena
              // itu yang beneran dipakai buat cocokin webhook nanti --
              // webhook `payment.succeeded` bawa `data.reference_id` milik
              // payment_method di dalamnya (bukan reference_id kita), yang
              // cocok cuma `data.payment_request_id`. Lihat catatan di
              // xenditClient.js.
              await supabase.from('whatsapp_requests').update({ xendit_qr_id: xenditQrId }).eq('id', insertedRow.id);

              const qrPngBase64 = await QRCode.toDataURL(qrString).then(dataUrl => dataUrl.split(',')[1]);
              const media = new MessageMedia('image/png', qrPngBase64);
              const caption = `Hampir selesai kak! Tinggal bayar DP Rp${dpAmount.toLocaleString('id-ID')} (50% dari total) lewat QRIS di atas, scan pakai e-wallet/m-banking apa aja ya. Slot ditahan 30 menit — kalau lewat, booking otomatis batal dan kakak perlu booking ulang.`;

              await sendMediaWithDelay(msg.from, media, caption);
              console.log('[QR SENT] QR pembayaran DP terkirim ke', msg.from);
            } catch (err) {
              console.error('[XENDIT ERROR]', err.message, '| reference:', referenceId);
              if (err.response && err.response.data) {
                console.error('[XENDIT ERROR DETAIL]', JSON.stringify(err.response.data));
              }
              await supabase.from('whatsapp_requests').update({ payment_status: 'failed' }).eq('id', insertedRow.id);
              try {
                await replyAndSaveHistory(msg, 'Waduh kak, ada gangguan pas nyiapin pembayaran DP-nya. Boleh dicoba booking ulang beberapa saat lagi ya.');
              } catch (replyErr) {
                console.error('[REPLY ERROR]', replyErr.message, '| target:', msg.from);
              }
            }

            conversationState.delete(msg.from);
          } catch (err) {
            console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
          }
        } else {
          // Customer kirim sesuatu lain (kemungkinan koreksi) — reset & minta konfirmasi ulang
          console.log('[CONFIRM RESET] pesan bukan konfirmasi, kirim ringkasan ulang ke', msg.from);
          
          // Langsung jatuh ke cabang (c): kirim ringkasan & minta konfirmasi ulang
          conversationState.set(msg.from, { ...merged, awaitingConfirmation: true, lastUpdated: Date.now() });
          try {
            console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
            const kapsterText = merged.kapster ? ` dengan kapster ${merged.kapster}` : '';
            await replyAndSaveHistory(msg, `Baik kak, jadi booking untuk hari ${merged.hari} jam ${merged.jam}, servis ${merged.servis}${kapsterText}, atas nama ${merged.nama} -- benar begitu kak? Balas 'ya' untuk konfirmasi ya.`);
          } catch (err) {
            console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
          }
        }
      } else {
        // (c) Semua terisi tapi belum pernah minta konfirmasi — kirim ringkasan & minta konfirmasi
        
        // CEK KETERSEDIAAN DULU
        const { conflict, msg: conflictMsg, assignedBarber } = await checkAvailability(merged.hari, merged.jam, merged.kapster);
        if (conflict) {
          // Ada bentrok, minta ubah data
          conversationState.set(msg.from, { ...merged, jam: null, kapster: null, awaitingConfirmation: false, lastUpdated: Date.now() });
          try {
            console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
            await replyAndSaveHistory(msg, conflictMsg);
          } catch (err) {
            console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
          }
          return;
        }

        // Simpan kapster yang ditugaskan ke state agar konsisten
        merged.kapster = assignedBarber;
        conversationState.set(msg.from, { ...merged, awaitingConfirmation: true, lastUpdated: Date.now() });
        try {
          console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
          await replyAndSaveHistory(msg, `Baik kak, jadi booking untuk hari ${merged.hari} jam ${merged.jam}, servis ${merged.servis} dengan kapster **${assignedBarber}**, atas nama ${merged.nama} -- benar begitu kak? Balas 'ya' untuk konfirmasi ya.`);
        } catch (err) {
          console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
        }
      }
    } else {
      if (parsedData.naturalReply) {
        try {
          console.log('[REPLY ATTEMPT] mencoba membalas natural reply ke', msg.from);
          await replyAndSaveHistory(msg, parsedData.naturalReply);
        } catch (err) {
          console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
        }
      }
    }
  } else {
    console.log('[GEMINI SKIPPED/FAILED] Gagal parsing pesan ini.');
  }
});

// Sweep tiap menit: booking yang statusnya masih 'unpaid' tapi udah lewat
// batas waktu (payment_expires_at) otomatis ditandai 'expired' -- slot
// dilepas, nggak nyangkut nunggu bayar selamanya. Baris expired TETAP
// disimpan (bukan dihapus) buat catatan, cuma disembunyikan dari dashboard
// di sisi frontend.
setInterval(async () => {
  const { error } = await supabase
    .from('whatsapp_requests')
    .update({ payment_status: 'expired' })
    .eq('payment_status', 'unpaid')
    .lt('payment_expires_at', new Date().toISOString());
  if (error) console.error('[EXPIRY SWEEP ERROR]', error.message);
}, 60 * 1000);

// Webhook Xendit -- server HTTP kecil yang nebeng di proses Node yang sama
// (bukan proses PM2 terpisah), diakses publik lewat Cloudflare Tunnel yang
// nunjuk ke localhost:3002 di VPS. SENGAJA cuma 1 route, di-bind ke
// 127.0.0.1 doang (nggak bisa diakses langsung dari luar VPS kecuali lewat
// tunnel), dan verifikasi token adalah baris PERTAMA sebelum nyentuh apapun
// lain -- proyek ini pernah kena insiden API yang lupa dikasih otentikasi,
// endpoint ini didesain sejak awal buat nggak ngulang itu (lihat PROJECT.md).
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
      // Idempotency guard -- webhook Xendit bisa di-retry, ini aman diproses ulang.
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

  // Bukan payment_request DP booking WhatsApp -- cek queue_entries (pembayaran
  // SISA lewat QRIS yang di-generate dari dashboard pas "Selesaikan Sesi").
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

// Endpoint buat dashboard (frontend) minta QR pembayaran SISA (bukan DP) --
// dipanggil pas barber pilih "QRIS" di dialog Selesaikan Sesi buat customer
// yang bayar langsung di tempat. CORS dibatasi ke origin dashboard aja
// (DASHBOARD_ORIGINS, comma-separated) -- endpoint ini bisa bikin payment
// request beneran ke akun Xendit toko, jangan biarin situs sembarangan manggil.
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

// Halaman demo "kayak e-wallet" -- SENGAJA DIBUAT BUAT DEMO KE BARBER, bukan
// bagian alur produk asli. Customer beneran tetap bayar lewat scan QRIS di
// WhatsApp seperti biasa; halaman ini cuma jalan pintas biar demo bisa
// dilakuin dari HP (tanpa laptop/terminal) buat mensimulasikan pembayaran
// Test Mode, gantiin panggilan curl manual. Dilindungi passcode (DEMO_SECRET)
// di query string -- bukan keamanan tingkat produksi, tapi cukup buat
// nyegah akses sembarangan ke data test customer selama demo berlangsung.
// Data yang kesentuh cuma booking sandbox (nggak ada uang asli).
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

  // QR sungguhan dari Xendit Test Mode isinya placeholder generik (bukan
  // data unik per booking) -- jadi "scan" di sini nggak bener-bener baca isi
  // QR-nya buat nentuin booking, cukup pakai keberhasilan deteksi QR APAPUN
  // sebagai trigger buat bayar booking ter-anyar yang masih nunggu.
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

// List gabungan 2 sumber "menunggu bayar": DP booking WhatsApp
// (whatsapp_requests) DAN sisa bayar QRIS yang di-generate dari dashboard
// (queue_entries) -- keduanya dibedain lewat field `type` biar /demo/api/pay
// tau harus baca/update tabel mana.
webhookApp.get('/demo/api/list', async (req, res) => {
  if (!verifyDemoPasscode(req.query.kode)) return res.status(401).json({ error: 'unauthorized' });

  const { data: waRows, error: waError } = await supabase
    .from('whatsapp_requests')
    .select('id, sender_name, dp_amount, extracted_day, extracted_time, extracted_service')
    .eq('payment_status', 'unpaid')
    .not('xendit_qr_id', 'is', null) // buang booking lama pra-fitur DP (payment_status default 'unpaid' tapi nggak pernah ada QR)
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

client.initialize();

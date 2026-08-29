require('dotenv').config();
const crypto = require('crypto');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode'); // beda dari qrcode-terminal di atas -- ini buat generate PNG QR pembayaran
const { parseBookingMessage } = require('./services/gemini');
const supabase = require('./supabaseClient');
const { getServicePrice, calculateDp } = require('./services/priceLookup');
const { createQrisPaymentRequest } = require('./services/xenditClient');
const { getTargetDateStr, mentionsDay, checkAvailability, checkExistingBookingSameDay, getShopName, getBusinessContext } = require('./services/bookingDomain');
const { startWebhookServer } = require('./webhookServer');

const conversationState = new Map();
const chatHistory = new Map();

// Skip pesan yang timestamp-nya sebelum ini -- cegah replay pesan lama pas restart.
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// Safety net tambahan: cegah 1 pesan diproses dua kali.
const processedMessageIds = new Set();
const MAX_TRACKED_MESSAGE_IDS = 500;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Lock in-memory buat serialize "cek ketersediaan -> insert booking" --
// tanpa ini, 2 customer confirm bareng bisa ke-assign kapster yang sama.
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

// Tunjukin indikator "sedang mengetik" + jeda acak sebelum kirim, biar nggak kelihatan kayak bot.
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

// Sama kayak replyAndSaveHistory, tapi buat pesan yang diinisiasi bot sendiri (mis. notifikasi approve/reject).
async function sendMessageWithDelay(chatId, text) {
  await waitWithTypingIndicator(() => client.getChatById(chatId), text);
  await client.sendMessage(chatId, text);
}

// Sama kayak sendMessageWithDelay, tapi buat kirim media (gambar QR) + caption.
async function sendMediaWithDelay(chatId, media, caption) {
  await waitWithTypingIndicator(() => client.getChatById(chatId), caption || '');
  await client.sendMessage(chatId, media, { caption });
}

// getTargetDateStr/mentionsDay/checkAvailability/checkExistingBookingSameDay/
// getShopName/getBusinessContext dipindah ke ./bookingDomain.js.

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

// whatsapp-web.js bisa disconnect diam-diam tanpa proses Node crash --
// exit eksplisit biar PM2 restart & bikin sesi Puppeteer baru.
client.on('disconnected', (reason) => {
  console.log('[DISCONNECTED]', reason, '- keluar biar PM2 restart proses ini.');
  process.exit(1);
});

// Resolve nomor asli dari WA ID (@c.us atau @lid) -- query ulang ke server WA, fallback manual kalau gagal.
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

// Kirim notifikasi approve/reject ke customer. Prioritaskan sender_wa_id
// (ID chat asli) -- rekonstruksi manual dari sender_phone bisa gagal buat sebagian kontak.
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

// Kirim ulang notifikasi approve/reject yang tertunda (mis. bot lagi mati pas kapster mutusin).
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

// Dengerin approve/reject dari dashboard lewat Supabase Realtime, kirim notifikasi WA.
// Idempotent lewat kolom status_notified (bukan state in-memory).
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

      // (a) ada field kosong -> tanya. (b) udah lengkap + nunggu konfirmasi -> cek "ya"/"tidak".
      // (c) udah lengkap, belum minta konfirmasi -> kirim ringkasan.

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
            // Cek+insert dibungkus lock biar atomik; kirim balasan/QR di LUAR lock.
            // Pakai oldState.kapster (bukan merged.kapster) -- Gemini kadang ngarang
            // nama kapster di follow-up "ya" doang, oldState = yang udah disetujui customer.
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
                // Harga nggak ketemu -- fail open, insert tanpa DP daripada blokir booking.
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

              // Insert dulu (status 'unpaid') biar dashboard langsung nunjukin "menunggu pembayaran".
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
              // xendit_qr_id = payment_request_id, yang beneran dipakai webhook buat matching (lihat xenditClient.js).
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
            const realPhone = await resolveRealPhone(msg.from);
            const dup = await checkExistingBookingSameDay(realPhone, getTargetDateStr(merged.hari));
            const dupWarning = dup ? `⚠️ Kak, kamu udah ada booking jam ${dup.jam} di hari yang sama ya. ` : '';
            await replyAndSaveHistory(msg, `${dupWarning}Baik kak, jadi booking untuk hari ${merged.hari} jam ${merged.jam}, servis ${merged.servis}${kapsterText}, atas nama ${merged.nama} -- benar begitu kak? Balas 'ya' untuk konfirmasi ya.`);
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
          const realPhone = await resolveRealPhone(msg.from);
          const dup = await checkExistingBookingSameDay(realPhone, getTargetDateStr(merged.hari));
          const dupWarning = dup ? `⚠️ Kak, kamu udah ada booking jam ${dup.jam} di hari yang sama ya. ` : '';
          await replyAndSaveHistory(msg, `${dupWarning}Baik kak, jadi booking untuk hari ${merged.hari} jam ${merged.jam}, servis ${merged.servis} dengan kapster **${assignedBarber}**, atas nama ${merged.nama} -- benar begitu kak? Balas 'ya' untuk konfirmasi ya.`);
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

// Server webhook + halaman demo (webhook Xendit, endpoint QR sisa bayar,
// demo simulasi bayar) dipindah ke ./webhookServer.js.
startWebhookServer({ sendMessageWithDelay });

client.initialize();

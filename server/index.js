require('dotenv').config();
const crypto = require('crypto');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode'); // berbeda dari qrcode-terminal di atas — package ini digunakan untuk menghasilkan PNG QR pembayaran
const { parseBookingMessage } = require('./services/gemini');
const supabase = require('./supabaseClient');
const { getServicePrice, calculateDp } = require('./services/priceLookup');
const { createQrisPaymentRequest } = require('./services/xenditClient');
const { getTargetDateStr, mentionsDay, checkAvailability, checkExistingBookingSameDay, getShopName, getBusinessContext } = require('./services/bookingDomain');
const { startWebhookServer } = require('./webhookServer');

const conversationState = new Map();
const chatHistory = new Map();

// Pesan dengan timestamp sebelum nilai ini akan dilewati, untuk mencegah pesan lama diproses ulang saat restart.
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// Safety net tambahan: mencegah satu pesan diproses lebih dari sekali.
const processedMessageIds = new Set();
const MAX_TRACKED_MESSAGE_IDS = 500;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Lock in-memory untuk menyerialisasi proses "periksa ketersediaan -> insert booking".
// Tanpa lock ini, dua customer yang melakukan konfirmasi bersamaan berpotensi
// dialokasikan ke kapster yang sama.
let bookingLock = Promise.resolve();
function withBookingLock(fn) {
  const run = bookingLock.then(fn, fn);
  bookingLock = run.then(() => {}, () => {}); // error di satu booking jangan macetin antrian booking berikutnya
  return run;
}

// Menghitung jeda alami sebelum mengirim pesan — jeda dasar 1.5-3 detik ditambah
// durasi yang mengikuti panjang teks (menyerupai kecepatan mengetik manusia),
// dibatasi maksimal sekitar 7 detik.
function computeNaturalDelay(text) {
  const baseDelay = randomBetween(1500, 3000);
  const typingDelay = text.length * 30;
  return Math.min(baseDelay + typingDelay, 7000);
}

// Menampilkan indikator "sedang mengetik" dan jeda acak sebelum mengirim, agar tidak terlihat seperti balasan bot.
async function waitWithTypingIndicator(getChat, textForDelay) {
  try {
    const chat = await getChat();
    await chat.sendStateTyping();
  } catch (err) {
    // Bersifat non-fatal — tetap lanjut tanpa indikator typing apabila pengambilan chat gagal.
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

// Serupa dengan replyAndSaveHistory, namun untuk pesan yang diinisiasi oleh bot sendiri (misalnya notifikasi approve/reject).
async function sendMessageWithDelay(chatId, text) {
  await waitWithTypingIndicator(() => client.getChatById(chatId), text);
  await client.sendMessage(chatId, text);
}

// Serupa dengan sendMessageWithDelay, namun untuk mengirim media (gambar QR) beserta caption.
async function sendMediaWithDelay(chatId, media, caption) {
  await waitWithTypingIndicator(() => client.getChatById(chatId), caption || '');
  await client.sendMessage(chatId, media, { caption });
}

// getTargetDateStr/mentionsDay/checkAvailability/checkExistingBookingSameDay/
// getShopName/getBusinessContext telah dipindahkan ke ./bookingDomain.js.

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

// whatsapp-web.js dapat terputus secara diam-diam tanpa membuat proses Node crash.
// Exit secara eksplisit di sini agar PM2 melakukan restart dan membuat sesi Puppeteer baru.
client.on('disconnected', (reason) => {
  console.log('[DISCONNECTED]', reason, '- keluar biar PM2 restart proses ini.');
  process.exit(1);
});

// Meresolusi nomor asli dari WA ID (@c.us atau @lid) dengan melakukan query ulang ke
// server WhatsApp, dengan fallback manual apabila query gagal.
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

// Mengirim notifikasi approve/reject ke customer. sender_wa_id (ID chat asli)
// diprioritaskan karena rekonstruksi manual dari sender_phone dapat gagal untuk sebagian kontak.
async function notifyStatusChange(row) {
  if (!row.sender_wa_id && !row.sender_phone) {
    console.error('[NOTIFY SKIP] sender_wa_id & sender_phone kosong, tidak bisa kirim notifikasi | id:', row.id);
    return;
  }

  const [servis, barber] = (row.extracted_service || '').split('|BARBER:');
  const namaText = row.sender_name ? ` ${row.sender_name}` : '';

  let text;
  if (row.status === 'approved') {
    const barberText = barber ? `, kapster ${barber}` : '';
    const shopName = await getShopName();
    text = `Halo Kak${namaText}, booking untuk ${row.extracted_day} jam ${row.extracted_time} (${servis}${barberText}) sudah dikonfirmasi. Kami tunggu kedatangannya di ${shopName}.`;
  } else if (row.status === 'rejected') {
    text = `Mohon maaf, Kak${namaText}, slot ${row.extracted_day} jam ${row.extracted_time} ternyata tidak tersedia. Silakan hubungi kami kembali apabila ingin mencari jadwal lain.`;
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

// Mengirim ulang notifikasi approve/reject yang tertunda (misalnya karena bot sedang tidak aktif saat kapster memutuskan).
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

// Mendengarkan perubahan approve/reject dari dashboard melalui Supabase Realtime,
// lalu mengirim notifikasi WhatsApp. Bersifat idempotent melalui kolom
// status_notified (bukan state in-memory).
supabase
  .channel('whatsapp_requests_status')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_requests' }, async payload => {
    const id = payload.new && payload.new.id;
    if (!id) return;

    // Melakukan re-fetch baris lengkap berdasarkan ID, karena isi payload realtime mentah
    // tidak dapat sepenuhnya diandalkan (dapat berbeda tergantung konfigurasi REPLICA IDENTITY tabel).
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
  // Housekeeping: menghapus state percakapan yang berusia lebih dari 30 menit.
  const now = Date.now();
  for (const [key, state] of conversationState.entries()) {
    if (now - state.lastUpdated > 30 * 60 * 1000) {
      conversationState.delete(key);
    }
  }

  // 1. Melewati pesan dari bot/diri sendiri
  if (msg.fromMe) return;

  // 2. Melewati pesan dari grup WhatsApp
  if (msg.from.endsWith('@g.us')) return;

  // Melewati update status WhatsApp
  if (msg.from === 'status@broadcast') return;

  // Melewati pesan dengan timestamp sebelum proses ini dimulai — mencegah pesan lama
  // diproses dan dibalas ulang saat whatsapp-web.js membaca ulang pesan terakhir
  // pada sesi reconnect setelah restart.
  if (msg.timestamp && msg.timestamp < BOT_START_TIME) {
    console.log('[SKIP STALE MESSAGE] pesan dari sebelum bot ini nyala, diabaikan:', msg.from);
    return;
  }

  // Melewati pesan yang ID-nya sudah pernah diproses (safety net tambahan).
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

  // 3. Melewati pesan yang terlalu pendek, hanya apabila pengguna belum berada dalam state percakapan
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

  // Mengirim pesan ke Gemini untuk diparsing.
  const { context: businessContext, shopName } = await getBusinessContext();
  const parsedData = await parseBookingMessage(msg.body, businessContext, historyStr, shopName);
  
  if (parsedData) {
    console.log('[GEMINI PARSED]', JSON.stringify(parsedData, null, 2));

    const hasActiveState = conversationState.has(msg.from);

    // Menangani natural reply dari Gemini meskipun state percakapan sedang aktif,
    // sehingga pertanyaan seperti "jam berapa bukanya?" dijawab secara natural,
    // bukan diulang dengan prompt field yang belum lengkap.
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
      if (!merged.hari) missing.push('hari yang diinginkan');
      if (!merged.jam) missing.push('jam yang diinginkan');
      if (!merged.servis) missing.push('jenis layanan yang diinginkan (misalnya: cukur, creambath)');
      if (!merged.nama) missing.push('nama untuk booking');

      // (a) Terdapat field yang kosong -> tanyakan field tersebut. (b) Semua field lengkap dan
      // sedang menunggu konfirmasi -> periksa jawaban "ya"/"tidak". (c) Semua field lengkap namun
      // belum meminta konfirmasi -> kirim ringkasan.

      const KONFIRMASI_WORDS = ['ya', 'iya', 'benar', 'yes', 'oke', 'ok', 'betul', 'sip', 'siap'];
      const textNormalized = (msg.body || '').trim().toLowerCase();
      const isKonfirmasi = KONFIRMASI_WORDS.some(w => textNormalized === w || textNormalized.startsWith(w + ' ') || textNormalized.endsWith(' ' + w) || textNormalized.includes(' ' + w + ' '));

      if (missing.length > 0) {
        // (a) Terdapat field yang kosong — menanyakan field tersebut, dan mereset awaitingConfirmation.
        let known = [];
        if (merged.hari) known.push(`hari ${merged.hari}`);
        if (merged.jam) known.push(`jam ${merged.jam}`);
        if (merged.servis) known.push(`layanan ${merged.servis}`);
        if (merged.nama) known.push(`atas nama ${merged.nama}`);

        let intro = known.length > 0
          ? `Baik, untuk ${known.join(', ')}.`
          : `Halo, Kak. Untuk booking jadwal,`;

        let missingStr = missing.length > 1
          ? missing.slice(0, -1).join(', ') + ', dan ' + missing[missing.length - 1]
          : missing[0];

        conversationState.set(msg.from, { ...merged, awaitingConfirmation: false, lastUpdated: Date.now() });

        try {
          console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
          await replyAndSaveHistory(msg, `${intro} Mohon informasikan ${missingStr}.`);
        } catch (err) {
          console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
        }

      } else if (oldState.awaitingConfirmation === true) {
        // (b) Semua field terisi dan sedang menunggu konfirmasi
        if (isKonfirmasi) {
          try {
            // Pemeriksaan ketersediaan dan proses insert dibungkus dalam lock agar bersifat
            // atomik; pengiriman balasan/QR dilakukan DI LUAR lock. oldState.kapster (bukan
            // merged.kapster) digunakan karena Gemini kadang menghasilkan nama kapster yang
            // tidak sesuai pada follow-up berupa "ya" saja — oldState adalah nilai yang
            // sudah disetujui oleh customer.
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
                // Harga tidak ditemukan — fail open dengan melakukan insert tanpa DP, alih-alih memblokir booking.
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

              // Melakukan insert terlebih dahulu (status 'unpaid') agar dashboard segera menampilkan status "menunggu pembayaran".
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
              await replyAndSaveHistory(msg, `Mohon maaf, Kak, jadwal tersebut baru saja diambil oleh pelanggan lain. ${lockResult.conflictMsg}`);
              return;
            }

            if (lockResult.outcome === 'insertError') {
              await replyAndSaveHistory(msg, 'Mohon maaf, Kak, terjadi kendala saat menyimpan booking. Silakan coba lagi dalam beberapa saat.');
              conversationState.delete(msg.from);
              return;
            }

            if (lockResult.outcome === 'noDp') {
              await replyAndSaveHistory(msg, `Baik, Kak. Booking sudah lengkap:\n\nHari: ${merged.hari}\nJam: ${merged.jam}\nServis: ${merged.servis}\nKapster: ${lockResult.finalKapster}\nNama: ${merged.nama}\n\nTerima kasih, kami tunggu kedatangannya.`);
              conversationState.delete(msg.from);
              return;
            }

            // outcome === 'dp'
            const { insertedRow, dpAmount, referenceId } = lockResult;
            try {
              const { id: xenditQrId, qrString } = await createQrisPaymentRequest({ referenceId, amount: dpAmount });
              // xendit_qr_id merupakan payment_request_id yang digunakan webhook untuk pencocokan (lihat xenditClient.js).
              await supabase.from('whatsapp_requests').update({ xendit_qr_id: xenditQrId }).eq('id', insertedRow.id);

              const qrPngBase64 = await QRCode.toDataURL(qrString).then(dataUrl => dataUrl.split(',')[1]);
              const media = new MessageMedia('image/png', qrPngBase64);
              const caption = `Booking hampir selesai, Kak. Silakan bayar DP sebesar Rp${dpAmount.toLocaleString('id-ID')} (50% dari total) melalui QRIS di atas, dapat dipindai menggunakan e-wallet atau m-banking apa pun. Slot ditahan selama 30 menit; apabila melewati batas waktu tersebut, booking akan otomatis dibatalkan dan perlu dilakukan booking ulang.`;

              await sendMediaWithDelay(msg.from, media, caption);
              console.log('[QR SENT] QR pembayaran DP terkirim ke', msg.from);
            } catch (err) {
              console.error('[XENDIT ERROR]', err.message, '| reference:', referenceId);
              if (err.response && err.response.data) {
                console.error('[XENDIT ERROR DETAIL]', JSON.stringify(err.response.data));
              }
              await supabase.from('whatsapp_requests').update({ payment_status: 'failed' }).eq('id', insertedRow.id);
              try {
                await replyAndSaveHistory(msg, 'Mohon maaf, Kak, terjadi kendala saat menyiapkan pembayaran DP. Silakan coba melakukan booking ulang dalam beberapa saat.');
              } catch (replyErr) {
                console.error('[REPLY ERROR]', replyErr.message, '| target:', msg.from);
              }
            }

            conversationState.delete(msg.from);
          } catch (err) {
            console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
          }
        } else {
          // Customer mengirimkan hal lain (kemungkinan koreksi data) — mereset state dan meminta konfirmasi ulang.
          console.log('[CONFIRM RESET] pesan bukan konfirmasi, kirim ringkasan ulang ke', msg.from);

          // Melanjutkan langsung ke cabang (c): mengirim ringkasan dan meminta konfirmasi ulang.
          conversationState.set(msg.from, { ...merged, awaitingConfirmation: true, lastUpdated: Date.now() });
          try {
            console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
            const kapsterText = merged.kapster ? ` dengan kapster *${merged.kapster}*` : '';
            const realPhone = await resolveRealPhone(msg.from);
            const dup = await checkExistingBookingSameDay(realPhone, getTargetDateStr(merged.hari));
            const dupWarning = dup ? `Perlu diketahui, Anda sudah memiliki booking pada jam ${dup.jam} di hari yang sama. ` : '';
            await replyAndSaveHistory(msg, `${dupWarning}Baik, berikut ringkasan booking Anda: hari ${merged.hari}, jam ${merged.jam}, layanan ${merged.servis}${kapsterText}, atas nama ${merged.nama}. Apakah data tersebut sudah benar? Silakan balas "ya" untuk konfirmasi.`);
          } catch (err) {
            console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
          }
        }
      } else {
        // (c) Semua field terisi namun belum pernah meminta konfirmasi — mengirim ringkasan dan meminta konfirmasi.

        // Memeriksa ketersediaan terlebih dahulu.
        const { conflict, msg: conflictMsg, assignedBarber } = await checkAvailability(merged.hari, merged.jam, merged.kapster);
        if (conflict) {
          // Terjadi bentrok jadwal — meminta customer mengubah data.
          conversationState.set(msg.from, { ...merged, jam: null, kapster: null, awaitingConfirmation: false, lastUpdated: Date.now() });
          try {
            console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
            await replyAndSaveHistory(msg, conflictMsg);
          } catch (err) {
            console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
          }
          return;
        }

        // Menyimpan kapster yang ditugaskan ke dalam state agar konsisten.
        merged.kapster = assignedBarber;
        conversationState.set(msg.from, { ...merged, awaitingConfirmation: true, lastUpdated: Date.now() });
        try {
          console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
          const realPhone = await resolveRealPhone(msg.from);
          const dup = await checkExistingBookingSameDay(realPhone, getTargetDateStr(merged.hari));
          const dupWarning = dup ? `Perlu diketahui, Anda sudah memiliki booking pada jam ${dup.jam} di hari yang sama. ` : '';
          await replyAndSaveHistory(msg, `${dupWarning}Baik, berikut ringkasan booking Anda: hari ${merged.hari}, jam ${merged.jam}, layanan ${merged.servis} dengan kapster *${assignedBarber}*, atas nama ${merged.nama}. Apakah data tersebut sudah benar? Silakan balas "ya" untuk konfirmasi.`);
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

// Server webhook dan halaman demo (webhook Xendit, endpoint QR sisa pembayaran,
// simulasi pembayaran demo) telah dipindahkan ke ./webhookServer.js.
startWebhookServer({ sendMessageWithDelay });

client.initialize();

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { parseBookingMessage } = require('./gemini');
const supabase = require('./supabaseClient');

const conversationState = new Map();
const API_URL = process.env.API_URL || 'http://localhost:3001';

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
client.on('ready', () => console.log('Client is ready!'));
client.on('message', msg => console.log('[RAW EVENT]', msg.from, msg.type, msg.body));

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

  // 3. Skip pesan yang terlalu pendek HANYA jika pengguna belum ada di state percakapan
  if (!msg.body || (msg.body.trim().length < 5 && !conversationState.has(msg.from))) return;

  console.log(`\\n[NEW MESSAGE] ${msg.from}: ${msg.body}`);

  // Kirim ke Gemini untuk di-parsing
  const parsedData = await parseBookingMessage(msg.body);
  
  if (parsedData) {
    console.log('[GEMINI PARSED]', JSON.stringify(parsedData, null, 2));

    const hasActiveState = conversationState.has(msg.from);
    const effectiveBookingIntent = parsedData.isBookingIntent || hasActiveState;

    if (effectiveBookingIntent === true) {
      const oldState = conversationState.get(msg.from) || { nama: null, hari: null, jam: null, servis: null };
      
      const merged = {
        nama: parsedData.nama ?? oldState.nama,
        hari: parsedData.hari ?? oldState.hari,
        jam: parsedData.jam ?? oldState.jam,
        servis: parsedData.servis ?? oldState.servis
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
          await msg.reply(`${intro} Boleh info ${missingStr}?`);
        } catch (err) {
          console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
        }

      } else if (oldState.awaitingConfirmation === true) {
        // (b) Semua terisi & sedang menunggu konfirmasi
        if (isKonfirmasi) {
          // Customer konfirmasi — simpan ke Supabase
          try {
            console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
            await msg.reply(`Sip kak! Booking sudah lengkap:\\n\\nHari: ${merged.hari}\\nJam: ${merged.jam}\\nServis: ${merged.servis}\\nNama: ${merged.nama}\\n\\nTerima kasih, ditunggu kedatangannya!`);

            try {
              const { error } = await supabase.from('whatsapp_requests').insert({
                sender_name: merged.nama,
                sender_phone: msg.from,
                raw_message: msg.body,
                extracted_day: merged.hari,
                extracted_time: merged.jam,
                extracted_service: merged.servis,
                is_booking_intent: true
              });
              if (error) throw error;
              console.log('[DB SAVED] booking tersimpan ke database untuk', msg.from);
            } catch (err) {
              console.error('[DB SAVE ERROR]', err.message);
            }

            conversationState.delete(msg.from);
          } catch (err) {
            console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
          }
        } else {
          // Customer kirim sesuatu lain (kemungkinan koreksi) — reset & minta konfirmasi ulang
          console.log('[CONFIRM RESET] pesan bukan konfirmasi, kirim ringkasan ulang ke', msg.from);
          conversationState.set(msg.from, { ...merged, awaitingConfirmation: false, lastUpdated: Date.now() });

          // Langsung jatuh ke cabang (c): kirim ringkasan & minta konfirmasi ulang
          conversationState.set(msg.from, { ...merged, awaitingConfirmation: true, lastUpdated: Date.now() });
          try {
            console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
            await msg.reply(`Baik kak, jadi booking untuk hari ${merged.hari} jam ${merged.jam}, servis ${merged.servis}, atas nama ${merged.nama} -- benar begitu kak? Balas 'ya' untuk konfirmasi ya.`);
          } catch (err) {
            console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
          }
        }

      } else {
        // (c) Semua terisi tapi belum pernah minta konfirmasi — kirim ringkasan & minta konfirmasi
        conversationState.set(msg.from, { ...merged, awaitingConfirmation: true, lastUpdated: Date.now() });
        try {
          console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
          await msg.reply(`Baik kak, jadi booking untuk hari ${merged.hari} jam ${merged.jam}, servis ${merged.servis}, atas nama ${merged.nama} -- benar begitu kak? Balas 'ya' untuk konfirmasi ya.`);
        } catch (err) {
          console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
        }
      }
    }
  } else {
    console.log('[GEMINI SKIPPED/FAILED] Gagal parsing pesan ini.');
  }
});

client.initialize();

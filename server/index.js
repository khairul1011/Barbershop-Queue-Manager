require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { parseBookingMessage } = require('./gemini');

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

    if (parsedData.isBookingIntent === true) {
      const oldState = conversationState.get(msg.from) || { nama: null, hari: null, jam: null, servis: null };
      
      const merged = {
        nama: parsedData.nama ?? oldState.nama,
        hari: parsedData.hari ?? oldState.hari,
        jam: parsedData.jam ?? oldState.jam,
        servis: parsedData.servis ?? oldState.servis
      };
      
      conversationState.set(msg.from, { ...merged, lastUpdated: Date.now() });

      let missing = [];
      if (!merged.hari) missing.push('hari apa');
      if (!merged.jam) missing.push('jam berapa');
      if (!merged.servis) missing.push('mau potong apa (misal: cukur, creambath)');
      if (!merged.nama) missing.push('atas nama siapa');

      if (missing.length > 0) {
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

        try {
          console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
          await msg.reply(`${intro} Boleh info ${missingStr}?`);
        } catch (err) {
          console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
        }
      } else {
        try {
          console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
          await msg.reply(`Sip kak! Booking sudah lengkap:\\n\\nHari: ${merged.hari}\\nJam: ${merged.jam}\\nServis: ${merged.servis}\\nNama: ${merged.nama}\\n\\nTerima kasih, ditunggu kedatangannya!`);
          
          try {
            const response = await fetch(`${API_URL}/requests`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                senderName: merged.nama,
                senderPhone: msg.from,
                message: msg.body,
                extractedDay: merged.hari,
                extractedTime: merged.jam,
                extractedService: merged.servis
              })
            });
            if (!response.ok) throw new Error(`API responded with status ${response.status}`);
            console.log('[DB SAVED] booking tersimpan ke database untuk', msg.from);
          } catch (err) {
            console.error('[DB SAVE ERROR]', err.message);
          }
          
          conversationState.delete(msg.from);
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

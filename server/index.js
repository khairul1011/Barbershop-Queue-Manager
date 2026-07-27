require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { parseBookingMessage } = require('./gemini');

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
  // 1. Skip pesan dari bot/diri sendiri
  if (msg.fromMe) return;

  // 2. Skip pesan dari grup WhatsApp
  if (msg.from.endsWith('@g.us')) return;

  // 3. Skip pesan yang terlalu pendek (kurang dari 5 karakter)
  if (!msg.body || msg.body.trim().length < 5) return;

  console.log(`\\n[NEW MESSAGE] ${msg.from}: ${msg.body}`);

  // Kirim ke Gemini untuk di-parsing
  const parsedData = await parseBookingMessage(msg.body);
  
  if (parsedData) {
    console.log('[GEMINI PARSED]', JSON.stringify(parsedData, null, 2));

    if (parsedData.isBookingIntent === true) {
      let missing = [];
      if (!parsedData.hari) missing.push('hari apa');
      if (!parsedData.jam) missing.push('jam berapa');
      if (!parsedData.servis) missing.push('mau potong apa (misal: cukur, creambath)');
      if (!parsedData.nama) missing.push('atas nama siapa');

      if (missing.length > 0) {
        let known = [];
        if (parsedData.hari) known.push(`hari ${parsedData.hari}`);
        if (parsedData.jam) known.push(`jam ${parsedData.jam}`);
        if (parsedData.servis) known.push(`servis ${parsedData.servis}`);
        if (parsedData.nama) known.push(`Kak ${parsedData.nama}`);

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
          await msg.reply(`Sip kak! Booking sudah lengkap:\\n\\nHari: ${parsedData.hari}\\nJam: ${parsedData.jam}\\nServis: ${parsedData.servis}\\nNama: ${parsedData.nama}\\n\\nTerima kasih, ditunggu kedatangannya!`);
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

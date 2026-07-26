require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { parseBookingMessage } = require('./gemini');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
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
  } else {
    console.log('[GEMINI SKIPPED/FAILED] Gagal parsing pesan ini.');
  }
});

client.initialize();

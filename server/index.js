require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { parseBookingMessage } = require('./gemini');
const supabase = require('./supabaseClient');

const conversationState = new Map();
const chatHistory = new Map();

async function replyAndSaveHistory(msg, text) {
  await msg.reply(text);
  if (!chatHistory.has(msg.from)) chatHistory.set(msg.from, []);
  const history = chatHistory.get(msg.from);
  history.push(`Bot: ${text}`);
  if (history.length > 6) history.shift();
}

const API_URL = process.env.API_URL || 'http://localhost:3001';

function getTargetDateStr(dayStr) {
  const d = (dayStr || '').toLowerCase();
  const today = new Date();
  
  let targetIdx = today.getDay();
  if (d.includes('besok')) {
    targetIdx = (today.getDay() + 1) % 7;
  } else if (d.includes('lusa')) {
    targetIdx = (today.getDay() + 2) % 7;
  } else if (d.includes('senin')) targetIdx = 1;
  else if (d.includes('selasa')) targetIdx = 2;
  else if (d.includes('rabu')) targetIdx = 3;
  else if (d.includes('kamis')) targetIdx = 4;
  else if (d.includes('jumat')) targetIdx = 5;
  else if (d.includes('sabtu')) targetIdx = 6;
  else if (d.includes('minggu')) targetIdx = 0;

  const diff = (targetIdx - today.getDay() + 7) % 7;
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function checkAvailability(hariStr, jamStr, kapsterStr) {
  const dateStr = getTargetDateStr(hariStr);
  const { data: queue } = await supabase.from('queue_entries')
    .select('barber_id, scheduled_time, status')
    .eq('scheduled_date', dateStr);
    
  const { data: barbers } = await supabase.from('barbers').select('id, name');
  
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

async function getBusinessContext() {
  try {
    const { data: barbers } = await supabase.from('barbers').select('name, specialization, status').eq('status', 'active');
    const { data: services } = await supabase.from('services').select('name, price, duration_minutes');
    const { data: hours } = await supabase.from('business_hours').select('open_hour, close_hour').limit(1).single();

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

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
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

    return context || "Info bisnis sedang tidak dapat diakses, mohon maaf.";
  } catch (err) {
    console.error('[BUSINESS CONTEXT ERROR]', err.message);
    return "Info bisnis sedang tidak dapat diakses, mohon maaf.";
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
  const businessContext = await getBusinessContext();
  const parsedData = await parseBookingMessage(msg.body, businessContext, historyStr);
  
  if (parsedData) {
    console.log('[GEMINI PARSED]', JSON.stringify(parsedData, null, 2));

    const hasActiveState = conversationState.has(msg.from);

    // [BUG FIX]: Intercept natural replies from Gemini even when in active state
    // so questions like "jam berapa bukanya?" get answered naturally instead of repeating the missing field prompt.
    if (!parsedData.isBookingIntent && parsedData.naturalReply && hasActiveState) {
      const oldState = conversationState.get(msg.from) || { nama: null, hari: null, jam: null, servis: null, kapster: null };
      
      const merged = {
        nama: parsedData.nama ?? oldState.nama,
        hari: parsedData.hari ?? oldState.hari,
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
        hari: parsedData.hari ?? oldState.hari,
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
          // CEK KETERSEDIAAN ULANG SAAT KONFIRMASI (BISA JADI SUDAH DIAMBIL ORANG SAAT MENUNGGU BALASAN)
          const { conflict, msg: conflictMsg, assignedBarber } = await checkAvailability(merged.hari, merged.jam, merged.kapster);
          if (conflict) {
            conversationState.set(msg.from, { ...merged, jam: null, kapster: null, awaitingConfirmation: false, lastUpdated: Date.now() });
            try {
              console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
              await replyAndSaveHistory(msg, `Waduh kak, barusan saja jadwalnya diambil orang lain. ${conflictMsg}`);
            } catch (err) {
              console.error('[REPLY ERROR]', err.message, '| target:', msg.from);
            }
            return;
          }

          // Customer konfirmasi & jadwal masih aman — simpan ke Supabase
          const finalKapster = assignedBarber || merged.kapster;
          try {
            console.log('[REPLY ATTEMPT] mencoba membalas ke', msg.from);
            await replyAndSaveHistory(msg, `Sip kak! Booking sudah lengkap:\n\nHari: ${merged.hari}\nJam: ${merged.jam}\nServis: ${merged.servis}\nKapster: ${finalKapster}\nNama: ${merged.nama}\n\nTerima kasih, ditunggu kedatangannya!`);

            try {
              const finalService = `${merged.servis}|BARBER:${finalKapster}`;
              const { error } = await supabase.from('whatsapp_requests').insert({
                sender_name: merged.nama,
                sender_phone: msg.from,
                raw_message: msg.body,
                extracted_day: merged.hari,
                extracted_time: merged.jam,
                extracted_service: finalService,
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

client.initialize();

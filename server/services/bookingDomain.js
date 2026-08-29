const supabase = require('../supabaseClient');

// VPS berjalan pada UTC, sedangkan toko beroperasi pada WIB (UTC+7, tanpa DST).
// Pergeseran +7 jam ini diperlukan agar getUTC*() di bawah mengembalikan tanggal
// kalender WIB yang benar.
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

// Guard: field `hari` dari Gemini hanya dipercaya apabila pesan asli benar-benar
// menyebutkan kata terkait hari — Gemini kadang menghasilkan nilai hari yang tidak
// sesuai pada pesan follow-up yang singkat.
const DAY_KEYWORDS = ['besok', 'lusa', 'hari ini', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
function mentionsDay(text) {
  const t = (text || '').toLowerCase();
  return DAY_KEYWORDS.some(k => t.includes(k));
}

// Guard: mendeteksi kalau pelanggan eksplisit menyatakan ingin booking BARU
// (bukan melanjutkan sesi yang masih tertunda). Insiden nyata: booking pertama
// belum sempat dikonfirmasi (pelanggan malah bertanya-tanya di tengah jalan),
// lalu pelanggan bilang "bisa book lagi?" dengan nama berbeda -- tanpa guard
// ini, field jam/servis/kapster dari sesi lama yang belum selesai ikut
// terbawa ke booking baru tersebut karena pelanggan tidak menyebutkan ulang
// detail yang sebenarnya ingin diisi ulang dari nol.
const NEW_BOOKING_KEYWORDS = ['book lagi', 'booking lagi', 'booking baru', 'pesan lagi', 'pesen lagi', 'reservasi lagi', 'reservasi baru'];
function indicatesNewBooking(text) {
  const t = (text || '').toLowerCase();
  return NEW_BOOKING_KEYWORDS.some(k => t.includes(k));
}

// Memeriksa bentrok jadwal kapster untuk satu slot (hari+jam), dan mengembalikan
// kapster yang ditugaskan apabila slot tersedia.
async function checkAvailability(hariStr, jamStr, kapsterStr) {
  const dateStr = getTargetDateStr(hariStr);
  const { data: queue } = await supabase.from('queue_entries')
    .select('barber_id, scheduled_time, status')
    .eq('scheduled_date', dateStr);

  // Filter menggunakan archived=false, bukan status — kapster yang telah "dihapus" harus tetap dikecualikan.
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
           msg: `Mohon maaf, Kak, kapster ${kapsterStr} sudah memiliki jadwal pada jam ${jamStr}. ` +
                (availableBarbers.length > 0
                  ? `Kapster yang tersedia pada jam tersebut: ${availableBarbers.map(b=>b.name).join(', ')}. Apakah Kak ingin mengganti kapster atau memilih jam lain?`
                  : `Seluruh kapster juga penuh pada jam tersebut. Silakan pilih jam lain.`)
        };
     }
     const match = barbers.find(b => b.id === requestedBarberId);
     return { conflict: false, assignedBarber: match.name };
  } else {
     if (busyBarberIds.size + anyCount >= barbers.length) {
        return {
           conflict: true,
           msg: `Mohon maaf, Kak, seluruh kapster sudah penuh untuk jam ${jamStr}. Silakan pilih jam lain.`
        };
     }
     const availableBarbers = barbers.filter(b => !busyBarberIds.has(b.id));
     return { conflict: false, assignedBarber: availableBarbers[0].name };
  }
}

// Memeriksa apakah nomor ini sudah memiliki booking aktif pada hari yang sama.
// Hasilnya hanya digunakan sebagai peringatan, bukan untuk memblokir booking.
//
// Pencocokan WAJIB memakai kolom scheduled_date (tanggal absolut yang sudah
// diresolusi saat insert), BUKAN menerjemahkan ulang extracted_day. Insiden
// nyata: extracted_day menyimpan string relatif ("besok"), dan sebelumnya
// fungsi ini menerjemahkannya ulang dengan getTargetDateStr() pada saat query
// -- sehingga baris booking berumur berhari-hari yang dulu berarti "besok"
// versi tanggal pembuatannya ikut cocok dengan "besok" versi hari ini, dan
// peringatan booking ganda muncul terus-menerus untuk jadwal yang sebenarnya
// sudah lama lewat.
//
// Baris berstatus 'approved' sengaja tidak diperiksa di whatsapp_requests
// karena sudah menjadi entri queue_entries (kalender) yang diperiksa di bawah;
// memakai keduanya justru berisiko salah lapor apabila entri kalendernya sudah
// dibatalkan barber sementara baris whatsapp_requests-nya tetap 'approved'.
async function checkExistingBookingSameDay(realPhone, dateStr) {
  if (!realPhone) return null;

  const { data: waRows } = await supabase
    .from('whatsapp_requests')
    .select('extracted_time')
    .eq('sender_phone', realPhone)
    .eq('status', 'pending')
    .eq('scheduled_date', dateStr)
    .not('payment_status', 'in', '("expired","failed")')
    .limit(1);

  if (waRows && waRows.length > 0) return { jam: formatJam(waRows[0].extracted_time) };

  const { data: qeRows } = await supabase
    .from('queue_entries')
    .select('scheduled_time')
    .eq('phone', realPhone)
    .eq('scheduled_date', dateStr)
    .neq('status', 'completed')
    .limit(1);

  if (qeRows && qeRows.length > 0) return { jam: formatJam(qeRows[0].scheduled_time) };

  return null;
}

// queue_entries.scheduled_time bertipe `time` sehingga terbaca "14:00:00",
// sedangkan whatsapp_requests.extracted_time berupa teks "14:00". Diseragamkan
// ke HH:MM agar pesan ke pelanggan tidak menampilkan detik.
function formatJam(value) {
  return (value || '').slice(0, 5);
}

const DEFAULT_SHOP_NAME = 'BarberFlow';

async function getShopName() {
  try {
    const { data } = await supabase.from('business_hours').select('shop_name').limit(1).single();
    return (data && data.shop_name) || DEFAULT_SHOP_NAME;
  } catch (err) {
    return DEFAULT_SHOP_NAME;
  }
}

// Merangkum jam operasional, kapster aktif, daftar layanan, dan informasi cuti
// untuk diberikan kepada Gemini sebagai konteks parsing pesan booking.
async function getBusinessContext() {
  try {
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

module.exports = {
  getTargetDateStr,
  mentionsDay,
  indicatesNewBooking,
  checkAvailability,
  checkExistingBookingSameDay,
  getShopName,
  getBusinessContext
};

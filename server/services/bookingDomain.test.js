const test = require('node:test');
const assert = require('node:assert/strict');
const supabase = require('../supabaseClient');
const { getTargetDateStr, mentionsDay, indicatesNewBooking, checkAvailability, isConfirmationReply } = require('./bookingDomain');

function withMockedNow(isoString, fn) {
  const realNow = Date.now;
  Date.now = () => new Date(isoString).getTime();
  try {
    fn();
  } finally {
    Date.now = realNow;
  }
}

test('getTargetDateStr menggunakan tanggal WIB, bukan UTC, pada jam-jam rawan (17:00-23:59 UTC)', () => {
  // 2026-01-15T20:00Z = 2026-01-16T03:00 WIB (Jumat) -- UTC & WIB beda tanggal
  // kalender persis di jam ini, skenario yang dulu bikin checkAvailability()
  // ngecek tanggal salah dan tiga customer ke-assign kapster+jam yang sama.
  withMockedNow('2026-01-15T20:00:00.000Z', () => {
    assert.equal(getTargetDateStr('hari ini'), '2026-01-16');
    assert.equal(getTargetDateStr('besok'), '2026-01-17');
    assert.equal(getTargetDateStr('jumat'), '2026-01-16');
    assert.equal(getTargetDateStr('senin'), '2026-01-19');
  });
});

test('getTargetDateStr tetap benar pada jam yang aman (siang WIB)', () => {
  // 2026-01-15T02:00Z = 2026-01-15T09:00 WIB -- UTC & WIB tanggal kalendernya sama di sini.
  withMockedNow('2026-01-15T02:00:00.000Z', () => {
    assert.equal(getTargetDateStr('hari ini'), '2026-01-15');
    assert.equal(getTargetDateStr('besok'), '2026-01-16');
  });
});

test('mentionsDay hanya bernilai true apabila pesan asli benar-benar menyebutkan kata terkait hari', () => {
  assert.equal(mentionsDay('besok bisa jam 5?'), true);
  assert.equal(mentionsDay('hari ini masih ada slot?'), true);
  assert.equal(mentionsDay('jam 5 aja deh'), false);
  assert.equal(mentionsDay('ya'), false);
  assert.equal(mentionsDay(''), false);
  assert.equal(mentionsDay(null), false);
});

test('indicatesNewBooking mendeteksi sinyal eksplisit "booking baru" dari pelanggan', () => {
  // Insiden nyata: booking pertama belum sempat dikonfirmasi, pelanggan bilang
  // "bisa book lagi ga?" dengan nama berbeda -- tanpa deteksi ini, jam/servis/
  // kapster dari sesi lama yang belum selesai ikut kebawa ke booking baru.
  assert.equal(indicatesNewBooking('bisa book lagi ga?'), true);
  assert.equal(indicatesNewBooking('mau booking baru dong'), true);
  assert.equal(indicatesNewBooking('pesen lagi ya kak'), true);
  assert.equal(indicatesNewBooking('besok jam 3 masih ada slot?'), false);
  assert.equal(indicatesNewBooking(''), false);
  assert.equal(indicatesNewBooking(null), false);
});

test('isConfirmationReply menerima persetujuan murni', () => {
  for (const text of ['ya', 'Iya kak', 'ok', 'oke deh', 'sip, siap', 'benar', 'ya, betul', 'Ya.', 'ok makasih kak']) {
    assert.equal(isConfirmationReply(text), true, text);
  }
});

test('isConfirmationReply menolak koreksi walaupun diakhiri/diawali kata "ya"', () => {
  // Insiden: pesan-pesan ini dulu terbaca sebagai konfirmasi sehingga booking
  // langsung tersimpan tanpa ringkasan baru ke pelanggan.
  for (const text of [
    'ganti jam 4 ya',
    'bukan, hari rabu aja ya',
    'iya tapi ganti ke jam 3',
    'belum ok',
    'ya atas nama budi',
    'ya kapsternya renol aja',
    'ya besok aja',
    'ga jadi ya',
    'tidak',
    '',
    null
  ]) {
    assert.equal(isConfirmationReply(text), false, String(text));
  }
});

// Pengganti supabase-js dalam memori yang menerapkan filter query yang dipakai
// checkAvailability, dengan semantik NULL ala SQL (NULL tidak lolos neq / not in).
function fakeFrom(tables) {
  return table => {
    let rows = [...(tables[table] || [])];
    const builder = {
      select() { return builder; },
      eq(col, val) { rows = rows.filter(r => r[col] === val); return builder; },
      neq(col, val) { rows = rows.filter(r => r[col] != null && r[col] !== val); return builder; },
      in(col, vals) { rows = rows.filter(r => vals.includes(r[col])); return builder; },
      not(col, op, list) {
        assert.equal(op, 'in');
        const vals = list.replace(/[()"]/g, '').split(',');
        rows = rows.filter(r => r[col] != null && !vals.includes(r[col]));
        return builder;
      },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); }
    };
    return builder;
  };
}

// 2026-01-15T02:00Z = Kamis 15 Januari 2026 09:00 WIB, sehingga "besok" = 2026-01-16.
async function withFakeDb(tables, fn) {
  const realNow = Date.now;
  const realFrom = supabase.from;
  Date.now = () => new Date('2026-01-15T02:00:00.000Z').getTime();
  supabase.from = fakeFrom(tables);
  try {
    return await fn();
  } finally {
    Date.now = realNow;
    supabase.from = realFrom;
  }
}

const BARBERS = [
  { id: 'b1', name: 'Irfan', status: 'active', archived: false },
  { id: 'b2', name: 'Renol', status: 'active', archived: false }
];

function waRequest(overrides) {
  return {
    status: 'pending',
    scheduled_date: '2026-01-16',
    extracted_day: 'besok',
    extracted_time: '14:00',
    extracted_service: 'Potong|BARBER:Irfan',
    payment_status: 'paid',
    ...overrides
  };
}

test('checkAvailability: booking yang DP-nya expired/failed tidak mengunci slot', async () => {
  // Insiden: baris ini tetap 'pending' tapi disembunyikan dari dashboard, jadi
  // barber tidak bisa menolaknya -- slot kapster terkunci permanen.
  const tables = {
    barbers: BARBERS,
    whatsapp_requests: [
      waRequest({ payment_status: 'expired' }),
      waRequest({ payment_status: 'failed', extracted_service: 'Potong|BARBER:Renol' })
    ]
  };
  await withFakeDb(tables, async () => {
    const res = await checkAvailability('besok', '14:00', 'Irfan');
    assert.equal(res.conflict, false);
    assert.equal(res.assignedBarber, 'Irfan');
    assert.equal((await checkAvailability('besok', '14:00', null)).conflict, false);
  });

  // Pembanding: DP yang masih berjalan atau sudah lunas tetap menahan slot.
  for (const payment_status of ['unpaid', 'paid']) {
    await withFakeDb({ barbers: BARBERS, whatsapp_requests: [waRequest({ payment_status })] }, async () => {
      assert.equal((await checkAvailability('besok', '14:00', 'Irfan')).conflict, true, payment_status);
    });
  }
});

test('checkAvailability: request dari tanggal lain tidak ikut mengunci slot walaupun extracted_day-nya sama', async () => {
  // Baris lama berisi extracted_day "besok" yang dulu berarti 2026-01-11; dulu
  // diterjemahkan ulang jadi "besok" versi hari ini dan ikut mengunci slot.
  const tables = {
    barbers: BARBERS,
    whatsapp_requests: [waRequest({ scheduled_date: '2026-01-11' })]
  };
  await withFakeDb(tables, async () => {
    assert.equal((await checkAvailability('besok', '14:00', 'Irfan')).conflict, false);
  });
});

test('checkAvailability: entri kalender berstatus completed tidak dihitung sebagai jadwal terisi', async () => {
  const entry = { barber_id: 'b1', scheduled_date: '2026-01-16', scheduled_time: '14:00:00' };
  await withFakeDb({ barbers: BARBERS, queue_entries: [{ ...entry, status: 'completed' }] }, async () => {
    assert.equal((await checkAvailability('besok', '14:00', 'Irfan')).conflict, false);
  });
  await withFakeDb({ barbers: BARBERS, queue_entries: [{ ...entry, status: 'confirmed' }] }, async () => {
    assert.equal((await checkAvailability('besok', '14:00', 'Irfan')).conflict, true);
  });
});

test('checkAvailability: kapster yang cuti tidak ditugaskan dan tidak mengurangi kapasitas', async () => {
  const tables = {
    barbers: BARBERS,
    barber_time_off: [{ off_date: '2026-01-16', barbers: { id: 'b1' } }],
    queue_entries: [{ barber_id: 'b1', scheduled_date: '2026-01-16', scheduled_time: '14:00:00', status: 'confirmed' }]
  };
  await withFakeDb(tables, async () => {
    const requested = await checkAvailability('besok', '14:00', 'Irfan');
    assert.equal(requested.conflict, true);
    assert.match(requested.msg, /tidak bertugas/);
    assert.match(requested.msg, /Renol/);

    // Jadwal lama milik kapster yang cuti tidak boleh membuat slot terbaca penuh.
    const any = await checkAvailability('besok', '14:00', null);
    assert.equal(any.conflict, false);
    assert.equal(any.assignedBarber, 'Renol');

    // Cuti hanya berlaku di tanggalnya.
    assert.equal((await checkAvailability('hari ini', '14:00', 'Irfan')).conflict, false);
  });
});

test('checkAvailability: status off hanya berlaku untuk hari ini', async () => {
  const tables = { barbers: [{ ...BARBERS[0], status: 'off' }, BARBERS[1]] };
  await withFakeDb(tables, async () => {
    assert.equal((await checkAvailability('hari ini', '14:00', 'Irfan')).conflict, true);
    assert.equal((await checkAvailability('hari ini', '14:00', null)).assignedBarber, 'Renol');
    assert.equal((await checkAvailability('besok', '14:00', 'Irfan')).conflict, false);
  });
});

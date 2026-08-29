const test = require('node:test');
const assert = require('node:assert/strict');
const { getTargetDateStr, mentionsDay, indicatesNewBooking } = require('./bookingDomain');

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

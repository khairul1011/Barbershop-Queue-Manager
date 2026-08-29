const test = require('node:test');
const assert = require('node:assert/strict');
const { getTargetDateStr, mentionsDay } = require('./bookingDomain');

function withMockedNow(isoString, fn) {
  const realNow = Date.now;
  Date.now = () => new Date(isoString).getTime();
  try {
    fn();
  } finally {
    Date.now = realNow;
  }
}

test('getTargetDateStr pakai tanggal WIB, bukan UTC, di jam-jam rawan (17:00-23:59 UTC)', () => {
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

test('getTargetDateStr tetap bener di jam aman (siang WIB)', () => {
  // 2026-01-15T02:00Z = 2026-01-15T09:00 WIB -- UTC & WIB tanggal kalendernya sama di sini.
  withMockedNow('2026-01-15T02:00:00.000Z', () => {
    assert.equal(getTargetDateStr('hari ini'), '2026-01-15');
    assert.equal(getTargetDateStr('besok'), '2026-01-16');
  });
});

test('mentionsDay cuma true kalau pesan asli beneran nyebut kata hari', () => {
  assert.equal(mentionsDay('besok bisa jam 5?'), true);
  assert.equal(mentionsDay('hari ini masih ada slot?'), true);
  assert.equal(mentionsDay('jam 5 aja deh'), false);
  assert.equal(mentionsDay('ya'), false);
  assert.equal(mentionsDay(''), false);
  assert.equal(mentionsDay(null), false);
});

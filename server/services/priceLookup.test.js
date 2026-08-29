const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDp } = require('./priceLookup');

test('calculateDp membulatkan ke integer IDR (Xendit nolak desimal)', () => {
  assert.equal(calculateDp(35000), 17500);
  assert.equal(calculateDp(25001), 12501); // 12500.5 dibulatkan ke atas
  assert.equal(calculateDp(0), 0);
});

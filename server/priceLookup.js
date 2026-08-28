const supabase = require('./supabaseClient');

// Sama seperti fuzzyMatchService() di src/App.tsx — dipertahankan identik
// (exact match dulu, baru partial "includes" dua arah) supaya bot dan
// dashboard "mikir" dengan cara yang sama soal nama servis mana yang
// dimaksud, walau dua sisi ini nggak share module langsung.
async function getServicePrice(serviceName) {
  if (!serviceName) return null;

  const { data: services, error } = await supabase
    .from('services')
    .select('name, price')
    .eq('archived', false);

  if (error || !services || services.length === 0) return null;

  const s = serviceName.toLowerCase();

  const exactMatch = services.find(srv => srv.name.toLowerCase() === s);
  if (exactMatch) return exactMatch.price;

  const partialMatch = services.find(srv =>
    srv.name.toLowerCase().includes(s) || s.includes(srv.name.toLowerCase())
  );
  if (partialMatch) return partialMatch.price;

  return null;
}

// Xendit butuh nominal IDR bulat (nggak boleh desimal), jadi pembulatan di
// sini wajib, bukan sekadar rapi-rapi angka.
function calculateDp(price) {
  return Math.round(price * 0.5);
}

module.exports = { getServicePrice, calculateDp };

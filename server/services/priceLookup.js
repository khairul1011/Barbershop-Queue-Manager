const supabase = require('../supabaseClient');

// Logika pencocokan sama seperti fuzzyMatchService() di src/App.tsx (exact match terlebih dahulu, kemudian partial match).
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

// Xendit mensyaratkan nominal IDR berupa bilangan bulat (desimal tidak diperbolehkan),
// sehingga pembulatan di sini bersifat wajib, bukan sekadar formatting.
function calculateDp(price) {
  return Math.round(price * 0.5);
}

module.exports = { getServicePrice, calculateDp };

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Prefer the service_role key so the bot bypasses RLS entirely (it's a
// trusted backend, never exposed to a browser) — falls back to the anon
// key only if the new env var hasn't been set yet, so a missed deploy step
// degrades gracefully instead of hard-crashing the bot.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[SUPABASE] URL or Key not found in environment variables.');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[SUPABASE] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. RLS will apply.');
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');
module.exports = supabase;

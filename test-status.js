import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('barbers').update({ status: 'archived' }).eq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('SUCCESS:', data);
  }
}
run();

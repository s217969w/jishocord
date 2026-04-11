import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

export async function addInconsistent(word, fix) {
  const { data, error } = await supabase
    .from('inconsistent')
    .insert([{ word, fix }]);
  if (error) console.error('Error:', error.message);
  else console.log('Data:', data);
}
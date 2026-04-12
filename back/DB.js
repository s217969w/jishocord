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

export async function addword(word, pronounce, fullWord, Japanese, summary, detail) {
  if(!word || !pronounce || !summary || !detail) {
    console.error('必須項目が不足');
    return;
  }
  const { data, error } = await supabase
    .from('dictionary')
    .insert([{ word, pronounce, fullWord, Japanese, summary, detail }]);
  if (error) console.error('Error:', error.message);
  else console.log('Data:', data);
}

export async function getTips(word){
  const { data: inconsistent, error } = await supabase
    .from('inconsistent')
    .select()
    .eq('word', word);
  if (error) console.error('Error:', error.message);
  //else console.log('Data:', inconsistent);
  let fixedWord = "";
  if(inconsistent.length == 1) {
    fixedWord = inconsistent[0].fix;
  } else {
    fixedWord = word;
  }
  const { data, error:error2 } = await supabase
    .from('dictionary')
    .select()
    .eq('word', fixedWord);
  if (error2) console.error('Error:', error2.message);
  else {
    if(data.length == 0) return null;
    else return data[0];
  }
}
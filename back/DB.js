import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

export async function addInconsistent(word, fix) {
  const { data, error } = await supabase
    .from('inconsistent')
    .insert([{ word, fix }]);
  if (error) console.error('Error in DB.js:', error.message);
  else console.log('Data:', data);
}

export async function addword(entryDetails, isApporoved) {
  if(!entryDetails.word || !entryDetails.pronounce || !entryDetails.summary || !entryDetails.detail) {
    console.error('Error in DB.js: 必須項目が不足');
    return;
  }
  const { rt, error } = await supabase
    .from('dictionary')
    .insert([{
      word: entryDetails.word,
      pronounce: entryDetails.pronounce,
      fullWord: entryDetails.fullWord,
      Japanese: entryDetails.Japanese,
      summary: entryDetails.summary,
      detail: entryDetails.detail,
      is_approved: isApporoved
      }]
    );
  if (error) console.error('Error in DB.js:', error.message);
  else console.log('Data:', rt);
}

export async function getTips(word){
  const { data: inconsistent, error } = await supabase
    .from('inconsistent')
    .select()
    .eq('word', word);
  if (error) console.error('Error:', error.message);
  //else console.log('表記ゆれ:', inconsistent);
  let fixedWord = "";
  if(!inconsistent || inconsistent.length != 1) {
    fixedWord = word;
  } else {
    fixedWord = inconsistent[0].fix;
  }
  const { data, error:error2 } = await supabase
    .from('dictionary')
    .select()
    .eq('word', fixedWord);
  if (error2) console.error('Error in DB.js:', error2.message);
  else {
    if(data.length == 0) return null;
    else return data[0];
  }
}
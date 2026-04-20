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

// DBへ単語を追加
export async function addword(entryDetails) {
  if(!entryDetails.word || !entryDetails.pronounce || !entryDetails.summary || !entryDetails.detail) {
    console.error('Error in DB.js: 必須項目が不足');
    return;
  }
  const { data, error } = await supabase
    .from('dictionary')
    .insert([{
      word: entryDetails.word,
      pronounce: entryDetails.pronounce,
      fullWord: entryDetails.fullWord,
      Japanese: entryDetails.Japanese,
      summary: entryDetails.summary,
      detail: entryDetails.detail,
      is_approved: false
      }]
    );
  if (error) console.error('Error in addword:', error.message);
  else console.log('Data:', data);
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
  if (error2) console.error('Error in getTips:', error2.message);
  else {
    if(data.length == 0) return null;
    else return data[0];
  }
}

export async function getUnapproved() {
  const { data, error } = await supabase
    .from('dictionary')
    .select('word')
    .eq('is_approved', false);
  if (error) console.error('Error in getUnapproved():', error.message);
  else {
    console.log(data);
    return data;
  }
  
}

export async function approve(word) {
  const { data, error } = await supabase
    .from('dictionary')
    .update({ is_approved: true })
    .eq('word', word)
    .select(); // 更新後のデータを取得
  if (error) {
    console.error('Error in approve():', error.message);
    return 500;
  } else {
    // dataが空ならwordが存在しない
    if (!data || data.length === 0) {
      console.log('指定されたwordは存在しません');
      return 404;
    }
    console.log(data);
    return 200;
  }
}

export async function editWord(editDetails) {
  const before = await getTips(editDetails.word);
  if(!before) {
    console.log('指定されたwordは存在しません');
    return 404;
  }
  const updateDetail = {
      ...before,
      ...editDetails,
  };
  const { data, error } = await supabase
    .from('dictionary')
    .update(updateDetail)
    .eq('word', editDetails.word)
    .select(); // 更新後のデータを取得
  if (error) {
    console.error('Error in approve():', error.message);
    return 500;
  } else {
    console.log(data);
    return 200;
  }
}
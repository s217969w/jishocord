import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { DictionaryDraft, DictionaryEntry, EditDetails, InconsistentEntry } from './interface.js';
dotenv.config();



const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('SUPABASE_URL または SUPABASE_SECRET_KEY が設定されていません');
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

export async function addInconsistent(word: string, fix: string): Promise<void> {
  const { data, error } = await supabase
    .from('inconsistent')
    .insert([{ word, fix }]);

  if (error) console.error('Error in DB.ts:', error.message);
  else console.log('Data:', data);
}

export async function addword(entryDetails: DictionaryDraft): Promise<void> {
  if (!entryDetails.word || !entryDetails.pronounce || !entryDetails.summary || !entryDetails.detail) {
    console.error('Error in DB.ts: 必須項目が不足');
    return;
  }

  const { data, error } = await supabase
    .from('dictionary')
    .insert([
      {
        word: entryDetails.word,
        pronounce: entryDetails.pronounce,
        fullWord: entryDetails.fullWord,
        Japanese: entryDetails.Japanese,
        summary: entryDetails.summary,
        detail: entryDetails.detail,
        is_approved: false,
      },
    ]);

  if (error) console.error('Error in addword:', error.message);
  else console.log('Data:', data);
}

export async function getTips(word: string): Promise<DictionaryEntry | null> {
  const { data: inconsistent, error } = await supabase
    .from('inconsistent')
    .select()
    .eq('word', word);

  if (error) console.error('Error:', error.message);

  const fixedWord = inconsistent && inconsistent.length === 1 ? (inconsistent[0] as InconsistentEntry).fix : word;

  const { data, error: error2 } = await supabase
    .from('dictionary')
    .select()
    .eq('word', fixedWord);

  if (error2) {
    console.error('Error in getTips:', error2.message);
    return null;
  }

  if (!data || data.length === 0) return null;
  return data[0] as DictionaryEntry;
}

export async function getUnapproved(): Promise<Array<Pick<DictionaryEntry, 'word'>>> {
  const { data, error } = await supabase
    .from('dictionary')
    .select('word')
    .eq('is_approved', false);

  if (error) {
    console.error('Error in getUnapproved():', error.message);
    return [];
  }

  console.log(data);
  return (data ?? []) as Array<Pick<DictionaryEntry, 'word'>>;
}

export async function approve(word: string): Promise<200 | 404 | 500> {
  const { data, error } = await supabase
    .from('dictionary')
    .update({ is_approved: true })
    .eq('word', word)
    .select();

  if (error) {
    console.error('Error in approve():', error.message);
    return 500;
  }

  if (!data || data.length === 0) {
    console.log('指定されたwordは存在しません');
    return 404;
  }

  console.log(data);
  return 200;
}

export async function editWord(editDetails: EditDetails): Promise<200 | 404 | 500> {
  const before = await getTips(editDetails.word);
  if (!before) {
    console.log('指定されたwordは存在しません');
    return 404;
  }

  const updateDetail: DictionaryEntry = {
    word:editDetails.word,
    pronounce: editDetails.pronounce ?? before.pronounce,
    fullWord: editDetails.fullWord ?? before.fullWord,
    Japanese: editDetails.Japanese ?? before.Japanese,
    summary: editDetails.summary ?? before.summary,
    detail: editDetails.detail ?? before.detail,
    is_approved: before.is_approved
  };

  const { data, error } = await supabase
    .from('dictionary')
    .update(updateDetail)
    .eq('word', editDetails.word)
    .select();

  if (error) {
    console.error('Error in approve():', error.message);
    return 500;
  }

  console.log(data);
  return 200;
}
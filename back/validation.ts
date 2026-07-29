import { z } from 'zod';
import { dictionaryLimits } from './interface.js';

const unsafeCharacters = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u;

const safeText = (max: number, min = 0) =>
  z.string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !unsafeCharacters.test(value), '制御文字または不可視文字は使用できません')
    .transform((value) => value.normalize('NFKC'));

export const aliasSchema = safeText(dictionaryLimits.alias, 1);

export const dictionaryInputSchema = z.object({
  word: safeText(dictionaryLimits.word, 1),
  pronounce: safeText(dictionaryLimits.pronounce, 1),
  fullWord: safeText(dictionaryLimits.fullWord).nullable(),
  Japanese: safeText(dictionaryLimits.Japanese).nullable(),
  summary: safeText(dictionaryLimits.summary, 1),
  detail: safeText(dictionaryLimits.detail, 1),
  canonicalWord: safeText(dictionaryLimits.word, 1),
  aliases: z.array(aliasSchema).max(dictionaryLimits.aliasesPerEntry),
}).strict();

export const editDetailsSchema = z.object({
  word: safeText(dictionaryLimits.word, 1),
  pronounce: safeText(dictionaryLimits.pronounce, 1).nullable(),
  fullWord: safeText(dictionaryLimits.fullWord).nullable(),
  Japanese: safeText(dictionaryLimits.Japanese).nullable(),
  summary: safeText(dictionaryLimits.summary, 1).nullable(),
  detail: safeText(dictionaryLimits.detail, 1).nullable(),
  canonicalWord: safeText(dictionaryLimits.word, 1).nullable(),
  aliases: z.array(aliasSchema).max(dictionaryLimits.aliasesPerEntry).nullable(),
}).strict();

export function normalizeWord(word: string): string {
  return word.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ja-JP');
}

export function sanitizeAliasCandidates(canonicalWord: string, word: string, aliases: string[]): string[] {
  const canonicalNormalized = normalizeWord(canonicalWord);
  const unique = new Map<string, string>();
  for (const candidate of [word, ...aliases]) {
    const normalized = normalizeWord(candidate);
    if (!normalized || normalized === canonicalNormalized || unique.has(normalized)) continue;
    unique.set(normalized, candidate.normalize('NFKC').trim().replace(/\s+/gu, ' '));
  }
  return [...unique.values()].slice(0, dictionaryLimits.aliasesPerEntry);
}

export function neutralizeDiscordMentions(text: string): string {
  return text.replaceAll('@', '@\u200b');
}

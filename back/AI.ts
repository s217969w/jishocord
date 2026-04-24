import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { z } from 'zod';

import { addWord } from './DB.js';
import { DictionaryEntry } from './interface.js';

dotenv.config();

const wordSchema = z.object({
  word: z.string().describe('単語。例: BFS'),
  fullWord: z.string().nullable().describe('略称の場合の正式名称。例: Breadth First Search'),
  Japanese: z.string().nullable().describe('正式名称が英語の場合の日本語訳。例: 幅優先探索'),
  summary: z.string().describe('概要。一文で簡潔に説明。'),
  detail: z.string().describe('詳細。2~3文で説明。'),
  pronounce: z.string().describe('単語の読み方。すべて平仮名。'),
  is_approved: z.boolean().default(false).describe('承認済みかどうか。'),
});

const responseSchema = z.union([wordSchema, z.null()]);

const structPrompt = `
以下の形式で、技術用語「{word}」についてJSONで出力してください。\n
word: 単語\n
fullWord: 略称の場合の正式名称（なければnull）\n
Japanese: 正式名称が英語の場合、日本語訳（なければnull）\n
summary: 概要を一文で簡潔に\n
detail: 詳細を簡単に2~3文で\n
pronounce: 単語の読み方を、すべて平仮名で出力\n
is_approved: 必ずfalse\n
ただし、{word}が存在しない単語の場合や説明できない場合、不適切用語だと判断した場合はnullを返してください。
`;

const personalityPrompt = `
summaryとdetailは、「知的で落ち着いた女子」が話しているような形で出力してください。
ただし、分かりやすさよりも正確性を重視してください。
語尾は親しみやすい口調(「～だよ」「～だね」)を中心に使用してください。
`;

const examplePrompt = `
出力例:
{
"word": "BFS",\n
"fullWord": "Breadth First Search",\n
"Japanese": "幅優先探索",\n
"summary": "探索アルゴリズムのひとつだよ。",\n
"detail": "グラフ構造などにおいて、始点からの距離が最も近い箇所から順番に探索していく手法だよ。主にキューが使用されるよ。",\n
"pronounce": "びーえふえす",\n
"is_approved": false
}
`;

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not set');
}

const ai = new GoogleGenAI({ apiKey });

export async function askAI(word: string): Promise<DictionaryEntry | null> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{ role: 'user', parts: [{ text: `${structPrompt.replaceAll('{word}', word)}\n${personalityPrompt}\n${examplePrompt}` }] }],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(responseSchema),
    },
  });

  if (!response.text) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch (error) {
    console.error('AI response JSON parse error:', error);
    return null;
  }

  if (parsed === null) {
    return null;
  }

  const data = responseSchema.parse(parsed);
  if (data === null) {
    return null;
  }
  data.is_approved = false; // 念のため
  console.log(data);
  await addWord(data);
  return data;
}
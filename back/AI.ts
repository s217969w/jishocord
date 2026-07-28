import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { z } from 'zod';
import { AiResult } from './interface.js';
import { createLogContext, logError } from './logger.js';
import { dictionaryInputSchema } from './validation.js';

dotenv.config();

const responseSchema = z.union([dictionaryInputSchema, z.null()]);
const structPrompt = `
技術用語「{word}」について、次のJSON形式で出力してください。
word: 単語
fullWord: 略称の場合の正式名称（なければnull）
Japanese: 正式名称が英語の場合の日本語訳（なければnull）
summary: 概要を一文で簡潔に
detail: 詳細を簡単に2〜3文で
pronounce: 単語の読み方をすべて平仮名で出力
存在しない、説明できない、または不適切な用語の場合はnullを返してください。
summaryとdetailは、知的で落ち着いた少女の親しみやすい口調にし、正確性を優先してください。
`;

const retryableTypes = new Set<AiResult['type']>(['invalid_response', 'rate_limited', 'timeout']);
const maxAttempts = 3;

function classifyError(error: unknown): Exclude<AiResult, { type: 'generated' } | { type: 'not_explainable' }> {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined;
  if (status === 429 || /429|rate.?limit|resource exhausted/iu.test(message)) {
    return { type: 'rate_limited', message };
  }
  if (/timeout|timed out|abort/iu.test(message)) {
    return { type: 'timeout', message };
  }
  return { type: 'external_error', message };
}

function parseResponse(text: string | undefined): AiResult {
  if (!text) return { type: 'invalid_response', message: 'AI応答が空です。' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { type: 'invalid_response', message: 'AI応答がJSONではありません。' };
  }
  if (parsed === null) return { type: 'not_explainable' };
  if (parsed === false || parsed === 'false') {
    return { type: 'invalid_response', message: 'AI応答がfalseでした。' };
  }
  const result = responseSchema.safeParse(parsed);
  if (!result.success || result.data === null) {
    return { type: 'invalid_response', message: result.success ? 'AI応答が空です。' : result.error.message };
  }
  return { type: 'generated', entry: result.data };
}

export async function askAI(word: string): Promise<AiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { type: 'external_error', message: 'GEMINI_API_KEY is not set' };
  const ai = new GoogleGenAI({ apiKey });
  const context = createLogContext('askAI');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let result: AiResult;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: structPrompt.replaceAll('{word}', word) }] }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(responseSchema),
          httpOptions: { timeout: 10_000 },
        },
      });
      result = parseResponse(response.text);
    } catch (error) {
      result = classifyError(error);
    }

    if (result.type === 'generated' || result.type === 'not_explainable' || !retryableTypes.has(result.type)) {
      if (result.type !== 'generated' && result.type !== 'not_explainable') logError(context, result.message);
      return result;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    } else {
      logError(context, result.message);
      return result;
    }
  }
  return { type: 'external_error', message: 'AI処理が完了しませんでした。' };
}

export const aiResponseForTest = { parseResponse, classifyError };

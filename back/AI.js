import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";


const wordSchema = z.object({
    word: z.string().describe("単語。例: BFS"),
    fullWord: z.string().nullable().describe("略称の場合の正式名称。例: Breadth First Search"),
    Japanese: z.string().nullable().describe("正式名称が英語の場合の日本語訳。例: 幅優先探索"),
    summary: z.string().describe("概要。一文で簡潔に説明。"),
    detail: z.string().describe(`詳細。2~3文で説明。`),
    pronounce:z.string().describe(`単語の読み方。すべて平仮名。`),
});

const askPrompt = 
    `
    以下の形式で、技術用語「{word}」についてJSONで出力してください。\n
    word: 単語\n
    fullWord: 略称の場合の正式名称（なければnull）\n
    Japanese: 正式名称が英語の場合、日本語訳（なければnull）\n
    summary: 概要を一文で簡潔に\n
    detail: 詳細を簡単に2~3文で\n
    pronounce: 単語の読み方を、すべて平仮名で出力\n
    ただし、{word}が存在しない単語の場合や説明できない場合、不適切用語だと判断した場合はnullを返してください。\n
    出力例:
    {
    word: 'BFS',
    fullWord: 'Breadth First Search',
    Japanese: '幅優先探索',
    summary: '探索アルゴリズムのひとつ。',
    detail: 'グラフ構造などにおいて、始点からの距離が最も近い箇所から順番に探索していく手法。主にキューが使用される。',
    pronounce: 'びーえふえす'
    }
    `;


const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

export async function askAI(word) {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: "user", parts: [{ text: askPrompt.replace("{word}", word) }] }],
        config: {
            responseMimeType: "application/json",
            responseJsonSchema: zodToJsonSchema(wordSchema),
        },
    });
    const data = wordSchema.parse(JSON.parse(response.text));
    console.log(data);
    return data;
}

const tunePrompt = 
    `
    与えられたJSONファイルは、wordで指定された単語を簡単に説明したものです。
    summaryとdetailについて一部の語尾や単語を変化させ、「知的で落ち着いた女子」が話しているような
    出力に変更してください。ただし、伝える内容自体は変えてはいけません。\n
    語尾は親しみやすい口調(「～だよ」「～だね」)を中心に使用してください。\n
    {data}
    `;

export async function personalityTuning(data) {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: "user", parts: [{ text: tunePrompt.replace("{data}", JSON.stringify(data, null, 2)) }] }],
        config: {
            responseMimeType: "application/json",
            responseJsonSchema: zodToJsonSchema(wordSchema),
        },
    });
    const fix = wordSchema.parse(JSON.parse(response.text));
    console.log(fix);
    return fix;
}
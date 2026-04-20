import type { DictionaryEntry } from './back/interface.js';

export async function description(data: DictionaryEntry): Promise<string> {
  let desc = '';
  desc += data.word;
  desc += `【${data.pronounce}】\n\n`;

  if (data.fullWord != null) {
    desc += data.fullWord;
    if (data.Japanese != null) desc += `, ${data.Japanese}`;
    desc += '\n\n';
  }

  desc += `${data.summary}\n`;
  desc += data.detail;

  if (data.is_approved === false) {
    desc += `\n※これはAIで作った説明で、未承認だよ。\n
この説明で大丈夫なら\`/approve\`から承認しておいてね。\n
もし間違ってたら\`/edit\`から教えて。`;
  }

  return desc;
}
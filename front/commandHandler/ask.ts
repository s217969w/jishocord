import { CacheType, ChatInputCommandInteraction } from "discord.js";
import { getTips } from "../../back/DB.js";
import { askAI } from "../../back/AI.js";

// '/ask' が使用されたとき用
export async function onAsked(interaction:ChatInputCommandInteraction<CacheType>) {
  const word = interaction.options.getString('word', true);
  const sendMessage = await makeReply(word);
  await interaction.reply({ content:sendMessage, flags:'Ephemeral' });
  return;
}

// 返信文を作って返す
export async function makeReply(word: string): Promise<string> {
  let data = await getTips(word);

  if (!data) {
    data = await askAI(word);
    if (!data) {
      return 'ごめんなさい、調べたけど分からなかった...';
    }
  }

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
    desc += `\n※これはAIで作った説明で、未承認だよ。
この説明で大丈夫なら\`/approve\`から承認しておいてね。
もし間違ってたら\`/edit\`から教えて。`;
  }

  return desc;
}
import { CacheType, ChatInputCommandInteraction, ButtonBuilder, ActionRowBuilder, ButtonStyle } from "discord.js";
import { getTips } from "../../back/DB.js";
import { askAI } from "../../back/AI.js";
import { DictionaryEntry } from "../../back/interface.js";

// '/ask' が使用されたとき用
export async function onAsked(interaction:ChatInputCommandInteraction<CacheType>) {
  const word = interaction.options.getString('word', true);
  const data = await generateData(word);
  const sendMessage = await makeReply(data);
  if(data?.is_approved === false) {
    const button = new ButtonBuilder()
      .setCustomId("approve_button")
      .setLabel("承認")
      .setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    await interaction.reply({ content:sendMessage, flags:'Ephemeral', components:[row] });
  } else {
    await interaction.reply({ content:sendMessage, flags:'Ephemeral' });
  }
  return;
}

// 返信文を作って返す
export async function generateData(word: string): Promise<DictionaryEntry | null> {
  let data = await getTips(word);

  if (!data) {
    data = await askAI(word);
  }
  return data;
}

export async function makeReply(data: DictionaryEntry | null): Promise<string> {
  if(data === null) return 'ごめんなさい、調べたけど分からなかった...';
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
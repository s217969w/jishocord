import { CacheType, ChatInputCommandInteraction } from "discord.js";
import { getUnapproved } from "../../back/DB.js";


export async function unapprovedListUp(interaction : ChatInputCommandInteraction<CacheType>) {
  const wordList = await getUnapproved();
  let sendMessage = '未承認の単語一覧です:\n';
  const unapprovedListLimit = 10;

  for (let i = 0; i < Math.min(wordList.length, unapprovedListLimit); i++) {
    sendMessage += `- ${wordList[i].word}\n`;
  }

  if (wordList.length > unapprovedListLimit) {
    sendMessage += `他${wordList.length - unapprovedListLimit}件`;
  }

  await interaction.reply({ content: sendMessage, flags:'Ephemeral' });
  return;
}
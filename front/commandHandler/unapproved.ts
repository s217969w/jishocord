import { CacheType, ChatInputCommandInteraction } from 'discord.js';
import { getUnapproved } from '../../back/DB.js';

export async function unapprovedListUp(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  const result = await getUnapproved(interaction.guildId);
  if (!result.ok) {
    await interaction.reply({ content: result.message, flags: 'Ephemeral' });
    return;
  }
  const limit = 10;
  const lines = result.value.slice(0, limit).map((entry) => `- [${entry.scope}] ${entry.word}`);
  const remainder = result.value.length > limit ? `\n他${result.value.length - limit}件` : '';
  await interaction.reply({
    content: lines.length ? `未承認の単語一覧です:\n${lines.join('\n')}${remainder}` : '未承認の単語はありません。',
    flags: 'Ephemeral',
  });
}

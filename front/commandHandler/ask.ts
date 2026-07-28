import { CacheType, ChatInputCommandInteraction } from 'discord.js';
import { askAI } from '../../back/AI.js';
import { addWord, getTips } from '../../back/DB.js';
import { AiResult, AppResult, DictionaryEntry } from '../../back/interface.js';
import { neutralizeDiscordMentions } from '../../back/validation.js';

export type GenerateResult =
  | { type: 'found'; entry: DictionaryEntry }
  | { type: 'not_explainable' }
  | { type: 'temporary_error'; message: string };

export async function generateData(
  word: string,
  guildId: string | null,
  discordUserId?: string,
): Promise<GenerateResult> {
  const found = await getTips(word, guildId);
  if (!found.ok) return { type: 'temporary_error', message: found.message };
  if (found.value) return { type: 'found', entry: found.value };

  const generated = await askAI(word);
  if (generated.type === 'not_explainable') return { type: 'not_explainable' };
  if (generated.type !== 'generated') return aiFailureToUi(generated);

  const saved = await addWord(generated.entry, { guildId, discordUserId }, 'public');
  if (!saved.ok) return saveFailureToUi(saved);
  return { type: 'found', entry: saved.value };
}

function aiFailureToUi(result: Exclude<AiResult, { type: 'generated' } | { type: 'not_explainable' }>): GenerateResult {
  if (result.type === 'rate_limited') {
    return { type: 'temporary_error', message: 'ただいま説明の生成が混み合っています。少し待ってから試してね。' };
  }
  if (result.type === 'timeout') {
    return { type: 'temporary_error', message: '説明の生成が時間内に終わりませんでした。もう一度試してね。' };
  }
  return { type: 'temporary_error', message: '説明を生成できませんでした。時間をおいて試してね。' };
}

function saveFailureToUi(result: Extract<AppResult<DictionaryEntry>, { ok: false }>): GenerateResult {
  if (result.error === 'duplicate') {
    return { type: 'temporary_error', message: '同じ単語が先に登録されました。もう一度検索してね。' };
  }
  return { type: 'temporary_error', message: '説明は作れましたが、保存できませんでした。時間をおいて試してね。' };
}

export function makeReply(data: DictionaryEntry): string {
  let description = `${data.word}【${data.pronounce}】\n\n`;
  if (data.fullWord !== null) {
    description += data.fullWord;
    if (data.Japanese !== null) description += `, ${data.Japanese}`;
    description += '\n\n';
  }
  description += `${data.summary}\n${data.detail}`;
  if (data.status !== 'approved') {
    description += '\n※これはAIで作った未承認の説明だよ。権限のある人が内容を確認してね。';
  }
  return neutralizeDiscordMentions(description);
}

export async function onAsked(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  await interaction.deferReply({ flags: 'Ephemeral' });
  const word = interaction.options.getString('word', true);
  const result = await generateData(word, interaction.guildId, interaction.user.id);
  if (result.type === 'not_explainable') {
    await interaction.editReply('ごめんなさい、その言葉は説明できなかったよ。');
    return;
  }
  if (result.type === 'temporary_error') {
    await interaction.editReply(result.message);
    return;
  }
  await interaction.editReply({ content: makeReply(result.entry), allowedMentions: { parse: [] } });
}

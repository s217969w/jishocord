import {
  CacheType,
  Interaction,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { approve, deleteWord, editWord } from '../back/DB.js';
import { DictionaryScope, EditDetails, Envs } from '../back/interface.js';
import { onAsked } from './commandHandler/ask.js';
import { unapprovedListUp } from './commandHandler/unapproved.js';

const scopeOption = (option: import('discord.js').SlashCommandStringOption) =>
  option
    .setName('scope')
    .setDescription('辞書の範囲')
    .setRequired(true)
    .addChoices({ name: 'ローカル', value: 'local' }, { name: 'パブリック', value: 'public' });

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('技術用語の説明を表示します')
    .addStringOption((option) => option.setName('word').setDescription('調べたい単語').setRequired(true)),
  new SlashCommandBuilder().setName('unapproved').setDescription('未承認の単語リストを表示します'),
  new SlashCommandBuilder()
    .setName('approve')
    .setDescription('指定した用語説明を承認します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) => option.setName('word').setDescription('承認する単語').setRequired(true))
    .addStringOption(scopeOption),
  new SlashCommandBuilder()
    .setName('edit')
    .setDescription('技術用語の説明を編集します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) => option.setName('word').setDescription('編集する単語').setRequired(true))
    .addStringOption(scopeOption)
    .addStringOption((option) => option.setName('pronounce').setDescription('読み方'))
    .addStringOption((option) => option.setName('fullword').setDescription('正式名称'))
    .addStringOption((option) => option.setName('japanese').setDescription('正式名称の日本語表記'))
    .addStringOption((option) => option.setName('summary').setDescription('概要文'))
    .addStringOption((option) => option.setName('detail').setDescription('説明文')),
  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('技術用語の説明を削除します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) => option.setName('word').setDescription('削除する単語').setRequired(true))
    .addStringOption(scopeOption),
].map((command) => command.toJSON());

export async function registerCommands(rest: REST, envs: Envs): Promise<void> {
  if (!envs.clientId) throw new Error('DISCORD_CLIENT_ID が未登録です');
  if (envs.commandRegistration === 'guild') {
    if (!envs.guildId) throw new Error('guild登録には DISCORD_GUILD_ID が必要です');
    await rest.put(Routes.applicationGuildCommands(envs.clientId, envs.guildId), { body: commands });
  } else {
    await rest.put(Routes.applicationCommands(envs.clientId), { body: commands });
  }
  console.log(`スラッシュコマンドを${envs.commandRegistration}登録しました`);
}

function scopeOf(interaction: Extract<Interaction<CacheType>, { commandName: string }>): DictionaryScope {
  if (!interaction.isChatInputCommand()) return 'public';
  return interaction.options.getString('scope', true) as DictionaryScope;
}

export async function interactionHandler(interaction: Interaction<CacheType>): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'ping') {
      await interaction.reply({ content: 'pong!', flags: 'Ephemeral' });
      return;
    }
    if (interaction.commandName === 'ask') return await onAsked(interaction);
    if (interaction.commandName === 'unapproved') return await unapprovedListUp(interaction);

    const word = interaction.options.getString('word', true);
    const scope = scopeOf(interaction);
    const context = { guildId: interaction.guildId, discordUserId: interaction.user.id };
    if (interaction.commandName === 'approve') {
      const result = await approve(word, context, scope);
      await interaction.reply({ content: result.ok ? `${word}の説明を承認しました。` : result.message, flags: 'Ephemeral' });
      return;
    }
    if (interaction.commandName === 'edit') {
      const details: EditDetails = {
        word,
        pronounce: interaction.options.getString('pronounce'),
        fullWord: interaction.options.getString('fullword'),
        Japanese: interaction.options.getString('japanese'),
        summary: interaction.options.getString('summary'),
        detail: interaction.options.getString('detail'),
      };
      const result = await editWord(details, context, scope);
      await interaction.reply({ content: result.ok ? `${word}の説明を編集しました。` : result.message, flags: 'Ephemeral' });
      return;
    }
    if (interaction.commandName === 'delete') {
      const result = await deleteWord(word, context, scope);
      await interaction.reply({ content: result.ok ? `${word}の説明を削除しました。` : result.message, flags: 'Ephemeral' });
    }
  } catch (error) {
    console.error('スラッシュコマンド処理中に問題が発生しました:', error);
    const message = { content: 'エラーが発生しました。時間をおいて試してください。', flags: 'Ephemeral' as const };
    if (interaction.replied || interaction.deferred) await interaction.followUp(message);
    else await interaction.reply(message);
  }
}

import { CacheType, Interaction, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { EditDetails, Envs } from "../back/interface.js";
import { approve, editWord } from "../back/DB.js";
import { unapprovedListUp } from "./commandHandler/unapproved.js";
import { onAsked } from "./commandHandler/ask.js";


const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('技術用語の説明を表示します')
    .addStringOption((option) =>
      option.setName('word')
        .setDescription('調べたい単語')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('unapproved')
    .setDescription('未承認の単語リストを表示します'),
  new SlashCommandBuilder()
    .setName('approve')
    .setDescription('指定した用語説明を承認します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) =>
      option.setName('word')
        .setDescription('承認する単語')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('edit')
    .setDescription('技術用語の説明を編集します')
    .addStringOption((option) =>
      option.setName('word')
        .setDescription('編集する単語')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) =>
      option.setName('pronounce')
        .setDescription('読み方'),
    )
    .addStringOption((option) =>
      option.setName('fullword')
        .setDescription('正式名称'),
    )
    .addStringOption((option) =>
      option.setName('japanese')
        .setDescription('正式名称の日本語表記'),
    )
    .addStringOption((option) =>
      option.setName('summary')
        .setDescription('概要文'),
    )
    .addStringOption((option) =>
      option.setName('detail')
        .setDescription('説明文'),
    ),
].map((command) => command.toJSON());


export async function registerCommands(rest : REST, envs: Envs): Promise<void> {
  try {
    if(envs.clientId && envs.guildId){
      await rest.put(
        Routes.applicationGuildCommands(envs.clientId, envs.guildId),
        { body: commands },
      );
      console.log('スラッシュコマンドを登録しました');
    } else {
      console.error('clientIdまたはguildIdが未登録です');
    }
  } catch (error) {
    console.error('コマンド登録エラー:', error);
  }
}

export async function interactionHandler (interaction : Interaction<CacheType>) {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'ping') {
      await interaction.reply({ content: 'pong!', flags:'Ephemeral' });
      return;
    }

    if (interaction.commandName === 'ask') {
      await onAsked(interaction);
    }

    if (interaction.commandName === 'unapproved') {
      await unapprovedListUp(interaction);
    }

    if (interaction.commandName === 'approve') {
      const word = interaction.options.getString('word', true);
      const result = await approve(word);

      if (result === 200) {
        await interaction.reply({ content: `${word}の説明を承認しました。`, flags:'Ephemeral' });
      } else if (result === 404) {
        await interaction.reply({ content: `未承認の単語に${word}は存在しません。`, flags:'Ephemeral' });
      } else {
        await interaction.reply({ content: 'エラーが発生しました。', flags:'Ephemeral' });
      }
      return;
    }

    if (interaction.commandName === 'edit') {      
      const word = interaction.options.getString('word', true);
      const editDetails:EditDetails = {
        word: word,
        pronounce: interaction.options.getString('pronounce'),
        fullWord: interaction.options.getString('fullword'),
        Japanese: interaction.options.getString('japanese'),
        summary: interaction.options.getString('summary'),
        detail: interaction.options.getString('detail'),
      }

      const result = await editWord(editDetails);

      if (result === 200) {
        await interaction.reply({ content: `${word}の説明を編集しました。`, flags:'Ephemeral' });
      } else if (result === 404) {
        await interaction.reply({ content: `単語「${word}」は未登録だよ。`, flags:'Ephemeral' });
      } else {
        await interaction.reply({ content: '編集中にエラーが発生しました。', flags:'Ephemeral' });
      }
    }
  } catch (error) {
    console.error('スラッシュコマンド処理中に問題が発生しました:', error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'エラーが発生しました。', flags:'Ephemeral' });
    } else {
      await interaction.reply({ content: 'エラーが発生しました。', flags:'Ephemeral' });
    }
  }
}
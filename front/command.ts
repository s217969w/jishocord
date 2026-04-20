import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { Envs } from "../back/interface.js";


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
    if(!(!envs.clientId || !envs.guildId)){
      await rest.put(
        Routes.applicationGuildCommands(envs.clientId, envs.guildId),
        { body: commands },
      );
    }
    console.log('スラッシュコマンドを登録しました');
  } catch (error) {
    console.error('コマンド登録エラー:', error);
  }
}
import { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, type Message } from 'discord.js';
import dotenv from 'dotenv';

import { addInconsistent, approve, editWord, getTips, getUnapproved, } from './back/DB.js';
import { EditDetails, Envs } from './back/interface.js';
import { askAI } from './back/AI.js';
import { description } from './front/description.js';
import { registerCommands } from './front/command.js';

dotenv.config();

const envs : Envs = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID
}

if (!envs.token || !envs.clientId || !envs.guildId) {
  console.error('DISCORD_TOKEN, CLIENT_ID, または GUILD_ID が設定されていません。');
  process.exit(1);
}

const unapprovedListLimit = 10;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const rest = new REST({ version: '10' }).setToken(envs.token);


client.once(Events.ClientReady, async () => {
  console.log('ボットが起動したよ');
  await registerCommands(rest, envs);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'ping') {
      await interaction.reply({ content: 'pong!', flags:'Ephemeral' });
      return;
    }

    if (interaction.commandName === 'ask') {
      const word = interaction.options.getString('word', true);
      let data = await getTips(word);

      if (!data) {
        data = await askAI(word);
        if (!data) {
          await interaction.reply({ content: 'ごめんなさい、調べたけど分からなかった...', flags:'Ephemeral' });
          return;
        }
      }

      const sendMessage = await description(data);
      await interaction.reply({ content: sendMessage, flags:'Ephemeral' });
      return;
    }

    if (interaction.commandName === 'unapproved') {
      const wordList = await getUnapproved();
      let sendMessage = '未承認の単語一覧です:\n';

      for (let i = 0; i < Math.min(wordList.length, unapprovedListLimit); i++) {
        sendMessage += `- ${wordList[i].word}\n`;
      }

      if (wordList.length > unapprovedListLimit) {
        sendMessage += `他${wordList.length - unapprovedListLimit}件`;
      }

      await interaction.reply({ content: sendMessage, flags:'Ephemeral' });
      return;
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
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  const botUserId = client.user?.id;
  if (!botUserId || !message.mentions.has(botUserId)) return;

  const inl = message.content.split(' ');
  inl.shift();

  try {
    if (inl.length === 0) {
      await message.reply('こんにちは。呼びましたか？');
      return;
    }

    if (inl[0] === 'fix' && inl.length === 3) {
      await addInconsistent(inl[1], inl[2]);
      return;
    }

    const word = inl.join(' ');
    let data = await getTips(word);

    if (!data) {
      await message.reply(`${word}は登録されてなかったから、AIに聞いてみるね...`);
      data = await askAI(word);

      if (!data) {
        await message.reply('ごめんなさい、調べたけど分からなかった...');
        return;
      }
    }

    const sendMessage = await description(data);
    await message.reply(sendMessage);
  } catch (error) {
    console.error('処理中に問題が発生しました: ', error);
    await message.reply('ごめんなさい、エラーが発生しちゃいました...');
  }
});

client.login(envs.token);
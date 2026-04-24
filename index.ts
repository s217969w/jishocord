import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Events, GatewayIntentBits, REST, type Message } from 'discord.js';
import { approve } from './back/DB.js';
import dotenv from 'dotenv';

import { addInconsistent } from './back/DB.js';
import { Envs } from './back/interface.js';
import { interactionHandler, registerCommands } from './front/command.js';
import { generateData, makeReply } from './front/commandHandler/ask.js';

dotenv.config();

const envs : Envs = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID
}

if (!envs.token || !envs.clientId || !envs.guildId) {
  console.error('DISCORD_TOKEN, DISCORD_CLIENT_ID, または DISCORD_GUILD_ID が設定されていません。');
  process.exit(1);
}


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
  await interactionHandler(interaction);
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

    // if (inl[0] === 'fix' && inl.length === 3) {
    //   await addInconsistent(inl[1], inl[2]);
    //   return;
    // }

    const word = inl.join(' ');
    const data = await generateData(word);
    const sendMessage = await makeReply(data);
    if(data?.is_approved === false) {
      const button = new ButtonBuilder()
        .setCustomId("approve_button")
        .setLabel("承認")
        .setStyle(ButtonStyle.Success);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
      await message.reply({ content:sendMessage, components:[row] });
    } else {
      await message.reply({ content:sendMessage });
    }

  } catch (error) {
    console.error('処理中に問題が発生しました: ', error);
    await message.reply('ごめんなさい、エラーが発生しちゃいました...');
  }
});

// メッセージコンポーネント（ボタン）インタラクションの処理
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'approve_button') return;

  try {
    // メッセージ本文から単語を抽出（前方の単語部分を取得）
    const content = interaction.message.content;
    // 例: 「word【pronounce】...」の形式なので、最初の行から単語を取得
    const firstLine = content.split('\n')[0];
    const word = firstLine.split('【')[0];
    const result = await approve(word.trim());
    if (result === 200) {
      await interaction.update({
        content: `${content}\n${word}の説明を承認しました。`,
        components: []
      });
    } else {
      await interaction.update({
        content: 'エラーが発生しました。',
        components: []
      });
    }
  } catch (error) {
    console.error('ボタン処理中に問題が発生しました: ', error);
    await interaction.update({
      content: '承認処理中にエラーが発生しました。',
      components: []
    });
  }
});

client.login(envs.token);
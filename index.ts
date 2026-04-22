import { Client, Events, GatewayIntentBits, REST, type Message } from 'discord.js';
import dotenv from 'dotenv';

import { addInconsistent } from './back/DB.js';
import { Envs } from './back/interface.js';
import { interactionHandler, registerCommands } from './front/command.js';
import { makeReply } from './front/commandHandler/ask.js';

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

    if (inl[0] === 'fix' && inl.length === 3) {
      await addInconsistent(inl[1], inl[2]);
      return;
    }

    const word = inl.join(' ');
    const sendMessage = await makeReply(word);
    await message.reply(sendMessage);

  } catch (error) {
    console.error('処理中に問題が発生しました: ', error);
    await message.reply('ごめんなさい、エラーが発生しちゃいました...');
  }
});

client.login(envs.token);
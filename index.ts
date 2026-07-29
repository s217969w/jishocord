import { Client, Events, GatewayIntentBits, REST, type Message } from 'discord.js';
import dotenv from 'dotenv';
import { ensureGuildSettings, markGuildDeparted } from './back/DB.js';
import { Envs } from './back/interface.js';
import { interactionHandler, registerCommands } from './front/command.js';
import { generateData, makeReply } from './front/commandHandler/ask.js';

dotenv.config();

const registration = process.env.DISCORD_COMMAND_REGISTRATION === 'guild' ? 'guild' : 'global';
const envs: Envs = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  commandRegistration: registration,
};

if (!envs.token || !envs.clientId || (registration === 'guild' && !envs.guildId)) {
  console.error('Discordの必須環境変数が設定されていません。');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const rest = new REST({ version: '10' }).setToken(envs.token);

client.once(Events.ClientReady, async () => {
  console.log('ボットが起動したよ');
  await registerCommands(rest, envs);
  for (const guild of client.guilds.cache.values()) {
    const result = await ensureGuildSettings(guild.id);
    if (!result.ok) console.error(`サーバー設定の初期化に失敗しました: ${guild.id}`);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  const result = await ensureGuildSettings(guild.id);
  if (!result.ok) console.error(`サーバー設定の初期化に失敗しました: ${guild.id}`);
});

client.on(Events.GuildDelete, async (guild) => {
  const result = await markGuildDeparted(guild.id);
  if (!result.ok) console.error(`サーバー退出の記録に失敗しました: ${guild.id}`);
});

client.on(Events.InteractionCreate, interactionHandler);

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot || !client.user || !message.mentions.has(client.user.id)) return;
  const word = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'gu'), '').trim();
  if (!word) {
    await message.reply({ content: 'こんにちは。呼びましたか？', allowedMentions: { repliedUser: false } });
    return;
  }
  try {
    const result = await generateData(word, message.guildId, message.author.id);
    const content = result.type === 'found' || result.type === 'already_exists'
      ? makeReply(result.entry)
      : result.type === 'not_explainable'
        ? 'ごめんなさい、その言葉は説明できなかったよ。'
        : result.message;
    await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
  } catch (error) {
    console.error('メッセージ処理中に問題が発生しました:', error);
    await message.reply({ content: 'ごめんなさい、一時的なエラーが発生しました。', allowedMentions: { repliedUser: false } });
  }
});

process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

client.login(envs.token);

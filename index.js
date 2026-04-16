
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } from 'discord.js';
import dotenv from 'dotenv';
import { addInconsistent, approve, getTips, getUnapproved } from './back/DB.js';
import { description } from './description.js';
import { askAI } from './back/AI.js';
dotenv.config();
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if(!token || !clientId || !guildId) {
  console.error('DISCORD_TOKEN, CLIENT_ID, または GUILD_ID が設定されていません。');
  process.exit(1);
}

const unapprovedListLimit = 10;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// スラッシュコマンド定義
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('技術用語の説明を表示します')
    .addStringOption(option =>
      option.setName('word')
        .setDescription('調べたい単語')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('unapproved')
    .setDescription('未承認の単語リストを表示します'),
  new SlashCommandBuilder()
    .setName('approve')
    .setDescription('指定した用語説明を承認します')
    .addStringOption(option =>
      option.setName('word')
        .setDescription('承認する単語')
        .setRequired(true)),
]
  .map(command => command.toJSON());

// コマンド登録
const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );
    console.log('スラッシュコマンドを登録しました');
  } catch (error) {
    console.error('コマンド登録エラー:', error);
  }
}

client.once(Events.ClientReady, async () => {
  console.log('ボットが起動したよ');
  await registerCommands();
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'ping') {
      await interaction.reply({content:'pong!', flags: 'Ephemeral'});
    } else if (interaction.commandName === 'ask') {
      const word = interaction.options.getString('word');
      let data = await getTips(word);
      if (!data) {
        data = await askAI(word);
        if(!data) {
          await interaction.reply({ content: `ごめんなさい、調べたけど分からなかった...`, flags: 'Ephemeral' });
        } else {
          const sendMessage = await description(data);
          await interaction.reply({content: sendMessage, flags: 'Ephemeral'});
        }
      } else {
        const sendMessage = await description(data);
        await interaction.reply({content: sendMessage, flags: 'Ephemeral'});
      }
    } else if (interaction.commandName === 'unapproved') {
      const wordList = await getUnapproved();
      let sendMessage = '未承認の単語一覧です:\n';
      for(let i = 0; i < Math.min(wordList.length, unapprovedListLimit); i++) {
        sendMessage += `- ${wordList[i].word}\n`
      }
      if(wordList.length > unapprovedListLimit) sendMessage += `他${wordList.length - unapprovedListLimit}件`
      await interaction.reply({content: sendMessage, flags: 'Ephemeral'});
    } else if (interaction.commandName === 'approve') {
      const word = interaction.options.getString('word');
      const result = await approve(word);
      if(result === 200) {
        await interaction.reply({content:`${word}の説明を承認しました。`, flags: 'Ephemeral'});
      } else if(result === 404){
        await interaction.reply({content:`未承認の単語に${word}は存在しません。`, flags: 'Ephemeral'});
      } else {
        await interaction.reply({content:'エラーが発生しました。', flags: 'Ephemeral'});
      }
    }
  } catch (error) {
    console.error('スラッシュコマンド処理中に問題が発生しました:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'エラーが発生しました。', flags: 'Ephemeral' });
    } else {
      await interaction.reply({ content: 'エラーが発生しました。', flags: 'Ephemeral' });
    }
  }
});

// 旧メッセージコマンドも残す場合はここに
client.on('messageCreate', async message => {
  if(message.author.bot) return; //BOTのメッセージには反応しない

  // メンションされたら返答
  if(message.mentions.has(client.user.id)) {
    let inl = message.content.split(' ');
    inl.shift();
    try {
      if(inl.length == 0) {
        await message.channel.send("こんにちは。呼びましたか？");
      } else if(inl[0] == "fix" && inl.length == 3) {
        await addInconsistent(inl[1], inl[2]);
      } else {
        const word = inl.join(' ');
        let data = await getTips(word);
        if(!data) {
          // 未登録の場合
          await message.channel.send(`${word}は登録されてなかったから、AIに聞いてみるね...`);
          data = await askAI(word);
          if(!data) {
            // AIがnullを返した
            await message.channel.send(`ごめんなさい、調べたけど分からなかった...`);
          } else {
            const sendMessage = await description(data);
            await message.channel.send(sendMessage);
          }
        } else {
          // 登録済み。そのまま返信
          console.log(data);
          const sendMessage = await description(data);
          await message.channel.send(sendMessage);
        }
      }
    } catch (error) {
      console.error('処理中に問題が発生しました: ', error);
      await message.channel.send("ごめんなさい、エラーが発生しちゃいました...");
    }
  }
});

client.login(token);
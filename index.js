import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { addInconsistent, getTips } from './back/DB.js';
import { description } from './description.js';
dotenv.config();
const token = process.env.DISCORD_TOKEN;
if(!token) {
  console.error('DISCORD_TOKEN is not set.');
  process.exit(1);
}
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});



client.on('messageCreate', async message => {
  if(message.author.bot) return; //BOTのメッセージには反応しない

  // メンションされたら返答
  if(message.mentions.has(client.user.id)) {
    let inl = message.content.split(' ');
    inl.shift();
    
    try {
        if(inl.length == 0) {
        message.channel.send("こんにちは。呼びましたか？");
      } else if(inl[0] == "fix" && inl.length == 3) {
        await addInconsistent(inl[1], inl[2]);
      } else {
        let word = inl.join(' ');
        let data = await getTips(word);
        if(!data) {
          message.channel.send("ごめんなさい、" + word + "は登録されてないみたい...");
        } else {
          let sendMessage = description(data);
          message.channel.send(sendMessage);
        }
      }
    } catch (error) {
      console.error('処理中に問題が発生しました: ', error);
    }
  }
});

client.on('clientready', () => {
  console.log('ボットが起動したよ');
});
client.login(token);
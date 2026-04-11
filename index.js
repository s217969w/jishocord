import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { addInconsistent } from './back/DBtest.js';
dotenv.config();
const token = process.env.DISCORD_TOKEN;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('messageCreate', message => {
  if(message.author.bot) return; //BOTのメッセージには反応しない

  // メンションされたら返答
  if(message.mentions.has(client.user.id)) {
    console.log(message.content);
    let word = message.content.split(' ');
    console.log(word[1]);
    if(word[1] == "fix" && word.length == 4) {
      addInconsistent(word[2], word[3]);
    } else {
      message.channel.send(word[1]);
    }
  }
});

client.on('clientready', () => {
  console.log('ボットが起動したよ');
});
client.login(token);
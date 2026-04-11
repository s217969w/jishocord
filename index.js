import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { addInconsistent } from './back/DBtest.js';
import { addword, getTips } from './back/DB.js';
import { description } from './description.js';
dotenv.config();
const token = process.env.DISCORD_TOKEN;
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
    console.log(message.content);
    let inl = message.content.split(' ');
    inl.shift();
    
    if(inl[0] == "fix" && inl.length == 3) {
      addInconsistent(inl[1], inl[2]);
    } else {
      let word = inl.join(' ');
      console.log(word);
      let data = await getTips(word);
      console.log(data);
      let sendMessage = description(data);
      message.channel.send(sendMessage);
    }
  }
});

client.on('clientready', () => {
  console.log('ボットが起動したよ');
});
client.login(token);
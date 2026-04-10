const { Client, GatewayIntentBits } = require('discord.js');
const { token } = require('./config.json');

const client = new Client(
  { intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
    ]
  }
);

client.on('messageCreate', message => {
  if(message.author.bot) return; //BOTのメッセージには反応しない

  // メンションされたら返答
  if(message.mentions.has(client.user.id)) {
    console.log(message.content);
    let word = message.content.split(' ');
    console.log(word[1]);
    message.channel.send(word[1]);
  }
});

client.on('ready', () => {
  console.log('ボットが起動したよ');
});
client.login(token);
const { Client, GatewayIntentBits } = require('discord.js');
const { PREFIX, BOT_TOKEN } = require('./Util/constants');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();

  if (!commandName) return;

  try {
    const commandPath = path.join(__dirname, 'Modules', `${commandName}.js`);
    const command = require(commandPath);
    if (command?.execute) {
      command.execute(message, args);
    }
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return message.reply(`Comanda \`${commandName}\` nu există.`);
    }
    throw err;
  }
});

client.login(BOT_TOKEN);

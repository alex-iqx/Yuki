const { Client, GatewayIntentBits, Events, Partials, ActivityType } = require('discord.js');
const { PREFIX, BOT_TOKEN } = require('./Util/constants');
const contact = require('./Modules/contact');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'DM me to contact our staff~ 🌸', type: ActivityType.Custom }]
  });

  await contact.init(client);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (!message.guild) {
    return contact.handleDM(message, client).catch(() => {});
  }

  if (contact.isTicketChannel(message.channel.id)) {
    return contact.handleTicketMessage(message, client).catch(() => {});
  }

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

client.on(Events.ChannelDelete, (channel) => {
  contact.onChannelDelete(channel.id);
});

client.login(BOT_TOKEN);

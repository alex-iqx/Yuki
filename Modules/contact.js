const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionFlagsBits
} = require('discord.js');
const { TICKET_CATEGORY_ID, PREFIX, TICKET_CLOSED_EMOJI } = require('../Util/constants');

const activeTickets = new Map();
const ticketUsers = new Map();
let cachedGuildName = null;

const formatDate = () =>
    new Date().toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).replace(',', '');

async function getGuildName(client) {
    if (cachedGuildName) return cachedGuildName;
    try {
        const category = await client.channels.fetch(TICKET_CATEGORY_ID);
        cachedGuildName = category?.guild?.name || 'Server';
    } catch {
        cachedGuildName = 'Server';
    }
    return cachedGuildName;
}

function createEmbedBase(client, title, description) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0xFFB4D9)
        .setThumbnail(client.user.displayAvatarURL());
}

module.exports = {
    name: 'contact',

    async init(client) {
        if (!TICKET_CATEGORY_ID) return;
        try {
            const category = await client.channels.fetch(TICKET_CATEGORY_ID);
            if (category?.type !== ChannelType.GuildCategory) return;
            const guild = category.guild;
            const channels = await guild.channels.fetch();

            for (const [, channel] of channels) {
                if (channel.parentId === TICKET_CATEGORY_ID && channel.name.startsWith('ticket-')) {
                    try {
                        const messages = await channel.messages.fetch({ limit: 1, after: '0' });
                        const firstMsg = messages.first();
                        const authorName = firstMsg?.embeds?.[0]?.author?.name;
                        const match = authorName?.match(/\((\d+)\)$/);
                        if (match) {
                            const userId = match[1];
                            activeTickets.set(userId, channel.id);
                            ticketUsers.set(channel.id, userId);
                        }
                    } catch {}
                }
            }
            console.log(`Loaded ${activeTickets.size} active ticket(s).`);
        } catch (err) {
            console.error('Failed to load active tickets:', err);
        }
    },

    isTicketChannel: channelId => ticketUsers.has(channelId),

    onChannelDelete(channelId) {
        const userId = ticketUsers.get(channelId);
        if (userId) {
            activeTickets.delete(userId);
            ticketUsers.delete(channelId);
        }
    },

    async handleDM(message, client) {
        if (!TICKET_CATEGORY_ID) return;
        const content = (message.content || '').trim();
        if (!content) return;

        const guildName = await getGuildName(client);

        const existingChannelId = activeTickets.get(message.author.id);
        if (existingChannelId) {
            const channel = await client.channels.fetch(existingChannelId).catch(() => null);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: `${message.author.tag} (${message.author.id})`,
                        iconURL: message.author.displayAvatarURL()
                    })
                    .setDescription(content.slice(0, 4096))
                    .setColor(0xFFB4D9)
                    .setThumbnail(client.user.displayAvatarURL())
                    .setFooter({ text: `Received at: ${formatDate()}` });
                await channel.send({ embeds: [embed] }).catch(() => {});
                await message.react(TICKET_CLOSED_EMOJI).catch(() => {});
                return;
            }
            activeTickets.delete(message.author.id);
            ticketUsers.delete(existingChannelId);
        }

        const confirmEmbed = createEmbedBase(client, `${guildName} • Contact Staff`, 'Are you sure you want to send this message?');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('contact_confirm')
                .setLabel('Send')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('contact_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        const prompt = await message.channel.send({ embeds: [confirmEmbed], components: [row] }).catch(() => null);
        if (!prompt) return;

        const collector = prompt.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 120_000, max: 1
        });

        collector.on('collect', async interaction => {
            await interaction.update({ components: [] }).catch(() => {});

            if (interaction.customId !== 'contact_confirm') {
                await message.channel.send({
                    embeds: [createEmbedBase(
                        client,
                        `${guildName} • Contact Staff`,
                        'Contact request has been cancelled.'
                    )]
                }).catch(() => {});
                return;
            }

            try {
                const category = await client.channels.fetch(TICKET_CATEGORY_ID).catch(() => null);
                if (!category || category.type !== ChannelType.GuildCategory) {
                    await message.channel.send({
                        embeds: [createEmbedBase(
                            client,
                            `${guildName} • Contact Staff`,
                            'I cannot create a ticket right now.'
                        )]
                    }).catch(() => {});
                    return;
                }

                const guild = category.guild;
                const username = (message.author.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80)) || 'user';

                const ticketChannel = await guild.channels.create({
                    name: `ticket-${username}`,
                    type: ChannelType.GuildText,
                    parent: TICKET_CATEGORY_ID,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                }).catch(() => null);

                if (!ticketChannel) {
                    await message.channel.send({
                        embeds: [createEmbedBase(client, `${guildName} • Contact Staff`, 'Failed to create ticket channel.')]
                    }).catch(() => {});
                    return;
                }

                activeTickets.set(message.author.id, ticketChannel.id);
                ticketUsers.set(ticketChannel.id, message.author.id);

                const ticketEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: `${message.author.tag} (${message.author.id})`,
                        iconURL: message.author.displayAvatarURL()
                    })
                    .setDescription(content.slice(0, 4096))
                    .setColor(0xFFB4D9)
                    .setThumbnail(client.user.displayAvatarURL())
                    .setFooter({ text: `Received at: ${formatDate()}` });

                await ticketChannel.send({ embeds: [ticketEmbed] }).catch(() => {});

                await message.channel.send({
                    embeds: [createEmbedBase(
                        client,
                        `${guildName} • Contact Staff`,
                        'A ticket has been opened with your request. Any further messages you send here will be forwarded to the staff.'
                    )]
                }).catch(() => {});
            } catch {
                await message.channel.send({
                    embeds: [createEmbedBase(
                        client,
                        `${guildName} • Contact Staff`,
                        'An error occurred while creating your ticket.'
                    )]
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await prompt.edit({ components: [] }).catch(() => {});
                await message.channel.send({
                    embeds: [createEmbedBase(
                        client,
                        `${guildName} • Contact Staff`,
                        'The confirmation time has expired.'
                    )]
                }).catch(() => {});
            }
        });
    },

    async handleTicketMessage(message, client) {
        const userId = ticketUsers.get(message.channel.id);
        if (!userId) return;

        const content = (message.content || '').trim();
        if (!content) return;
        if (content.toLowerCase() === `${PREFIX}close`)
            return this.closeTicket(message.channel, userId, client);

        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) return;

            const guildName = await getGuildName(client);
            const embed = new EmbedBuilder()
                .setTitle(`${guildName} • Contact Staff`)
                .setAuthor({
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL()
                })
                .setDescription(content.slice(0, 4096))
                .setColor(0xFFB4D9)
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: `Received at: ${formatDate()}` });

            await user.send({ embeds: [embed] })
                .then(() => message.react(TICKET_CLOSED_EMOJI).catch(() => {}))
                .catch(() => message.channel.send('Could not send the message to this user (DMs may be disabled).').catch(() => {}));
        } catch {}
    },

    async closeTicket(channel, userId, client) {
        const guildName = await getGuildName(client);
        await new Promise(r => setTimeout(r, 5000));

        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                await user.send({
                    embeds: [createEmbedBase(
                        client,
                        `${guildName} • Contact Staff`,
                        'Your ticket has been closed. If you need further assistance, feel free to send a new message.'
                    )]
                }).catch(() => {});
            }
        } catch {}

        activeTickets.delete(userId);
        ticketUsers.delete(channel.id);
        await channel.delete().catch(() => {});
    }
};

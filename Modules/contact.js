const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionFlagsBits
} = require('discord.js');
const { TICKET_CATEGORY_ID, PREFIX, TICKET_CLOSED_EMOJI } = require('../Util/constants');

const activeTickets = new Map();
const ticketUsers = new Map();
let cachedGuild = null;

const formatDate = () =>
    new Date().toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).replace(',', '');

async function getGuild(client) {
    if (cachedGuild) return cachedGuild;
    try {
        const category = await client.channels.fetch(TICKET_CATEGORY_ID);
        const guild = category?.guild;
        cachedGuild = {
            name: guild?.name || 'Server',
            iconURL: guild?.iconURL() || client.user.displayAvatarURL()
        };
    } catch {
        cachedGuild = {
            name: 'Server',
            iconURL: client.user.displayAvatarURL()
        };
    }
    return cachedGuild;
}

function createEmbed(guild, title, description) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0xFFB4D9)
        .setThumbnail(guild.iconURL);
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

        const guild = await getGuild(client);

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
                    .setThumbnail(guild.iconURL)
                    .setFooter({ text: `Received at: ${formatDate()}` });
                await channel.send({ embeds: [embed] }).catch(() => {});
                await message.react(TICKET_CLOSED_EMOJI).catch(() => {});
                return;
            }
            activeTickets.delete(message.author.id);
            ticketUsers.delete(existingChannelId);
        }

        const confirmEmbed = createEmbed(
            guild,
            `Are you sure you want to contact the ${guild.name} staff team?`,
            'If you wish to continue, click the \"Send\" button below to open a support ticket.'
        );
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
                    embeds: [createEmbed(guild, 'Request Cancelled', 'Your contact request has been cancelled. No ticket was created.')]
                }).catch(() => {});
                return;
            }

            try {
                const category = await client.channels.fetch(TICKET_CATEGORY_ID).catch(() => null);
                if (!category || category.type !== ChannelType.GuildCategory) {
                    await message.channel.send({
                        embeds: [createEmbed(guild, 'Unavailable', 'We cannot create a ticket right now. Please try again later.')]
                    }).catch(() => {});
                    return;
                }

                const discordGuild = category.guild;
                const username = (message.author.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80)) || 'user';

                const ticketChannel = await discordGuild.channels.create({
                    name: `ticket-${username}`,
                    type: ChannelType.GuildText,
                    parent: TICKET_CATEGORY_ID,
                    permissionOverwrites: [
                        { id: discordGuild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                }).catch(() => null);

                if (!ticketChannel) {
                    await message.channel.send({
                        embeds: [createEmbed(guild, 'Ticket Creation Failed', 'Something went wrong while creating your ticket. Please try again later.')]
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
                    .setThumbnail(guild.iconURL)
                    .setFooter({ text: `Received at: ${formatDate()}` });

                await ticketChannel.send({ embeds: [ticketEmbed] }).catch(() => {});

                await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('Staff Contacted')
                        .setDescription('We have opened a ticket with your message. Our staff team will review it and respond here as soon as they can.')
                        .setColor(0xFFB4D9)
                        .setThumbnail(guild.iconURL)
                        .setFooter({
                            text: `Message forwarded • ${formatDate()}`,
                            iconURL: guild.iconURL
                        })]
                }).catch(() => {});
            } catch (err) {
                console.error('Failed while creating ticket:', err);
                await message.channel.send({
                    embeds: [createEmbed(guild, 'Something Went Wrong', 'An error occurred while creating your ticket. Please try again later.')]
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await prompt.edit({ components: [] }).catch(() => {});
                await message.channel.send({
                    embeds: [createEmbed(guild, 'Request Expired', 'You took too long to respond. Please send your message again to retry.')]
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

            const guild = await getGuild(client);
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL()
                })
                .setDescription(content.slice(0, 4096))
                .setColor(0xFFB4D9)
                .setThumbnail(guild.iconURL)
                .setFooter({
                    text: `Staff 🌸 ${guild.name} • ${formatDate()}`,
                    iconURL: guild.iconURL
                });

            await user.send({ embeds: [embed] })
                .then(() => message.react(TICKET_CLOSED_EMOJI).catch(() => {}))
                .catch(() => message.channel.send('Could not send the message to this user (DMs may be disabled).').catch(() => {}));
        } catch {}
    },

    async closeTicket(channel, userId, client) {
        const guild = await getGuild(client);
        await new Promise(r => setTimeout(r, 5000));

        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                await user.send({
                    embeds: [createEmbed(guild, 'Ticket Closed', 'Your ticket has been closed. If you need further assistance, feel free to send a new message.')]
                }).catch(() => {});
            }
        } catch {}

        activeTickets.delete(userId);
        ticketUsers.delete(channel.id);
        await channel.delete().catch(() => {});
    }
};

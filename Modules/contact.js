const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionFlagsBits
} = require('discord.js');
const { TICKET_CATEGORY_ID } = require('../Util/constants');

const activeTickets = new Map();
const ticketUsers = new Map();

let cachedGuildName = null;

async function getGuildName(client) {
    if (cachedGuildName) return cachedGuildName;
    try {
        const category = await client.channels.fetch(TICKET_CATEGORY_ID);
        cachedGuildName = category.guild.name;
    } catch {
        cachedGuildName = 'Server';
    }
    return cachedGuildName;
}

module.exports = {
    name: 'contact',

    async init(client) {
        if (!TICKET_CATEGORY_ID) return;
        try {
            const category = await client.channels.fetch(TICKET_CATEGORY_ID);
            if (!category || category.type !== ChannelType.GuildCategory) return;

            const guild = category.guild;
            const channels = await guild.channels.fetch();

            for (const [channelId, channel] of channels) {
                if (channel.parentId === TICKET_CATEGORY_ID && channel.name.startsWith('ticket-')) {
                    const userId = channel.topic;
                    if (userId) {
                        activeTickets.set(userId, channelId);
                        ticketUsers.set(channelId, userId);
                    }
                }
            }

            console.log(`Loaded ${activeTickets.size} active ticket(s).`);
        } catch (err) {
            console.error('Failed to load active tickets:', err);
        }
    },

    isTicketChannel(channelId) {
        return ticketUsers.has(channelId);
    },

    onChannelDelete(channelId) {
        const userId = ticketUsers.get(channelId);
        if (userId) {
            activeTickets.delete(userId);
            ticketUsers.delete(channelId);
        }
    },

    async handleDM(message, client) {
        const content = (message.content || '').trim();
        if (!TICKET_CATEGORY_ID || !content) return;

        const existingChannelId = activeTickets.get(message.author.id);
        if (existingChannelId) {
            const channel = await client.channels.fetch(existingChannelId).catch(() => null);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: message.author.tag,
                        iconURL: message.author.displayAvatarURL()
                    })
                    .setDescription(content.slice(0, 4096))
                    .setColor(0xAED6F1)
                    .setTimestamp();

                await channel.send({ embeds: [embed] }).catch(() => {});
                await message.react('✅').catch(() => {});
                return;
            }

            activeTickets.delete(message.author.id);
            ticketUsers.delete(existingChannelId);
        }

        const guildName = await getGuildName(client);

        const confirmEmbed = new EmbedBuilder()
            .setTitle(`${guildName} • Contact Staff`)
            .setDescription('Are you sure you want to send this message?')
            .setColor(0xAED6F1)
            .setThumbnail(client.user.displayAvatarURL());

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

        const prompt = await message.channel.send({
            embeds: [confirmEmbed],
            components: [row]
        }).catch(() => null);

        if (!prompt) return;

        const collector = prompt.createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id,
            time: 120_000,
            max: 1
        });

        collector.on('collect', async (interaction) => {
            await interaction.update({ components: [] }).catch(() => {});

            if (interaction.customId === 'contact_confirm') {
                try {
                    const category = await client.channels.fetch(TICKET_CATEGORY_ID).catch(() => null);
                    if (!category || category.type !== ChannelType.GuildCategory) {
                        await message.channel.send({
                            embeds: [new EmbedBuilder()
                                .setTitle(`${guildName} • Contact Staff`)
                                .setDescription('I cannot create a ticket right now.')
                                .setColor(0xE74C3C)
                                .setThumbnail(client.user.displayAvatarURL())]
                        }).catch(() => {});
                        return;
                    }

                    const guild = category.guild;
                    const username = message.author.username
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '')
                        .slice(0, 80) || 'user';

                    const ticketChannel = await guild.channels.create({
                        name: `ticket-${username}`,
                        type: ChannelType.GuildText,
                        parent: TICKET_CATEGORY_ID,
                        topic: message.author.id,
                        permissionOverwrites: [
                            {
                                id: guild.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: client.user.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages
                                ]
                            }
                        ]
                    });

                    activeTickets.set(message.author.id, ticketChannel.id);
                    ticketUsers.set(ticketChannel.id, message.author.id);

                    const ticketEmbed = new EmbedBuilder()
                        .setAuthor({
                            name: message.author.tag,
                            iconURL: message.author.displayAvatarURL()
                        })
                        .setDescription(content.slice(0, 4096))
                        .setColor(0xAED6F1)
                        .addFields({
                            name: 'User',
                            value: `${message.author.tag} (${message.author.id})`,
                            inline: true
                        })
                        .setTimestamp();

                    await ticketChannel.send({ embeds: [ticketEmbed] }).catch(() => {});

                    await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setTitle(`${guildName} • Contact Staff`)
                            .setDescription('Your ticket has been opened. Any further messages you send here will be forwarded to the staff.')
                            .setColor(0x2ECC71)
                            .setThumbnail(client.user.displayAvatarURL())]
                    }).catch(() => {});
                } catch {
                    await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setTitle(`${guildName} • Contact Staff`)
                            .setDescription('An error occurred while creating your ticket.')
                            .setColor(0xE74C3C)
                            .setThumbnail(client.user.displayAvatarURL())]
                    }).catch(() => {});
                }
            } else {
                await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle(`${guildName} • Contact Staff`)
                        .setDescription('Contact request has been cancelled.')
                        .setColor(0x95A5A6)
                        .setThumbnail(client.user.displayAvatarURL())]
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await prompt.edit({ components: [] }).catch(() => {});
                await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle(`${guildName} • Contact Staff`)
                        .setDescription('The confirmation time has expired.')
                        .setColor(0x95A5A6)
                        .setThumbnail(client.user.displayAvatarURL())]
                }).catch(() => {});
            }
        });
    },

    async handleTicketMessage(message, client) {
        const userId = ticketUsers.get(message.channel.id);
        if (!userId) return;

        const content = (message.content || '').trim();
        if (!content) return;

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
                .setColor(0xAED6F1)
                .setTimestamp();

            await user.send({ embeds: [embed] }).catch(() => {
                message.channel.send('Could not send the message to this user (DMs may be disabled).').catch(() => {});
            });
        } catch {
            // silently fail
        }
    }
};

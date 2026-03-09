const { PREFIX, ALLOWED_ROLE_ID } = require('../Util/constants');

module.exports = {
  name: 'say',
  execute(message, args) {
    if (!message.member?.roles.cache.has(ALLOWED_ROLE_ID)) {
      return message.reply('Nu ai permisiunea să folosești această comandă.');
    }

    const channel = message.mentions.channels.first();
    const text = channel ? args.slice(1).join(' ').trim() : args.join(' ').trim();

    if (!text) {
      return message.reply({
        content: [
          '**Exemplu de utilizare:**',
          `• \`${PREFIX}say <text>\`: trimite textul în acest canal (mesajul tău va fi șters ulterior).`,
          `• \`${PREFIX}say #canal <text>\`: trimite textul în canalul menționat.`,
          '',
          `Exemple: \`${PREFIX}say Salut!\` | \`${PREFIX}say #anunțuri Salut!\``
        ].join('\n')
      });
    }

    const targetChannel = channel ?? message.channel;

    if (targetChannel.id === message.channel.id) {
      message.delete().catch(() => {});
    }

    targetChannel.send(text);
  }
};
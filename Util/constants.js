require('dotenv').config();

module.exports = {
  PREFIX: process.env.PREFIX || ',',
  ALLOWED_ROLE_ID: process.env.ALLOWED_ROLE_ID,
  BOT_TOKEN: process.env.BOT_TOKEN,
  APPLICATION_ID: process.env.APPLICATION_ID,
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID,
  TICKET_CLOSED_EMOJI: process.env.TICKET_CLOSED_EMOJI
};

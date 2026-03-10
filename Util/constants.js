require('dotenv').config();

module.exports = {
  PREFIX: process.env.PREFIX || ',',
  ALLOWED_ROLE_ID: process.env.ALLOWED_ROLE_ID,
  BOT_TOKEN: process.env.BOT_TOKEN,
  APPLICATION_ID: process.env.APPLICATION_ID
};

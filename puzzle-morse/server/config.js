const crypto = require('crypto');

module.exports = {
  PORT: process.env.PORT || 3000,
  // The secret word stays STRICTLY on the server and is never sent to the browser
  SECRET_WORD: process.env.SECRET_WORD || 'soseyessos',
  COOKIE_SECRET: process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex'),
  RATE_LIMIT_PER_MINUTE: 10,
  WINDOW_MS: 60 * 1000
};

const crypto = require('crypto');

/**
 * Creates an HMAC-SHA256 signed cookie string.
 * @param {object} payload 
 * @param {string} secret 
 * @returns {string} Signed cookie string: payloadBase64.signature
 */
function createSignedCookie(payload, secret) {
  const jsonStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(jsonStr).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');
  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 signed cookie string.
 * @param {string} cookieValue 
 * @param {string} secret 
 * @returns {object|null} Decoded payload or null if invalid / tampered
 */
function verifySignedCookie(cookieValue, secret) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const data = JSON.parse(jsonStr);
    if (data.exp && Date.now() > data.exp) {
      return null; // Expired
    }
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * Parses the Cookie header from an incoming HTTP request.
 * @param {import('http').IncomingMessage} req 
 * @returns {Record<string, string>}
 */
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;

  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });

  return list;
}

module.exports = {
  createSignedCookie,
  verifySignedCookie,
  parseCookies
};

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./server/config');
const { encodeToSegments } = require('./server/signal-encoder');
const { createSignedCookie, verifySignedCookie, parseCookies } = require('./server/auth');
const TeamRateLimiter = require('./server/rate-limiter');
const { logRequest } = require('./server/logger');

const rateLimiter = new TeamRateLimiter(config.RATE_LIMIT_PER_MINUTE, config.WINDOW_MS);

// Pre-calculate segments on the server only. The raw secret word is NEVER sent to the client.
const signalData = encodeToSegments(config.SECRET_WORD);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const clientIp = getClientIp(req);
  const cookies = parseCookies(req);

  // 1. GET /api/signal (Protected Signal Endpoint)
  if (req.method === 'GET' && pathname === '/api/signal') {
    const authCookie = cookies['orb_stage_token'];
    const session = verifySignedCookie(authCookie, config.COOKIE_SECRET);

    if (!session || !session.unlocked) {
      logRequest({
        method: 'GET',
        path: '/api/signal',
        ip: clientIp,
        teamId: null,
        status: 403,
        message: 'Stage locked. Missing or invalid signed cookie.'
      });

      res.writeHead(403, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      });
      return res.end(JSON.stringify({ error: 'Stage locked. Valid team credential required.' }));
    }

    const teamId = session.teamId || 'unknown_team';
    const rateCheck = rateLimiter.check(teamId);

    if (!rateCheck.allowed) {
      logRequest({
        method: 'GET',
        path: '/api/signal',
        ip: clientIp,
        teamId,
        status: 429,
        count: rateCheck.currentCount,
        message: `Rate limit exceeded. Remaining ms until reset: ${rateCheck.resetMs}`
      });

      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString(),
        'X-RateLimit-Limit': String(config.RATE_LIMIT_PER_MINUTE),
        'X-RateLimit-Remaining': '0',
        'Cache-Control': 'no-store'
      });
      return res.end(JSON.stringify({ error: 'Rate limit exceeded. Maximum 10 requests per minute per team.' }));
    }

    logRequest({
      method: 'GET',
      path: '/api/signal',
      ip: clientIp,
      teamId,
      status: 200,
      count: rateCheck.currentCount,
      message: `Delivered signal (${signalData.segments.length} segments, ${signalData.totalUnits} total units)`
    });

    // SECURITY: MUST RETURN ONLY AN ARRAY OF [startUnit, endUnit] SEGMENTS!
    // No letters, no plaintext, no metadata.
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-RateLimit-Limit': String(config.RATE_LIMIT_PER_MINUTE),
      'X-RateLimit-Remaining': String(rateCheck.remaining),
      'Cache-Control': 'no-store, must-revalidate'
    });
    return res.end(JSON.stringify(signalData.segments));
  }

  // 2. POST /api/unlock (Stage Unlock Helper for scavenger hunt integration)
  if (req.method === 'POST' && pathname === '/api/unlock') {
    const body = await parseJsonBody(req);
    const teamId = (body.teamId || 'team_alpha').trim();
    const token = createSignedCookie({
      teamId,
      unlocked: true,
      stage: 'orb-signal',
      issuedAt: Date.now()
    }, config.COOKIE_SECRET);

    logRequest({
      method: 'POST',
      path: '/api/unlock',
      ip: clientIp,
      teamId,
      status: 200,
      message: 'Stage unlocked by team'
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `orb_stage_token=${token}; Path=/; HttpOnly; SameSite=Lax`
    });
    return res.end(JSON.stringify({ ok: true, message: 'Stage unlocked successfully', teamId }));
  }

  // 3. POST /api/verify (Verify secret answer on server)
  if (req.method === 'POST' && pathname === '/api/verify') {
    const body = await parseJsonBody(req);
    const answer = (body.answer || '').toLowerCase().trim().replace(/[^a-z]/g, '');
    const expected = config.SECRET_WORD.toLowerCase().trim().replace(/[^a-z]/g, '');
    const isCorrect = answer === expected;

    logRequest({
      method: 'POST',
      path: '/api/verify',
      ip: clientIp,
      status: isCorrect ? 200 : 400,
      message: `Answer check: ${isCorrect ? 'SUCCESS' : 'FAILED'}`
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ correct: isCorrect }));
  }

  // 4. POST /api/lock (Lock stage for testing/reset)
  if (req.method === 'POST' && pathname === '/api/lock') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `orb_stage_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    });
    return res.end(JSON.stringify({ ok: true, message: 'Stage locked' }));
  }

  // 4. GET /api/status (Check current unlock status)
  if (req.method === 'GET' && pathname === '/api/status') {
    const authCookie = cookies['orb_stage_token'];
    const session = verifySignedCookie(authCookie, config.COOKIE_SECRET);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      unlocked: !!(session && session.unlocked),
      teamId: session ? session.teamId : null
    }));
  }

  // 5. Static File Serving from /public
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  // Normalize path to prevent path traversal
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  // Security: check path within public folder
  const publicDir = path.join(__dirname, 'public');
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

if (require.main === module) {
  server.listen(config.PORT, () => {
    console.log(`=======================================================`);
    console.log(`[Orb-Signal] Scavenger Hunt Puzzle Server Running!`);
    console.log(`[URL] http://localhost:${config.PORT}`);
    console.log(`[GET /api/signal] Protected with signed cookie + rate limit (10/min)`);
    console.log(`=======================================================`);
  });
}

module.exports = { server, rateLimiter };

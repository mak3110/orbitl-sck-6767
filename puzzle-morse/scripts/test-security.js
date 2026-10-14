const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('../server/config');
const { encodeToSegments } = require('../server/signal-encoder');
const { createSignedCookie } = require('../server/auth');

const SECRET_WORD = config.SECRET_WORD; // 'soseyessos'

// Morse pattern for 'soseyessos':
// s: ... o: --- s: ... e: . y: -.-- e: . s: ... s: ... o: --- s: ...
const MORSE_PATTERNS = [
  '... --- ... . -.-- . ... ... --- ...',
  '...---...-.--......---...',
  '.../---/..././-.--/./.../.../---/...',
  '••• ——— ••• • —•—— • ••• ••• ——— •••'
];

async function runTests() {
  console.log('====================================================');
  console.log('       ORB-SIGNAL SECURITY & FUNCTIONALITY TESTS    ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} - ${detail}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Scan all files in public/ for the password
  // ----------------------------------------------------
  console.log('[Test Suite 1] Client-side Code Leakage Scan:');
  const publicDir = path.join(__dirname, '..', 'public');
  const clientFiles = fs.readdirSync(publicDir);

  for (const file of clientFiles) {
    const filePath = path.join(publicDir, file);
    if (!fs.statSync(filePath).isFile()) continue;
    const content = fs.readFileSync(filePath, 'utf8');

    // 1. Check for password
    const hasPassword = content.toLowerCase().includes(SECRET_WORD.toLowerCase());
    assert(!hasPassword, `No password leak in ${file}`, `Found "${SECRET_WORD}" in ${file}`);

    // 2. Check for morse pattern
    let hasMorse = false;
    let matchedPattern = '';
    for (const pat of MORSE_PATTERNS) {
      if (content.includes(pat)) {
        hasMorse = true;
        matchedPattern = pat;
        break;
      }
    }
    assert(!hasMorse, `No Morse pattern leak in ${file}`, `Found pattern "${matchedPattern}" in ${file}`);
  }

  // ----------------------------------------------------
  // TEST 2: Signal Segment Calculation
  // ----------------------------------------------------
  console.log('\n[Test Suite 2] Morse Signal Encoding Accuracy:');
  const signal = encodeToSegments(SECRET_WORD);
  assert(signal.segments.length === 27, `Generated 27 Morse mark segments for "${SECRET_WORD}"`);
  assert(signal.totalUnits === 97, `Total signal units is 97 (including 4 start & 4 end units)`);
  assert(signal.segments[0][0] === 4, `First segment starts at unit 4 (after 4 flat units)`);
  assert(signal.segments[signal.segments.length - 1][1] === 93, `Last segment ends at unit 93 (leaves 4 flat units)`);

  // ----------------------------------------------------
  // TEST 3: HTTP Server & Security Endpoints
  // ----------------------------------------------------
  console.log('\n[Test Suite 3] API Security & Authentication Tests:');
  const { server } = require('../server.js');
  
  // Start server on an ephemeral port for testing
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  function request(method, pathUrl, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${pathUrl}`, {
        method,
        headers: headers
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(resBody);
          } catch(e) {
            parsed = resBody;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  try {
    // 3a. GET /api/signal without signed cookie -> 403 Forbidden
    const unauthRes = await request('GET', '/api/signal');
    assert(unauthRes.status === 403, 'GET /api/signal rejects requests without signed cookie (403)');

    // 3b. GET /api/signal with forged/tampered cookie -> 403 Forbidden
    const forgedRes = await request('GET', '/api/signal', {
      'Cookie': 'orb_stage_token=eyJ0ZWFtSWQiOiJoYWNrZXIifQ.invalidsignature'
    });
    assert(forgedRes.status === 403, 'GET /api/signal rejects forged/tampered cookie (403)');

    // 3c. Unlock via POST /api/unlock
    const unlockRes = await request('POST', '/api/unlock', {
      'Content-Type': 'application/json'
    }, JSON.stringify({ teamId: 'team_bravo' }));
    assert(unlockRes.status === 200, 'POST /api/unlock successfully unlocks team');
    const cookieHeader = unlockRes.headers['set-cookie'] ? unlockRes.headers['set-cookie'][0] : '';
    assert(cookieHeader.includes('orb_stage_token='), 'Unlock sets orb_stage_token signed cookie');

    const authCookie = cookieHeader.split(';')[0];

    // 3d. GET /api/signal with valid signed cookie
    const authRes = await request('GET', '/api/signal', {
      'Cookie': authCookie
    });
    assert(authRes.status === 200, 'GET /api/signal succeeds with valid signed cookie (200)');
    assert(Array.isArray(authRes.body), 'GET /api/signal returns ONLY an array of segments');
    assert(authRes.body.length === 27, 'Segments array has exactly 27 segments');
    assert(Array.isArray(authRes.body[0]) && authRes.body[0].length === 2, 'Each item is a [startUnit, endUnit] tuple');
    // Ensure no secret word or text is leaked in response
    const jsonStr = JSON.stringify(authRes.body);
    assert(!jsonStr.includes(SECRET_WORD), 'API response does not leak secret word');

    // ----------------------------------------------------
    // TEST 4: Rate Limiting (10 requests per minute per team)
    // ----------------------------------------------------
    console.log('\n[Test Suite 4] Rate Limiting Test (10 requests/min):');
    // We already made 1 request with team_bravo.
    // Let's make 9 more requests (total = 10)
    let allOk = true;
    for (let i = 2; i <= 10; i++) {
      const res = await request('GET', '/api/signal', { 'Cookie': authCookie });
      if (res.status !== 200) allOk = false;
    }
    assert(allOk, 'First 10 requests within minute are permitted (200)');

    // 11th request must fail with 429 Too Many Requests
    const limitedRes = await request('GET', '/api/signal', { 'Cookie': authCookie });
    assert(limitedRes.status === 429, '11th request is blocked with HTTP 429 (Too Many Requests)');
    assert(limitedRes.headers['retry-after'] !== undefined, 'Rate limit response contains Retry-After header');

    // ----------------------------------------------------
    // TEST 5: Logging verification
    // ----------------------------------------------------
    console.log('\n[Test Suite 5] Request Logging:');
    const { logFilePath } = require('../server/logger');
    const logExists = fs.existsSync(logFilePath);
    assert(logExists, 'Log file logs/access.log exists');
    if (logExists) {
      const logContent = fs.readFileSync(logFilePath, 'utf8');
      assert(logContent.includes('team_bravo'), 'Log records team ID');
      assert(logContent.includes('429'), 'Log records rate limiting events');
    }

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

/**
 * test.js
 * 
 * Automated tests for "Reroute the Reactor":
 * 1. Correct setup returns clean letter grid.
 * 2. Wrong setup returns a different, deterministic grid.
 * 3. Responses from /api/state NEVER contain answer text, correct settings, or status flags.
 * 4. Input validation rejects invalid requests.
 * 5. /api/submit checks answer correctly, rate limits to 5 attempts/min/team, and writes to attempts.log.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('./server/index');
const { getLetterGrid } = require('./server/font');
const config = require('./server/config.private');

async function runTests() {
  console.log('--- Starting Tests for Reroute the Reactor ---');

  // Start server on an ephemeral port
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // Test 1: Correct setup returns clean letter grid
    // -------------------------------------------------------------
    console.log('[Test 1] Correct setup returns clean letter grid...');
    const k2r1 = config.teams.K2[1];
    const correctRes = await fetch(`${baseUrl}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamCode: 'K2',
        round: 1,
        levers: k2r1.levers,
        wires: k2r1.wires
      })
    });

    assert.strictEqual(correctRes.status, 200, 'Expected 200 status');
    const correctBody = await correctRes.json();

    // Verify response structure has ONLY 'grid'
    const keys = Object.keys(correctBody);
    assert.deepStrictEqual(keys, ['grid'], `Expected response to ONLY have 'grid' property, got: ${keys}`);

    // Verify grid dimensions
    assert.strictEqual(correctBody.grid.length, 7, 'Grid must have 7 rows');
    for (const row of correctBody.grid) {
      assert.strictEqual(row.length, 5, 'Each row must have 5 columns');
    }

    // Verify grid matches clean pixel font for target letter 'O'
    const expectedLetterGrid = getLetterGrid(k2r1.targetLetter);
    assert.deepStrictEqual(correctBody.grid, expectedLetterGrid, 'Correct setup should match clean target letter pixel font');
    console.log('✓ Correct setup matched clean target letter grid.');

    // -------------------------------------------------------------
    // Test 2: Wrong setup returns different and deterministic grid
    // -------------------------------------------------------------
    console.log('[Test 2] Wrong setup returns different, deterministic grid...');
    const wrongPayload = {
      teamCode: 'K2',
      round: 1,
      levers: [0, 0, 0],
      wires: [0, 1, 2, 3]
    };

    const wrongRes1 = await fetch(`${baseUrl}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrongPayload)
    });
    const wrongBody1 = await wrongRes1.json();

    // Must not match clean target letter grid
    assert.notDeepStrictEqual(wrongBody1.grid, expectedLetterGrid, 'Wrong setup must not return the clean target letter grid');

    // Determinism test: calling with exact same wrong setup must produce identical grid
    const wrongRes2 = await fetch(`${baseUrl}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrongPayload)
    });
    const wrongBody2 = await wrongRes2.json();
    assert.deepStrictEqual(wrongBody1.grid, wrongBody2.grid, 'Same wrong setup must deterministically return identical grid');
    console.log('✓ Wrong setup returned a plausible distinct grid deterministically.');

    // -------------------------------------------------------------
    // Test 3: Response NEVER contains answer text or status flags
    // -------------------------------------------------------------
    console.log('[Test 3] Verifying response privacy...');
    const rawResText = JSON.stringify(wrongBody1);
    assert(!rawResText.includes('"target"'), 'Response must not contain "target"');
    assert(!rawResText.includes('"targetLetter"'), 'Response must not contain "targetLetter"');
    assert(!rawResText.includes('"correct"'), 'Response must not contain "correct"');
    assert(!rawResText.includes('"isCorrect"'), 'Response must not contain "isCorrect"');
    assert(!rawResText.includes('"ok"'), 'Response must not contain "ok"');
    console.log('✓ Responses strictly contain ONLY the grid data with zero answer leaks.');

    // -------------------------------------------------------------
    // Test 4: Input validation
    // -------------------------------------------------------------
    console.log('[Test 4] Validating request input validation...');
    const badReqs = [
      { teamCode: 'UNKNOWN', round: 1, levers: [0, 0, 0], wires: [0, 0, 0, 0] },
      { teamCode: 'K2', round: 99, levers: [0, 0, 0], wires: [0, 0, 0, 0] },
      { teamCode: 'K2', round: 1, levers: [0, 5, 0], wires: [0, 0, 0, 0] },
      { teamCode: 'K2', round: 1, levers: [0, 0], wires: [0, 0, 0, 0] },
      { teamCode: 'K2', round: 1, levers: [0, 0, 0], wires: [0, 0] }
    ];

    for (const bad of badReqs) {
      const res = await fetch(`${baseUrl}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bad)
      });
      assert.strictEqual(res.status, 400, `Expected 400 for invalid input: ${JSON.stringify(bad)}`);
    }
    console.log('✓ All invalid requests properly rejected with 400.');

    // -------------------------------------------------------------
    // Test 5: /api/submit evaluation, rate limit, and file logging
    // -------------------------------------------------------------
    console.log('[Test 5] Testing /api/submit and rate limiting...');
    // Team M5 round 1 target letter is 'R'
    const submitWrong = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamCode: 'M5', round: 1, letter: 'Z' })
    });
    const submitWrongBody = await submitWrong.json();
    assert.strictEqual(submitWrongBody.ok, false, 'Wrong letter submission should return ok: false');

    const submitRight = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamCode: 'M5', round: 1, letter: 'R' })
    });
    const submitRightBody = await submitRight.json();
    assert.strictEqual(submitRightBody.ok, true, 'Correct letter submission should return ok: true');

    // Make 3 more submissions to hit the 5 attempts/min limit for team M5
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamCode: 'M5', round: 1, letter: 'X' })
      });
      assert.strictEqual(res.status, 200);
    }

    // 6th attempt should be blocked by rate limiter (429)
    const rateLimitedRes = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamCode: 'M5', round: 1, letter: 'X' })
    });
    assert.strictEqual(rateLimitedRes.status, 429, '6th attempt within 1 minute should return 429');
    console.log('✓ Rate limiting to 5 attempts/minute verified.');

    // Verify attempts log file
    const logPath = path.join(__dirname, 'server', 'attempts.log');
    assert(fs.existsSync(logPath), 'attempts.log file should exist');
    const logContent = fs.readFileSync(logPath, 'utf8');
    assert(logContent.includes('TEAM=M5 ROUND=1 LETTER=R RESULT=SUCCESS'), 'Log should record correct attempt');
    assert(logContent.includes('TEAM=M5 ROUND=1 LETTER=Z RESULT=FAILURE'), 'Log should record failed attempt');
    console.log('✓ Attempt logs verified in server/attempts.log.');

    // -------------------------------------------------------------
    // Test 6: GET /api/hint progression, privacy & penalty logging
    // -------------------------------------------------------------
    console.log('[Test 6] Testing GET /api/hint progression & security...');
    // Attempting Level 3 directly without earning Level 1 and 2 must be blocked!
    const directHint3Res = await fetch(`${baseUrl}/api/hint?teamCode=K2&round=1&level=3`);
    assert.strictEqual(directHint3Res.status, 403, 'Direct call to Level 3 without unlocking Level 1 & 2 must return 403');

    // Unlock Level 1
    const hint1Res = await fetch(`${baseUrl}/api/hint?teamCode=K2&round=1&level=1&levers=0,0,0&wires=0,1,2,3`);
    assert.strictEqual(hint1Res.status, 200);
    const hint1Body = await hint1Res.json();
    assert.strictEqual(hint1Body.level, 1);
    assert(Array.isArray(hint1Body.differingColumns), 'Should return differingColumns array');
    assert(!JSON.stringify(hint1Body).includes('"targetLetter"'), 'Hint 1 must not leak target letter');

    // Attempting Level 3 before Level 2 must still be blocked!
    const skipTo3Res = await fetch(`${baseUrl}/api/hint?teamCode=K2&round=1&level=3`);
    assert.strictEqual(skipTo3Res.status, 403, 'Calling Level 3 before Level 2 must return 403');

    // Unlock Level 2
    const hint2Res = await fetch(`${baseUrl}/api/hint?teamCode=K2&round=1&level=2`);
    assert.strictEqual(hint2Res.status, 200);
    const hint2Body = await hint2Res.json();
    assert.strictEqual(hint2Body.level, 2);
    assert.strictEqual(hint2Body.socketIndex, config.teams.K2[1].wires[0]);
    assert(!JSON.stringify(hint2Body).includes('"targetLetter"'), 'Hint 2 must not leak target letter');

    // Now Level 3 is earned and should succeed
    const hint3Res = await fetch(`${baseUrl}/api/hint?teamCode=K2&round=1&level=3`);
    assert.strictEqual(hint3Res.status, 200);
    const hint3Body = await hint3Res.json();
    assert.strictEqual(hint3Body.level, 3);
    assert.strictEqual(hint3Body.leverIndex, 1);
    assert.strictEqual(hint3Body.position, config.teams.K2[1].levers[1]);
    assert.strictEqual(hint3Body.penaltyMinutes, 2, 'Must include 2-minute penalty');

    // Verify penalty was logged
    const updatedLogContent = fs.readFileSync(logPath, 'utf8');
    assert(updatedLogContent.includes('HINT_LEVEL_3 PENALTY=2min'), 'Penalty must be recorded in log');

    // Invalid hint level rejected
    const badHintRes = await fetch(`${baseUrl}/api/hint?teamCode=K2&round=1&level=99`);
    assert.strictEqual(badHintRes.status, 400, 'Invalid level should return 400');

    // -------------------------------------------------------------
    // Test 7: Security Audit Checks (Prototype Pollution, Direct File Access)
    // -------------------------------------------------------------
    console.log('[Test 7] Testing Security Audit protections...');
    // 7a. Prototype pollution prevention
    const protoRes = await fetch(`${baseUrl}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamCode: '__proto__', round: 1, levers: [0, 0, 0], wires: [0, 1, 2, 3] })
    });
    assert.strictEqual(protoRes.status, 400, '__proto__ team code must return 400');

    // 7b. Direct access to config.private.js must be blocked (404)
    const privateFileRes = await fetch(`${baseUrl}/server/config.private.js`);
    assert.strictEqual(privateFileRes.status, 404, 'Direct access to config.private.js must return 404');
    const privateFileRes2 = await fetch(`${baseUrl}/config.private.js`);
    assert.strictEqual(privateFileRes2.status, 404, 'Direct access to /config.private.js must return 404');
    console.log('✓ Security protections confirmed (prototype pollution & private file isolation).');

    console.log('\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});

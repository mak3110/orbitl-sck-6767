/**
 * server/index.js
 * 
 * Express server for "Reroute the Reactor".
 * Listens on 0.0.0.0:3000 to allow access from other devices on the same local network.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const config = require('./config.private');
const { getLetterGrid, generateDeterministicWrongGrid } = require('./font');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Security Guard: explicitly block any direct requests matching private files
app.use((req, res, next) => {
  if (req.path.includes('config.private') || req.path.includes('.private')) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting state for POST /api/submit (5 attempts per minute per team)
// Map: teamCode -> Array of timestamps (ms)
const submissionRateLimits = new Map();
const ATTEMPT_LIMIT = 5;
const WINDOW_MS = 60 * 1000;

// Hint progression tracking: `${team}:${round}` -> highest hint level unlocked (1, 2, 3)
const teamHintProgress = new Map();

// Log file for submit attempts & penalties
const LOG_PATH = path.join(__dirname, 'attempts.log');

/**
 * Normalize team code: strip non-alphanumeric characters and uppercase
 * Prevents rate-limit bypassing via formatting variations (e.g. 'k2', 'K 2', 'K-2')
 */
function normalizeTeamCode(code) {
  if (typeof code !== 'string') return '';
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Safe property check preventing Prototype Pollution lookup
 */
function isValidTeam(team) {
  return Boolean(team && config.teams && Object.prototype.hasOwnProperty.call(config.teams, team));
}

/**
 * Helper to log submission attempts & penalties
 */
function logAttempt(teamCode, round, letter, ok) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] TEAM=${teamCode} ROUND=${round} LETTER=${letter} RESULT=${ok ? 'SUCCESS' : 'FAILURE'}\n`;
  try {
    fs.appendFileSync(LOG_PATH, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to write to attempts log:', err);
  }
}

function logHintPenalty(teamCode, round, penaltyMinutes) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] TEAM=${teamCode} ROUND=${round} ACTION=HINT_LEVEL_3 PENALTY=${penaltyMinutes}min\n`;
  try {
    fs.appendFileSync(LOG_PATH, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to write to attempts log:', err);
  }
}

/**
 * POST /api/state
 * Body: { teamCode, round, levers: [a, b, c], wires: [s1, s2, s3, s4] }
 * Returns ONLY: { grid: [[... 5 cols] x 7 rows] }
 * Brightness values: 0 to 9.
 * NEVER returns target letter, correct settings, or correctness status.
 */
app.post('/api/state', (req, res) => {
  const { teamCode, round, levers, wires } = req.body || {};

  // Validate teamCode safely
  const normalizedTeam = normalizeTeamCode(teamCode);
  if (!isValidTeam(normalizedTeam)) {
    return res.status(400).json({ error: 'Team not found or invalid' });
  }
  const teamConfig = config.teams[normalizedTeam];

  // Validate round (1, 2, or 3) safely without prototype access
  const roundNum = Number(round);
  if (!Number.isInteger(roundNum) || ![1, 2, 3].includes(roundNum) || !Object.prototype.hasOwnProperty.call(teamConfig, roundNum)) {
    return res.status(400).json({ error: 'Invalid round number' });
  }
  const roundConfig = teamConfig[roundNum];

  // Validate levers: dense array of 3 numbers (each 0 to 3, no sparse holes)
  if (
    !Array.isArray(levers) ||
    levers.length !== 3 ||
    ![0, 1, 2].every(i => typeof levers[i] === 'number' && Number.isInteger(levers[i]) && levers[i] >= 0 && levers[i] <= 3)
  ) {
    return res.status(400).json({ error: 'Invalid levers: must be an array of 3 integers (0-3)' });
  }

  // Validate wires: dense array of 4 numbers (each 0 to 3, no sparse holes)
  if (
    !Array.isArray(wires) ||
    wires.length !== 4 ||
    ![0, 1, 2, 3].every(i => typeof wires[i] === 'number' && Number.isInteger(wires[i]) && wires[i] >= 0 && wires[i] <= 3)
  ) {
    return res.status(400).json({ error: 'Invalid wires: must be an array of 4 integers (0-3)' });
  }

  // Check setup against round answer
  const isLeversCorrect = levers.every((v, i) => v === roundConfig.levers[i]);
  const isWiresCorrect = wires.every((v, i) => v === roundConfig.wires[i]);
  const isFullyCorrect = isLeversCorrect && isWiresCorrect;

  let grid;
  if (isFullyCorrect) {
    // Return clean pixel-font version of target letter
    grid = getLetterGrid(roundConfig.targetLetter);
  } else {
    // Return plausible, deterministic wrong glyph / noise for this exact configuration
    const seedKey = `${normalizedTeam}|${roundNum}|${levers.join(',')}|${wires.join(',')}`;
    grid = generateDeterministicWrongGrid(seedKey);
  }

  // Strictly return ONLY the 7x5 brightness grid
  return res.json({ grid });
});

/**
 * POST /api/submit
 * Body: { teamCode, round, letter }
 * Returns: { ok: true/false }
 * Rate limit: 5 attempts per minute per team
 * Logs each attempt to server/attempts.log
 */
app.post('/api/submit', (req, res) => {
  const { teamCode, round, letter } = req.body || {};

  // Validate teamCode safely
  const normalizedTeam = normalizeTeamCode(teamCode);
  if (!isValidTeam(normalizedTeam)) {
    return res.status(400).json({ error: 'Team not found or invalid' });
  }
  const teamConfig = config.teams[normalizedTeam];

  // Validate round
  const roundNum = Number(round);
  if (!Number.isInteger(roundNum) || ![1, 2, 3].includes(roundNum) || !Object.prototype.hasOwnProperty.call(teamConfig, roundNum)) {
    return res.status(400).json({ error: 'Invalid round number' });
  }
  const roundConfig = teamConfig[roundNum];

  // Validate letter
  if (!letter || typeof letter !== 'string' || letter.trim().length !== 1) {
    return res.status(400).json({ error: 'Invalid letter: must be a single character' });
  }
  const submittedLetter = letter.trim().toUpperCase();

  // Rate Limiting: 5 attempts per minute per team (keyed strictly by canonical team code)
  const now = Date.now();
  let attempts = submissionRateLimits.get(normalizedTeam) || [];
  // Keep only timestamps within the last 60 seconds
  attempts = attempts.filter(ts => now - ts < WINDOW_MS);

  if (attempts.length >= ATTEMPT_LIMIT) {
    submissionRateLimits.set(normalizedTeam, attempts);
    return res.status(429).json({
      error: 'Rate limit exceeded: maximum 5 attempts per minute per team'
    });
  }

  // Record attempt timestamp synchronously to avoid parallel race condition
  attempts.push(now);
  submissionRateLimits.set(normalizedTeam, attempts);

  // Compare submitted letter with targetLetter
  const isMatch = (submittedLetter === roundConfig.targetLetter.toUpperCase());

  // Log attempt
  logAttempt(normalizedTeam, roundNum, submittedLetter, isMatch);

  // If correct, clear any round hint state
  if (isMatch) {
    teamHintProgress.delete(`${normalizedTeam}:${roundNum}`);
  }

  // Return ok: true/false
  return res.json({ ok: isMatch });
});

/**
 * GET /api/hint?teamCode=&round=&level=
 * Query parameters:
 * - teamCode: string (e.g. 'K2')
 * - round: 1, 2, or 3
 * - level: 1, 2, or 3
 * 
 * Enforces sequential hint progression:
 * - Must earn Level 1 before Level 2, and Level 2 before Level 3.
 * - Logs 2-minute penalty when Level 3 is issued.
 * - Never leaks full answers or target letters.
 */
app.get('/api/hint', (req, res) => {
  const { teamCode, round, level, levers: leversQuery, wires: wiresQuery } = req.query || {};

  // Validate teamCode safely
  const normalizedTeam = normalizeTeamCode(teamCode);
  if (!isValidTeam(normalizedTeam)) {
    return res.status(400).json({ error: 'Team not found or invalid' });
  }
  const teamConfig = config.teams[normalizedTeam];

  // Validate round
  const roundNum = Number(round);
  if (!Number.isInteger(roundNum) || ![1, 2, 3].includes(roundNum) || !Object.prototype.hasOwnProperty.call(teamConfig, roundNum)) {
    return res.status(400).json({ error: 'Invalid round number' });
  }
  const roundConfig = teamConfig[roundNum];

  // Validate level (1, 2, or 3)
  const hintLevel = Number(level);
  if (!Number.isInteger(hintLevel) || hintLevel < 1 || hintLevel > 3) {
    return res.status(400).json({ error: 'Invalid hint level: must be 1, 2, or 3' });
  }

  // Enforce sequential hint progression (cannot call level 3 without earning it)
  const progressKey = `${normalizedTeam}:${roundNum}`;
  const currentUnlocked = teamHintProgress.get(progressKey) || 0;

  if (hintLevel === 2 && currentUnlocked < 1) {
    return res.status(403).json({ error: 'Level 2 hint is locked: you must request Level 1 first' });
  }
  if (hintLevel === 3 && currentUnlocked < 2) {
    return res.status(403).json({ error: 'Level 3 hint is locked: you must request Level 2 first' });
  }

  // Update progress
  teamHintProgress.set(progressKey, Math.max(currentUnlocked, hintLevel));

  if (hintLevel === 1) {
    // Level 1: Flash columns of the heat map that differ from the target
    let currentLevers = [0, 0, 0];
    let currentWires = [0, 1, 2, 3];

    if (leversQuery) {
      const parsed = String(leversQuery).split(',').map(Number);
      if (parsed.length === 3 && [0, 1, 2].every(i => typeof parsed[i] === 'number' && Number.isInteger(parsed[i]) && parsed[i] >= 0 && parsed[i] <= 3)) {
        currentLevers = parsed;
      }
    }
    if (wiresQuery) {
      const parsed = String(wiresQuery).split(',').map(Number);
      if (parsed.length === 4 && [0, 1, 2, 3].every(i => typeof parsed[i] === 'number' && Number.isInteger(parsed[i]) && parsed[i] >= 0 && parsed[i] <= 3)) {
        currentWires = parsed;
      }
    }

    const isLeversCorrect = currentLevers.every((v, i) => v === roundConfig.levers[i]);
    const isWiresCorrect = currentWires.every((v, i) => v === roundConfig.wires[i]);
    const isFullyCorrect = isLeversCorrect && isWiresCorrect;

    const targetGrid = getLetterGrid(roundConfig.targetLetter);
    const currentGrid = isFullyCorrect
      ? targetGrid
      : generateDeterministicWrongGrid(`${normalizedTeam}|${roundNum}|${currentLevers.join(',')}|${currentWires.join(',')}`);

    const differingColumns = [];
    for (let col = 0; col < 5; col++) {
      let colDiffers = false;
      for (let row = 0; row < 7; row++) {
        if (currentGrid[row][col] !== targetGrid[row][col]) {
          colDiffers = true;
          break;
        }
      }
      if (colDiffers) {
        differingColumns.push(col);
      }
    }

    return res.json({
      level: 1,
      differingColumns,
      message: `Scanning core: ${differingColumns.length} matrix column(s) misaligned`
    });
  } else if (hintLevel === 2) {
    // Level 2: Light up one socket's icon
    const targetSocket = roundConfig.wires[0];
    const wireNames = ['Wire 0 (Circle)', 'Wire 1 (Triangle)', 'Wire 2 (Square)', 'Wire 3 (Diamond)'];
    return res.json({
      level: 2,
      socketIndex: targetSocket,
      wireIndex: 0,
      message: `Coupler frequency detected: calibrate Socket ${targetSocket} for ${wireNames[0]}`
    });
  } else {
    // Level 3: Lock one lever into correct position (with 2-minute penalty)
    const targetPosition = roundConfig.levers[1];
    logHintPenalty(normalizedTeam, roundNum, 2);

    return res.json({
      level: 3,
      leverIndex: 1,
      leverName: 'Lever B',
      position: targetPosition,
      penaltyMinutes: 2,
      message: `Emergency bypass: lock Lever B at position ${targetPosition} (2-min penalty applied)`
    });
  }
});

// Graceful JSON error-handling middleware (prevents server crashes on malformed request bodies)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }
  return res.status(500).json({ error: 'Internal Server Error' });
});

// Start listening if run directly
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`===============================================`);
    console.log(` Reroute the Reactor Server running on:`);
    console.log(` - Local:    http://localhost:${PORT}`);
    console.log(` - Network:  http://${HOST}:${PORT}`);
    console.log(`===============================================`);
  });
}

module.exports = app;

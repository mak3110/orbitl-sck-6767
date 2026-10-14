const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFilePath = path.join(logDir, 'access.log');

/**
 * Logs a request event to console and to logs/access.log
 * @param {object} entry 
 */
function logRequest(entry) {
  const timestamp = new Date().toISOString();
  const team = entry.teamId || 'ANONYMOUS';
  const ip = entry.ip || 'UNKNOWN_IP';
  const status = entry.status || 200;
  const message = entry.message || '';
  const count = entry.count !== undefined ? `[Rate: ${entry.count}/10]` : '';

  const logLine = `[${timestamp}] [TEAM: ${team}] [IP: ${ip}] [STATUS: ${status}] ${entry.method || 'GET'} ${entry.path || '/api/signal'} ${count} ${message}\n`;

  // Write to console
  process.stdout.write(logLine);

  // Append to log file synchronously to ensure log reliability
  try {
    fs.appendFileSync(logFilePath, logLine);
  } catch (err) {
    console.error('Failed to append to log file:', err.message);
  }
}

module.exports = {
  logRequest,
  logFilePath
};

/**
 * In-memory sliding window rate limiter per team.
 * Limit: 10 requests per minute per team.
 */
class TeamRateLimiter {
  constructor(limit = 10, windowMs = 60 * 1000) {
    this.limit = limit;
    this.windowMs = windowMs;
    /** @type {Map<string, number[]>} */
    this.requests = new Map();
  }

  /**
   * Checks and records a request for a team.
   * @param {string} teamKey - Team identifier (e.g. teamId or IP)
   * @returns {{ allowed: boolean, currentCount: number, limit: number, remaining: number, resetMs: number }}
   */
  check(teamKey) {
    const now = Date.now();
    const timestamps = this.requests.get(teamKey) || [];

    // Filter out timestamps outside the sliding window
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

    if (validTimestamps.length >= this.limit) {
      const oldest = validTimestamps[0];
      const resetMs = Math.max(0, this.windowMs - (now - oldest));
      this.requests.set(teamKey, validTimestamps);
      return {
        allowed: false,
        currentCount: validTimestamps.length,
        limit: this.limit,
        remaining: 0,
        resetMs
      };
    }

    validTimestamps.push(now);
    this.requests.set(teamKey, validTimestamps);

    return {
      allowed: true,
      currentCount: validTimestamps.length,
      limit: this.limit,
      remaining: this.limit - validTimestamps.length,
      resetMs: this.windowMs
    };
  }

  /**
   * Resets counts (useful for testing)
   */
  clear() {
    this.requests.clear();
  }
}

module.exports = TeamRateLimiter;

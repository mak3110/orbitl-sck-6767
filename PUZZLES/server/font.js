/**
 * server/font.js
 * 
 * 7-row by 5-column pixel font definitions (A-Z) and
 * deterministic glyph/noise generator for reactor readout.
 */

const FONT_7X5 = {
  'A': [
    [0, 9, 9, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 9, 9, 9, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9]
  ],
  'B': [
    [9, 9, 9, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 9, 9, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 9, 9, 9, 0]
  ],
  'C': [
    [0, 9, 9, 9, 9],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [0, 9, 9, 9, 9]
  ],
  'D': [
    [9, 9, 9, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 9, 9, 9, 0]
  ],
  'E': [
    [9, 9, 9, 9, 9],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 9, 9, 9, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 9, 9, 9, 9]
  ],
  'F': [
    [9, 9, 9, 9, 9],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 9, 9, 9, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0]
  ],
  'G': [
    [0, 9, 9, 9, 9],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 9, 9, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [0, 9, 9, 9, 9]
  ],
  'H': [
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 9, 9, 9, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9]
  ],
  'I': [
    [9, 9, 9, 9, 9],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [9, 9, 9, 9, 9]
  ],
  'J': [
    [0, 0, 9, 9, 9],
    [0, 0, 0, 9, 0],
    [0, 0, 0, 9, 0],
    [0, 0, 0, 9, 0],
    [9, 0, 0, 9, 0],
    [9, 0, 0, 9, 0],
    [0, 9, 9, 0, 0]
  ],
  'K': [
    [9, 0, 0, 0, 9],
    [9, 0, 0, 9, 0],
    [9, 0, 9, 0, 0],
    [9, 9, 0, 0, 0],
    [9, 0, 9, 0, 0],
    [9, 0, 0, 9, 0],
    [9, 0, 0, 0, 9]
  ],
  'L': [
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 9, 9, 9, 9]
  ],
  'M': [
    [9, 0, 0, 0, 9],
    [9, 9, 0, 9, 9],
    [9, 0, 9, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9]
  ],
  'N': [
    [9, 0, 0, 0, 9],
    [9, 9, 0, 0, 9],
    [9, 0, 9, 0, 9],
    [9, 0, 9, 0, 9],
    [9, 0, 0, 9, 9],
    [9, 0, 0, 9, 9],
    [9, 0, 0, 0, 9]
  ],
  'O': [
    [0, 9, 9, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [0, 9, 9, 9, 0]
  ],
  'P': [
    [9, 9, 9, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 9, 9, 9, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0]
  ],
  'Q': [
    [0, 9, 9, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 9, 0, 9],
    [9, 0, 0, 9, 0],
    [0, 9, 9, 0, 9]
  ],
  'R': [
    [9, 9, 9, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 9, 9, 9, 0],
    [9, 0, 9, 0, 0],
    [9, 0, 0, 9, 0],
    [9, 0, 0, 0, 9]
  ],
  'S': [
    [0, 9, 9, 9, 9],
    [9, 0, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [0, 9, 9, 9, 0],
    [0, 0, 0, 0, 9],
    [0, 0, 0, 0, 9],
    [9, 9, 9, 9, 0]
  ],
  'T': [
    [9, 9, 9, 9, 9],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0]
  ],
  'U': [
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [0, 9, 9, 9, 0]
  ],
  'V': [
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [0, 9, 0, 9, 0],
    [0, 0, 9, 0, 0]
  ],
  'W': [
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [9, 0, 9, 0, 9],
    [9, 0, 9, 0, 9],
    [9, 9, 0, 9, 9],
    [9, 0, 0, 0, 9]
  ],
  'X': [
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [0, 9, 0, 9, 0],
    [0, 0, 9, 0, 0],
    [0, 9, 0, 9, 0],
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9]
  ],
  'Y': [
    [9, 0, 0, 0, 9],
    [9, 0, 0, 0, 9],
    [0, 9, 0, 9, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 9, 0, 0]
  ],
  'Z': [
    [9, 9, 9, 9, 9],
    [0, 0, 0, 0, 9],
    [0, 0, 0, 9, 0],
    [0, 0, 9, 0, 0],
    [0, 9, 0, 0, 0],
    [9, 0, 0, 0, 0],
    [9, 9, 9, 9, 9]
  ]
};

/**
 * 32-bit Murmur-like string hash
 */
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mulberry32 PRNG
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Get clean pixel-font grid for a letter (7 rows x 5 cols)
 */
function getLetterGrid(letter) {
  const char = (letter || '').toUpperCase();
  const template = FONT_7X5[char];
  if (!template) {
    // Fallback block if letter missing
    return Array.from({ length: 7 }, () => Array(5).fill(0));
  }
  // Return deep clone
  return template.map(row => [...row]);
}

/**
 * Generate a deterministic plausible corrupted glyph / signal noise
 * for a specific combination of inputs.
 * The same input seed string always produces the exact same grid.
 */
function generateDeterministicWrongGrid(seedStr) {
  const seed = hashString(seedStr);
  const rng = mulberry32(seed);

  // Initialize 7x5 grid
  const grid = Array.from({ length: 7 }, () => Array(5).fill(0));

  // Determine structural features for the false/distorted signal:
  // e.g. scan lines, partial bars, noise spikes, glow
  const mode = Math.floor(rng() * 4); // 0: fragmented bars, 1: wave/interference, 2: distorted rune, 3: static mesh

  // Base brightness noise (subtle phosphor glow 0-2)
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      grid[r][c] = Math.floor(rng() * 3); // 0, 1, or 2
    }
  }

  if (mode === 0) {
    // Fragmented horizontal scanlines
    const activeRows = [Math.floor(rng() * 7), Math.floor(rng() * 7)];
    for (const r of activeRows) {
      const startCol = Math.floor(rng() * 3);
      const len = 2 + Math.floor(rng() * 3);
      for (let c = startCol; c < Math.min(5, startCol + len); c++) {
        grid[r][c] = 5 + Math.floor(rng() * 5); // 5-9
      }
    }
    // A vertical glitch spike
    const spikeCol = Math.floor(rng() * 5);
    const spikeRowStart = Math.floor(rng() * 4);
    for (let r = spikeRowStart; r < Math.min(7, spikeRowStart + 3); r++) {
      grid[r][spikeCol] = Math.max(grid[r][spikeCol], 6 + Math.floor(rng() * 4));
    }
  } else if (mode === 1) {
    // Stepped wave / interference
    let c = Math.floor(rng() * 3);
    for (let r = 0; r < 7; r++) {
      if (c >= 0 && c < 5) {
        grid[r][c] = 7 + Math.floor(rng() * 3);
        if (c > 0) grid[r][c - 1] = Math.max(grid[r][c - 1], 3 + Math.floor(rng() * 3));
        if (c < 4) grid[r][c + 1] = Math.max(grid[r][c + 1], 3 + Math.floor(rng() * 3));
      }
      c += (rng() > 0.5 ? 1 : -1);
      c = Math.max(0, Math.min(4, c));
    }
  } else if (mode === 2) {
    // Fractured pseudo-glyph (resembling broken segments)
    const corners = [[0, 0], [0, 4], [6, 0], [6, 4], [3, 2], [1, 2], [5, 2]];
    for (const [r, c] of corners) {
      if (rng() > 0.3) {
        grid[r][c] = 7 + Math.floor(rng() * 3);
      }
    }
    const midRow = 1 + Math.floor(rng() * 5);
    for (let col = 1; col < 4; col++) {
      if (rng() > 0.4) {
        grid[midRow][col] = 6 + Math.floor(rng() * 4);
      }
    }
  } else {
    // Grid pattern / noise scatter
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        const val = rng();
        if (val > 0.8) {
          grid[r][c] = 7 + Math.floor(rng() * 3);
        } else if (val > 0.5) {
          grid[r][c] = 3 + Math.floor(rng() * 3);
        }
      }
    }
  }

  // Ensure all values are clamped strictly between 0 and 9
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      grid[r][c] = Math.min(9, Math.max(0, Math.round(grid[r][c])));
    }
  }

  return grid;
}

module.exports = {
  FONT_7X5,
  getLetterGrid,
  generateDeterministicWrongGrid
};

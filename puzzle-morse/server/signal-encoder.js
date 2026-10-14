/**
 * Server-Side Signal Encoder
 * Encodes secret text to array of [startUnit, endUnit] segments.
 * 
 * Rules:
 * - On = sine wave, Off = flat line
 * - Dot = 1 unit on
 * - Dash = 3 units on
 * - Gap within letter = 1 unit off
 * - Gap between letters = 3 units off
 * - Gap between words = 7 units off
 * - 4 flat units at the start and end
 */

const MORSE_TABLE = {
  'a': '.-',    'b': '-...',  'c': '-.-.',  'd': '-..',
  'e': '.',     'f': '..-.',  'g': '--.',   'h': '....',
  'i': '..',    'j': '.---',  'k': '-.-',   'l': '.-..',
  'm': '--',    'n': '-.',    'o': '---',   'p': '.--.',
  'q': '--.-',  'r': '.-.',   's': '...',   't': '-',
  'u': '..-',   'v': '...-',  'w': '.--',   'x': '-..-',
  'y': '-.--',  'z': '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...',
  '8': '---..', '9': '----.'
};

/**
 * Encodes input text into raw [startUnit, endUnit] segments.
 * @param {string} text 
 * @returns {{ segments: Array<[number, number]>, totalUnits: number }}
 */
function encodeToSegments(text) {
  const normalized = (text || '').toLowerCase().trim();
  const words = normalized.split(/\s+/);
  
  let currentUnit = 4; // 4 flat units at the start
  const segments = [];

  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    for (let c = 0; c < word.length; c++) {
      const char = word[c];
      const pattern = MORSE_TABLE[char];
      if (!pattern) continue;

      for (let m = 0; m < pattern.length; m++) {
        const symbol = pattern[m];
        const duration = (symbol === '-') ? 3 : 1;
        segments.push([currentUnit, currentUnit + duration]);
        currentUnit += duration;

        // Gap within letter = 1 unit
        if (m < pattern.length - 1) {
          currentUnit += 1;
        }
      }

      // Gap between letters = 3 units
      if (c < word.length - 1) {
        currentUnit += 3;
      }
    }

    // Gap between words = 7 units
    if (w < words.length - 1) {
      currentUnit += 7;
    }
  }

  // 4 flat units at the end
  currentUnit += 4;

  return {
    segments,
    totalUnits: currentUnit
  };
}

module.exports = {
  encodeToSegments
};

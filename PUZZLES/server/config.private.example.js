// Example configuration template for "Reroute the Reactor"
// Copy this file to server/config.private.js and update answers as needed.
// IMPORTANT: server/config.private.js is gitignored and contains private puzzle answers.

module.exports = {
  teams: {
    K2: {
      1: {
        levers: [1, 3, 0],
        wires: [2, 0, 3, 1],
        targetLetter: 'O'
      },
      2: {
        levers: [0, 2, 3],
        wires: [1, 3, 0, 2],
        targetLetter: 'F'
      },
      3: {
        levers: [2, 1, 2],
        wires: [3, 2, 1, 0],
        targetLetter: 'F'
      }
    },
    M5: {
      1: {
        levers: [3, 0, 1],
        wires: [0, 3, 2, 1],
        targetLetter: 'R'
      },
      2: {
        levers: [2, 2, 0],
        wires: [3, 1, 0, 2],
        targetLetter: 'U'
      },
      3: {
        levers: [1, 0, 3],
        wires: [1, 2, 3, 0],
        targetLetter: 'N'
      }
    }
  }
};

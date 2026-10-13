/**
 * public/app.js
 * 
 * Reroute the Reactor - Client Logic
 * - 5x7 glowing heat map with 1s settling animation
 * - 3 vertical levers with touch/mouse drag & snapping
 * - 4 wires & 4 sockets patch bay with SVG curved cables & collision pop-back
 * - 150ms debounced /api/state sync
 * - In-memory team code authentication (zero localStorage)
 * - Round progression (1 to 3), submission via /api/submit, & suffix recovery banner
 * - 3-level server hints via GET /api/hint with 2-minute penalty tracking
 * Zero external libraries or internet dependencies.
 */

(function () {
  // ==========================================================================
  // GAME STATE (IN-MEMORY ONLY)
  // ==========================================================================

  let currentTeamCode = null; // Strictly in-memory, never stored in localStorage
  let currentRound = 1;
  const TOTAL_ROUNDS = 3;
  const recoveredLetters = [];

  let currentHintLevel = 1;
  let penaltyApplied = false;

  // DOM Elements - General & Status
  const teamAuthOverlay = document.getElementById('team-auth-overlay');
  const teamCodeInput = document.getElementById('team-code-input');
  const btnAuthTeam = document.getElementById('btn-auth-team');
  const authError = document.getElementById('auth-error');

  const roundIndicator = document.getElementById('round-indicator');
  const penaltyBadge = document.getElementById('penalty-badge');
  const teamStatusLabel = document.getElementById('team-status-label');

  // DOM Elements - Heat Map
  const ROWS = 7;
  const COLS = 5;
  const SETTLE_DURATION = 1000;
  const gridContainer = document.getElementById('heatmap-grid');
  const stateText = document.getElementById('state-text');
  const monitorPanel = document.getElementById('monitor-panel');

  // DOM Elements - Decryption Submission
  const letterInput = document.getElementById('letter-input');
  const btnSubmitLetter = document.getElementById('btn-submit-letter');
  const feedbackMessage = document.getElementById('feedback-message');

  // DOM Elements - Hints
  const btnRequestHint = document.getElementById('btn-request-hint');
  const hintsLog = document.getElementById('hints-log');
  const hintsPenaltyWarning = document.getElementById('hints-penalty-warning');

  // DOM Elements - Victory
  const victoryBanner = document.getElementById('victory-banner');
  const suffixWord = document.getElementById('suffix-word');
  const btnReplayMission = document.getElementById('btn-replay-mission');

  // Heat Map Internal State
  let cellElements = [];
  let currentGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  let animationId = null;

  // Debounce Timer for Server State Sync
  let debounceTimer = null;

  // ==========================================================================
  // HEAT MAP RENDERING & 1-SECOND SETTLING ANIMATION
  // ==========================================================================

  function initializeGridDOM() {
    if (!gridContainer) return;
    gridContainer.innerHTML = '';
    cellElements = [];

    for (let r = 0; r < ROWS; r++) {
      const rowArr = [];
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.dataset.level = '0';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `Row ${r + 1}, Column ${c + 1}`);
        gridContainer.appendChild(cell);
        rowArr.push(cell);
      }
      cellElements.push(rowArr);
    }
  }

  function sanitizeGrid(inputGrid) {
    const sanitized = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        let val = 0;
        if (inputGrid && inputGrid[r] && typeof inputGrid[r][c] === 'number') {
          val = Math.round(inputGrid[r][c]);
        }
        val = Math.max(0, Math.min(9, isNaN(val) ? 0 : val));
        row.push(val);
      }
      sanitized.push(row);
    }
    return sanitized;
  }

  function setCellLevel(r, c, level) {
    if (cellElements[r] && cellElements[r][c]) {
      cellElements[r][c].dataset.level = String(level);
    }
  }

  function renderGrid(targetGrid) {
    const finalGrid = sanitizeGrid(targetGrid);
    const startGrid = currentGrid.map(row => [...row]);

    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (monitorPanel) monitorPanel.classList.add('is-settling');
    if (stateText) {
      stateText.textContent = 'SETTLING SIGNAL...';
      stateText.classList.add('settling');
    }

    const startTime = performance.now();
    let lastJitterTick = 0;

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / SETTLE_DURATION);

      if (progress < 1) {
        if (now - lastJitterTick > 45) {
          lastJitterTick = now;
          const flickerProb = Math.pow(1 - progress, 1.2) * 0.85;

          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const startVal = startGrid[r][c];
              const targetVal = finalGrid[r][c];
              const baseInterp = startVal + (targetVal - startVal) * progress;

              let displayVal;
              if (Math.random() < flickerProb) {
                const noiseRange = Math.round((1 - progress) * 8);
                const jitter = (Math.random() * (noiseRange * 2) - noiseRange);
                displayVal = Math.round(baseInterp + jitter);
              } else {
                displayVal = Math.round(baseInterp);
              }

              displayVal = Math.max(0, Math.min(9, displayVal));
              setCellLevel(r, c, displayVal);
            }
          }
        }
        animationId = requestAnimationFrame(step);
      } else {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            setCellLevel(r, c, finalGrid[r][c]);
          }
        }
        currentGrid = finalGrid;
        animationId = null;

        if (monitorPanel) monitorPanel.classList.remove('is-settling');
        if (stateText) {
          stateText.textContent = 'SIGNAL LOCKED';
          stateText.classList.remove('settling');
        }
      }
    }

    animationId = requestAnimationFrame(step);
  }

  // ==========================================================================
  // VERTICAL LEVERS LOGIC
  // ==========================================================================

  const NUM_LEVERS = 3;
  const NOTCH_MIN = 0;
  const NOTCH_MAX = 3;
  const Y_TOP = 14;
  const Y_BOTTOM = 166;
  const TRAVEL = Y_BOTTOM - Y_TOP;

  const leverValues = [0, 0, 0];

  function notchToY(notch) {
    const clamped = Math.max(NOTCH_MIN, Math.min(NOTCH_MAX, notch));
    return Y_TOP + (NOTCH_MAX - clamped) * (TRAVEL / (NOTCH_MAX - NOTCH_MIN));
  }

  function yToNearestNotch(y) {
    const clampedY = Math.max(Y_TOP, Math.min(Y_BOTTOM, y));
    const fraction = (clampedY - Y_TOP) / TRAVEL;
    const notch = Math.round((1 - fraction) * NOTCH_MAX);
    return Math.max(NOTCH_MIN, Math.min(NOTCH_MAX, notch));
  }

  function updateLeverUI(leverIndex, notch) {
    const assembly = document.getElementById(`lever-assembly-${leverIndex}`);
    const badge = document.getElementById(`lever-badge-${leverIndex}`);
    const summary = document.getElementById('levers-summary');
    const handle = document.getElementById(`lever-handle-${leverIndex}`);

    if (badge) badge.textContent = `POS: ${notch}`;
    if (handle) handle.setAttribute('aria-valuenow', String(notch));

    if (assembly) {
      const notches = assembly.querySelectorAll('.lever-notch');
      notches.forEach(n => {
        if (Number(n.dataset.notch) === notch) {
          n.classList.add('active');
        } else {
          n.classList.remove('active');
        }
      });
    }

    if (summary) {
      summary.textContent = `A:${leverValues[0]} | B:${leverValues[1]} | C:${leverValues[2]}`;
    }
  }

  function setLeverPosition(leverIndex, targetNotch, notify = true) {
    const safeNotch = Math.max(NOTCH_MIN, Math.min(NOTCH_MAX, Math.round(targetNotch)));
    const prevVal = leverValues[leverIndex];
    leverValues[leverIndex] = safeNotch;

    const handle = document.getElementById(`lever-handle-${leverIndex}`);
    if (handle) {
      handle.style.top = `${notchToY(safeNotch)}px`;
    }

    updateLeverUI(leverIndex, safeNotch);

    if (notify && prevVal !== safeNotch) {
      triggerChange();
    }
  }

  function initializeLevers() {
    for (let i = 0; i < NUM_LEVERS; i++) {
      const leverIndex = i;
      const assembly = document.getElementById(`lever-assembly-${leverIndex}`);
      const handle = document.getElementById(`lever-handle-${leverIndex}`);
      const slot = assembly ? assembly.querySelector('.lever-slot') : null;
      const notchElements = assembly ? assembly.querySelectorAll('.lever-notch') : [];

      if (!assembly || !handle) continue;

      let isDragging = false;
      let startClientY = 0;
      let startHandleY = 0;

      handle.style.top = `${notchToY(leverValues[leverIndex])}px`;
      updateLeverUI(leverIndex, leverValues[leverIndex]);

      handle.addEventListener('pointerdown', (e) => {
        // If locked by Level 3 hint, disallow dragging
        const unit = document.getElementById(`lever-unit-${leverIndex}`);
        if (unit && unit.classList.contains('locked')) return;

        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('dragging');

        startClientY = e.clientY;
        const currentStyleTop = parseFloat(handle.style.top);
        startHandleY = isNaN(currentStyleTop) ? notchToY(leverValues[leverIndex]) : currentStyleTop;
      });

      handle.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const deltaY = e.clientY - startClientY;
        const targetY = Math.max(Y_TOP, Math.min(Y_BOTTOM, startHandleY + deltaY));
        handle.style.top = `${targetY}px`;

        const previewNotch = yToNearestNotch(targetY);
        updateLeverUI(leverIndex, previewNotch);
      });

      const finishDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        handle.classList.remove('dragging');

        try {
          if (handle.hasPointerCapture(e.pointerId)) {
            handle.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}

        const currentY = parseFloat(handle.style.top);
        const finalNotch = yToNearestNotch(currentY);
        setLeverPosition(leverIndex, finalNotch, true);
      };

      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', finishDrag);

      notchElements.forEach((notchEl) => {
        notchEl.addEventListener('pointerdown', (e) => {
          const unit = document.getElementById(`lever-unit-${leverIndex}`);
          if (unit && unit.classList.contains('locked')) return;

          e.preventDefault();
          e.stopPropagation();
          const targetNotch = Number(notchEl.dataset.notch);
          setLeverPosition(leverIndex, targetNotch, true);
        });
      });

      if (slot) {
        slot.addEventListener('pointerdown', (e) => {
          const unit = document.getElementById(`lever-unit-${leverIndex}`);
          if (unit && unit.classList.contains('locked')) return;

          e.preventDefault();
          const rect = assembly.getBoundingClientRect();
          const relativeY = e.clientY - rect.top;
          const targetNotch = yToNearestNotch(relativeY);
          setLeverPosition(leverIndex, targetNotch, true);
        });
      }

      handle.addEventListener('keydown', (e) => {
        const unit = document.getElementById(`lever-unit-${leverIndex}`);
        if (unit && unit.classList.contains('locked')) return;

        let current = leverValues[leverIndex];
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (current < NOTCH_MAX) setLeverPosition(leverIndex, current + 1, true);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          if (current > NOTCH_MIN) setLeverPosition(leverIndex, current - 1, true);
        } else if (e.key === 'Home') {
          e.preventDefault();
          setLeverPosition(leverIndex, NOTCH_MIN, true);
        } else if (e.key === 'End') {
          e.preventDefault();
          setLeverPosition(leverIndex, NOTCH_MAX, true);
        }
      });
    }
  }

  // ==========================================================================
  // PATCH BAY LOGIC (WIRES & SOCKETS)
  // ==========================================================================

  const NUM_WIRES = 4;
  const NUM_SOCKETS = 4;
  const WIRE_COLORS = ['#00e5ff', '#ffaa00', '#10b981', '#c084fc'];
  const wireMapping = [0, 1, 2, 3];
  const cableElements = [];

  function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }

  function computeCablePath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);

    const ctrlDist = Math.max(35, dx * 0.45);
    const cx1 = x1 + ctrlDist;
    const cx2 = x2 - ctrlDist;

    const sag = Math.min(30, Math.max(10, dist * 0.08));
    const cy1 = y1 + sag;
    const cy2 = y2 + sag;

    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  function getElementStageCenter(el, stageRect) {
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - stageRect.left,
      y: rect.top + rect.height / 2 - stageRect.top
    };
  }

  function updateWiresTelemetry() {
    const summary = document.getElementById('wires-summary');
    if (!summary) return;
    const parts = wireMapping.map((skt, i) => `W${i}:${skt >= 0 ? 'S' + skt : '--'}`);
    summary.textContent = parts.join(' | ');

    for (let s = 0; s < NUM_SOCKETS; s++) {
      const port = document.getElementById(`socket-port-${s}`);
      if (!port) continue;
      const isOccupied = wireMapping.includes(s);
      if (isOccupied) {
        port.classList.add('occupied');
      } else {
        port.classList.remove('occupied');
      }
    }
  }

  function updateWireCable(wireIdx, dragX = null, dragY = null) {
    const stage = document.getElementById('patchbay-stage');
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();

    const originPin = document.querySelector(`#wire-origin-${wireIdx} .wire-origin-pin`);
    const plug = document.getElementById(`wire-plug-${wireIdx}`);
    if (!originPin || !plug) return;

    const start = getElementStageCenter(originPin, stageRect);

    let endX, endY;
    if (dragX !== null && dragY !== null) {
      endX = dragX;
      endY = dragY;
    } else {
      const targetSocket = wireMapping[wireIdx];
      if (targetSocket >= 0 && targetSocket < NUM_SOCKETS) {
        const socketPort = document.getElementById(`socket-port-${targetSocket}`);
        const socketPos = getElementStageCenter(socketPort, stageRect);
        endX = socketPos.x;
        endY = socketPos.y;
      } else {
        const originSlot = document.getElementById(`wire-origin-${wireIdx}`);
        const slotPos = getElementStageCenter(originSlot, stageRect);
        endX = slotPos.x + 36;
        endY = slotPos.y;
      }
      plug.style.left = `${endX}px`;
      plug.style.top = `${endY}px`;
    }

    const pathData = computeCablePath(start.x, start.y, endX, endY);
    const cables = cableElements[wireIdx];
    if (cables) {
      cables.glow.setAttribute('d', pathData);
      cables.main.setAttribute('d', pathData);
      cables.core.setAttribute('d', pathData);
    }
  }

  function updateAllCables() {
    for (let i = 0; i < NUM_WIRES; i++) {
      updateWireCable(i);
    }
    updateWiresTelemetry();
  }

  function connectWireToSocket(wireIdx, socketIdx, notify = true) {
    if (socketIdx < 0 || socketIdx >= NUM_SOCKETS) {
      wireMapping[wireIdx] = -1;
    } else {
      // Pop-back: two wires cannot share a socket (the older one pops back)
      const currentOccupant = wireMapping.findIndex((s, idx) => idx !== wireIdx && s === socketIdx);
      if (currentOccupant !== -1) {
        wireMapping[currentOccupant] = -1;
        updateWireCable(currentOccupant);
      }
      wireMapping[wireIdx] = socketIdx;
    }

    updateWireCable(wireIdx);
    updateWiresTelemetry();

    if (notify) {
      triggerChange();
    }
  }

  function initializePatchBay() {
    const stage = document.getElementById('patchbay-stage');
    const svgCanvas = document.getElementById('wires-canvas');
    if (!stage || !svgCanvas) return;

    svgCanvas.innerHTML = '';
    cableElements.length = 0;

    for (let i = 0; i < NUM_WIRES; i++) {
      const color = WIRE_COLORS[i];

      const glow = createSvgElement('path', {
        stroke: color,
        'stroke-width': '9',
        'stroke-linecap': 'round',
        fill: 'none',
        opacity: '0.22',
        style: 'filter: drop-shadow(0 0 6px ' + color + ');'
      });

      const main = createSvgElement('path', {
        stroke: color,
        'stroke-width': '4',
        'stroke-linecap': 'round',
        fill: 'none',
        opacity: '0.9'
      });

      const core = createSvgElement('path', {
        stroke: '#ffffff',
        'stroke-width': '1.5',
        'stroke-linecap': 'round',
        'stroke-dasharray': '5 3',
        fill: 'none',
        opacity: '0.65'
      });

      svgCanvas.appendChild(glow);
      svgCanvas.appendChild(main);
      svgCanvas.appendChild(core);

      cableElements.push({ glow, main, core });
    }

    for (let i = 0; i < NUM_WIRES; i++) {
      const wireIdx = i;
      const plug = document.getElementById(`wire-plug-${wireIdx}`);
      if (!plug) continue;

      let isDragging = false;

      plug.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        plug.setPointerCapture(e.pointerId);
        plug.classList.add('dragging');

        const stageRect = stage.getBoundingClientRect();
        const curX = e.clientX - stageRect.left;
        const curY = e.clientY - stageRect.top;

        plug.style.left = `${curX}px`;
        plug.style.top = `${curY}px`;
        updateWireCable(wireIdx, curX, curY);
      });

      plug.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const stageRect = stage.getBoundingClientRect();
        const curX = e.clientX - stageRect.left;
        const curY = e.clientY - stageRect.top;

        plug.style.left = `${curX}px`;
        plug.style.top = `${curY}px`;
        updateWireCable(wireIdx, curX, curY);

        for (let s = 0; s < NUM_SOCKETS; s++) {
          const socketPort = document.getElementById(`socket-port-${s}`);
          if (!socketPort) continue;
          const pos = getElementStageCenter(socketPort, stageRect);
          const dist = Math.hypot(curX - pos.x, curY - pos.y);

          if (dist <= 40) {
            socketPort.classList.add('hover-target');
          } else {
            socketPort.classList.remove('hover-target');
          }
        }
      });

      const finishDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        plug.classList.remove('dragging');

        try {
          if (plug.hasPointerCapture(e.pointerId)) {
            plug.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}

        for (let s = 0; s < NUM_SOCKETS; s++) {
          const port = document.getElementById(`socket-port-${s}`);
          if (port) port.classList.remove('hover-target');
        }

        const stageRect = stage.getBoundingClientRect();
        const dropX = e.clientX - stageRect.left;
        const dropY = e.clientY - stageRect.top;

        let nearestSocket = -1;
        let minDistance = 46;

        for (let s = 0; s < NUM_SOCKETS; s++) {
          const socketPort = document.getElementById(`socket-port-${s}`);
          if (!socketPort) continue;
          const pos = getElementStageCenter(socketPort, stageRect);
          const dist = Math.hypot(dropX - pos.x, dropY - pos.y);
          if (dist < minDistance) {
            minDistance = dist;
            nearestSocket = s;
          }
        }

        if (nearestSocket !== -1) {
          connectWireToSocket(wireIdx, nearestSocket, true);
        } else {
          if (dropX < 120) {
            connectWireToSocket(wireIdx, -1, true);
          } else {
            updateWireCable(wireIdx);
          }
        }
      };

      plug.addEventListener('pointerup', finishDrag);
      plug.addEventListener('pointercancel', finishDrag);
    }

    requestAnimationFrame(() => {
      updateAllCables();
    });

    window.addEventListener('resize', () => {
      updateAllCables();
    });
  }

  // ==========================================================================
  // SERVER SYNC (DEBOUNCED 150MS)
  // ==========================================================================

  function triggerChange() {
    const currentLevers = [...leverValues];
    const currentWires = [...wireMapping];

    if (typeof window.onChange === 'function') {
      window.onChange({
        levers: currentLevers,
        wires: currentWires
      });
    }

    // Schedule 150ms debounced POST /api/state
    if (currentTeamCode) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        syncServerState();
      }, 150);
    }
  }

  async function syncServerState() {
    if (!currentTeamCode) return;

    // Sanitize wire mapping for server (0..3 integers)
    const sanitizedWires = wireMapping.map((s, idx) => (s >= 0 ? s : idx));

    try {
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamCode: currentTeamCode,
          round: currentRound,
          levers: leverValues,
          wires: sanitizedWires
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.grid) {
          renderGrid(data.grid);
        }
      } else {
        console.warn('[Server Sync] /api/state responded with status:', res.status);
      }
    } catch (err) {
      console.error('[Server Sync] Network error during state sync:', err);
    }
  }

  // ==========================================================================
  // TEAM AUTHENTICATION (IN-MEMORY ONLY)
  // ==========================================================================

  async function authenticateTeam(code) {
    if (!code) {
      if (authError) authError.textContent = 'Please enter your assigned Team Code.';
      return;
    }

    const testCode = code.trim().toUpperCase();

    try {
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamCode: testCode,
          round: 1,
          levers: [0, 0, 0],
          wires: [0, 1, 2, 3]
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Save ONLY in memory
        currentTeamCode = testCode;

        if (teamAuthOverlay) teamAuthOverlay.classList.add('hidden');
        if (teamStatusLabel) teamStatusLabel.textContent = `TEAM ${currentTeamCode}`;
        if (roundIndicator) roundIndicator.textContent = `ROUND 1 OF ${TOTAL_ROUNDS}`;

        if (data && data.grid) {
          renderGrid(data.grid);
        }
        updateAllCables();
      } else {
        if (authError) authError.textContent = 'Team code not recognized. Check assigned code (e.g. K2, M5).';
      }
    } catch (err) {
      if (authError) authError.textContent = 'Unable to reach reactor server. Verify connection.';
    }
  }

  // ==========================================================================
  // SUBMISSION LOGIC (POST /api/submit)
  // ==========================================================================

  async function submitLetter() {
    if (!currentTeamCode) return;

    const letter = (letterInput.value || '').trim().toUpperCase();
    if (!letter || letter.length !== 1) {
      showFeedback('Please enter a single letter guess (A-Z).', 'error');
      return;
    }

    try {
      if (btnSubmitLetter) {
        btnSubmitLetter.disabled = true;
        btnSubmitLetter.textContent = 'CHECKING...';
      }
      showFeedback('Verifying core frequency signal with server...', 'normal');
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamCode: currentTeamCode,
          round: currentRound,
          letter
        })
      });

      if (res.status === 429) {
        showFeedback('Rate limit reached: Maximum 5 attempts per minute per team. Please wait.', 'warning');
        return;
      }

      if (!res.ok) {
        showFeedback('Error submitting signal evaluation to server.', 'error');
        return;
      }

      const data = await res.json();
      if (data.ok === true) {
        // Correct letter!
        recoveredLetters.push(letter);
        letterInput.value = '';

        if (currentRound < TOTAL_ROUNDS) {
          showFeedback(`✓ Core frequency verified! Letter "${letter}" confirmed. Advancing to Round ${currentRound + 1}...`, 'success');

          currentRound++;
          if (roundIndicator) roundIndicator.textContent = `ROUND ${currentRound} OF ${TOTAL_ROUNDS}`;

          // Reset levers to [0, 0, 0]
          setLeverPosition(0, 0, false);
          setLeverPosition(1, 0, false);
          setLeverPosition(2, 0, false);

          // Unlock any locked levers
          for (let i = 0; i < NUM_LEVERS; i++) {
            const unit = document.getElementById(`lever-unit-${i}`);
            if (unit) unit.classList.remove('locked');
          }

          // Reset wires to [0, 1, 2, 3]
          connectWireToSocket(0, 0, false);
          connectWireToSocket(1, 1, false);
          connectWireToSocket(2, 2, false);
          connectWireToSocket(3, 3, false);

          // Reset hints for next round
          resetHintsForNewRound();

          // Sync server state for new round
          syncServerState();
        } else {
          // Mission Complete!
          showFeedback(`✓ Core frequency verified! All 3 containment seals recovered.`, 'success');
          showVictoryBanner();
        }
      } else {
        // Wrong letter
        showFeedback(`❌ Signal mismatch: Letter "${letter}" is incorrect. Adjust levers and patch routing.`, 'error');
      }
    } catch (err) {
      showFeedback('Network failure communicating with reactor server.', 'error');
    } finally {
      if (btnSubmitLetter) {
        btnSubmitLetter.disabled = false;
        btnSubmitLetter.textContent = 'SUBMIT LETTER';
      }
    }
  }

  function showFeedback(msg, type = 'normal') {
    if (!feedbackMessage) return;
    feedbackMessage.textContent = msg;
    feedbackMessage.className = 'feedback-message ' + (type !== 'normal' ? type : '');
  }

  function showVictoryBanner() {
    if (victoryBanner && suffixWord) {
      const fullWord = recoveredLetters.join('');
      suffixWord.textContent = `Suffix recovered: ${fullWord}`;
      victoryBanner.classList.remove('hidden');

      const submitSection = document.getElementById('submission-section');
      if (submitSection) submitSection.style.display = 'none';

      const hintsSection = document.getElementById('hints-section');
      if (hintsSection) hintsSection.style.display = 'none';
    }
  }

  // ==========================================================================
  // 3-LEVEL SERVER HINTS (GET /api/hint)
  // ==========================================================================

  function resetHintsForNewRound() {
    currentHintLevel = 1;
    if (btnRequestHint) {
      btnRequestHint.textContent = 'REQUEST HINT (LEVEL 1)';
      btnRequestHint.disabled = false;
    }
    if (hintsLog) {
      hintsLog.textContent = 'Hints are on standby for Round ' + currentRound + '.';
    }
    // Clear any socket illuminated hints
    for (let s = 0; s < NUM_SOCKETS; s++) {
      const socketSlot = document.getElementById(`socket-slot-${s}`);
      if (socketSlot) socketSlot.classList.remove('hint-illuminated');
    }
  }

  async function requestServerHint() {
    if (!currentTeamCode || currentHintLevel > 3) return;

    try {
      const sanitizedWires = wireMapping.map((s, idx) => (s >= 0 ? s : idx));
      const queryParams = new URLSearchParams({
        teamCode: currentTeamCode,
        round: currentRound,
        level: currentHintLevel,
        levers: leverValues.join(','),
        wires: sanitizedWires.join(',')
      });

      const res = await fetch(`/api/hint?${queryParams.toString()}`);
      if (!res.ok) {
        if (hintsLog) hintsLog.textContent = 'Advisory system unavailable.';
        return;
      }

      const hintData = await res.json();

      if (hintData.level === 1) {
        // Level 1: Flash columns of heat map differing from target
        const cols = hintData.differingColumns || [];
        flashHeatmapColumns(cols);

        if (hintsLog) {
          hintsLog.textContent = `[Level 1 Advisory] Flashing ${cols.length} misaligned matrix column(s) on the display.`;
        }
        currentHintLevel = 2;
        if (btnRequestHint) btnRequestHint.textContent = 'REQUEST HINT (LEVEL 2)';

      } else if (hintData.level === 2) {
        // Level 2: Light up one socket's icon
        const socketIdx = hintData.socketIndex;
        illuminateSocketHint(socketIdx);

        if (hintsLog) {
          hintsLog.textContent = `[Level 2 Advisory] Socket SKT ${socketIdx} core channel illuminated in gold.`;
        }
        currentHintLevel = 3;
        if (btnRequestHint) btnRequestHint.textContent = 'REQUEST HINT (LEVEL 3 - 2 MIN PENALTY)';

      } else if (hintData.level === 3) {
        // Level 3: Lock one lever into correct position with 2-min penalty
        const leverIdx = hintData.leverIndex;
        const position = hintData.position;

        // Snap and lock lever
        setLeverPosition(leverIdx, position, true);
        const unit = document.getElementById(`lever-unit-${leverIdx}`);
        if (unit) unit.classList.add('locked');

        // Note 2-minute penalty
        penaltyApplied = true;
        if (hintsPenaltyWarning) hintsPenaltyWarning.classList.add('visible');
        if (penaltyBadge) penaltyBadge.classList.remove('hidden');

        if (hintsLog) {
          hintsLog.textContent = `[Level 3 Advisory] ${hintData.message}. NOTE: 2-minute time penalty applied!`;
        }

        currentHintLevel = 4;
        if (btnRequestHint) {
          btnRequestHint.textContent = 'ALL HINTS EXHAUSTED';
          btnRequestHint.disabled = true;
        }
      }
    } catch (err) {
      if (hintsLog) hintsLog.textContent = 'Failed to connect to advisory beacon.';
    }
  }

  function flashHeatmapColumns(columns) {
    if (!columns || columns.length === 0) return;

    for (const c of columns) {
      for (let r = 0; r < ROWS; r++) {
        if (cellElements[r] && cellElements[r][c]) {
          cellElements[r][c].classList.add('column-flash');
        }
      }
    }

    setTimeout(() => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (cellElements[r] && cellElements[r][c]) {
            cellElements[r][c].classList.remove('column-flash');
          }
        }
      }
    }, 2400);
  }

  function illuminateSocketHint(socketIdx) {
    const slot = document.getElementById(`socket-slot-${socketIdx}`);
    if (slot) {
      slot.classList.add('hint-illuminated');
    }
  }

  // ==========================================================================
  // INITIALIZATION & EVENT LISTENERS
  // ==========================================================================

  // Exported helpers
  window.renderGrid = renderGrid;
  window.getLeverValues = () => [...leverValues];
  window.setLeverValue = (idx, val) => setLeverPosition(idx, val, true);
  window.getWireValues = () => [...wireMapping];
  window.setWireConnection = (wireIdx, socketIdx) => connectWireToSocket(wireIdx, socketIdx, true);
  window.getTeamCode = () => currentTeamCode;
  window.getRound = () => currentRound;

  document.addEventListener('DOMContentLoaded', () => {
    initializeGridDOM();
    initializeLevers();
    initializePatchBay();

    // Wire Team Auth
    if (btnAuthTeam) {
      btnAuthTeam.addEventListener('click', () => {
        authenticateTeam(teamCodeInput.value);
      });
    }
    if (teamCodeInput) {
      teamCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          authenticateTeam(teamCodeInput.value);
        }
      });
    }

    // Wire Letter Submission
    if (btnSubmitLetter) {
      btnSubmitLetter.addEventListener('click', submitLetter);
    }
    if (letterInput) {
      letterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          submitLetter();
        }
      });
      letterInput.addEventListener('input', () => {
        letterInput.value = letterInput.value.toUpperCase();
      });
    }

    // Wire Hints Button
    if (btnRequestHint) {
      btnRequestHint.addEventListener('click', requestServerHint);
    }

    // Wire Replay Button
    if (btnReplayMission) {
      btnReplayMission.addEventListener('click', () => {
        location.reload();
      });
    }
  });
})();

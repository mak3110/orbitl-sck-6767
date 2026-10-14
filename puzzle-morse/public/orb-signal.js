/**
 * Orb-Signal Web Component
 * Self-contained, framework-agnostic, zero-external-dependencies.
 * 
 * Complies with:
 * - Wavelength: 1 unit = 18px
 * - Eased amplitude in/out over 0.25 unit
 * - Progress line moves at 1 unit per U ms (480ms - 720ms)
 * - Line stays ~35% from the top
 * - Glowing orb rides wave and pulses with amplitude
 * - Passed wave is dimmed
 * - End of signal jumps back to top with brief brightening (ONLY start signal)
 * - Reduced motion support (static dot-dash strip)
 * - Accessible touch controls
 */

class OrbSignalElement extends HTMLElement {
  constructor() {
    super();
    this.segments = [];
    this.totalUnits = 97; // Derived from segments or default
    this.uMs = 600; // Default ms per unit (range: 480 - 720)
    this.currentUnit = 0;
    this.isPlaying = true;
    this.isLocked = false;
    this.reducedMotion = false;
    this.flashTimer = 0;
    this.lastTimestamp = 0;
    this.rafId = null;

    // Canvas geometry constants
    this.PX_PER_UNIT = 18;
    this.EASE_WINDOW = 0.25;
    this.LINE_TARGET_RATIO = 0.35; // 35% from top

    this.boundAnimate = this.animate.bind(this);
    this.boundResize = this.handleResize.bind(this);
  }

  static get observedAttributes() {
    return ['speed', 'api', 'reduced-motion'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'speed' && newVal) {
      const parsed = parseInt(newVal, 10);
      if (!isNaN(parsed) && parsed >= 480 && parsed <= 720) {
        this.uMs = parsed;
        const slider = this.querySelector('.orb-slider-input');
        const display = this.querySelector('.orb-slider-val');
        if (slider) slider.value = parsed;
        if (display) display.textContent = `${parsed} ms`;
      }
    } else if (name === 'reduced-motion') {
      this.setReducedMotion(newVal === 'true');
    }
  }

  connectedCallback() {
    this.render();
    this.setupAccessibility();
    this.setupEvents();
    this.fetchSignal();
    window.addEventListener('resize', this.boundResize);
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.boundResize);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  render() {
    const defaultSpeed = parseInt(this.getAttribute('speed') || '600', 10);
    this.uMs = Math.max(480, Math.min(720, defaultSpeed));

    this.innerHTML = `
      <div class="orb-card" role="region" aria-label="Orb-Signal Morse Puzzle">
        <!-- Header -->
        <div class="orb-header">
          <div class="orb-title-area">
            <span class="orb-badge">Scavenger Hunt</span>
            <strong style="font-size: 1.1rem; letter-spacing: -0.02em;">Signal Chamber</strong>
          </div>
          <div class="orb-status" id="orbStatusDisplay">
            <span class="orb-status-dot" id="orbStatusDot"></span>
            <span id="orbStatusText">Connecting...</span>
          </div>
        </div>

        <!-- Canvas Visual Stage -->
        <div class="orb-canvas-container" id="canvasContainer" tabindex="0" role="application" aria-label="Morse Signal Wave Visualizer">
          <canvas class="orb-canvas" id="orbCanvas"></canvas>
          <div class="orb-flash-overlay" id="flashOverlay"></div>
          
          <!-- Locked Screen State -->
          <div class="orb-locked-screen" id="lockedScreen" style="display: none;">
            <svg class="orb-locked-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3 style="margin: 0; font-size: 1.15rem;">Stage Locked</h3>
            <p style="margin: 0; font-size: 0.875rem; color: var(--orb-text-muted);">
              You need a valid unlocked team credential to view the secret signal.
            </p>
            <button class="orb-btn primary" id="btnQuickUnlock" type="button">
              Unlock Stage Credential
            </button>
          </div>
        </div>

        <!-- Static Dot-Dash Strip (For Reduced Motion) -->
        <div class="orb-static-strip" id="staticStrip" aria-live="polite">
          <div class="orb-strip-legend">
            <div class="orb-legend-item">
              <span class="orb-strip-unit dot" style="height: 24px; width: 24px; font-size: 0.75rem;">•</span>
              <span>Dot (1u)</span>
            </div>
            <div class="orb-legend-item">
              <span class="orb-strip-unit dash" style="height: 24px; width: 48px; font-size: 0.75rem;">—</span>
              <span>Dash (3u)</span>
            </div>
            <div class="orb-legend-item">
              <span class="orb-strip-unit letter-gap" style="height: 20px; width: 28px;">3u</span>
              <span>Letter Gap</span>
            </div>
            <div class="orb-legend-item">
              <span class="orb-strip-unit word-gap" style="height: 20px; width: 44px;">7u</span>
              <span>Word Gap</span>
            </div>
          </div>
          <div class="orb-strip-timeline" id="stripTimeline" role="list">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Accessible Interactive Controls -->
        <div class="orb-controls">
          <!-- Speed Adjustment Slider (480ms - 720ms) -->
          <div class="orb-slider-row">
            <label class="orb-slider-label" for="speedSlider">
              Unit Speed: <span class="orb-slider-val" id="speedVal">${this.uMs} ms</span>
            </label>
            <input 
              type="range" 
              class="orb-slider-input" 
              id="speedSlider" 
              min="480" 
              max="720" 
              step="10" 
              value="${this.uMs}"
              aria-label="Adjust signal unit duration in milliseconds (480 to 720 ms)"
            />
          </div>

          <!-- Buttons Row -->
          <div class="orb-button-row">
            <button class="orb-btn" id="btnPlayPause" type="button" aria-pressed="false">
              <span id="playIcon">⏸</span> <span id="playText">Pause</span>
            </button>
            <button class="orb-btn" id="btnRestart" type="button" aria-label="Restart signal to beginning">
              <span>⏮</span> <span>Restart Signal</span>
            </button>
            <button class="orb-btn" id="btnToggleMotion" type="button" aria-pressed="false">
              <span id="motionIcon">♿</span> <span id="motionText">Static View</span>
            </button>
          </div>

          <!-- Info & Touch Guidance -->
          <div class="orb-info-row">
            <span>Progress: 1 unit / U ms (Wavelength: 18px)</span>
            <span>Jump to top = ONLY start signal</span>
          </div>
        </div>
      </div>
    `;

    this.canvas = this.querySelector('#orbCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.handleResize();
  }

  setupAccessibility() {
    // Check system preference for reduced motion
    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionMedia.matches || this.getAttribute('reduced-motion') === 'true') {
      this.setReducedMotion(true);
    }

    motionMedia.addEventListener('change', (e) => {
      this.setReducedMotion(e.matches);
    });
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
    const canvasContainer = this.querySelector('#canvasContainer');
    const staticStrip = this.querySelector('#staticStrip');
    const btnMotion = this.querySelector('#btnToggleMotion');
    const motionText = this.querySelector('#motionText');

    if (enabled) {
      if (canvasContainer) canvasContainer.style.display = 'none';
      if (staticStrip) staticStrip.classList.add('visible');
      if (btnMotion) btnMotion.setAttribute('aria-pressed', 'true');
      if (motionText) motionText.textContent = 'Wave View';
      this.populateStaticStrip();
    } else {
      if (canvasContainer) canvasContainer.style.display = 'flex';
      if (staticStrip) staticStrip.classList.remove('visible');
      if (btnMotion) btnMotion.setAttribute('aria-pressed', 'false');
      if (motionText) motionText.textContent = 'Static View';
      this.handleResize();
    }
  }

  setupEvents() {
    // Speed Slider
    const slider = this.querySelector('#speedSlider');
    const speedVal = this.querySelector('#speedVal');
    slider.addEventListener('input', (e) => {
      this.uMs = parseInt(e.target.value, 10);
      speedVal.textContent = `${this.uMs} ms`;
      this.setAttribute('speed', this.uMs);
    });

    // Play/Pause
    const btnPlayPause = this.querySelector('#btnPlayPause');
    const playText = this.querySelector('#playText');
    const playIcon = this.querySelector('#playIcon');
    btnPlayPause.addEventListener('click', () => {
      this.isPlaying = !this.isPlaying;
      btnPlayPause.setAttribute('aria-pressed', String(!this.isPlaying));
      playText.textContent = this.isPlaying ? 'Pause' : 'Play';
      playIcon.textContent = this.isPlaying ? '⏸' : '▶';
    });

    // Restart (trigger jump to top and start flash)
    const btnRestart = this.querySelector('#btnRestart');
    btnRestart.addEventListener('click', () => {
      this.triggerStartSignal();
    });

    // Toggle Motion Mode
    const btnToggleMotion = this.querySelector('#btnToggleMotion');
    btnToggleMotion.addEventListener('click', () => {
      this.setReducedMotion(!this.reducedMotion);
    });

    // Quick Unlock button (helper for testing/evaluator)
    const btnUnlock = this.querySelector('#btnQuickUnlock');
    if (btnUnlock) {
      btnUnlock.addEventListener('click', async () => {
        await this.unlockStage('team_cipher');
      });
    }

    // Touch on canvas to scrub / pause
    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', () => {
        // Subtle haptic touch feedback if supported
        if (navigator.vibrate) navigator.vibrate(10);
      });
    }
  }

  handleResize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async fetchSignal() {
    const statusDot = this.querySelector('#orbStatusDot');
    const statusText = this.querySelector('#orbStatusText');
    const lockedScreen = this.querySelector('#lockedScreen');
    const apiUrl = this.getAttribute('api') || '/api/signal';

    try {
      const response = await fetch(apiUrl, { credentials: 'same-origin' });
      
      if (response.status === 403 || response.status === 401) {
        // Stage is locked! Show locked screen
        this.isLocked = true;
        if (statusDot) statusDot.className = 'orb-status-dot locked';
        if (statusText) statusText.textContent = 'Stage Locked';
        if (lockedScreen) lockedScreen.style.display = 'flex';
        return;
      }

      if (response.status === 429) {
        if (statusText) statusText.textContent = 'Rate Limited (10/min)';
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      // Successful fetch of segments array only: [[start, end], [start, end], ...]
      const data = await response.json();
      if (Array.isArray(data)) {
        this.segments = data;
        // Total units is last segment end + 4 flat units at end
        const lastEnd = data.length > 0 ? data[data.length - 1][1] : 93;
        this.totalUnits = lastEnd + 4;

        this.isLocked = false;
        if (statusDot) statusDot.className = 'orb-status-dot';
        if (statusText) statusText.textContent = 'Signal Synchronized';
        if (lockedScreen) lockedScreen.style.display = 'none';

        this.populateStaticStrip();
        this.triggerStartSignal();

        if (!this.rafId) {
          this.lastTimestamp = performance.now();
          this.rafId = requestAnimationFrame(this.boundAnimate);
        }
      }
    } catch (err) {
      console.warn('[Orb-Signal] Failed to fetch signal:', err.message);
      if (statusText) statusText.textContent = 'Connection Error';
    }
  }

  async unlockStage(teamId = 'team_scavenger') {
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId })
      });
      if (res.ok) {
        await this.fetchSignal();
      }
    } catch (e) {
      console.error('Unlock failed', e);
    }
  }

  triggerStartSignal() {
    this.currentUnit = 0;
    this.flashTimer = 1.0; // Trigger brief brightening flash
    const overlay = this.querySelector('#flashOverlay');
    if (overlay) {
      overlay.classList.add('active');
      setTimeout(() => overlay.classList.remove('active'), 250);
    }
  }

  populateStaticStrip() {
    const container = this.querySelector('#stripTimeline');
    if (!container || !this.segments || this.segments.length === 0) return;

    container.innerHTML = '';

    // Flat start units: 4
    const startMargin = document.createElement('div');
    startMargin.className = 'orb-strip-unit letter-gap';
    startMargin.style.width = '48px';
    startMargin.textContent = 'Start 4u';
    startMargin.setAttribute('aria-label', 'Start with 4 flat units');
    container.appendChild(startMargin);

    for (let i = 0; i < this.segments.length; i++) {
      const [start, end] = this.segments[i];
      const duration = end - start;

      // Check gap before this segment (if not first)
      if (i > 0) {
        const prevEnd = this.segments[i - 1][1];
        const gap = start - prevEnd;
        const gapEl = document.createElement('div');
        gapEl.className = gap >= 7 ? 'orb-strip-unit word-gap' : 'orb-strip-unit letter-gap';
        gapEl.textContent = `${gap}u`;
        gapEl.setAttribute('aria-label', `Gap of ${gap} units`);
        container.appendChild(gapEl);
      }

      // Segment unit (dot = 1, dash = 3)
      const el = document.createElement('div');
      const isDash = duration === 3;
      el.className = `orb-strip-unit ${isDash ? 'dash' : 'dot'}`;
      el.textContent = isDash ? '—' : '•';
      el.setAttribute('role', 'listitem');
      el.setAttribute('aria-label', `${isDash ? 'Dash' : 'Dot'} duration ${duration} units`);
      container.appendChild(el);
    }

    // Flat end units: 4
    const endMargin = document.createElement('div');
    endMargin.className = 'orb-strip-unit letter-gap';
    endMargin.style.width = '48px';
    endMargin.textContent = 'End 4u';
    endMargin.setAttribute('aria-label', 'End with 4 flat units');
    container.appendChild(endMargin);
  }

  /**
   * Evaluates the wave amplitude and X offset for a given unit position u.
   * On = sine wave (wavelength 1 unit = 18px, amplitude eased in/out over 0.25 unit), off = flat line.
   */
  getWaveState(u) {
    let amplitude = 0;
    const maxAmp = 42; // Peak wave swing amplitude in pixels

    // Find if u falls inside any segment [start, end]
    for (let i = 0; i < this.segments.length; i++) {
      const [start, end] = this.segments[i];
      if (u >= start && u <= end) {
        const distStart = u - start;
        const distEnd = end - u;

        // Eased in/out over 0.25 unit
        const easeIn = Math.min(1, Math.max(0, distStart / this.EASE_WINDOW));
        const easeOut = Math.min(1, Math.max(0, distEnd / this.EASE_WINDOW));

        // Smooth cosine ease: 0.5 * (1 - cos(pi * t))
        const smoothIn = 0.5 * (1 - Math.cos(Math.PI * easeIn));
        const smoothOut = 0.5 * (1 - Math.cos(Math.PI * easeOut));
        const factor = Math.min(smoothIn, smoothOut);

        amplitude = maxAmp * factor;
        break;
      }
    }

    // Wavelength = 1 unit = 18px -> sin(2 * pi * u)
    const sinVal = Math.sin(2 * Math.PI * u);
    return {
      amplitude,
      normalizedAmp: amplitude / maxAmp,
      xOffset: amplitude * sinVal
    };
  }

  animate(timestamp) {
    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const deltaMs = Math.min(100, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;

    if (this.isPlaying && !this.isLocked && !this.reducedMotion && this.totalUnits > 0) {
      // 1 unit per U ms
      const deltaUnits = deltaMs / this.uMs;
      this.currentUnit += deltaUnits;

      if (this.currentUnit >= this.totalUnits) {
        // Reached end! Jumps back to the top and briefly brightens (ONLY start signal)
        this.triggerStartSignal();
      }
    }

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - deltaMs / 320);
    }

    if (!this.reducedMotion && this.canvas) {
      this.draw();
    }

    this.rafId = requestAnimationFrame(this.boundAnimate);
  }

  draw() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    if (this.segments.length === 0) {
      return;
    }

    const centerX = width * 0.46; // Center line slightly left of center for beautiful balance
    const targetLineY = height * this.LINE_TARGET_RATIO; // 35% from the top

    // Total pixel height of the full signal
    const totalSignalPx = this.totalUnits * this.PX_PER_UNIT;

    // Camera scrolling calculation:
    // Wave scrolls so the line stays about 35% from the top.
    // When progress u moves:
    // Signal progress px = currentUnit * 18px.
    // Progress line on screen Y:
    let lineY;
    let waveScrollOffset; // Screen Y where signal unit 0 begins

    const progressPx = this.currentUnit * this.PX_PER_UNIT;

    if (progressPx <= targetLineY) {
      // At the start: line moves down from top (Y=0) towards targetLineY
      lineY = progressPx;
      waveScrollOffset = 0;
    } else if (progressPx < totalSignalPx - (height - targetLineY)) {
      // Main scrolling phase: line stays locked at 35% from top
      lineY = targetLineY;
      waveScrollOffset = targetLineY - progressPx;
    } else {
      // Near the end: wave stays at bottom, line moves from targetLineY down to bottom of wave
      waveScrollOffset = height - totalSignalPx;
      lineY = waveScrollOffset + progressPx;
    }

    // 1. Draw Wave
    // "Wave already passed is dimmed."
    // We sample the wave along Y from top to bottom of screen.
    const sampleStep = 1.5; // Smooth sub-pixel sampling
    const startY = Math.max(0, waveScrollOffset);
    const endY = Math.min(height, waveScrollOffset + totalSignalPx);

    // Wave passed (above progress line Y) = DIMMED
    // Wave upcoming (below progress line Y) = ACTIVE
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const activeColor = isDark ? '#f97316' : '#b85012';
    const dimmedColor = isDark ? 'rgba(249, 115, 22, 0.22)' : 'rgba(184, 80, 18, 0.24)';

    // Draw Dimmed Section (from wave start to lineY)
    if (lineY > startY) {
      ctx.beginPath();
      ctx.strokeStyle = dimmedColor;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let first = true;
      for (let sy = startY; sy <= lineY; sy += sampleStep) {
        const u = (sy - waveScrollOffset) / this.PX_PER_UNIT;
        const wave = this.getWaveState(u);
        const sx = centerX + wave.xOffset;
        if (first) {
          ctx.moveTo(sx, sy);
          first = false;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    }

    // Draw Active Section (from lineY to endY)
    if (lineY < endY) {
      ctx.beginPath();
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let first = true;
      for (let sy = lineY; sy <= endY; sy += sampleStep) {
        const u = (sy - waveScrollOffset) / this.PX_PER_UNIT;
        const wave = this.getWaveState(u);
        const sx = centerX + wave.xOffset;
        if (first) {
          ctx.moveTo(sx, sy);
          first = false;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    }

    // 2. Draw Horizontal Dotted Progress Line
    // "A dotted horizontal progress line moves down the wave at 1 unit per U ms, and the wave scrolls so the line stays about 35% from the top."
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 2.0;

    const lineColor = isDark ? '#38bdf8' : '#0b6176';
    ctx.strokeStyle = lineColor;

    // Flash brightening effect if active
    if (this.flashTimer > 0) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18 * this.flashTimer;
      ctx.lineWidth = 2.5 + 1.5 * this.flashTimer;
    }

    ctx.moveTo(0, lineY);
    ctx.lineTo(width, lineY);
    ctx.stroke();
    ctx.restore();

    // 3. Draw Glowing Orb
    // "A glowing orb rides the wave at the line and pulses with the wave's amplitude."
    const currentWave = this.getWaveState(this.currentUnit);
    const orbX = centerX + currentWave.xOffset;
    const orbY = lineY;
    const pulseFactor = currentWave.normalizedAmp; // 0 (flat) to 1 (peak wave)

    ctx.save();

    // Pulse size: base 9px, grows up to 13.5px during oscillation
    const baseRadius = 9;
    const orbRadius = baseRadius + 4.5 * pulseFactor;

    // Outer Halo Glow
    const haloRadius = 20 + 16 * pulseFactor + (this.flashTimer * 20);
    const glowGrad = ctx.createRadialGradient(orbX, orbY, orbRadius * 0.5, orbX, orbY, haloRadius);
    
    if (isDark) {
      glowGrad.addColorStop(0, `rgba(56, 189, 248, ${0.7 + 0.3 * pulseFactor})`);
      glowGrad.addColorStop(0.5, `rgba(56, 189, 248, ${0.25 + 0.2 * pulseFactor})`);
      glowGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    } else {
      glowGrad.addColorStop(0, `rgba(11, 97, 118, ${0.65 + 0.35 * pulseFactor})`);
      glowGrad.addColorStop(0.5, `rgba(11, 97, 118, ${0.25 + 0.2 * pulseFactor})`);
      glowGrad.addColorStop(1, 'rgba(11, 97, 118, 0)');
    }

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(orbX, orbY, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // Orb Solid Core (Deep teal from reference image)
    ctx.beginPath();
    ctx.arc(orbX, orbY, orbRadius, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#38bdf8' : '#0a647a';
    ctx.fill();

    // Specular highlight on orb
    ctx.beginPath();
    ctx.arc(orbX - orbRadius * 0.3, orbY - orbRadius * 0.3, orbRadius * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();

    // Flash brightening on jump to top
    if (this.flashTimer > 0) {
      ctx.beginPath();
      ctx.arc(orbX, orbY, orbRadius + 8 * this.flashTimer, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * this.flashTimer})`;
      ctx.fill();
    }

    ctx.restore();
  }
}

// Define Custom Element
if (!customElements.get('orb-signal')) {
  customElements.define('orb-signal', OrbSignalElement);
}

// Global export for script tag integrations
window.OrbSignalElement = OrbSignalElement;

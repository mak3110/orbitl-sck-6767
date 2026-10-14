# Orb-Signal Morse Puzzle

An integratable canvas puzzle element and standalone page built for an online school game / scavenger hunt.

The secret word is **`soseyessos`**.

---

## 🎯 Quick Start

Start the server:
```bash
npm start
```
Then open:
- Main Scavenger Hunt Stage: **`http://localhost:3000`**
- Minimal Embed Demonstration: **`http://localhost:3000/embed-demo.html`**

To run the automated security & verification suite:
```bash
npm test
```

---

## 🧩 Visual & Canvas Design

- **Vertical Wave Rendering**: The Morse signal is drawn vertically along the chamber.
- **Sine Wave (On)**: Wavelength is **1 unit = 18px** ($2\pi$ radians per unit).
- **Amplitude Easing**: Smooth cosine easing in and out over **0.25 unit**.
- **Flat Line (Off)**: Amplitude is 0 (centered vertical line).
- **Progress Line**: A dotted horizontal line positioned at **~35% from the top**. The wave scrolls so that the line maintains this reading head position.
- **Dimmed Past Signal**: The section of the wave that has already passed above the progress line is dimmed, while upcoming signal below is active and vibrant.
- **Glowing Orb**: A deep teal orb rides the wave directly at the progress line, pulsating in diameter and radial glow with the wave's instantaneous amplitude.
- **Start Signal**: When the progress reaches the end of the signal, it **jumps back to the top and briefly flashes/brightens**. This jump is the **ONLY** start indicator.
- **Adjustable Speed**: Interactive slider allows setting unit duration from **480 ms to 720 ms** (default: 600 ms).

---

## 🔌 Integration into Any Parent Website

You can embed the `<orb-signal>` element into any existing school or scavenger hunt website with just two tags:

```html
<!-- 1. Include Stylesheet & Script (No external libraries required) -->
<link rel="stylesheet" href="/orb-signal.css">
<script src="/orb-signal.js"></script>

<!-- 2. Drop the custom element into your page -->
<orb-signal speed="600" api="/api/signal"></orb-signal>
```

### Supported Attributes
| Attribute | Description | Default | Range |
|---|---|---|---|
| `speed` | Unit duration in milliseconds | `600` | `480` to `720` |
| `api` | Signal segments API endpoint | `/api/signal` | Any URL |
| `reduced-motion` | Force static dot-dash view | `false` | `true`, `false`, `auto` |

---

## 🔒 Security Architecture

1. **Zero Client Leakage**:
   - The password (`soseyessos`) and its Morse pattern **never appear** in any file sent to the browser (HTML, CSS, JS, JSON).
   - Answer submission is verified securely on the server via `POST /api/verify`.
2. **Protected Endpoint (`GET /api/signal`)**:
   - Only delivers data after verifying an HMAC-SHA256 signed cookie (`orb_stage_token`).
   - If missing or invalid, responds with `HTTP 403 Forbidden`.
   - Returns **strictly an array of `[startUnit, endUnit]` segments** (e.g. `[[4,5],[6,7],...]`), without any text, letters, or metadata.
3. **Rate Limiting**:
   - Enforces a maximum of **10 requests per minute per team** using a rolling window.
   - Rejection status: `HTTP 429 Too Many Requests` with a `Retry-After` header.
4. **Audit Logging**:
   - Every request is logged to `logs/access.log` and standard output with timestamp, IP, team identifier, and rate limit status.

---

## ♿ Accessibility & Reduced Motion

- **`prefers-reduced-motion` Support**: Automatically detects system preference and switches from dynamic canvas wave to a static dot-dash timeline strip. Users can also manually toggle this with the **"Static View"** button.
- **No Meaning Carried by Color Alone**:
  - Dots (1 unit) and Dashes (3 units) are differentiated by distinct widths, geometric shapes, and text glyphs (`•` vs `—`).
  - Gaps (intra-letter, letter, word) are explicitly annotated with unit measurements (`1u`, `3u`, `7u`).
  - Full ARIA live regions and screen-reader labels.
- **Touch & Mobile Ready**:
  - 44px+ touch-friendly buttons and slider controls.
  - Responsive canvas adapting to mobile, tablet, and desktop viewports.
- **No External Libraries**: 100% vanilla JavaScript, CSS3, Canvas 2D API, and native Node.js.

---

## 🧪 Automated Test Suite

Run:
```bash
npm test
```
The test suite performs 27 checks:
- Scans all files in `public/` to ensure no password or Morse representation exists.
- Verifies exact Morse segment calculations (27 segments, 97 total units, 4 flat margin units).
- Tests unauthorized access blocking (HTTP 403).
- Tests cookie signature forgery prevention.
- Tests team unlock via signed cookie.
- Tests segment-only payload delivery.
- Tests 10 requests/minute rate limiter and HTTP 429 blocking on the 11th request.
- Verifies append-only logging in `logs/access.log`.

# Reroute the Reactor 🚀

A collaborative reactor-routing puzzle game designed to run on a local network across multiple laptops.

---

## 1. Installation

Open PowerShell or Command Prompt in this folder and install dependencies:

```powershell
npm install
```

---

## 2. Start the Server

Start the Node.js Express server:

```powershell
npm start
```

The server binds to `0.0.0.0:3000`, making it accessible locally and to any device connected to the same network.

---

## 3. Find Your Laptop's Local IP Address on Windows

To allow a second laptop to connect, find your host laptop's local IPv4 address:

1. Press `Win + R`, type `powershell` (or `cmd`), and hit **Enter**.
2. Run the command:
   ```powershell
   ipconfig
   ```
3. Look for your active network adapter:
   - If connected via Wi-Fi: look under **Wireless LAN adapter Wi-Fi**.
   - If connected via Ethernet cable: look under **Ethernet adapter**.
4. Find the line:
   ```text
   IPv4 Address . . . . . . . . . . . : 192.168.1.X
   ```
   *(Your IP will typically start with `192.168.` or `10.`)*

---

## 4. Open the Game from a Second Laptop

1. Connect the second laptop to the **same Wi-Fi / local network** as the host laptop.
2. Open any web browser (Chrome, Edge, Firefox, Safari) on the second laptop.
3. In the address bar, enter your host laptop's IP followed by port `3000`:
   ```text
   http://<YOUR_LAPTOP_IP>:3000
   ```
   *Example: `http://192.168.1.45:3000`*

---

## 5. Windows Firewall Troubleshooting

If the second laptop cannot connect or the page times out:
1. When you first run `npm start`, Windows Firewall may show a pop-up. Ensure **Private networks** is checked, then click **Allow access**.
2. Alternatively, temporarily check if Windows Firewall is blocking inbound connections on port 3000:
   - Open PowerShell as Administrator and run:
     ```powershell
     New-NetFirewallRule -DisplayName "Reroute the Reactor (Port 3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
     ```

---

## 6. Puzzle Rules & Backend Architecture

### Rules
- Teams have a team code (e.g., `K2`, `M5`) and play through 3 rounds.
- Each round has a correct combination of:
  - **3 Levers**: each set to a position `0`, `1`, `2`, or `3`.
  - **4 Wires**: each connected to a socket `0`, `1`, `2`, or `3`.
- Teams deduce the target letter for each round. For team `K2`, the 3 rounds spell **O**, **F**, **F**. For team `M5`, the 3 rounds spell **R**, **U**, **N**.

### Security & Privacy
- Answers and target letters are stored strictly in `server/config.private.js` (excluded by `.gitignore`).
- Neither the target letter nor whether the setup is correct is ever sent back by `/api/state`.

### API Endpoints
- **`POST /api/state`**:
  - Request: `{ "teamCode": "K2", "round": 1, "levers": [1, 3, 0], "wires": [2, 0, 3, 1] }`
  - Response: `{ "grid": [[...], ...] }` (Strictly a 7-row by 5-column grid of brightness values `0` to `9`).
  - Correct setup returns the clean pixel-font version of the target letter.
  - Incorrect setup returns a deterministic plausible wrong glyph/noise for that exact setup.
- **`POST /api/submit`**:
  - Request: `{ "teamCode": "K2", "round": 1, "letter": "O" }`
  - Response: `{ "ok": true }` or `{ "ok": false }`
  - Rate limit: 5 attempts per minute per team.
  - All attempts are logged with timestamp, team, round, and result to `server/attempts.log`.

---

## 7. Run Automated Tests

To verify puzzle logic, determinism, rate limiting, and response privacy:

```powershell
npm test
```

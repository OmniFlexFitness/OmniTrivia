# Running OmniTrivia locally on your network

This gets the app served from your machine so any phone or laptop on the same
Wi-Fi can open it. Read the "What actually works today" section at the bottom
first — cross-device joining is **not** wired up yet.

## Start the server

```bash
npm install          # first time only
npm run dev          # binds to all interfaces (see vite.config.ts)
```

Vite prints two URLs:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.1.42:5173/   <-- share this one
```

Everyone on the same Wi-Fi opens the **Network** URL. `npm run dev:lan` does the
same thing explicitly if you have overridden the config.

## If the Network URL does not load from a phone

1. **Same network.** Phones on a guest VLAN or on cellular cannot reach your
   laptop. Turn Wi-Fi on and join the same SSID.
2. **Firewall.** Allow inbound TCP 5173:
   - macOS: System Settings → Network → Firewall → Options → allow `node`
   - Windows: `netsh advfirewall firewall add rule name="OmniTrivia" dir=in action=allow protocol=TCP localport=5173`
   - Linux (ufw): `sudo ufw allow 5173/tcp`
3. **AP isolation.** Many café/gym routers block client-to-client traffic. Use a
   phone hotspot, or deploy per `DEPLOYMENT.md` instead.
4. **Wrong IP.** Confirm with `ipconfig` (Windows) or `ipconfig getifaddr en0`
   (macOS) / `hostname -I` (Linux) and use that address.

## Trivia question source

`src/services/geminiService.ts` reads `VITE_API_KEY` from `.env` and calls
Gemini (`gemini-1.5-flash`) to generate each round. With no key — or on any API
error — it silently falls back to placeholder questions that read
"This is a mock question #1 about Science...". If you see those, the key is
missing or the call failed; check the browser console.

## What actually works today

Game state lives entirely in React context (`src/context/GameContext.tsx`).
There is no server, no socket, and no shared session. Concretely:

- **Hosting works.** Configure rounds, generate/review questions, get a PIN,
  play through the wheel, questions, and leaderboard in one browser.
- **Joining from another device does not.** A phone that opens the Network URL
  and enters the PIN starts its *own* isolated game in its *own* browser tab.
  The PIN is never validated and the host never sees that player.
- **Other players in the lobby are bots.** `GameContext` auto-adds bots every
  3 seconds until there are 3 players, and scores them with `Math.random()`.

So the current build is a solid single-screen / big-screen trivia runner, not a
Kahoot-style multiplayer session. Making players on other devices join the same
game needs a real backend (a small WebSocket server holding room state keyed by
PIN, with the client reading from it instead of local context).

## Known build drift

`npm run build` fails typechecking today — some components call context methods
that do not exist yet (`importGame`, `goBackToConfig`, `initialPin`, and a
5-argument `joinGame`). `npm run dev` still runs because Vite does not
typecheck. Run `npm run typecheck` to see the current list.

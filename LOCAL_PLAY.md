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

Copy `.env.example` to `.env` and put your Gemini key in `VITE_API_KEY`.
`src/services/geminiService.ts` calls `gemini-1.5-flash` to generate every
round, with a 20-second ceiling per request.

If a round cannot be generated, it falls back to placeholder questions **and
the review screen shows a warning banner naming the reason**. Never start a
game while that banner is up — the questions are not real.

To run your own questions instead, use **IMPORT MY OWN QUESTIONS** on the setup
screen. It takes a CSV file or a public Google Sheet with these columns:

```
category,question,option1,option2,option3,option4,correctAnswer,explanation
Science,What planet is known as the Red Planet?,Mars,Venus,Jupiter,Mercury,Mars,Iron oxide gives Mars its colour.
```

Each distinct `category` becomes its own round.

## Running the game

1. **HOST GAME** → pick rounds and questions per round.
2. **GENERATE & REVIEW** (or **IMPORT MY OWN QUESTIONS**). Read the review
   screen; the ↻ button on any question regenerates just that one.
3. **APPROVE & OPEN LOBBY** → you get a PIN. **JOIN AS PLAYER** to play along,
   **ADD BOT** for more opponents.
4. **START GAME** → **SPIN THE WHEEL** each round (or flick the wheel), then
   **START ROUND**.
5. Answer, advance with **NEXT QUESTION**, then **SEE FINAL RESULTS**.
6. **PLAY AGAIN** replays the same questions with scores reset — it does not
   regenerate, so it costs no API calls.

## What actually works today

Game state lives entirely in React context (`src/context/GameContext.tsx`).
There is no server, no socket, and no shared session. Concretely:

- **Hosting works end to end** — verified through a full two-round game.
- **Joining from another device does not.** A phone that opens the Network URL
  and enters the PIN starts its *own* isolated game in its *own* browser tab.
  The PIN is never validated and the host never sees that player. A `?pin=`
  link pre-fills the field, but that is all it does.
- **Other players in the lobby are bots.** `GameContext` auto-adds bots every
  3 seconds until there are 3 players, and scores them with `Math.random()`.

So this is a big-screen trivia runner: one host machine, everyone answering in
the room. Making players on other devices join the same game needs a real
backend (a small WebSocket server holding room state keyed by PIN, with the
client reading from it instead of local context).

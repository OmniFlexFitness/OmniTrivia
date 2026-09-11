# Running OmniTrivia locally on your network

This gets the app served from your machine so any phone or laptop on the same
Wi-Fi can open it. Read the "What actually works today" section at the bottom
first — cross-device joining is **not** wired up yet.

## Start the server

```bash
npm install          # first time only
npm run dev          # binds to all interfaces (see vite.config.ts)
```

If `npm run dev` reports missing packages, your `node_modules` is a leftover
from when this repo committed its dependencies. Delete it and run `npm install`
again — see "Reusing an older clone" in `README.md`.

Vite prints two URLs:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.1.42:5173/   <-- share this one
```

Everyone on the same Wi-Fi opens the **Network** URL. `npm run dev:lan` does the
same thing explicitly if you have overridden the config.

## Who else can reach it

`npm run dev` binds to every interface, which is what lets phones join — and
also what lets anyone else on that Wi-Fi open the same URL. Vite inlines
`VITE_ANTHROPIC_API_KEY` into the code it serves, so **every device that loads
the Network URL receives your Anthropic key** and can spend against your
account. The dev server prints a warning at startup when this applies.

On a venue or guest network, do one or more of:

- Give the key a low spend limit in the Anthropic Console, and rotate it after
  the event.
- Run `npm run dev:local` (localhost only) and play purely off the host screen.
- Import your questions from CSV instead of generating them, and run with no
  key set at all — nothing to leak.

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

Copy `.env.example` to `.env` and put your Anthropic key in
`VITE_ANTHROPIC_API_KEY` (create one at
https://console.anthropic.com/settings/keys). Identity-linked keys also need
`VITE_ANTHROPIC_WORKSPACE_ID` set to a `wrkspc_...` id, or every request is
rejected with "anthropic-workspace-id is required"; ordinary keys can leave it
blank. `src/services/claudeService.ts`
calls `claude-opus-5` to generate every round, with a 90-second ceiling per
request. The model fills a schema directly via structured outputs, so a
malformed response is caught rather than half-parsed.

If a round cannot be generated, it falls back to placeholder questions **and
the review screen shows a warning banner naming the reason**. Never start a
game while that banner is up — the questions are not real.

### Running with no API key at all

You do not need a key. **IMPORT MY OWN QUESTIONS** on the setup screen takes a
CSV file or a public Google Sheet.

Importing a **CSV file** makes no network calls whatsoever — verified by
playing a full game with no key set and zero outbound requests. That is the
recommended way to run a real event: the questions are yours, the game works
offline, and there is no key to leak on a venue network.

Importing a **Google Sheet** does make one request, to `docs.google.com`, to
export the sheet as CSV. It needs working internet and a sheet shared as
"Anyone with the link can view" — so export it to a CSV file ahead of time if
the venue Wi-Fi cannot be trusted.

See **QUESTION_FORMAT.md** for the column spec, and `questions.example.csv` for
a working file covering all five question types.

## Running the game

1. **HOST GAME** → pick rounds and questions per round.
2. **GENERATE & REVIEW** (or **IMPORT MY OWN QUESTIONS**). Read the review
   screen; the ↻ button on any question regenerates just that one.
3. **APPROVE & OPEN LOBBY** → you get a PIN. **OPEN BROADCAST DISPLAY**, drag
   that window onto the projector and put it full screen. **JOIN AS PLAYER** to
   play along, **ADD BOT** for more opponents.
4. **START GAME** → **SPIN THE WHEEL** each round (or flick the wheel), then
   **START ROUND**.
5. Questions run themselves — the clock counts down, the broadcast counts the
   room in, and the question closes early once everyone has answered. **Pause**,
   **+10s**, **Reveal** and the **auto-advance** toggle are on the control
   screen when you need to take the wheel.
6. **PLAY AGAIN** replays the same questions with scores reset — it does not
   regenerate, so it costs no API calls.

### Setting up the two screens

The host window and the broadcast window are different interfaces, and only the
broadcast one is meant to be seen.

- Extend your desktop rather than mirroring it, or the room watches you work.
- The broadcast window is the same app at `?view=broadcast`, so on Windows
  <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>←/→</kbd> throws it onto the other
  display, and <kbd>F11</kbd> makes it full screen.
- The two windows talk over `BroadcastChannel`, which is same-browser and
  same-machine only. Opening `?view=broadcast` on a phone or a second laptop
  gets you a window that sits on "WAITING FOR THE HOST" forever — that needs the
  backend described below.
- The broadcast window shows **no host** in its header if the host window is
  closed, reloaded or still on the start screen. Reopening the game from the
  host window brings it straight back; the broadcast window does not need
  restarting.

## What actually works today

Game state lives entirely in React context (`src/context/GameContext.tsx`).
There is no server, no socket, and no shared session. Concretely:

- **Hosting works end to end** — verified through a full two-round game,
  bracket and all.
- **The broadcast window works**, because it is a second window of the same
  app on the same machine rather than a second client. The host window
  publishes a snapshot of the game; the broadcast window renders it and can
  never change it. Nothing about that path crosses the network.
- **Joining from another device does not.** A phone that opens the Network URL
  and enters the PIN starts its *own* isolated game in its *own* browser tab.
  The PIN is never validated and the host never sees that player. A `?pin=`
  link pre-fills the field, but that is all it does.
- **Other players in the lobby are bots.** `GameContext` auto-adds bots every
  3 seconds until there are 3 players. They answer at staggered, random times
  during each question and are graded by the same scoring code as a person, so
  the "answered / still answering" count on the broadcast moves the way a real
  room would — but they are still guessing, not playing.

So this is a big-screen trivia runner: one host machine driving two windows,
everyone answering in the room. Making players on other devices join the same
game needs a real backend (a small WebSocket server holding room state keyed by
PIN, with the client reading from it instead of local context). That same
server is what would let the broadcast screen live on a different machine.

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

1. **HOST GAME** → name the game, then pick rounds and questions per round.
   The name is what the room sees; the PIN is only the code players type.
2. **GENERATE & REVIEW** (or **IMPORT MY OWN QUESTIONS**). Read the review
   screen; the ↻ button on any question regenerates just that one.
3. **APPROVE & OPEN LOBBY** → you get a PIN and a QR code, and you are seated
   as a player automatically. **OPEN BROADCAST DISPLAY**, drag that window onto
   the projector and put it full screen. **EDIT MY PLAYER** renames your seat,
   **ADD BOT** adds opponents.
4. **START GAME** → **SPIN THE WHEEL** each round (or flick the wheel), then
   **START ROUND**.
5. Questions run themselves — the clock counts down, the broadcast counts the
   room in, and the question closes early once everyone has answered. **Pause**,
   **+10s**, **Reveal** and the **auto-advance** toggle are on the control
   screen when you need to take the wheel.
6. **PLAY AGAIN** replays the same questions with scores reset — it does not
   regenerate, so it costs no API calls.

### Joining a game

The lobby and the broadcast standby screen both show a **QR code** next to the
PIN. It encodes this app's own URL with `?pin=` already filled in, so a scan
lands on the join screen with the code entered — the same idea as Kahoot's join
screen.

A PIN now means something:

- **Every live room gets a PIN no other live room is using.** Rooms are tracked
  in this browser's storage, so opening a second game cannot hand out a code
  that is already in play.
- **Joining with a PIN nobody is hosting is refused.** It used to quietly open
  an empty room of its own that answered to the same code, which looked like
  the host's game and was not. The join screen now says no such game is
  running.
- **Joining with a real PIN puts you in that host's game** — you appear in
  their lobby, you see their questions as they go up, and your answers are
  scored by them.

> **The catch: that only works in the same browser on the host's machine.**
> Rooms are shared between tabs and windows through `BroadcastChannel` and
> `localStorage`, neither of which crosses a network. A phone that scans the QR
> code gets the app and the PIN filled in, and then cannot find the room. That
> is the same missing piece described under "What actually works today" — it
> needs a server holding room state, not a bigger front end.

### Hosting and playing at the same time

The host is always seated as a player, and the control screen runs two panes
side by side: the controls on one, **your player view** on the other. So a
single person can click through a whole round — reading the question, locking
in an answer, watching the count tick over and the next question arrive —
which is the fastest way to feel whether the pacing holds up before a room is
in front of you.

The **answering on/off** toggle on that pane decides whether you are playing:

- **On** — you are in the answer count, and the answer is held back from your
  control screen until you lock one in.
- **Off** — you are running the show. Questions no longer wait for you, and the
  answer reference is visible again so you can read it out.

The count agrees everywhere: flipping the toggle changes the "waiting on"
number on your screen and on the projector at the same time.

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
- **Joining works between tabs of the same browser.** A second tab that enters
  a live PIN joins that host's game for real: the host sees the player, the
  player sees the questions, and answers are scored by the host. Rooms are
  registered in `localStorage` and talk over `BroadcastChannel`.
- **Joining from another device still does not.** Neither of those mechanisms
  crosses a network, so a phone that scans the QR code gets the app with the
  PIN filled in and then finds no room to join — it now says so rather than
  starting a phantom game.
- **Other players in the lobby are bots.** `GameContext` auto-adds bots every
  3 seconds until there are 3 players. They answer at staggered, random times
  during each question and are graded by the same scoring code as a person, so
  the "answered / still answering" count on the broadcast moves the way a real
  room would — but they are still guessing, not playing.

So this is a big-screen trivia runner: one host machine driving its own
windows, everyone answering in the room. Making players on other devices join the same
game needs a real backend (a small WebSocket server holding room state keyed by
PIN, with the client reading from it instead of local context). That same
server is what would let the broadcast screen live on a different machine.

# OmniTrivia

A trivia game you host on one screen — a laptop at the front of the room, a TV,
a projector — and run for a room of people. Kahoot-style rounds with a Trivia
Crack-style category wheel.

Questions come from one of two places: written by you and imported from a CSV or
Google Sheet, or generated on the spot by Claude.

Live at **https://trivia.omniflexfitness.com** — deployed from `master` on every
push. See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting and
[MULTIPLAYER.md](MULTIPLAYER.md) for letting phones in the room join the game.

## Rules and terminology

Some of these words sound alike and mean different things. The app uses them
exactly as they are defined here, and so does the code.

| Term | What it means |
| --- | --- |
| **Game** | The whole night: one host, one PIN, and the set of rounds they have loaded. |
| **Round** | One spin of the wheel. The wheel picks a category — really picks it, from the ones not yet played — then every player still in the bracket is paired off. A round has one category and one set of questions. |
| **Matchup** | One pairing for one round: you against one other player. Round one is drawn at random; from then on the bracket decides who you face, because it pairs the players who won. |
| **Match** | A matchup actually being played — the round's questions, answered by the two people in it. A round has one match per matchup, and every match runs at its own pace. |
| **Bracket** | Single elimination by default. The higher round score in a matchup advances; the other player is out. The odd player out each round gets a **bye** and advances unopposed — and a bye goes to whoever has had the fewest so far, so the same person cannot keep drawing them. |
| **Loser's bracket** | Optional double elimination, switched on at setup or in the lobby. A first loss drops a player into the loser's bracket instead of out; a loss there ends their night. Both sides play in every round, on the same category, and the last player on each side meets in a one-match **grand final**. |
| **Remote** | A tablet or phone running the round for the host — spin, start, pause, +10s, close, end the round, next round — once it has the PIN and the host password. The host's window still runs the game; the remote drives it. |
| **Category pool** | The host's own standing list of categories. The end-of-round vote draws its options from it. It is separate from the questions a game happens to be loaded with. |
| **Rejoin code** | Four digits a player picks when they join. Their name and that code get them back into the same seat — score, streak and place in the bracket — from any phone, at any point in the game. |
| **Host password** | What the host sets when they open the game. With the PIN it takes the running game back on any device if the host's window closes, reloads or dies. |

### How a game runs

1. The host loads questions, opens a lobby, and players join with the PIN.
2. **START GAME** closes the lobby and draws the round-one matchups at random.
3. Each round: the wheel is spun, whichever slice stops under the pointer is
   the category, every matchup is dealt that round's questions, and the matches
   play out. The wheel carries only the categories still to be played, so it
   loses a slice each round and the last round is a wheel of one. The host
   spins it, and the projector and every player's phone turn the same wheel
   alongside them.
4. At the end of a round, every matchup is settled on that round's points. The
   winners are paired into next round's matchups; the losers are out of the
   bracket but stay on the leaderboard.
   **Only round one is drawn at random.** After that the bracket decides it:
   the winner of the first matchup meets the winner of the second, and so on.
   When the field is an odd size somebody takes a bye, and it goes to whoever
   has had the fewest byes — otherwise it lands on the same player every round,
   because a bye winner is always last in the list of who advanced.
5. The game ends when one player is left standing, or when the rounds run out —
   whichever comes first. If the rounds run out first, the highest score among
   the players still in it takes the night — with anybody still unbeaten ranked
   ahead of the loser's bracket.

### The loser's bracket

Switch **LOSER'S BRACKET** on in the game setup (or in the lobby, any time
before **START GAME**) and the night becomes double elimination:

- **A first loss drops you, it does not remove you.** Lose a matchup in the
  winners' bracket and you are in the loser's bracket next round. Lose there
  and you are out.
- **Both sides play every round.** One spin of the wheel, one category, one
  set of questions — the winners' matchups and the loser's matchups are just
  more tables on the same board, all on their own clocks.
- **Nothing is drawn at random after round one.** The loser's bracket pairs
  the players who survived it against the players who have just dropped into
  it, alternately; byes still go to whoever has had the fewest.
- **The grand final** is the last player on each side, one match, winner
  takes the night. There is no "bracket reset" if the loser's-bracket player
  wins it — every round is a spin of the wheel, and the wheel runs out.
- **While one side is waiting on the other**, its last player takes a bye
  each round: they keep answering and banking points, with nobody to be
  drawn against until the other side catches up.
- **It takes more rounds.** Roughly twice as many: 8 players settle in 3
  rounds single elimination and 6 with a loser's bracket; 16 players take 4
  and 7. The lobby shows the exact number for the players in the room next to
  the number of rounds loaded, and warns when the rounds will run out first.

`npm run check-hosting` plays several hundred simulated nights from 2 to 16
players and asserts that nobody goes out on one loss (except the grand
final's loser), the champion has lost at most once, and every bracket is
decided in exactly the number of rounds the lobby promises.

### Nobody waits for anybody

**Every player is on their own question, on their own clock.** That is the one
rule the whole format hangs on, and it goes all the way down:

- A player's question closes the **moment they answer it**. Not when their
  opponent answers, not when the room does.
- They see whether they got it, and then take the next question whenever they
  like — there is a **NEXT QUESTION** button on the feedback, and a short
  countdown only as a backstop for a phone nobody has picked up.
- So one player can be on question five of a round while the person they are
  playing is still reading question two, and neither of them is being held up.

This is deliberate rather than convenient: **points include a bonus for every
second left on your clock**, so answering quickly is worth something, and
making the quick answerer sit and wait would spend the very thing they just
earned. The two players in a matchup are compared on the points they finish
the round with — not on the pace they got there at.

**The projector trails the field rather than driving it.** The big screen holds
whichever question the *slowest* player in the room is still working on, and
only puts the answer up once every player has been through it. Nobody can be
shown a question — or an answer — ahead of where they are. The field board down
the side is where the room watches somebody pull three questions clear.

### How points work

- **100** for a correct answer.
- **+10** for every second still on your own clock when you lock it in.
- Each round is scored on its own. Every matchup starts level at zero, so only
  the round you are in decides it.
- A tie in a matchup is settled on total score, then on the draw. Never on a
  coin flip in front of a room.

### Likes and the end-of-round vote

Two different questions get asked of the room, and the host keeps the answers
across games:

- **Likes** are for a category people have actually played. The heart is on the
  playing and results screens, one like per player per category, and it means
  "that round was good, write more of it".
- **The end-of-round vote** is for categories nobody has played yet. At the end
  of every round a ballot of four categories goes up, drawn at random from the
  host's **category pool** and skipping what this game has already played. The
  host draws it once and publishes it, so **every phone and the big screen show
  the same four options**. One vote each, changeable while the ballot is up.

The host manages the pool — add, edit, delete — from **CATEGORY POOL** on the
start screen, the setup screen, or the **pool** button on the control screen.
The totals live behind **CATEGORY DATA**: likes, votes, how many ballots a
category has appeared on, and how many rounds have been played on it, sortable
and exportable as CSV. Bots never like or vote, so every number there came from
a person.

> Both the pool and the data are kept in the host machine's browser storage,
> the same place the rest of the game's authority lives. They survive across
> games and across restarts on that machine; they do not follow you to another
> one, and clearing the browser's site data clears them.

**The rules are in the app as well as here.** Every screen carries a "how this
works" card explaining what that screen is for — collapsible, and it remembers
being closed — and the projector puts the terminology and the scoring up in
front of the room during the lobby and between rounds.

## Local Runbook

This guide covers everything needed to run OmniTrivia locally, configure displays for hosting, and troubleshoot local network, firewall, or port issues.

### 1. Prerequisites

- **Node.js**: `v18.0.0` or higher (Node 20+ LTS recommended). Check via `node -v`.
- **npm**: `v9.0.0` or higher. Check via `npm -v`.
- **Operating System**: Windows 10/11, macOS, or Linux.
- **Hardware & Displays**: A host computer (laptop/desktop) connected to a TV or projector via HDMI, AirPlay, or Miracast, set up in **Extended Desktop** mode.

### 2. Setup & Installation

Clone the repository and install dependencies:

1. Clone the repository:
```bash
git clone https://github.com/OmniFlexFitness/OmniTrivia.git
```

2. Change into the project directory:
```bash
cd OmniTrivia
```

3. Install dependencies:
```bash
npm install
```

`npm install` is required — dependencies are not vendored in git, and Vite/esbuild require platform-specific binaries.

> [!NOTE]
> **Reusing an older clone**:
> `node_modules/` used to be committed to this repository. If you have an older checkout, delete `node_modules/` and reinstall cleanly:
>
> - **PowerShell (Windows)**:
>   ```powershell
>   Remove-Item -Recurse -Force node_modules
>   ```
>   ```bash
>   npm install
>   ```
> - **Command Prompt (Windows)**:
>   ```cmd
>   rmdir /s /q node_modules
>   ```
>   ```cmd
>   npm install
>   ```
> - **macOS / Linux**:
>   ```bash
>   rm -rf node_modules
>   ```
>   ```bash
>   npm install
>   ```

Verify that all dependencies and binaries are in place at any time:
```bash
npm run check-deps
```

### 3. Choosing Your Question Source

You have three operating modes:

- **Mode A: The question bank (recommended, and the default)**
  No configuration at all. **HOST GAME → USE THE QUESTION BANK** pulls several
  hundred premade questions from a public Google Sheet and drops you straight
  on the WHAT TO PLAY screen. No API key, no file, no cost — it just needs
  internet access, because the bank lives on `docs.google.com`.
- **Mode B: Zero API key / fully offline (safest on a venue network)**
  Run directly using the included `questions.csv`, or import your own CSV via
  **HOST GAME → IMPORT MY OWN QUESTIONS**. No network calls or API costs are
  incurred, and nothing needs to reach the internet at all.
- **Mode C: AI generation with Claude**
  Create `.env` from `.env.example`:
  - macOS / Linux:
    ```bash
    cp .env.example .env
    ```
  - Windows (PowerShell / CMD):
    ```powershell
    copy .env.example .env
    ```
  Set your API key in `.env`:
  ```env
  VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
  # Only required if your key is identity-linked:
  VITE_ANTHROPIC_WORKSPACE_ID=wrkspc_...
  ```
  Run the diagnostics script to verify your key:
  ```bash
  npm run check-key
  ```

### 4. Starting the Dev Server

OmniTrivia provides three dev server modes:

| Command | Host Bind | Use Case |
|---|---|---|
| `npm run dev` | `0.0.0.0` (All interfaces) | Default. Allows devices on the local Wi-Fi to load the app. |
| `npm run dev:local` | `localhost` (Loopback only) | Restricts access strictly to your host laptop. Ideal for untrusted/public networks. |
| `npm run dev -- --port <PORT>` | `0.0.0.0` on specified port | Use when default port `5173` is busy or blocked by OS exclusions (e.g. `npm run dev -- --port 3000`). |

Once started, Vite prints:
```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.1.42:5173/
```

### 5. Troubleshooting Local Issues

#### Fix: `Error: listen EACCES: permission denied 0.0.0.0:5173`
On Windows, the Hyper-V / WSL Host Network Service dynamically reserves port ranges (commonly `5145 - 5244`). If port `5173` falls inside an exclusion range, Windows denies permission to bind to that port.

1. **Verify reserved port ranges** (PowerShell / CMD):
   ```powershell
   netsh interface ipv4 show excludedportrange protocol=tcp
   ```
2. **Immediate solution**: Launch Vite on an alternative, unreserved port (such as `3000`, `5175`, or `8080`):
   - For all interfaces on port 3000:
     ```bash
     npm run dev -- --port 3000
     ```
   - For localhost loopback only on port 3000:
     ```bash
     npm run dev:local -- --port 3000
     ```

#### Fix: Placeholder Questions / "GENERATE & REVIEW" Failures
If AI question generation returns placeholder questions:
1. Run `npm run check-key` to test connectivity to the Anthropic Messages API.
2. **Windows Notepad naming trap**: Ensure `.env` is not named `.env.txt`. In Windows File Explorer, turn on **View > File name extensions** and verify the file is named exactly `.env`.
3. Ensure you restarted the Vite server after editing `.env` (Vite only reads `.env` on startup).

#### Fix: Mobile / Network URL Not Loading on Phones
1. **Verify Wi-Fi**: Both host laptop and phones must be connected to the exact same Wi-Fi SSID (not cellular data or guest networks).
2. **Firewall Access**: Ensure inbound TCP on port `5173` (or your custom port) is allowed:
   - **Windows**: `netsh advfirewall firewall add rule name="OmniTrivia" dir=in action=allow protocol=TCP localport=5173`
   - **macOS**: System Settings → Network → Firewall → Options → Allow `node`
   - **Linux (ufw)**: `sudo ufw allow 5173/tcp`
3. **Router AP Isolation**: Some commercial guest Wi-Fi networks block device-to-device communication. If so, connect all devices to a personal mobile Wi-Fi hotspot, or deploy remotely via Google Cloud Run.

### 5b. A screen went blank

Almost always a build that changed underneath an open page. The site is
redeployed on every push to `master`, and both the page and its bundle are
cached for ten minutes — so a phone or a projector window that loaded just
before a deploy can still be running the previous build while the host has
already moved to the new one.

The app now handles this itself:

- A page whose bundle no longer exists reloads once against a fresh URL, and
  says so in words with a **Reload** button if that does not fix it — instead
  of showing nothing at all.
- A screen that receives game data from a newer build fetches that build rather
  than trying to render fields it does not have. Rendering them is what turned
  a phone black mid-round: a field that moved reads as `undefined`, the render
  throws, and React takes the whole page down.
- Anything that still manages to crash shows what broke and a **Reload**
  button, on a screen rather than in a console nobody can open.

If you are looking at a blank screen on a build from before those landed,
reload the page — on iOS, close the tab and open the link again.

A reload is not the end of a game for anybody. A player's phone comes back to
its own seat on its own; the **host's** window comes back through
[Getting a lost game back](#getting-a-lost-game-back) — the start screen offers
the game by its PIN, and the host password finishes it. That is worth knowing
before it happens, because the reload is automatic and the password is not
recoverable after the fact.

### 6. Two-Screen Hosting Procedure

OmniTrivia uses a dual-screen architecture where host controls and player-facing visuals stay separate:

1. **Display Setup**: Connect your laptop to the venue screen/projector. Press <kbd>Win</kbd>+<kbd>P</kbd> (Windows) or open System Settings → Displays (macOS) and choose **Extend** (do *not* duplicate/mirror).
2. **Host Window**: Open `http://localhost:5173/` (or your port) on your laptop display. Click **HOST GAME**, configure rounds, and proceed to the lobby.
3. **Broadcast Window**:
   - In the lobby or game header, click **OPEN BROADCAST DISPLAY** (opens `http://localhost:5173/?view=broadcast`).
   - Drag this window onto the projector/TV display (on Windows, press <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>→</kbd>).
   - Press <kbd>F11</kbd> to enter full screen.
4. **Sync Verification**: The broadcast window synchronizes with the host via browser `BroadcastChannel`. The broadcast button will indicate green (**BROADCAST LIVE**) when connected. Both windows must remain open in the same browser on the host machine.

### 7. Local Production Build & Preview

To test the optimized production build locally before deploying:

1. Build production bundle with TypeScript check:
```bash
npm run build
```

2. Serve `dist/` via Vite's production preview server:
```bash
npm run preview
```

### 8. Scripts Reference

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, reachable from other devices on your Wi-Fi (`0.0.0.0:5173`) |
| `npm run dev:local` | Dev server, loopback only (`localhost:5173`) — use on untrusted networks |
| `npm run dev -- --port <PORT>` | Dev server on custom port (e.g. `--port 3000`) |
| `npm run build` | Typecheck, then build optimized bundle to `dist/` |
| `npm run preview` | Serve the built `dist/` production preview on port `4173` |
| `npm run typecheck` | Typecheck TypeScript without building |
| `npm run check-deps` | Verify Node and dependencies without starting a server |
| `npm run generate-questions` | Write a question CSV with Claude from Node, keeping the key off the browser |
| `npm run check-key` | Diagnose why AI generation is returning placeholders |
| `npm run check-question-bank` | Fetch the live question bank and assert every row still plays |
| `npm run check-round-pacing` | Play a round headlessly and assert nobody waits for anybody |
| `npm run check-game-setup` | Assert shuffling, import trimming and the wheel's geometry all hold |
| `npm run check-returns` | Take a lost game back headlessly, and check the wrong code cannot |
| `npm run check-hosting` | Play simulated loser's-bracket nights, and check only the host password gets the remote |
| `npm run check-live` | Check the *deployed* site: sign-in, published rules, and the proxy's key |
| `npm run rules:deploy` | Publish `firebase/database.rules.json` to the live database |

## Questions

### The default: the question bank

**HOST GAME → USE THE QUESTION BANK** is the shortest path from opening the app
to running a night. It is several hundred questions across around thirty
categories — general knowledge, geography, history, science, music, film and
TV, food, sport, Florida, and a stack of narrower ones — and it costs nothing,
needs no API key and needs nothing written.

The bank is an ordinary public Google Sheet, read through the same importer as
any other sheet:

<https://docs.google.com/spreadsheets/d/1tEnMpZmax8QIyIrQvKOb5vuXdBhXRhcMh7wP3_CDIXc/edit?gid=2001#gid=2001>

That has two consequences worth knowing:

- **Editing the sheet changes the game.** Questions added or fixed there are
  live the next time a host loads the bank. Nothing to rebuild, nothing to
  redeploy.
- **It needs the internet.** The bank is fetched from `docs.google.com` at load
  time, so it is the one question source that cannot work offline. On a venue
  network you cannot trust, export it to CSV beforehand and use **IMPORT MY OWN
  QUESTIONS → Select File**, or fall back to `questions.csv`.

Loading the bank lands on the same **WHAT TO PLAY** screen an imported file
does — it is a library, not a game, so you still choose which categories to
keep and how much of each to play, and you still review every question before
the lobby opens.

Pointing the app at a different bank is one constant, `DEFAULT_QUESTION_BANK`
in `src/constants.ts`. Whatever you point it at has to be shared as "anyone
with the link can view".

Check that the live bank still loads and still plays:

```bash
npm run check-question-bank
```

That fetches the real sheet through the app's own services, reports how many
rows became questions and of what type, and fails if any question ends up
pointing at an answer it does not have. It needs the network and nothing else.

### Ready to play offline: `questions.csv`

`questions.csv` in this repo is a full night — 10 rounds of 5, one per
category, mixing multiple choice, true/false, a slider, a drag-to-order puzzle
and a typed answer. **HOST GAME → IMPORT MY OWN QUESTIONS → Select File** and
you are playing, with no API key involved.

Regenerate it, or write a different set, without ever putting the key in the
browser:

- Generate all 10 categories:
```bash
npm run generate-questions
```

- Generate specific categories to a custom file:
```bash
npm run generate-questions -- --categories Music,Food --out kava-night.csv
```

That script calls Claude from Node, so the key stays on your machine and never
reaches the bundle or the room's Wi-Fi. It reads the same `.env`.

### Write your own with any assistant

`QUESTION_PROMPT.md` is a prompt you paste into Claude, ChatGPT or anything
else you have open. It carries the whole column spec and the parser's rules,
and returns a CSV you import directly. Change the `CATEGORIES` line and you
change the categories on offer — the wheel draws whatever the imported file
contains (minus anything you untick on the way in), so custom ones are
first-class (they just show with a ❓ instead of a themed icon).

### Bring your own (no API key needed)

**HOST GAME → IMPORT MY OWN QUESTIONS**, then either select a CSV file or paste
a public Google Sheet URL. No API key is needed either way, and the questions
are exactly the ones you wrote.

- **A CSV file makes no network calls at all** — it is read in the browser.
  This is the one that works fully offline, and the safest option on a venue
  network: there is no key involved and nothing to leak.
- **A Google Sheet is fetched from `docs.google.com`** over the network, so it
  needs internet access and a sheet shared as "Anyone with the link can view".
  Convenient for editing questions collaboratively, but it will fail offline —
  export the sheet to CSV beforehand if the venue's Wi-Fi is unreliable.

`QUESTION_FORMAT.md` has the column spec; `questions.example.csv` is a working
file covering all five question types.

### Generate with Claude

```bash
cp .env.example .env
```

Then configure your key in `.env`:
```env
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Create a key at <https://console.anthropic.com/settings/keys>. `npm run dev`
picks it up; **HOST GAME → GENERATE & REVIEW** then writes each round with
`claude-opus-5`.

If your key is **identity-linked**, requests are rejected with
`anthropic-workspace-id is required` until they name a workspace. Add it too:

```
VITE_ANTHROPIC_WORKSPACE_ID=wrkspc_...
```

Ordinary keys carry their own workspace and need nothing here — leave it blank.
The review screen tells you which case you are in if a round fails.

Always read the review screen before opening the lobby. If generation failed,
a banner says so and the questions are placeholders, not real ones.

If every round comes back as placeholders, run **`npm run check-key`**. It
resolves the key the same way the app does, says which file supplied it, calls
the API once and reports what came back, and flags leftovers from the old
Gemini version. That answers the question faster than reading anything below.

The usual cause is that the dev server never saw your `.env`. It prints a
warning at startup when that is the case.
Check that the file is named exactly `.env` — on Windows, Notepad appends
`.txt` unless you pick "All Files" in the save dialog, and `.env.txt` is
ignored — that it sits next to `package.json`, and that you restarted the
server after creating it. Vite reads it only at startup.

> **The key ships in the browser bundle.** Vite inlines `VITE_*` variables into
> the JavaScript it serves, so anyone who loads the app — including every device
> on the same Wi-Fi when you use the Network URL — can read the key and spend
> against your account. The dev server warns you at startup when this applies.
> Give the key a low spend limit, use `npm run dev:local`, or skip the key
> entirely and import your questions. Moving generation behind a small server is
> the real fix, and is not built yet.

## Two screens: hosting and broadcast

A game runs on two windows, and they show completely different things.

- **The hosting interface** is the host's own screen. It is a board of every
  match in the round, each showing both players' seats with their own clocks
  and controls, plus a panel showing what the projector is holding up, the
  scores and the bracket. Nobody else should see it.
- **The broadcast interface** is the projector or TV. It shows one question,
  the answer choices, a countdown, how many matches are through that question,
  a field board of how far each player has got, and — between rounds — the
  wheel, the round's head-to-heads and the vote on what to play next. The
  answer never reaches it until everybody is through the question.

A player's phone is a third view of the same snapshot, and between rounds it is
not a waiting screen: it turns the wheel too, names who they have been drawn
against, and carries the like and the vote. None of these screens is told where
the wheel is going — the category is published once it has stopped, so a result
can never be read out of a snapshot while the room is still watching it turn.

Open the broadcast window from **OPEN BROADCAST DISPLAY** in the lobby or in
the header of the control screen, then drag it onto the second display and put
it full screen. The button turns green and reads **BROADCAST LIVE** once the
two windows are talking.

### Hosting from more than one device

With [multiplayer configured](MULTIPLAYER.md), neither the broadcast nor the
controls have to live on the laptop. **CAST & REMOTE** — in the lobby, and in
the header of the control screen — has a link and a QR code for each:

- **Broadcast on another device** (`?view=broadcast&pin=1234`). Open it on a
  smart TV's browser, the laptop wired to the projector, anything with a
  browser, and go full screen. It follows the game by PIN over the network,
  exactly the way a phone does, and shows exactly what the projector window
  shows — no controls, and no answers before they are due. A screen with no
  camera can open `?view=broadcast` on its own and type the PIN. It
  reconnects by itself if its Wi-Fi drops, and a reload comes back to the
  same game.
- **Remote for your tablet** (`?view=remote&pin=1234`). Scan it with an iPad
  and type the **host password**, and the round runs from wherever you are
  standing: add bots and start the game, turn the loser's bracket on or off
  in the lobby, **spin** the wheel (the laptop's wheel spins, lands and
  decides, exactly as if you had pressed it there), **start the round**,
  pause / +10s / close one table or every table, **move the room on**, **end
  the round**, redraw the ballot, **start the next round**, **play again**.
  It also shows the answer to whatever each table is reading, behind a tap,
  for adjudicating from the floor, and switches your own seat's answering
  off so nothing waits on you while you walk.

The laptop still runs the game in both cases — the remote is a second set of
hands on its buttons, not a second host — so keep its window open and not
minimised (a hidden tab's timers are slowed down by the browser). The header
shows which remotes are linked. Ending the game for good stays on the laptop.

**How the remote proves it is you.** The password never leaves the tablet.
It becomes the same proof a returning host uses, and the tablet signs a
hello with it (HMAC-SHA256) bound to its own signed-in identity. The host
window checks the signature, binds that identity, and from then on accepts
commands only from it — the database stamps every message with the sender's
real identity, so a hello or a command copied off the room's bus and sent
from another device is refused. Nothing needed changing in
`firebase/database.rules.json`: the existing rules already carry all of it.

> Without multiplayer, the broadcast and the remote still work — as windows
> of **the same browser on the same machine**, over `BroadcastChannel`.

### Joining by PIN

Every live room gets a PIN no other live room is using, and joining with a PIN
nobody is hosting is refused rather than opening an empty room of its own. A
PIN that does resolve puts that player in the host's game: they appear in the
lobby, see each question as it goes up, and their answers are scored by the
host.

With **[multiplayer configured](MULTIPLAYER.md)**, that works from any device:
a phone scans the QR code, lands on the join screen with the PIN already in it,
and takes a seat in the host's game. A phone that reloads or locks its screen
comes back to the same seat rather than opening a second one.

Without it, joining reaches only the tabs and windows of **the same browser on
the host's machine**, which is as far as `BroadcastChannel` and `localStorage`
go, and a phone that scans the code is told so plainly instead of being dropped
into a room of its own.

## Getting a lost game back

A trivia night has two ways of falling apart mid-round, and both are somebody
losing a page they cannot get back to. Both are recoverable with something
typed, because something remembered is exactly what has just been lost.

Losing the page is not always a choice, either: a page whose build has been
replaced underneath it reloads itself (see
[A screen went blank](#5b-a-screen-went-blank)), which puts a host back on the
start screen mid-game. When that happens the start screen offers the game it
was hosting by PIN, and the password takes it back.

### The host: PIN + host password

The host window *is* the game — the questions, the scores, the bracket and every
clock in the round live in it. So the room it claimed no longer dies with it.
Closing the tab, hitting back, reloading or letting the laptop sleep leaves the
room standing and simply stops refreshing it: phones are told nobody is
answering, and the game waits.

**RESUME HOSTING**, on the start screen, asks for the PIN and the host password.
With both, the game comes back as it was — every score, the bracket, the round
in progress, the clock where it stopped — and the players' phones reconnect on
their own within a few seconds. It works from the machine that lost the game
*or* from any other device, including a phone, which is the point of there being
a password at all: a new device has a new identity and nothing else to show.

- The room waits **30 minutes** for its host. After that any device may clear it
  away, and the next game that allocates PINs does.
- **Ending a game on purpose** closes the door: the room, the saved copy of the
  game and the password's hash are all deleted.
- If a second device takes the game over, the window it replaced says so rather
  than carrying on looking like it is still running the night.
- With multiplayer not configured, this still works on the machine that was
  hosting — the saved game is on that browser too.

### A player: name + rejoin code

Every player picks a four-digit **rejoin code** when they join, on the same
screen as their name and avatar. A phone that just reloads or locks comes back
by itself and never needs it. A phone that is flat, wiped, or a friend's has
nothing to come back with — and that is what the code is for: the same name and
the same code put them back in **their own seat**, with their score, their
streak and their place in the bracket, at any point in the game.

- It is the same form either way. A player does not have to know whether they
  are "joining" or "rejoining"; the host works out which it is.
- A seat is handed to the device that can prove it, not the one holding it, so a
  dead phone waking up an hour later cannot answer for somebody else.
- Two players cannot wear one name. Someone typing a name that is already in the
  game is asked for that player's code.

### What is stored, and where

Nothing is kept in the clear. Both secrets are salted with the game's PIN and
hashed (`src/services/proof.ts`), and only the hash is written down:

| | Where it lives | Who can read it |
| --- | --- | --- |
| Host password | `/roomSecrets/{pin}` and the host's own browser | **nobody**, host included — the rules compare against it without handing it out |
| The running game | `/hostState/{pin}` and the host's own browser | the host, or a device that has proved the password |
| Rejoin code | against that player's seat, in the host's game | the host only — never on the snapshot every device renders |

The full data model, and the rule that lets a returning device prove itself
without the hash ever being readable, is in
**[MULTIPLAYER.md](MULTIPLAYER.md#8-coming-back-after-a-disconnect)**.

## Hosting a game

1. **HOST GAME** → name the game, set the **host password**, then choose rounds
   and questions per round. The name is what the room sees; the PIN is only the
   code players type. The password is the one thing on that screen that is not
   about the questions — it is what gets this game back if the window dies, so
   write it down. The two numbers are the shape of the game whichever way the
   questions arrive — they apply to an import too.
2. **USE THE QUESTION BANK** for the premade set, **GENERATE & REVIEW** to have
   Claude write one, or **IMPORT MY OWN QUESTIONS** to bring a CSV or a sheet.
   The bank and an import both stop at **WHAT TO PLAY** first: tick the
   categories you want, and the rounds and questions-per-round ceilings trim
   the rest away, drawn at random. Several hundred questions across thirty
   categories is a library — this is where it becomes a three-round night.
3. Read the review screen. The ↻ on a question writes a different one for that
   slot, the bin drops it, and **drop category** takes a whole category out of
   the game. Rounds are allowed to end up different lengths. The blocks are not
   in playing order — which category comes up in which round is the wheel's
   decision.
4. **APPROVE & OPEN LOBBY** → you get a PIN and a QR code, and you are seated
   as a player automatically. The lobby shows the host password one last time
   (behind an eye toggle, because a laptop on a bar table gets read over
   shoulders). **OPEN BROADCAST DISPLAY** and move it to the big screen.
   **EDIT MY PLAYER** renames your seat, **ADD BOT** adds opponents. The
   **loser's bracket** can still be switched here, with the number of rounds
   it needs for the players who turned up. **CAST & REMOTE** puts the
   broadcast on another device or the controls on your tablet.
5. **START GAME** → **SPIN THE WHEEL** each round, then **START ROUND**. The
   spin decides the category: whichever slice stops under the pointer is what
   the room plays, and it comes off the wheel for the rest of the game. That
   deals every matchup its match, every player their own seat in it, and stops
   coordinating them. Your own match sits beside the controls, with an
   **answering on/off** toggle: off takes you out of the round so nothing waits
   on you, and brings the answer reference back.
6. Every player runs themselves: their clock counts down, their question closes
   the moment they answer it, their answer goes up for them alone, and
   **NEXT QUESTION** takes them straight on. Somebody can be finished with the
   round while the person they are playing is on question two. **Pause**,
   **+10s** and **Reveal** act on one table — both seats at it — with "everyone"
   versions beside them, and **END ROUND NOW** on the right of that row stops
   the whole round wherever it has got to.
7. The projector follows the field: it holds whichever question the slowest
   player is still on, and puts the answer up once everyone is through it.
   **MOVE THE ROOM ON** does that by hand when **auto-advance** is off.
8. At the end of a round the broadcast shows the round's results, the standings,
   the bracket including who is up against whom next, and the **vote on what to
   play next time**. **START ROUND N** to carry on.
9. **PLAY AGAIN** replays the same questions with scores reset — no
   regeneration, no API spend.

Two host-only panels sit outside a game: **pool** edits the categories the
end-of-round vote offers, and **data** shows the likes and votes collected
across every game this browser has hosted. Both are reachable from the start
screen as well as from the control screen.

### How a round is played

**A round is asynchronous, down to the individual.** Every matchup gets the
round's questions, and every player in it works through them on a clock of
their own. Nobody waits on the room, and — unlike the first version of this
format — nobody waits on the person they are playing either.

So one question, for one player:

1. They get it on their own clock, the same question their opponent gets.
2. It closes the instant **they** answer it, or when their own clock runs out.
3. The answer goes up for them, with what it scored.
4. They take the next one when they are ready. A countdown moves them on by
   itself if they do not, which is only there for a phone face-down on a table.

The two players in a matchup are still playing each other — same questions,
same clock length, and the round's points decide the matchup — but their pace
is their own. Points include ten a second for time left, so making the quick
answerer wait would take back what they just earned.

**The projector trails the field rather than driving it.** It holds whichever
question the slowest player is still working on, so nobody in the room can be
shown a question — or an answer — ahead of where they are, and it only puts the
answer up once everybody has been through it. The field board down the side is
where the room watches somebody pull three questions clear.

**The host can end a round where it stands.** A table goes quiet, somebody
walks off mid-match, the venue wants the room back — **END ROUND NOW** on the
match board stops every clock and settles the round on the scores as they are.
Nothing has to be reconciled to do that, because a round is scored as it is
played: points are banked the moment an answer is given, so the scoreboard at
that instant already is the result. The questions nobody reached are simply not
played, and an unanswered one is not recorded as a miss — it would break a
streak and count against a player for a question they were never given time to
finish. The button asks first whenever anybody is still answering, and says how
many; once the field is through it stops asking and just cuts to the results.

### How a round is scored

Players are drawn into head-to-head pairs when the game starts, and the odd
player out gets a bye. Each round is scored on its own — every pairing starts
level at zero — and the higher score in a pairing advances. A tie is settled on
the running total, then on the draw; never on a coin flip in front of a room.

Points are 100 for a correct answer plus 10 for every second left on **your
own** clock, so answering quickly is worth the same wherever you are in the
field, and getting there quickly also means getting to the next question first.

The game ends when one player is left standing, or when the rounds run out,
whichever comes first.

### Checking the format still holds

The claim that nobody waits for anybody is the sort of thing that looks true
with four bots on a host's laptop and quietly stops being true the next time
the engine is touched, so it is checked against the app's own services:

```bash
npm run check-round-pacing
```

It plays a round with two players answering at wildly different speeds and
asserts what matters: a question closes for the player who answered it and
nobody else, the next one is available immediately, a faster correct answer
scores more, the projector refuses to reveal while anyone could still be
looking, and the round only ends once the big screen has caught up. It also
covers the bracket — that a bye moves to somebody who has not had one, and
that the draw after round one is fixed rather than redrawn — and the likes and
the ballot, that a re-sent like still counts once and that every screen is
published the same four options.

Coming back from a disconnect is checked the same way, and it is the half worth
checking hardest, because the same code that lets somebody back into their own
game is the code that must not let anybody into anyone else's:

```bash
npm run check-returns
```

It saves a game mid-round and takes it back, asserting every score and clock
returns and that the password never appears in what was written down; then it
puts a player's seat in front of the wrong code, somebody else's code, a name
with no code at all, and a stranger who knows the name — and checks that only
the right pair gets the seat, and that the phone which lost it stops being able
to answer for it. `npm run check-room-rules` covers the database side of the
same story against a local emulator.

The other claim worth checking is that a game is put together the way this
README says it is — shuffled, trimmed to the host's numbers, and played on
whatever the wheel actually landed on:

```bash
npm run check-game-setup
```

It asserts that a shuffle never loses, duplicates or corrupts a question and
that the correct answer follows its option around; that the four question types
whose option order *is* the answer are left alone, checked against
`questions.example.csv` through the real parser; that an import is trimmed to
the categories the host kept and the ceilings they set; that the slice under
the pointer is the slice the spin planned for, at every wheel size; and that
the category a round is played on is the one the wheel stopped on.

## What this is not

**The host's browser is still the whole game.** Players on their phones join a
room, answer questions and are scored, but everything that decides any of that
lives in the hosting tab — Firebase only carries messages between devices, and
keeps a copy of the game for whoever can prove they host it. Two things follow
from that:

- **Nothing on the server decides anything.** If a round is scored wrongly, it
  was scored wrongly in a browser. A lost host window is recoverable (see
  "Getting a lost game back"); a lost host *machine* takes the broadcast
  display with it.
- **The laptop stays the referee even when it is not the screen.** A broadcast
  on a TV and a remote on a tablet both follow the host's window over the
  network; neither can run the game without it.

**Multiplayer is off until it is set up.** With no Firebase configuration the
app runs exactly as it always did: joining works between windows of one
browser, and a phone that types the PIN is told there is no room it can reach.
[MULTIPLAYER.md](MULTIPLAYER.md) is the ten-minute setup.

## Remote Runbook

The live site is **https://trivia.omniflexfitness.com**, published to **GitHub
Pages** from this repository by `.github/workflows/deploy.yml` on every push to
`master`. The app is a static bundle, so that is all the hosting it needs — the
full runbook, including the one-time Pages settings and the Cloudflare DNS
record, is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

The rest of this section covers the **container alternative** — Google Cloud Run
or any Docker host — which is worth taking once the app grows a backend.

### 1. Architecture Overview

OmniTrivia is packaged as a multi-stage Docker image defined in `Dockerfile`:
- **Stage 1 (Build)**: Uses `node:22-alpine` to run `npm ci` and `npm run build`, compiling an optimized static bundle in `dist/`.
- **Stage 2 (Serve)**: Uses `nginx:1.25-alpine` configured via `nginx/omnitrivia.conf` to serve static assets on port `8080` with client-side SPA routing (`try_files $uri $uri/ /index.html`).

```
┌─────────────────────────────────────────────────────────┐
│                    Cloud Run Service                    │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │             Nginx 1.25 Alpine (Port 8080)         │  │
│  │                                                   │  │
│  │   /                  ──> index.html (React SPA)   │  │
│  │   /?view=broadcast   ──> Broadcast Display View   │  │
│  │   /assets/*          ──> Static Bundles (Gzip)    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

> [!WARNING]
> **API Key Security in Public Deployments**:
> Vite inlines all `VITE_*` environment variables directly into the compiled JavaScript bundle served to client browsers. If you pass an Anthropic API key during the build (`--build-arg VITE_ANTHROPIC_API_KEY=...`), **anyone viewing your public website can inspect network requests or bundle sources and extract your key**.
> - **Best Practice for Public Sites**: Deploy **without** an API key (leave empty). Hosts can use **HOST GAME → USE THE QUESTION BANK** for the premade set, or **IMPORT MY OWN QUESTIONS** with a CSV or public Google Sheet. Neither needs a key.
> - If you must deploy with generation enabled, create a dedicated key with a strict monthly spend limit in the Anthropic Console.

### 2. Prerequisites

1. **Google Cloud Account**: A GCP project with an active billing account.
2. **Google Cloud SDK (`gcloud`)**: Installed and authenticated:
   - Log into your Google Cloud user account:
     ```bash
     gcloud auth login
     ```
   - Set up Application Default Credentials (ADC):
     ```bash
     gcloud auth application-default login
     ```
3. **Docker**: Optional if using Cloud Build (`gcloud builds submit`), but recommended if building locally.
4. Detailed deployment background and CMEK guidance can be found in `DEPLOYMENT.md`.

### 3. Step-by-Step Google Cloud Run Deployment

#### Step 3.1: Configure Environment Variables
Set your Google Cloud project ID and desired compute region:

1. Set your Project ID:
```bash
export PROJECT_ID="your-gcp-project-id"
```

2. Set your preferred compute region:
```bash
export REGION="us-central1"
```

3. Configure the active project in `gcloud`:
```bash
gcloud config set project $PROJECT_ID
```

4. Configure the default region in `gcloud`:
```bash
gcloud config set compute/region $REGION
```

#### Step 3.2: Enable Required Google Cloud APIs
Enable Cloud Build, Artifact Registry, and Cloud Run:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

#### Step 3.3: Create Artifact Registry Repository
Create a Docker repository to store the container images:

```bash
gcloud artifacts repositories create omnitrivia-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker repository for OmniTrivia application"
```

#### Step 3.4: Build and Push Container Image

Run Cloud Build from the application root directory (where `Dockerfile` resides):

**Option A: Keyless Build (Recommended for Public Deployments)**
```bash
gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/omnitrivia-repo/omnitrivia-app:latest
```

**Option B: With Inlined Anthropic API Key (Low-Spend Key Only)**
```bash
gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/omnitrivia-repo/omnitrivia-app:latest \
  --build-arg VITE_ANTHROPIC_API_KEY="sk-ant-..."
```

#### Step 3.5: Deploy to Cloud Run
Deploy the container to a serverless Cloud Run service:

```bash
gcloud run deploy omnitrivia-app \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/omnitrivia-repo/omnitrivia-app:latest" \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5
```

Upon completion, the command outputs the public **Service URL**:
```
Service URL: https://omnitrivia-app-xxxxxxxxxx-xx.a.run.app
```

### 4. Custom Domain & Managed SSL

`trivia.omniflexfitness.com` currently points at GitHub Pages. A hostname can
only answer from one place, so if you move it here, first remove the custom
domain under **Settings → Pages** and replace the Cloudflare `CNAME` with the
records Cloud Run gives you.

To map a custom domain (such as `trivia.omniflexfitness.com`):

1. **Create Domain Mapping**:
   ```bash
   gcloud beta run domain-mappings create \
     --service=omnitrivia-app \
     --domain=trivia.omniflexfitness.com \
     --region=$REGION
   ```
2. **Update DNS Records**:
   The command displays the DNS records (usually `CNAME` or `A`/`AAAA` records). Add these records at your domain registrar/DNS provider.
3. **SSL Certificate**: Google Cloud automatically provisions and renews a Let's Encrypt SSL/TLS certificate once DNS propagation completes.

### 5. Alternative: Standalone Docker / VPS Deployment

You can run the container on any VPS, cloud VM, or local Docker daemon:

1. Build the Docker image:
```bash
docker build -t omnitrivia:latest .
```

2. Run the container on port 8080:
```bash
docker run -d -p 8080:8080 --name omnitrivia omnitrivia:latest
```
Access the application at `http://localhost:8080` (or `http://<your-vps-ip>:8080`).

### 6. Operations, Monitoring & Rollbacks

- **View Live Container Logs**:
  ```bash
  gcloud run services logs tail omnitrivia-app --region=$REGION
  ```
- **Deploy an Update**:
  Simply repeat the `gcloud builds submit` and `gcloud run deploy` commands. Cloud Run creates a new revision with zero-downtime traffic switching.
- **Roll Back to a Previous Revision**:
  ```bash
  gcloud run services rollback omnitrivia-app --region=$REGION
  ```
- **Remote Play Operations**:
  - The host opens the deployed URL on the laptop connected to the projector and launches the broadcast screen.
  - Audience members can scan the lobby QR code to open the site on their phones. *(Note: Shared multiplayer room synchronization across independent devices requires a backend server; currently, game state is managed in the host's browser session).*

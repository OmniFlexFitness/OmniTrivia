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

Four words in this game sound alike and mean different things. The app uses
them exactly as they are defined here, and so does the code.

| Term | What it means |
| --- | --- |
| **Game** | The whole night: one host, one PIN, and the set of rounds they have loaded. |
| **Round** | One spin of the wheel. The wheel picks a category, then every player still in the bracket is paired off. A round has one category and one set of questions. |
| **Matchup** | One pairing for one round: you against one other player. Round one is drawn at random; from then on the bracket decides who you face, because it pairs the players who won. |
| **Match** | A matchup actually being played — the round's questions, answered by the two people in it. A round has one match per matchup, and every match runs at its own pace. |
| **Bracket** | Single elimination. The higher round score in a matchup advances; the other player is out. The odd player out each round gets a **bye** and advances unopposed. |
| **Category pool** | The host's own standing list of categories. The end-of-round vote draws its options from it. It is separate from the questions a game happens to be loaded with. |

### How a game runs

1. The host loads questions, opens a lobby, and players join with the PIN.
2. **START GAME** closes the lobby and draws the round-one matchups at random.
3. Each round: the wheel picks the category, every matchup is dealt the round's
   questions, and the matches play out.
4. At the end of a round, every matchup is settled on that round's points. The
   winners are paired into next round's matchups; the losers are out of the
   bracket but stay on the leaderboard.
5. The game ends when one player is left standing, or when the rounds run out —
   whichever comes first. If the rounds run out first, the highest score among
   the players still in it takes the night.

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

You have two operating modes:

- **Mode A: Zero API Key / Fully Offline (Recommended for live events)**
  No configuration needed! Run directly using the included `questions.csv` or import your own CSV or Google Sheet via **HOST GAME → IMPORT MY OWN QUESTIONS**. No network calls or API costs are incurred.
- **Mode B: AI Generation with Claude**
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
| `npm run check-round-pacing` | Play a round headlessly and assert nobody waits for anybody |
| `npm run check-live` | Check the *deployed* site: sign-in, published rules, and the proxy's key |
| `npm run rules:deploy` | Publish `firebase/database.rules.json` to the live database |

## Questions

### Ready to play: `questions.csv`

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
change the rounds — the wheel draws whatever categories the imported file
contains, so custom ones are first-class (they just show with a ❓ instead of
a themed icon).

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
  a field board of how far each player has got, and — between rounds — the vote
  on what to play next. The answer never reaches it until everybody is through
  the question.

Open the broadcast window from **OPEN BROADCAST DISPLAY** in the lobby or in
the header of the control screen, then drag it onto the second display and put
it full screen. The button turns green and reads **BROADCAST LIVE** once the
two windows are talking.

> The two windows sync over `BroadcastChannel`, so they have to be **the same
> browser on the same machine** — a laptop with the projector as a second
> display. A different device cannot be the broadcast screen; that needs the
> backend described under "What this is not".

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

## Hosting a game

1. **HOST GAME** → name the game, then choose rounds and questions per round.
   The name is what the room sees; the PIN is only the code players type.
2. **GENERATE & REVIEW**, or **IMPORT MY OWN QUESTIONS**. Read the review
   screen — the ↻ on any question regenerates just that one.
3. **APPROVE & OPEN LOBBY** → you get a PIN and a QR code, and you are seated
   as a player automatically. **OPEN BROADCAST DISPLAY** and move it to the big
   screen. **EDIT MY PLAYER** renames your seat, **ADD BOT** adds opponents.
4. **START GAME** → **SPIN THE WHEEL** each round, then **START ROUND**. That
   deals every matchup its match, every player their own seat in it, and stops
   coordinating them. Your own match sits beside the controls, with an
   **answering on/off** toggle: off takes you out of the round so nothing waits
   on you, and brings the answer reference back.
5. Every player runs themselves: their clock counts down, their question closes
   the moment they answer it, their answer goes up for them alone, and
   **NEXT QUESTION** takes them straight on. Somebody can be finished with the
   round while the person they are playing is on question two. **Pause**,
   **+10s** and **Reveal** act on one table — both seats at it — with "everyone"
   versions beside them.
6. The projector follows the field: it holds whichever question the slowest
   player is still on, and puts the answer up once everyone is through it.
   **MOVE THE ROOM ON** does that by hand when **auto-advance** is off.
7. At the end of a round the broadcast shows the round's results, the standings,
   the bracket including who is up against whom next, and the **vote on what to
   play next time**. **START ROUND N** to carry on.
8. **PLAY AGAIN** replays the same questions with scores reset — no
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
covers the likes and the ballot — that a re-sent like still counts once, and
that every screen is published the same four options.

## What this is not

**The host's browser is still the whole game.** Players on their phones join a
room, answer questions and are scored, but everything that decides any of that
lives in the hosting tab — Firebase only carries messages between devices. Two
things follow from that:

- **If the host's window closes, the game is gone.** There is no state on the
  server to recover it from.
- **The broadcast screen is still a second window of the host's own browser**,
  synced over `BroadcastChannel`. A projector on the host machine, not a device
  you point at the URL.

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
> - **Best Practice for Public Sites**: Deploy **without** an API key (leave empty). Use **HOST GAME → IMPORT MY OWN QUESTIONS** with a CSV or public Google Sheet.
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

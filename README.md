# OmniTrivia

A trivia game you host on one screen — a laptop at the front of the room, a TV,
a projector — and run for a room of people. Kahoot-style rounds with a Trivia
Crack-style category wheel.

Questions come from one of two places: written by you and imported from a CSV or
Google Sheet, or generated on the spot by Claude.

## Run it locally

Requires **Node 18+**.

```bash
git clone https://github.com/OmniFlexFitness/OmniTrivia.git
cd OmniTrivia
npm install
npm run dev
```

`npm install` is not optional — the repo does not vendor dependencies, and the
bundler needs binaries built for your platform.

### Reusing an older clone

`node_modules/` used to be committed to this repo. A clone made before it was
removed still has that directory on disk, and it predates the switch to the
Anthropic SDK — so Vite starts and then dies on the first import:

```
[plugin:vite:import-analysis] Failed to resolve import "@anthropic-ai/sdk"
```

The directory is stale, not broken. Delete it and reinstall:

```bash
rm -rf node_modules && npm install                          # macOS / Linux
rmdir /s /q node_modules && npm install                     # Windows (cmd)
Remove-Item -Recurse -Force node_modules; npm install       # Windows (PowerShell)
```

`npm run dev` now checks this before starting and names any missing package
instead of failing inside Vite.

Vite prints two URLs:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.1.42:5173/
```

Open the **Local** URL to host. See `LOCAL_PLAY.md` for what the Network URL
does and does not get you, and for firewall troubleshooting.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, reachable from other devices on your Wi-Fi |
| `npm run dev:local` | Dev server, loopback only — use on untrusted networks |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run typecheck` | Typecheck without building |
| `npm run check-deps` | Verify Node and dependencies without starting anything |
| `npm run generate-questions` | Write a question CSV with Claude, without exposing the key |
| `npm run check-key` | Diagnose why generation is returning placeholders |

## Questions

### Ready to play: `questions.csv`

`questions.csv` in this repo is a full night — 10 rounds of 5, one per
category, mixing multiple choice, true/false, a slider, a drag-to-order puzzle
and a typed answer. **HOST GAME → IMPORT MY OWN QUESTIONS → Select File** and
you are playing, with no API key involved.

Regenerate it, or write a different set, without ever putting the key in the
browser:

```bash
npm run generate-questions                                   # all 10 categories
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
# then put your key in .env:
#   VITE_ANTHROPIC_API_KEY=sk-ant-...
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

- **The hosting interface** is the host's own screen. It carries the question
  with its answer, the clock and its controls, a live read on who has answered,
  the round's matchups and the bracket. Nobody else should see it.
- **The broadcast interface** is the projector or TV. It shows the question and
  the answer choices, a countdown ring, and a running count of how many players
  have answered and how many the room is still waiting on — and nothing else.
  The answer never reaches it until the question is over.

Open the broadcast window from **OPEN BROADCAST DISPLAY** in the lobby or in
the header of the control screen, then drag it onto the second display and put
it full screen. The button turns green and reads **BROADCAST LIVE** once the
two windows are talking.

> The two windows sync over `BroadcastChannel`, so they have to be **the same
> browser on the same machine** — a laptop with the projector as a second
> display. A different device cannot be the broadcast screen; that needs the
> backend described under "What this is not".

## Hosting a game

1. **HOST GAME** → choose rounds and questions per round.
2. **GENERATE & REVIEW**, or **IMPORT MY OWN QUESTIONS**. Read the review
   screen — the ↻ on any question regenerates just that one.
3. **APPROVE & OPEN LOBBY** → you get a PIN. **OPEN BROADCAST DISPLAY** and
   move it to the big screen. **JOIN AS PLAYER** to play along, **ADD BOT** for
   more opponents.
4. **START GAME** → **SPIN THE WHEEL** each round, then **START ROUND**.
5. Each question runs itself: the clock counts down, the broadcast counts
   players in, and the question closes as soon as the last one has answered.
   The answer goes up, then the next question follows. **Pause**, **+10s**,
   **Reveal** and **auto-advance off** are there when the room needs them.
6. At the end of a round the broadcast shows the round's results, the standings
   and the bracket, including who is up against whom next. **START ROUND N** to
   carry on.
7. **PLAY AGAIN** replays the same questions with scores reset — no
   regeneration, no API spend.

### How a round is scored

Players are drawn into head-to-head pairs when the game starts, and the odd
player out gets a bye. Each round is scored on its own — every pairing starts
level at zero — and the higher score in a pairing advances. A tie is settled on
the running total, then on the draw; never on a coin flip in front of a room.

The game ends when one player is left standing, or when the rounds run out,
whichever comes first.

## What this is not

**There is no multiplayer.** Game state lives entirely in the browser tab that
is hosting. A phone that opens the Network URL and types the PIN starts its
*own* separate game — the PIN is not checked against anything, and the host
never sees that player. The other names in your lobby are bots.

So: the broadcast screen everyone looks at, people answering out loud or on the
host machine. Getting players onto their own phones needs a backend holding
room state keyed by PIN, which does not exist yet — and the same gap is why the
broadcast window has to be a second display on the host's own machine rather
than any device you point at the URL.

## Deploying

`DEPLOYMENT.md` covers the Docker build and Google Cloud Run. The `Dockerfile`
is a multi-stage build that bundles the app and serves `dist/` from nginx.

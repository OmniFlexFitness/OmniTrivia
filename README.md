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

## Questions

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

Always read the review screen before opening the lobby. If generation failed,
a banner says so and the questions are placeholders, not real ones.

> **The key ships in the browser bundle.** Vite inlines `VITE_*` variables into
> the JavaScript it serves, so anyone who loads the app — including every device
> on the same Wi-Fi when you use the Network URL — can read the key and spend
> against your account. The dev server warns you at startup when this applies.
> Give the key a low spend limit, use `npm run dev:local`, or skip the key
> entirely and import your questions. Moving generation behind a small server is
> the real fix, and is not built yet.

## Hosting a game

1. **HOST GAME** → choose rounds and questions per round.
2. **GENERATE & REVIEW**, or **IMPORT MY OWN QUESTIONS**. Read the review
   screen — the ↻ on any question regenerates just that one.
3. **APPROVE & OPEN LOBBY** → you get a PIN. **JOIN AS PLAYER** to play along,
   **ADD BOT** for more opponents.
4. **START GAME** → **SPIN THE WHEEL** each round, then **START ROUND**.
5. Answer, **NEXT QUESTION**, then **SEE FINAL RESULTS**.
6. **PLAY AGAIN** replays the same questions with scores reset — no
   regeneration, no API spend.

## What this is not

**There is no multiplayer.** Game state lives entirely in the browser tab that
is hosting. A phone that opens the Network URL and types the PIN starts its
*own* separate game — the PIN is not checked against anything, and the host
never sees that player. The other names in your lobby are bots.

So: one screen everyone looks at, people answering out loud or on the host
machine. Getting players onto their own phones needs a backend holding room
state keyed by PIN, which does not exist yet.

## Deploying

`DEPLOYMENT.md` covers the Docker build and Google Cloud Run. The `Dockerfile`
is a multi-stage build that bundles the app and serves `dist/` from nginx.

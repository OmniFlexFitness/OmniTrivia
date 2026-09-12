# OmniTrivia

A trivia game you host on one screen — a laptop at the front of the room, a TV,
a projector — and run for a room of people. Kahoot-style rounds with a Trivia
Crack-style category wheel.

Questions come from one of two places: written by you and imported from a CSV or
Google Sheet, or generated on the spot by Claude.

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

## Remote Runbook

This guide covers deploying OmniTrivia remotely as a containerized web application to **Google Cloud Run** or any Docker/container platform.

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

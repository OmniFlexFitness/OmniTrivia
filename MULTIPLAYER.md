# Multiplayer Setup

Phones in the room join the host's game through **Firebase Realtime Database**.
Setting it up is a one-time job of about ten minutes, and it costs nothing at
the size a trivia night runs at.

Until it is set up the app still works — it just plays the way it always has,
between windows of one browser on the host's machine.

---

## 1. What is actually happening

The host's browser stays the **only authority**. It owns the game, decides who
is in it, scores every answer, and publishes what the room may see. Firebase
does not run the game; it carries messages between devices that cannot otherwise
hear each other.

```
     Phone                       Firebase RTDB                    Host laptop
       │                                                               │
       │  "is anyone hosting 8141?"  ──>  /rooms/8141/bus  ──>         │
       │                                                               │
       │  <──  /rooms/8141/bus  <──  "yes, and you're in"              │
       │                                                               │
       │  <──  /rooms/8141/snapshot  <──  the game, ~1×/second         │
       │                                                               │
       │  "my answer is B"  ──>  /rooms/8141/bus  ──>   scored here ───┘
```

Three paths under each room's PIN:

| Path | Written by | Holds |
| --- | --- | --- |
| `/rooms/{pin}/meta` | the host | who is hosting, whether the lobby is open |
| `/rooms/{pin}/snapshot` | the host | the game as the room may see it |
| `/rooms/{pin}/bus/{id}` | anyone in the room | one control message, pruned when stale |

The snapshot is the same one the projector renders, which is the point: it is
already built to **withhold the answer** until the question is over. Nothing a
phone receives contains the answer key while the clock is running.

---

## 2. Create the Firebase project

1. Go to https://console.firebase.google.com and click **Add project**.
   - Name it something like `omnitrivia`. Google Analytics is not needed —
     turn it off.
2. In the left sidebar, open **Build → Realtime Database** and click
   **Create Database**.
   - Pick the region closest to Southwest Florida (`us-central1` is fine).
   - Start in **locked mode**. The rules in this repo replace whatever it
     starts with.
3. Open **Build → Authentication → Get started**, then the **Sign-in method**
   tab, and enable **Anonymous**.

> [!IMPORTANT]
> **Anonymous sign-in is not optional.** Every device gets an anonymous
> identity, and the rules use it to decide who owns a room. Without it the
> database refuses every write and nobody can join anything.

4. Open **Project settings** (the gear, top left) → **Your apps** → the web
   icon (`</>`). Register an app called `omnitrivia-web`. Firebase shows a
   config block like this:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "omnitrivia-xxxx.firebaseapp.com",
  databaseURL: "https://omnitrivia-xxxx-default-rtdb.firebaseio.com",
  projectId: "omnitrivia-xxxx",
  appId: "1:123...:web:abc...",
};
```

Keep that tab open — those five values are the next two steps.

> These values are **not secrets**. A Firebase web config ships inside every
> web app that uses it and is readable by anyone who loads the page. What
> protects a room is the rules file, which is why step 3 matters as much as
> this one.

---

## 3. Publish the rules

The rules live in `firebase/database.rules.json` and are what stop a stranger
who guesses a PIN from taking over a live game. From the repo root:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest use --add          # pick the project you just made
npx firebase-tools@latest deploy --only database
```

Confirm in the console under **Realtime Database → Rules** that what you see
matches the file.

What the rules enforce, each one verified by `npm run check-room-rules`:

- A host claims a free PIN, and **nobody else can take it** while it is held.
- **Only the room's host** can publish the game or close the room.
- Any signed-in device can **ask** for a seat; none can publish, rewrite
  another device's message, or clear the room's traffic.
- Rooms are readable by any signed-in device that knows the PIN — the same
  reach the projector has, and no more.

---

## 4. Turn it on for the live site

Deployed builds read the config from **repository variables**, not secrets,
because it is public either way and variables are easier to see and edit.

**GitHub → Settings → Secrets and variables → Actions → Variables tab → New
repository variable**, five times:

| Name | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` from the config block |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_DATABASE_URL` | `databaseURL` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

Then **Actions → Deploy to GitHub Pages → Run workflow**. The run prints
`Multiplayer is on` when it picked the variables up, and a warning when it
did not.

## 5. Turn it on for local play

Put the same five values in `.env` next to `package.json` (copy `.env.example`),
then `npm run dev`. Phones on the same Wi-Fi can reach the dev server, and now
they can also *join* it.

---

## 6. Checking it works

### On the deployed site

1. Open https://trivia.omniflexfitness.com on the laptop, host a game, and get
   to the lobby.
2. Scan the QR code with a phone **on cellular data, not Wi-Fi** — that proves
   the traffic is really going through Firebase rather than the local network.
3. The phone should land on the join screen with the PIN filled in, take a
   name, and appear in the lobby on the laptop within a second or two.

### Against the emulator, without touching the real project

Needs Java, which the Firebase emulator runs on.

```bash
npm run emulators
```

Then, in a second terminal:

```bash
npm run check-room-rules    # 18 checks: who may write what
npm run check-room-join     # 10 checks: a real two-device join
```

`check-room-join` builds the app's own transport for Node and runs a host and a
player as **separate processes**, so anything they learn about each other went
over the wire. Run both after changing anything in `src/services/remoteRoom.ts`,
`src/services/broadcastBus.ts`, or the rules.

---

## 7. What it costs

Firebase's free Spark plan covers 100 simultaneous connections and 10 GB of
downloads a month. A room is one connection per device, and the host republishes
the game about once a second.

- **A 20-person night for 30 minutes** moves roughly 150–200 MB.
- That is **around 50 nights a month** on the free plan, with no card on file.

If a night ever gets big enough to matter, the snapshot is the thing to trim —
it is republished on every tick of the question clock.

---

## 8. Known limits

- **A phone that reloads rejoins its own seat**, because the seat is remembered
  in that browser (`src/services/seat.ts`) and the host recognises a returning
  player id — including mid-game, which an ordinary latecomer is not.
- **If the host's browser closes, the game is over.** State lives in the host's
  window; the database only carries it. Recovering a host mid-game would mean
  making the database authoritative, which is a much larger change.
- **Anyone who guesses a PIN can watch a room.** They see exactly what the
  projector shows and cannot affect it. Four digits is 9,000 rooms, and a night
  runs one.
- **Rooms clean themselves up.** The host's connection carries an `onDisconnect`
  that deletes the room, so a closed laptop does not leave its PIN held.

---

## 9. Key takeaways

- **Three console steps**: create the database, enable Anonymous sign-in,
  register a web app.
- **Deploy the rules.** They are the security model, and an unprotected database
  is the one way this setup can go badly wrong.
- **Five repository variables** and one workflow run turn it on for the live
  site; the same five in `.env` turn it on locally.
- **The host still runs the game.** Firebase is the wire, not the referee.
- **`npm run check-room-rules` and `npm run check-room-join`** prove both halves
  against a local emulator, without touching the real project.

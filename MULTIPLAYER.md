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

Three paths carry the game:

| Path | Written by | Holds |
| --- | --- | --- |
| `/rooms/{pin}/meta` | the host | who is hosting, whether the lobby is open |
| `/rooms/{pin}/snapshot` | the host | the game as the room may see it |
| `/rooms/{pin}/bus/{id}` | anyone in the room | one control message, pruned when stale |

The snapshot is the same one the projector renders, which is the point: it is
already built to **withhold the answer** until the question is over. Nothing a
phone receives contains the answer key while the clock is running.

Three more exist only so a host who loses their window can get the game back —
`/roomSecrets`, `/roomClaims` and `/hostState`. Unlike the three above, none of
them is readable by the room; see
[Coming back after a disconnect](#8-coming-back-after-a-disconnect).

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

> [!CAUTION]
> **This step is not optional, and skipping it looks like a broken app rather
> than a missed step.** A new database starts in locked mode, refusing every
> read and write no matter who is asking — so the console shows a healthy
> database, sign-in succeeds, and phones still cannot join anything. Nothing in
> the app can tell you this; `npm run check-live` can.

The rules live in `firebase/database.rules.json` and are what stop a stranger
who guesses a PIN from taking over a live game. From the repo root:

```bash
npm run rules:login
npm run rules:deploy
```

`.firebaserc` already names the project, so there is nothing to pick.

**Or skip the CLI entirely**: open **Realtime Database → Rules** in the console,
paste the contents of `firebase/database.rules.json` over what is there, and
click **Publish**. Same result, no Node version to fight.

Either way, confirm under **Realtime Database → Rules** that what you see
matches the file, then prove it from outside:

```bash
npm run check-live
```

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
repository variable**, five times. (The Secrets tab works too — the workflow
reads either — but a variable can be read back when you are checking your own
work, and a secret cannot.)

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

```bash
npm run check-live
```

This one signs in against the real project, claims and releases a room, and
confirms a second device cannot steal it — the three things that have to be
true before a phone can join, none of which the emulator can vouch for. Then,
by hand:

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

## 8. Coming back after a disconnect

Both halves of a room can lose the game, and both get back in with something
typed rather than something remembered.

### The host

The host names a **host password** on the setup screen (one is suggested; it is
shown again in the lobby). With that and the PIN, **RESUME HOSTING** on the
start screen takes the running game back — from the machine that lost it, or
from a phone if that laptop is not coming back.

Three pieces make it work, and all three are enforced by the rules in
`firebase/database.rules.json`:

| Path | Who can read it | Who can write it |
| --- | --- | --- |
| `/roomSecrets/{pin}` | **nobody** — not even the host | the room's host |
| `/roomClaims/{pin}/{uid}` | **nobody** | anyone, but *only* a value equal to the stored hash |
| `/hostState/{pin}` | the host, or a device that has claimed | same |

A returning device writes what it thinks the password hashes to into
`roomClaims`. The rules compare it against `roomSecrets` **server-side**, so the
write landing *is* the check — the hash is never handed out to be echoed back.
Holding a claim is then what lets that device read the saved game and rewrite
`meta.hostUid` to take the room over. The saved game is the whole game, correct
answers included, which is why nothing but those two can read it.

A **room now outlives its host's window** — that was the bug. Every way a host
leaves a page looks the same from the outside, so the room stays claimed and
simply stops being refreshed: a joining phone is told nobody is answering, while
the host can still come back for **30 minutes**. Past that any device may clear
it out, and the next PIN allocation does. Ending a game on purpose deletes the
room, the saved game and the password's hash then and there.

### A player

A player picks a four-digit **rejoin code** on the join screen, next to their
name and avatar. The host keeps only `playerProof` of it against their seat —
never on the snapshot every device renders. Their name and that code put them
back in *their own seat*, with their score, their streak and their place in the
bracket, from any phone and at any point in the game. The device that can prove
a seat outranks the device that merely holds it, so a dead phone waking up later
cannot answer for them.

`npm run check-returns` proves both paths without a browser; the rules table
above is covered by `npm run check-room-rules`.

## 9. More screens than the laptop

The same room that carries a phone's answers carries two host-side screens,
with no extra setup and **no change to the rules**:

| View | URL | What it can do |
| --- | --- | --- |
| Broadcast | `?view=broadcast&pin=1234` | Read the snapshot, exactly as a phone can — so exactly what the projector shows. No controls. |
| Remote | `?view=remote&pin=1234` | Send the host window commands — spin, start, pause, end the round — once it has proved the host password. |

Both links, with QR codes, are under **CAST & REMOTE** in the lobby and on the
control screen.

The remote is the part with a security story, because the room's bus is
readable by every device in the room:

1. The tablet derives `hostProof` from the PIN and the password locally.
2. It writes the proof to `/roomClaims/{pin}/{uid}` — the same check a
   returning host makes, enforced by the rules, so a wrong password is refused
   by the database even if the laptop is asleep. A right one also lets the
   tablet read `/hostState`, which is where it gets the answers it shows
   behind a tap.
3. It sends a `remote-hello` carrying `HMAC-SHA256(proof, pin + its uid +
   its remote id)` — never the proof, which anyone reading the bus could
   replay into `/roomClaims`.
4. The host window recomputes the signature against the uid the database
   stamped on the message. A match binds that uid; every later command is
   accepted only from it. The same hello sent from any other device is a
   signature for the wrong uid.

Commands name the value to set and the round they were pressed in, so a
double tap or a tablet a beat behind cannot flip a setting back or skip a
round. `npm run check-hosting` covers the signature (against the RFC 4231 test
vector), the replay case and the binding.

## 10. Known limits

- **A phone that reloads rejoins its own seat** with nothing typed, because the
  seat is remembered in that browser (`src/services/seat.ts`).
- **The host's browser is still the referee.** The database carries the game and
  now keeps a copy of it for its host, but nothing on the server decides
  anything.
- **Anyone who guesses a PIN can watch a room.** They see exactly what the
  projector shows and cannot affect it. Four digits is 9,000 rooms, and a night
  runs one.
- **A player's proof — and now the code itself — crosses the room's message
  bus**, which every device in the room can read. Sending the code adds
  nothing: the proof beside it is already what unlocks the seat. The host keeps
  the code only when it hashes to that proof, so it can read it back to a
  player who forgot it. So a rejoin code raises the bar from "knows a player id off the
  leaderboard" — which is everyone — to "was watching the database at the moment
  that player joined". The host password never crosses it at all.
- **A four-digit code is guessable by brute force**, but only online, one write
  at a time, against a room that is running tonight.
- **A remote is as powerful as the host password**, because it is the host
  password. Anyone who has it can take the whole game back anyway; there is no
  separate "remote-only" password, and no way to revoke one remote short of
  ending the game.
- **The laptop has to stay awake.** A remote drives the host window, it does not
  replace it. A minimised or sleeping window has its clock slowed or stopped by
  the browser, and the remote says "host quiet" when that happens.

---

## 11. Key takeaways

- **Three console steps**: create the database, enable Anonymous sign-in,
  register a web app.
- **Deploy the rules.** They are the security model, and an unprotected database
  is the one way this setup can go badly wrong.
- **Five repository variables** and one workflow run turn it on for the live
  site; the same five in `.env` turn it on locally.
- **Publishing the rules is a separate step from writing them**, and the app
  cannot tell you that you skipped it. `npm run check-live` can.
- **The host still runs the game.** Firebase is the wire, not the referee.
- **The broadcast and the controls can be on other devices** — a TV by PIN, a
  tablet with the host password — through the same room, with no new rules.
- **A lost game is recoverable.** The host comes back with the PIN and the host
  password; a player comes back with their name and their rejoin code. The room
  waits 30 minutes for the host before it clears itself away.
- **`npm run check-room-rules` and `npm run check-room-join`** prove both halves
  against a local emulator, without touching the real project.

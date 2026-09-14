# The question-generation proxy

Lets the deployed site generate questions with Claude **without shipping an
Anthropic key to the browser**.

Vite inlines every `VITE_*` value into the JavaScript it serves, so a key given
to the app is a key given to everyone who loads it — and a public site gets
scraped for keys within days. This Worker holds the key on Cloudflare instead.
The browser asks the Worker; the Worker asks Anthropic.

```
  Browser                     Cloudflare Worker              Anthropic
     │                                                           │
     │  POST /v1/messages     ──>  origin allowed?               │
     │  Authorization:             Firebase token valid?         │
     │    Bearer <firebase>        inside its rate limit?        │
     │                             body small enough?            │
     │                                    │                      │
     │                                    │  + x-api-key  ──────>│
     │  <────────────────────────────  the answer  <─────────────│
```

**The key never reaches the browser, the repository, or this file.** It is a
Cloudflare secret, set once from your machine.

---

## Why a request is trusted

Anyone who finds the URL can send it a request, so four things are checked
before anything is forwarded:

| Gate | What it stops |
| --- | --- |
| **Origin allowlist** | Another site calling it from a browser |
| **Firebase ID token** | Anyone who has not signed into *this* game's Firebase project — the token is signed by Google for this project, and is verified against Google's published keys on every request |
| **Rate limit** | One device burning the balance, 20 generations a minute |
| **Body size cap** | A request that is not a question request |

The Firebase check is the load-bearing one, and it is the same anonymous
sign-in the multiplayer layer already does — so there is nothing extra for a
host to log into.

---

## Setup

### 0. Node 22 or newer

Wrangler needs it, and refuses to start on anything older:

```
Wrangler requires at least Node.js v22.0.0. You are using v20.19.2.
```

Check with `node --version`. On Windows the simplest fix is the current LTS
installer from https://nodejs.org, which replaces the old version in place.
Nothing else in this project needs the upgrade — the app builds fine on 20 —
so this is only for deploying the Worker.

### 1. Deploy the Worker

Every command below is run **from the repository root**, on a checkout that
contains this directory:

```bash
npm run worker:login
npm run worker:deploy
```

The Worker answers at **https://play.omniflexfitness.com** and
**https://trivia-api.omniflexfitness.com** — two names for one Worker, set by
the `[[routes]]` blocks in `wrangler.toml`. Cloudflare creates each DNS record
on deploy, because `omniflexfitness.com` is already in the same account.

`VITE_ANTHROPIC_PROXY_URL` may name either; they are interchangeable. Note that
this spends `play.` on the proxy, so it is not available for the game itself —
the game stays on `trivia.omniflexfitness.com`.

A Worker with no route and no workers.dev subdomain has no address at all, and
wrangler refuses to deploy it:

```
X [ERROR] You can either deploy your worker to one or more routes by specifying
  them in your wrangler.toml file, or register a workers.dev subdomain here
```

If the zone turns out to live in a different Cloudflare account, delete the
`[[routes]]` block and register a workers.dev subdomain instead — it is free,
it is a one-time account setting, and wrangler offers it during the deploy.
The URL then becomes `https://omnitrivia-generate.<your-subdomain>.workers.dev`.

> [!WARNING]
> **Confirm the URL rather than assuming it.** `curl <url>/health` returning
> `ok` is the only thing that proves a Worker is really serving there. A
> `*.workers.dev` hostname that nobody deployed to still resolves — every one
> does — and answers `404` with a Cloudflare error code, which reads like a
> broken Worker rather than one that never existed.

> [!NOTE]
> **`secret put` on its own does not deploy anything.** Offered a Worker name
> it cannot find, wrangler creates an empty one — literally
> `export default { fetch() {} }` — purely to hold the secret. That is a Worker
> with your key and none of this code, and it has no URL. Deploy first; the
> secret survives every later deploy.

### 2. Put the key in Cloudflare

This is the **only** place the Anthropic key goes. It is read from your
terminal, stored encrypted by Cloudflare, and never written to the repository:

```bash
npm run worker:secret
```

Paste the key at the prompt — the same one in your local `.env`. It is not
echoed, and it does not appear in your shell history.

> [!TIP]
> Use a **dedicated key with a monthly spend limit** set in the Anthropic
> Console rather than your everyday one. Nothing here can leak it, but a
> capped key means a mistake anywhere is a small mistake.

### 3. Point the site at it

Add a repository **variable** (Settings → Secrets and variables → Actions →
**Variables** tab), then re-run the deploy workflow:

| Name | Value |
| --- | --- |
| `VITE_ANTHROPIC_PROXY_URL` | `https://play.omniflexfitness.com` (or `https://trivia-api.omniflexfitness.com`) |

The URL is not a secret — it is useless without a Firebase sign-in this proxy
accepts — and a variable can be read back later, which a secret cannot. The
workflow reads secrets as a fallback, so the same name on the Secrets tab works
too; it is just harder to check afterwards.

> [!IMPORTANT]
> **Firebase has to be configured too.** The proof a caller offers this proxy
> *is* the anonymous Firebase sign-in from [MULTIPLAYER.md](../MULTIPLAYER.md),
> so a build with a proxy URL and no `VITE_FIREBASE_*` variables has no token to
> send, and every generation is refused. The deploy workflow now fails loudly on
> that combination rather than letting it look like a broken proxy.

### 4. Check it

Is it deployed, and does the key exist on it?

```bash
curl https://trivia-api.omniflexfitness.com/health
npx wrangler@latest secret list --config worker/wrangler.toml
```

`ok` from the first, and `ANTHROPIC_API_KEY` listed by the second — the name
only; Cloudflare never shows the value back, not even to you.

Then the gates, against the live Worker:

```bash
PROXY_URL=https://trivia-api.omniflexfitness.com npm run check-proxy-gates
```

Every check there is a refusal, so it costs nothing to run against the live
Worker. Then open the site, host a game, and use **GENERATE & REVIEW** — the
first real generation is the last step, and it is the one that spends money.

---

## Local development

```bash
npm run worker:dev          # Worker at http://127.0.0.1:8787
```

(Node 22+, as above.)

`http://localhost:5173` is already in the allowlist, so a dev server can use it.
Point the app at it by setting this in `.env`:

```
VITE_ANTHROPIC_PROXY_URL=http://127.0.0.1:8787
```

Local runs need the key too — `wrangler dev` reads `.dev.vars` in this
directory (gitignored):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without a proxy set, `npm run dev` keeps reading `VITE_ANTHROPIC_API_KEY`
straight from `.env`, which is fine on your own machine.

---

## Tests

```bash
npm run check-proxy-auth     # 13 checks: the token gate, including forgeries
npm run worker:dev           # then, in another terminal:
npm run check-proxy-gates    # 12 checks: origin, method, path, missing tokens
```

`check-proxy-auth` mints its own RSA key pair, so it can produce the tokens a
real Firebase never would — expired, wrong project, unsigned, `"alg": "none"`,
payload swapped after signing — and every one has to be refused.

**What no test here covers:** a successful generation. That needs a real
Firebase token and a real key, and it spends real money, so it stays a human
step — step 4 above.

---

## Operating it

```bash
npm run worker:tail
```

Rejected tokens log their reason (`expired`, `wrong audience`, …); callers are
only ever told they were rejected, since telling them which check failed tells
them how to get past it.

**Cost:** Workers' free tier is 100,000 requests a day. One generated round is
one request. The bill that matters is the Anthropic one, and that is the same
bill you would pay generating locally.

**To turn generation off**, remove the `VITE_ANTHROPIC_PROXY_URL` variable and
re-deploy the site: the app falls back to importing questions from CSV, and the
Worker sits there answering nothing.

# OmniTrivia Deployment Guide

**Live site: https://trivia.omniflexfitness.com**

OmniTrivia is a **static client-side bundle** — React compiled by Vite into
plain HTML, JS and CSS. There is no server, no database and no API to run, so
it is published to **GitHub Pages** straight from this repository, and
`trivia.omniflexfitness.com` is pointed at it. Every push to `master` rebuilds
and republishes the site automatically.

The container path (Cloud Run, Docker, a VPS) is still supported and documented
at the end of this guide, but nothing in this app needs it today.

---

## 1. How the deployment works

| Piece | Where it lives | What it does |
| --- | --- | --- |
| **Build + publish** | `.github/workflows/deploy.yml` | On every push to `master`: `npm ci`, `npm run build` (`tsc` then `vite build`), then upload `dist/` to GitHub Pages. Pull requests build but do not deploy. |
| **Hosting** | GitHub Pages, this repository | Serves `dist/` over GitHub's CDN with a free, auto-renewing TLS certificate. |
| **Domain** | Cloudflare DNS for `omniflexfitness.com` | `trivia` is a `CNAME` to `omniflexfitness.github.io`. |
| **Asset paths** | `base: "./"` in `vite.config.ts` | Relative URLs, so the same build works at the custom domain root *and* at the `omniflexfitness.github.io/OmniTrivia/` fallback URL. |

**Deploy time** is roughly 60–90 seconds from push to live.

### Why GitHub Pages and not Cloud Run

- The app is **static**. Cloud Run's job here would be an nginx container
  handing back the same files Pages hands back for free.
- **No bill.** Pages is free on public repositories; Cloud Run needs billing
  enabled on a GCP project.
- **Already wired.** The DNS record exists, the domain is already verified
  against the OmniFlexFitness org, and this repository already holds the
  custom-domain claim.
- **One moving part.** Push to `master`, the site updates. No Docker build, no
  Artifact Registry, no revisions to prune.

Reach for Cloud Run when the app grows a **backend** — the moment you want real
cross-device multiplayer or a server-side Anthropic proxy, Pages stops being
enough. See [§6](#6-alternative-container-deployment-cloud-run--docker).

---

## 2. One-time setup

Everything below is done **once**, in the browser, by a repository admin. It
cannot be scripted from CI: enabling Pages and setting a custom domain need
admin rights that the workflow's built-in token deliberately does not have.

### Step 2.1 — Merge the deployment workflow to `master`

The workflow only counts once it is on the default branch.

### Step 2.2 — Point Pages at GitHub Actions

1. Go to **Settings → Pages** in this repository.
2. Under **Build and deployment → Source**, select **GitHub Actions**.

> [!IMPORTANT]
> This repository previously published from the **`gh-pages` branch**, which is
> why the live site has been showing a standalone "diploma wheel" page from
> April 2026 instead of this app. Switching the source to GitHub Actions is what
> retires that old deploy.

### Step 2.3 — Confirm the custom domain

Still on **Settings → Pages**, under **Custom domain**, the value should read:

```
trivia.omniflexfitness.com
```

It is already set. Leave it alone unless the certificate is missing — see
[§4](#4-fixing-https).

### Step 2.4 — Retire the stale `gh-pages` branch (optional, recommended)

Once Actions is the publishing source, the branch is dead weight and a source of
confusion about what is actually live:

```bash
git push origin --delete gh-pages
```

### Step 2.5 — Run the first deploy

Either push any commit to `master`, or trigger it by hand:

**Actions → Deploy to GitHub Pages → Run workflow → Branch: master → Run workflow**

### Step 2.6 — Turn on Enforce HTTPS

Back on **Settings → Pages**, tick **Enforce HTTPS**. The checkbox is greyed out
until GitHub has issued the certificate for the domain, which usually takes a
few minutes and can take up to 24 hours.

---

## 3. DNS — what is already in place

DNS for `omniflexfitness.com` is hosted at **Cloudflare** (`amir.ns.cloudflare.com`,
`coraline.ns.cloudflare.com`). The record that makes the subdomain work:

| Type | Name | Content | Proxy status | TTL |
| --- | --- | --- | --- | --- |
| `CNAME` | `trivia` | `omniflexfitness.github.io` | **DNS only** (grey cloud) | Auto |

Two more things are already true and worth knowing so you do not undo them:

- **Domain verification.** A `TXT` record at
  `_github-pages-challenge-omniflexfitness` verifies `omniflexfitness.com`
  against the GitHub org, which stops anyone else from claiming a subdomain of
  yours on Pages. Do not delete it.
- **No CAA records** on the zone, so nothing blocks GitHub from issuing a
  Let's Encrypt certificate.

> [!WARNING]
> **Keep the `trivia` record on "DNS only" (grey cloud).** If you flip it to
> Proxied (orange cloud), Cloudflare answers with its own IPs, GitHub can no
> longer validate the domain or renew the certificate, and **Enforce HTTPS**
> breaks. The apex `omniflexfitness.com` and `www` records point at **Shopify**
> and are untouched by any of this.

Verify DNS from any machine:

```bash
dig +short trivia.omniflexfitness.com
```

Expect `omniflexfitness.github.io` followed by four `185.199.10x.153` addresses.

---

## 4. Fixing HTTPS

As of this writing the site answers on **HTTP** and the TLS certificate it
serves does not cover `trivia.omniflexfitness.com`, which means GitHub has never
issued one for the domain. The fix, once the Actions deploy is live:

1. **Settings → Pages → Custom domain**: clear the field, **Save**.
2. Re-enter `trivia.omniflexfitness.com`, **Save**.
3. Wait for **"DNS check successful"** to appear under the field.
4. Wait for the certificate — minutes usually, up to 24 hours at worst.
5. Tick **Enforce HTTPS**.

Check it from the terminal:

```bash
curl -sSI https://trivia.omniflexfitness.com | head -n 5
```

A healthy response has `HTTP/2 200` and `server: GitHub.com`, with no TLS
warning. To confirm you are looking at *this* app and not the old page:

```bash
curl -sS https://trivia.omniflexfitness.com | grep -o '<title>[^<]*</title>'
```

Expect `<title>OmniTrivia</title>`.

---

## 5. Operating the site

### Shipping a change

```bash
git push origin master
```

Watch it in the **Actions** tab. The run has two jobs, `build` and `deploy`; the
deploy job posts the live URL when it finishes.

### Rolling back

Reverting is the deterministic option, because the next deploy always mirrors
`master`:

```bash
git revert <bad-commit-sha>
git push origin master
```

For a faster undo, open the last known-good run in **Actions** and choose
**Re-run all jobs** — but the next push to `master` will publish `master` again,
so land the revert either way.

### Cache behaviour

Pages serves HTML with `Cache-Control: max-age=600`. A browser that loaded the
site in the last ten minutes can keep showing the previous build; a hard refresh
(`Ctrl`+`Shift`+`R`) picks it up immediately. Hashed JS and CSS filenames mean
there is never a stale-asset mismatch.

### What deploying does **not** change

- **No cross-device multiplayer.** Game state lives in the host's browser and
  syncs between windows via `BroadcastChannel` and `localStorage`. A public URL
  means phones can *load* the app; it does not make them join the host's room.
  That needs a backend. See "What this is not" in the README.
- **Tailwind loads at runtime** from `cdn.tailwindcss.com` (see `index.html`).
  Venue Wi-Fi that blocks CDNs will render the app unstyled.
- **The repository is public**, so the deployed bundle, its sourcemaps and
  `questions.csv` are all readable by anyone. Keep an unreleased question set in
  a local CSV file, not in the repo.

---

### The Anthropic API key is deliberately absent

The build in CI runs **without** `VITE_ANTHROPIC_API_KEY`, on purpose.

> [!WARNING]
> Vite inlines every `VITE_*` variable into the JavaScript it ships. A key baked
> into a public site is readable by anyone who opens DevTools, and they can spend
> against your Anthropic account until you notice.

So the deployed site is the **import-your-own-questions** path: **HOST GAME →
IMPORT MY OWN QUESTIONS**, feeding it a CSV (see `QUESTION_FORMAT.md`).
Generation stays on your machine, where `npm run dev` reads the key from a local
`.env` that is never committed.

If you accept the exposure anyway — say, a throwaway key with a low monthly
spend cap set in the Anthropic Console — add the repository secret
`VITE_ANTHROPIC_API_KEY` under **Settings → Secrets and variables → Actions**,
then add this to the `Build` step in `.github/workflows/deploy.yml`:

```yaml
      - name: Build
        run: npm run build
        env:
          VITE_ANTHROPIC_API_KEY: ${{ secrets.VITE_ANTHROPIC_API_KEY }}
```

The recommendation stands: don't. Import a CSV instead.

---

## 6. Alternative: container deployment (Cloud Run / Docker)

Use this when the app gains a backend, or when you need a private deployment
behind authentication. The `Dockerfile` is a two-stage build — Node 22 compiles
the bundle, nginx 1.25 serves `dist/` on port `8080` using
`nginx/omnitrivia.conf`.

### Local container

```bash
docker build -t omnitrivia:latest .
docker run -d -p 8080:8080 --name omnitrivia omnitrivia:latest
```

The app is then at `http://localhost:8080`.

### Google Cloud Run

Prerequisites: a GCP project with billing enabled, the `gcloud` CLI installed
and authenticated (`gcloud auth login`).

**1. Set project and region**

```bash
export PROJECT_ID="[YOUR_PROJECT_ID]"
export REGION="us-central1"

gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION
```

**2. Enable the APIs**

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

**3. Create an image repository**

```bash
gcloud artifacts repositories create omnitrivia-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker repository for OmniTrivia app"
```

**4. Build and push the image**

```bash
gcloud builds submit \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/omnitrivia-repo/omnitrivia-app:latest
```

To bake in an Anthropic key, pass `--build-arg VITE_ANTHROPIC_API_KEY=...` —
subject to the same warning as above: it ends up in the public bundle.

**5. Deploy the service**

```bash
gcloud run deploy omnitrivia-app \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/omnitrivia-repo/omnitrivia-app:latest" \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --port=8080
```

The command prints a Service URL.

**6. Map the domain (only if you move off Pages)**

```bash
gcloud beta run domain-mappings create \
  --service=omnitrivia-app \
  --domain=trivia.omniflexfitness.com \
  --region=$REGION
```

Cloud Run prints the DNS records to create. Replace the existing `trivia`
`CNAME` in Cloudflare with them — the subdomain can point at Pages or at Cloud
Run, never both. Also remove the custom domain from **Settings → Pages** first,
so the two are not fighting over the same hostname.

**Operations**

```bash
# Live logs
gcloud run services logs tail omnitrivia-app --region=$REGION

# Roll back to the previous revision
gcloud run services rollback omnitrivia-app --region=$REGION
```

> **On CMEK:** Vertex AI Studio may offer a "Customer-managed encryption key"
> option when saving prompts. It applies to saved prompts, not to this
> deployment, and this project does not need it.

---

## 7. Key takeaways

- **`trivia.omniflexfitness.com` is served by GitHub Pages from this
  repository**, rebuilt by `.github/workflows/deploy.yml` on every push to
  `master`.
- **Three admin clicks finish the setup**: Pages source → *GitHub Actions*,
  confirm the custom domain, tick *Enforce HTTPS* once the certificate lands.
- **DNS is already correct** and must stay **DNS only / grey cloud** in
  Cloudflare. The Shopify storefront on the apex domain is unaffected.
- **The old `gh-pages` branch is what has been serving the stale page.** Switching
  the source retires it; deleting the branch prevents future confusion.
- **No API key ships in the deployed build.** Hosts import a CSV; question
  generation stays local.
- **Public hosting does not add multiplayer.** Cross-device rooms need a backend,
  which is the point at which the Cloud Run path in §6 becomes worth taking.

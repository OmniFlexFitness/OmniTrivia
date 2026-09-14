/**
 * Checks the deployed site end to end, against the real Firebase project and
 * the real Worker.
 *
 *   npm run check-live
 *   SITE_URL=https://trivia.omniflexfitness.com npm run check-live
 *
 * The emulator suites (check-room-rules, check-room-join) prove the rules and
 * the transport are correct. They cannot prove the rules were ever *published*,
 * or that Authentication was ever switched on, or that the key Cloudflare holds
 * is one Anthropic will bill — and every one of those has failed in production
 * while every emulator check passed. This covers that gap: it asks the live
 * site what it believes, then checks whether those beliefs are true.
 *
 * Nothing here generates a question, so it costs nothing to run. The proxy is
 * probed with a deliberately malformed body: Anthropic validates the key before
 * the body, so a complaint about the body means the key is good, and a
 * complaint about the key means it is not.
 */
const SITE = (process.env.SITE_URL ?? "https://trivia.omniflexfitness.com").replace(/\/+$/, "");

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const note = (text) => console.log(`        ${text}`);

const done = (summary) => {
  console.log(`\n${summary}\n`);
  console.log(failures ? `${failures} FAILED\n` : "all checks passed\n");
  process.exit(failures ? 1 : 0);
};

/* ------------------------------------------------------------------ *
 * What the deployed bundle actually believes
 * ------------------------------------------------------------------ */

console.log(`\nThe site at ${SITE}\n`);

const page = await fetch(SITE).catch(() => null);
ok("is serving", page?.ok === true, page ? `HTTP ${page.status}` : "unreachable");
if (!page?.ok) done("The site is not answering, so nothing below can be checked.");

const html = await page.text();
const entry = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
ok("ships a built bundle", Boolean(entry), "no assets/index-*.js in the page");
if (!entry) done("Without the bundle there is no way to read the deployed configuration.");

const bundle = await (await fetch(`${SITE}/${entry}`)).text();
note(`${entry} — ${bundle.length.toLocaleString()} bytes`);

// These value shapes are distinctive enough to recover from minified code,
// which is the point: this reads the deployment rather than trusting a .env.
const apiKey = bundle.match(/AIza[0-9A-Za-z_-]{35}/)?.[0];
const databaseURL = bundle.match(/https:\/\/[a-z0-9-]+\.(?:firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)/)?.[0];
const authDomain = bundle.match(/[a-z0-9-]+\.firebaseapp\.com/)?.[0];
const projectId = authDomain?.replace(/\.firebaseapp\.com$/, "");

ok("was built with a Firebase config", Boolean(apiKey && databaseURL && projectId),
  "the VITE_FIREBASE_* repository variables were missing at build time");
if (!apiKey || !databaseURL || !projectId) {
  done("Multiplayer and question generation both need this; set the variables and re-run the deploy workflow.");
}
note(`project ${projectId}`);
note(databaseURL);

/* ------------------------------------------------------------------ *
 * Is Authentication switched on?
 * ------------------------------------------------------------------ */

console.log("\nSigning in, the way every device does\n");

const { initializeApp } = await import("firebase/app");
const { getAuth, signInAnonymously } = await import("firebase/auth");
const { getDatabase, ref, get, set, remove } = await import("firebase/database");

const app = initializeApp({ apiKey, authDomain, databaseURL, projectId, appId: "1:0:web:check-live" });
const db = getDatabase(app);

const timed = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

let host;
try {
  host = (await timed(signInAnonymously(getAuth(app)), 15000, "sign-in")).user;
  ok("anonymous sign-in works", true);
  note(`signed in as ${host.uid}`);
} catch (error) {
  const code = error?.code ?? "";
  ok("anonymous sign-in works", false, `${code} ${error?.message ?? error}`);
  note(
    code.includes("configuration-not-found")
      ? "Authentication has never been initialised: Firebase console → Build → Authentication → Get started."
      : code.includes("operation-not-allowed")
        ? "Authentication exists but Anonymous is off: Sign-in method → Anonymous → Enable."
        : "Neither multiplayer nor question generation can work until this succeeds.",
  );
  done("Sign-in is the foundation for both halves of this app; stop here.");
}

/* ------------------------------------------------------------------ *
 * Were the rules ever published?
 * ------------------------------------------------------------------ */

console.log("\nThe database rules, as published\n");

/** A PIN nobody is using, so a real trivia night is never touched. */
const findFreePin = async () => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    const snapshot = await timed(get(ref(db, `rooms/${pin}`)), 15000, "read");
    if (!snapshot.exists()) return pin;
  }
  return null;
};

let pin = null;
let readable = false;
try {
  pin = await findFreePin();
  readable = true;
  ok("a signed-in device can read a room", true);
} catch (error) {
  ok("a signed-in device can read a room", false, error?.message ?? String(error));
}

let claimed = false;
if (readable && pin) {
  try {
    await timed(
      set(ref(db, `rooms/${pin}/meta`), {
        hostId: "check-live",
        hostUid: host.uid,
        gameName: "check-live",
        open: true,
        updatedAt: Date.now(),
      }),
      15000,
      "claim",
    );
    claimed = true;
    ok("a host can claim a free PIN", true);
    note(`claimed ${pin}`);
  } catch (error) {
    ok("a host can claim a free PIN", false, error?.message ?? String(error));
  }
}

// Generation does not depend on the rules, so a locked database is reported
// and stepped over rather than hiding whatever the proxy would have said.
if (!readable && !claimed) {
  note("The live database is still on its default locked rules — every read and");
  note("write is refused. Publish firebase/database.rules.json: npm run rules:deploy");
}

if (claimed) {
  try {
    await timed(
      set(ref(db, `rooms/${pin}/snapshot`), {
        from: "check-live",
        uid: host.uid,
        at: Date.now(),
        payload: "{}",
      }),
      15000,
      "publish",
    );
    ok("that host can publish the game to the room", true);
  } catch (error) {
    ok("that host can publish the game to the room", false, error?.message ?? String(error));
  }

  // The rules are the security model, so confirm they are the repo's and not
  // simply wide open: a second device must not be able to take a held PIN.
  try {
    const intruderApp = initializeApp(
      { apiKey, authDomain, databaseURL, projectId, appId: "1:0:web:check-live-2" },
      "intruder",
    );
    const intruder = (await timed(signInAnonymously(getAuth(intruderApp)), 15000, "sign-in")).user;
    let stolen = false;
    try {
      await timed(
        set(ref(getDatabase(intruderApp), `rooms/${pin}/meta`), {
          hostId: "intruder",
          hostUid: intruder.uid,
          gameName: "stolen",
          open: true,
          updatedAt: Date.now(),
        }),
        15000,
        "steal",
      );
      stolen = true;
    } catch {
      /* refused, which is the point */
    }
    ok("and nobody else can take that PIN from them", !stolen,
      "the published rules are more permissive than firebase/database.rules.json");
  } catch (error) {
    ok("and nobody else can take that PIN from them", false, `could not test — ${error?.message ?? error}`);
  }

  try {
    await timed(remove(ref(db, `rooms/${pin}`)), 15000, "cleanup");
    note(`released ${pin}`);
  } catch {
    note(`could not release ${pin} — it will be cleaned up on disconnect`);
  }
}

/* ------------------------------------------------------------------ *
 * Will the proxy really spend?
 * ------------------------------------------------------------------ */

console.log("\nThe question-generation proxy\n");

/**
 * The bundle names the proxy, but not in a form worth pattern-matching. Every
 * origin it mentions is a candidate, and the one answering /health with "ok" is
 * the answer — which beats guessing, since a hostname that resolves and 404s
 * looks exactly like a Worker that was never deployed.
 */
const findProxy = async () => {
  if (process.env.PROXY_URL) return process.env.PROXY_URL.replace(/\/+$/, "");
  const candidates = [...new Set(bundle.match(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}/g) ?? [])].filter(
    (origin) => !/(google|gstatic|firebase|googleapis|anthropic\.com|w3\.org|github)/.test(origin),
  );
  for (const origin of candidates.slice(0, 20)) {
    const response = await fetch(`${origin}/health`).catch(() => null);
    if (response?.ok && (await response.text()).trim() === "ok") return origin;
  }
  return null;
};

const proxy = await findProxy();
ok("the deployed app points at a live proxy", Boolean(proxy),
  "no origin in the bundle answers /health — VITE_ANTHROPIC_PROXY_URL is unset or the Worker is not deployed");

if (!proxy) {
  done("Multiplayer may still be fine; question generation is not configured.");
}
note(proxy);

const token = await host.getIdToken();
const attempt = await fetch(`${proxy}/v1/messages`, {
  method: "POST",
  headers: {
    Origin: SITE,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  // Deliberately malformed. Anthropic checks the key before the body, so this
  // reaches every gate and every credential without generating anything.
  body: "{}",
});
const text = await attempt.text();
let parsed = {};
try {
  parsed = JSON.parse(text);
} catch {
  /* keep the raw text */
}
const fromProxy = parsed?.error?.type === "proxy_error";
const upstreamType = fromProxy ? null : parsed?.error?.type;
const upstreamMessage = parsed?.error?.message ?? "";

ok("it accepts a real sign-in from the real site", !fromProxy,
  `the proxy itself refused with ${attempt.status}: ${parsed?.error?.message ?? text.slice(0, 200)}`);

if (!fromProxy) {
  const keyRejected = upstreamType === "authentication_error";
  const needsWorkspace = /workspace/i.test(upstreamMessage);
  ok("and the key it holds is one Anthropic will bill", !keyRejected && !needsWorkspace,
    `${upstreamType ?? attempt.status}: ${upstreamMessage.slice(0, 220)}`);

  if (needsWorkspace) {
    note("That key is not scoped to a workspace. Either create a key inside a");
    note("workspace and re-run `npm run worker:secret`, or set the workspace id:");
    note("npx wrangler@latest secret put ANTHROPIC_WORKSPACE_ID --config worker/wrangler.toml");
  } else if (keyRejected) {
    note("Cloudflare holds a key Anthropic does not recognise; re-run `npm run worker:secret`.");
  } else if (attempt.status === 400) {
    note("Anthropic rejected the body, which is the malformed one sent on purpose —");
    note("everything before it (origin, token, rate limit, key) worked.");
  }
}

done(
  failures
    ? "Something between the browser and the services it depends on is not wired up."
    : "The deployed site, the live database and the generation proxy all check out.",
);

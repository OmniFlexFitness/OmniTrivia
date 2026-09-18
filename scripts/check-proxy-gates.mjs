/**
 * Checks what the generation proxy refuses, against a running Worker.
 *
 *   npm run worker:dev          # in one terminal
 *   npm run check-proxy-gates   # in another
 *
 * Point it elsewhere with PROXY_URL=https://... to run the same checks against
 * the deployed Worker — they are all refusals, so nothing is spent doing it.
 *
 * The token gate itself is covered by scripts/check-proxy-auth.mjs, which can
 * mint forgeries; this covers everything around it. Neither exercises a real
 * generation: that needs a real Firebase token and spends real money, so it is
 * the one step left to a human (see worker/README.md).
 */
const PROXY = (process.env.PROXY_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const ALLOWED = process.env.ALLOWED_ORIGIN ?? "https://trivia.omniflexfitness.com";
const OTHER = "https://evil.example.com";

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const call = async (path, init = {}) => {
  const response = await fetch(`${PROXY}${path}`, init);
  return { status: response.status, headers: response.headers };
};

const post = (path, headers = {}) =>
  call(path, { method: "POST", headers, body: JSON.stringify({ model: "claude-opus-5" }) });

console.log(`\nProxy at ${PROXY}\n`);

const health = await call("/health");
if (health.status !== 200) {
  console.error(`No Worker answering at ${PROXY} — start one with: npm run worker:dev`);
  process.exit(1);
}
ok("answers a health check", true);

console.log("\nWho may call it\n");

/**
 * Every header @anthropic-ai/sdk puts on a request from a browser.
 *
 * A browser clears its whole header list in one preflight: one header the
 * Worker does not name and the POST is never sent, which the SDK can only
 * report as a connection error and the host only sees as placeholder
 * questions. Asking for a single header — as this check used to — passes
 * happily while the other eight are refused, so ask for all of them.
 *
 * `user-agent` is left out on purpose: browsers refuse to let a page set it,
 * so it never reaches the preflight.
 */
const SDK_HEADERS = [
  "authorization",
  "content-type",
  "x-api-key",
  "anthropic-version",
  "anthropic-dangerous-direct-browser-access",
  "x-stainless-arch",
  "x-stainless-lang",
  "x-stainless-os",
  "x-stainless-package-version",
  "x-stainless-retry-count",
  "x-stainless-runtime",
  "x-stainless-runtime-version",
  "x-stainless-timeout",
];

const preflight = await call("/v1/messages", {
  method: "OPTIONS",
  headers: {
    Origin: ALLOWED,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": SDK_HEADERS.join(","),
  },
});
ok("the game's own origin gets a preflight", preflight.status === 204);

const allowedHeaders = (preflight.headers.get("access-control-allow-headers") ?? "")
  .split(",")
  .map((name) => name.trim().toLowerCase());
const missing = SDK_HEADERS.filter((name) => !allowedHeaders.includes(name));
ok(
  "clearing every header the Anthropic SDK sends",
  missing.length === 0,
  `the browser would be refused over: ${missing.join(", ")}`,
);

ok(
  "which name that origin and no other",
  preflight.headers.get("access-control-allow-origin") === ALLOWED,
);

ok("another site's preflight is refused", (await call("/v1/messages", { method: "OPTIONS", headers: { Origin: OTHER } })).status === 403);
ok("a request from another site is refused", (await post("/v1/messages", { Origin: OTHER })).status === 403);
ok("a request from no site at all is refused", (await post("/v1/messages")).status === 403);

console.log("\nWho may spend\n");

ok("a request with no token is refused", (await post("/v1/messages", { Origin: ALLOWED })).status === 401);
ok(
  "a request with a made-up token is refused",
  (await post("/v1/messages", { Origin: ALLOWED, Authorization: "Bearer not.a.token" })).status === 401,
);
ok(
  "a token in the wrong scheme is refused",
  (await post("/v1/messages", { Origin: ALLOWED, Authorization: "Basic aGk6dGhlcmU=" })).status === 401,
);

console.log("\nWhat may be reached\n");

ok("no other Anthropic endpoint is exposed", (await post("/v1/models", { Origin: ALLOWED })).status === 404);
ok("GET is not a way in", (await call("/v1/messages", { headers: { Origin: ALLOWED } })).status === 405);

console.log(failures ? `\n${failures} FAILED\n` : "\nall checks passed\n");
process.exit(failures ? 1 : 0);

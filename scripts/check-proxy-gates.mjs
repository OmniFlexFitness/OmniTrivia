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

const preflight = await call("/v1/messages", {
  method: "OPTIONS",
  headers: { Origin: ALLOWED },
});
ok("the game's own origin gets a preflight", preflight.status === 204);
ok(
  "and the headers the Anthropic SDK sends",
  (preflight.headers.get("access-control-allow-headers") ?? "").includes(
    "anthropic-dangerous-direct-browser-access",
  ),
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

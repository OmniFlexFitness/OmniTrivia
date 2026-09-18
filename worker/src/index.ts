import { verifyFirebaseToken } from "./firebaseToken";

/**
 * The question-generation proxy.
 *
 * Vite inlines every VITE_* value into the bundle it ships, so an Anthropic key
 * given to the deployed app is a key given to everyone who loads it. This is
 * where the key lives instead: the browser asks this Worker, the Worker asks
 * Anthropic, and the key never leaves Cloudflare.
 *
 * A proxy that will spend someone's Anthropic balance for anyone who finds it
 * is not much better than the leak it replaced, so a request has to clear four
 * gates before anything is forwarded:
 *
 *   1. It comes from an allowed origin.
 *   2. It carries a Firebase ID token this Worker can verify against Google's
 *      published keys — the same anonymous sign-in the game already does.
 *   3. That device is inside its rate limit.
 *   4. The body is small enough to be a question request rather than a payload.
 */

export interface Env {
  /** Set with: npx wrangler secret put ANTHROPIC_API_KEY */
  ANTHROPIC_API_KEY: string;
  /**
   * Only needed when ANTHROPIC_API_KEY is not scoped to a workspace — an
   * org-level key, which Anthropic refuses with a 400 unless the request names
   * the workspace to bill. A key created inside a workspace needs none of this;
   * see worker/README.md, which recommends that instead.
   */
  ANTHROPIC_WORKSPACE_ID?: string;
  /** The Firebase project whose tokens are accepted. */
  FIREBASE_PROJECT_ID: string;
  /** Comma-separated origins allowed to call this. */
  ALLOWED_ORIGINS: string;
  /** Optional: remove the [[ratelimits]] block and this goes away cleanly. */
  GENERATION_LIMIT?: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Generation asks for a round of questions; nothing legitimate is larger. */
const MAX_BODY_BYTES = 128 * 1024;

/** Headers the Anthropic SDK sends from a browser that must survive the hop. */
const FORWARDED_HEADERS = [
  "anthropic-version",
  "anthropic-beta",
  "content-type",
  "accept",
];

const allowedOrigins = (env: Env): string[] =>
  env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

/**
 * Headers a browser may send here, whether or not it thought to ask.
 *
 * The Anthropic SDK does not stop at the headers the API documents. Every
 * request it makes also carries eight `x-stainless-*` telemetry headers, and a
 * browser will not send a request whose headers the preflight did not clear.
 * Omitting them is not a partial failure: the POST never leaves the browser at
 * all, the SDK reports it as a connection error, and the host is shown
 * placeholder questions with nothing to go on but a blocked preflight.
 */
const ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "anthropic-version",
  "anthropic-beta",
  "x-api-key",
  "anthropic-dangerous-direct-browser-access",
  "x-stainless-lang",
  "x-stainless-package-version",
  "x-stainless-os",
  "x-stainless-arch",
  "x-stainless-runtime",
  "x-stainless-runtime-version",
  "x-stainless-retry-count",
  "x-stainless-timeout",
];

/**
 * The list above, plus whatever this particular browser asked to send.
 *
 * Echoing the request's own list is what stops this breaking again the next
 * time the SDK adds a header. It grants nothing: clearing a header at the
 * preflight only lets the browser *send* it, and what a request may actually do
 * here is settled afterwards by the origin allowlist, the Firebase token, the
 * rate limit and the body cap — none of which a header can talk its way past.
 * Only the fixed FORWARDED_HEADERS list ever reaches Anthropic.
 */
const allowedRequestHeaders = (request: Request): string => {
  const asked = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set([...ALLOWED_HEADERS, ...asked])].join(", ");
};

/** Errors the SDK reads off a response; without these it cannot see them. */
const EXPOSED_HEADERS = "request-id, retry-after, anthropic-ratelimit-requests-reset";

const corsHeaders = (request: Request, env: Env): Record<string, string> => {
  const origin = request.headers.get("origin");
  const match = origin && allowedOrigins(env).includes(origin) ? origin : null;
  if (!match) return {};

  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": allowedRequestHeaders(request),
    // A 429 the SDK cannot read `retry-after` from is a 429 it backs off from
    // by guesswork, which on a shared key is the difference between the second
    // attempt working and the round starting on placeholders.
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": "86400",
    // The allowed-header list is now per-request, so a cache that ignored the
    // request's own list would hand one browser another browser's preflight.
    Vary: "Origin, Access-Control-Request-Headers",
  };
};

const refuse = (
  status: number,
  message: string,
  request: Request,
  env: Env,
): Response =>
  new Response(JSON.stringify({ error: { type: "proxy_error", message } }), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(request, env) },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const headers = corsHeaders(request, env);
      // An unlisted origin gets no CORS headers, so the browser stops it here.
      return new Response(null, { status: Object.keys(headers).length ? 204 : 403, headers });
    }

    // A health check that says nothing about the key or who may use it.
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    if (request.method !== "POST") {
      return refuse(405, "Only POST is accepted.", request, env);
    }

    // The Anthropic SDK appends /v1/messages to its base URL. Nothing else on
    // the API is needed here, so nothing else is reachable through it.
    if (url.pathname !== "/v1/messages") {
      return refuse(404, "Unknown endpoint.", request, env);
    }

    if (!origin || !allowedOrigins(env).includes(origin)) {
      return refuse(403, "Origin not allowed.", request, env);
    }

    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) {
      return refuse(401, "Sign in before generating questions.", request, env);
    }

    let uid: string;
    try {
      ({ uid } = await verifyFirebaseToken(token, {
        projectId: env.FIREBASE_PROJECT_ID,
      }));
    } catch (error) {
      // The reason goes to the log, not to whoever is probing.
      console.log(`rejected token: ${(error as Error).message}`);
      return refuse(401, "Sign in before generating questions.", request, env);
    }

    if (env.GENERATION_LIMIT) {
      const { success } = await env.GENERATION_LIMIT.limit({ key: uid });
      if (!success) {
        return refuse(429, "Too many generations from this device. Wait a moment.", request, env);
      }
    }

    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return refuse(413, "Request too large.", request, env);
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");
    // The caller's x-api-key — a placeholder, since it has no real one — is
    // dropped rather than forwarded. This is the only key that goes upstream.
    headers.set("x-api-key", env.ANTHROPIC_API_KEY);
    if (env.ANTHROPIC_WORKSPACE_ID) {
      headers.set("anthropic-workspace-id", env.ANTHROPIC_WORKSPACE_ID);
    }

    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers,
      body,
    });

    const response = new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
    for (const [name, value] of Object.entries(corsHeaders(request, env))) {
      response.headers.set(name, value);
    }
    // Nothing here is cacheable, and an answer cached across devices would be
    // an answer served to a device that never asked for it.
    response.headers.set("cache-control", "no-store");

    return response;
  },
};

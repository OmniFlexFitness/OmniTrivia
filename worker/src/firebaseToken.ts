/**
 * Verifying a Firebase ID token, without a Firebase SDK.
 *
 * The proxy has to know who is calling before it spends anything against the
 * Anthropic account. The app already signs every device in anonymously to
 * Firebase, so the device can hand over the ID token that sign-in produced and
 * this checks it: Google's signature over Google's own claims, which a caller
 * cannot mint for themselves.
 *
 * Google publishes the signing keys as a JWK set and rotates them, so the set
 * is fetched and cached for as long as the response says it is good for.
 */

export interface VerifiedToken {
  /** The Firebase uid of the signed-in device. */
  uid: string;
  /** When the token stops being valid, as a unix timestamp in seconds. */
  exp: number;
}

export interface VerifyOptions {
  /** Firebase project the token must have been issued for. */
  projectId: string;
  /** Swappable so tests can verify against a key pair they control. */
  fetchKeys?: () => Promise<Record<string, JsonWebKey>>;
  /** Swappable so tests can check expiry both ways. Seconds since the epoch. */
  now?: () => number;
}

const JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** Tokens minted a little ahead of us are a clock difference, not an attack. */
const CLOCK_SKEW_SECONDS = 60;

let cached: { keys: Record<string, JsonWebKey>; until: number } | null = null;

const fetchGoogleKeys = async (): Promise<Record<string, JsonWebKey>> => {
  if (cached && Date.now() < cached.until) return cached.keys;

  const response = await fetch(JWK_URL);
  if (!response.ok) throw new Error(`jwks ${response.status}`);

  const body = (await response.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const keys: Record<string, JsonWebKey> = {};
  for (const key of body.keys) keys[key.kid] = key;

  // Google says how long the set is good for; honour it rather than inventing
  // a TTL, so a rotation is picked up when it actually happens.
  const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "");
  const ttl = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;
  cached = { keys, until: Date.now() + ttl };

  return keys;
};

const decodeSegment = (segment: string): unknown => {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return JSON.parse(json);
};

const decodeSignature = (segment: string): Uint8Array => {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * Verify a Firebase ID token, returning who it belongs to.
 *
 * Throws with a short reason on anything that does not check out. The reason is
 * for the proxy's own logs — a caller is told only that it was rejected, since
 * telling them which check failed is telling them how to get past it.
 */
export const verifyFirebaseToken = async (
  token: string,
  options: VerifyOptions,
): Promise<VerifiedToken> => {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("not a jwt");

  const header = decodeSegment(parts[0]) as { alg?: string; kid?: string };
  const claims = decodeSegment(parts[1]) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
  };

  // Firebase signs ID tokens with RS256. Anything else — "none" above all —
  // is a forgery attempt dressed as a token.
  if (header.alg !== "RS256") throw new Error("wrong alg");
  if (!header.kid) throw new Error("no kid");

  const keys = await (options.fetchKeys ?? fetchGoogleKeys)();
  const jwk = keys[header.kid];
  if (!jwk) throw new Error("unknown key");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeSignature(parts[2]),
    signed,
  );
  if (!valid) throw new Error("bad signature");

  // A valid signature only says Google minted it. These say it was minted for
  // this project, for a real user, and is still current.
  const now = (options.now ?? (() => Math.floor(Date.now() / 1000)))();

  if (claims.aud !== options.projectId) throw new Error("wrong audience");
  if (claims.iss !== `https://securetoken.google.com/${options.projectId}`) {
    throw new Error("wrong issuer");
  }
  if (!claims.sub) throw new Error("no subject");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("expired");
  if (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_SECONDS) {
    throw new Error("issued in the future");
  }

  return { uid: claims.sub, exp: claims.exp };
};

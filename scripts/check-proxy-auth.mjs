/**
 * Checks the proxy's Firebase ID token verification.
 *
 *   node scripts/check-proxy-auth.mjs
 *
 * This is the gate that decides who may spend against the Anthropic account,
 * so it is tested against tokens built here rather than against a real one: a
 * key pair minted in-process can sign the forgeries a real Firebase never
 * would — wrong project, expired, unsigned, signed by the wrong key, "alg":
 * "none" — and every one of them has to be refused.
 *
 * The module under test is the Worker's own, built for Node with Vite.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto as crypto } from "node:crypto";
import { build } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "node_modules", ".cache", "omnitrivia-proxy-auth");
mkdirSync(outDir, { recursive: true });

await build({
  logLevel: "error",
  configFile: false,
  build: {
    outDir,
    emptyOutDir: true,
    ssr: join(root, "worker", "src", "firebaseToken.ts"),
    target: "node22",
    rollupOptions: { output: { entryFileNames: "firebaseToken.mjs" } },
  },
});

const { verifyFirebaseToken } = await import(join(outDir, "firebaseToken.mjs"));

const PROJECT = "omnitrivia-c3a93";
const KID = "test-key";
const NOW = 1_800_000_000;

const pair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const otherPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);

const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
const fetchKeys = async () => ({ [KID]: { ...publicJwk, kid: KID } });
const now = () => NOW;

const b64url = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Build a token: correct by default, broken in exactly the named way. */
const mint = async ({ header = {}, claims = {}, signWith = pair.privateKey, unsigned = false } = {}) => {
  const h = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT", ...header }));
  const c = b64url(
    JSON.stringify({
      aud: PROJECT,
      iss: `https://securetoken.google.com/${PROJECT}`,
      sub: "device-uid-1",
      iat: NOW - 60,
      exp: NOW + 3600,
      ...claims,
    }),
  );

  if (unsigned) return `${h}.${c}.`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signWith,
    new TextEncoder().encode(`${h}.${c}`),
  );
  return `${h}.${c}.${b64url(Buffer.from(signature))}`;
};

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const accepts = async (token) => {
  try {
    return await verifyFirebaseToken(token, { projectId: PROJECT, fetchKeys, now });
  } catch {
    return null;
  }
};

console.log("\nA token Firebase would really have issued\n");

const good = await accepts(await mint());
ok("is accepted", good !== null);
ok("and names the device that signed in", good?.uid === "device-uid-1");

console.log("\nTokens it would not\n");

ok("a token signed by the wrong key", (await accepts(await mint({ signWith: otherPair.privateKey }))) === null);
ok("an unsigned token", (await accepts(await mint({ unsigned: true }))) === null);
ok('a token claiming alg "none"', (await accepts(await mint({ header: { alg: "none" }, unsigned: true }))) === null);
ok("a token signed with a key this project does not publish", (await accepts(await mint({ header: { kid: "other-key" } }))) === null);
ok("a token for another Firebase project", (await accepts(await mint({ claims: { aud: "someone-elses-project" } }))) === null);
ok("a token from another issuer", (await accepts(await mint({ claims: { iss: "https://evil.example.com/x" } }))) === null);
ok("an expired token", (await accepts(await mint({ claims: { exp: NOW - 1 } }))) === null);
ok("a token issued in the future", (await accepts(await mint({ claims: { iat: NOW + 600 } }))) === null);
ok("a token with no subject", (await accepts(await mint({ claims: { sub: "" } }))) === null);
ok("a token with its payload swapped after signing", await (async () => {
  const token = await mint();
  const [h, , s] = token.split(".");
  const tampered = b64url(JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "somebody-else", iat: NOW - 60, exp: NOW + 3600 }));
  return (await accepts(`${h}.${tampered}.${s}`)) === null;
})());
ok("something that is not a token at all", (await accepts("hello")) === null);

console.log(failures ? `\n${failures} FAILED\n` : "\nall checks passed\n");
process.exit(failures ? 1 : 0);

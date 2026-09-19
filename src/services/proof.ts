/**
 * Proving you are who you say you are, with something you can type.
 *
 * Two people in a game need this, for the same reason and in the same way.
 *
 *  - **The host**, who is the game: the questions, the scores and the clock
 *    all live in their window, so a window that goes away used to take the
 *    night with it. A password named when the game is opened is what lets any
 *    device be trusted with it afterwards — see `hostSession.ts`.
 *  - **A player**, who is a seat: a score, a streak and a place in the
 *    bracket. A phone that reloads is recognised by the seat it saved, but a
 *    phone that is dead, wiped, or simply a different phone has nothing to
 *    show. A code they pick when they join is what gets them back into their
 *    own seat instead of a new one — see `seat.ts`.
 *
 * Neither secret is ever stored or sent in the clear. What travels and what is
 * kept is the hash below, salted with the game's PIN so the same code on two
 * nights is two different proofs.
 *
 * What this is not: a player's proof reaches the host over the room's message
 * bus, which every device in the room can read. So it raises the bar from
 * "knows a player id off the leaderboard" — which is everybody — to "was
 * watching the database at the moment that player joined". A trivia night is
 * the threat model; a bank is not.
 */

/* ------------------------------------------------------------------ *
 * The proof
 * ------------------------------------------------------------------ */

/**
 * SHA-256, in plain TypeScript.
 *
 * `crypto.subtle` would be the obvious way to do this and cannot be used: it
 * is absent outside a secure context, and a host running the dev server over
 * a venue's LAN is on `http://192.168.x.x`, which is not one. A returning
 * device must derive *byte-identical* proofs to the one that set the password,
 * so the derivation cannot vary with where it runs.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (value: number, bits: number): number =>
  (value >>> bits) | (value << (32 - bits));

const sha256Hex = (input: string): string => {
  const data = new TextEncoder().encode(input);
  // Append 0x80, pad with zeros to 56 mod 64, then the length as 64 bits.
  const padded = data.length + 9 + ((64 - ((data.length + 9) % 64)) % 64);
  const block = new Uint8Array(padded);
  block.set(data);
  block[data.length] = 0x80;

  const view = new DataView(block.buffer);
  const bits = data.length * 8;
  view.setUint32(padded - 8, Math.floor(bits / 4294967296), false);
  view.setUint32(padded - 4, bits >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let acc = h[7];

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (acc + s1 + choose + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const major = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + major) >>> 0;

      acc = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + acc) >>> 0;
  }

  return Array.from(h, (word) => word.toString(16).padStart(8, "0")).join("");
};

/**
 * Stretching the password. Guessing one against a live room is bounded by the
 * network rather than by this, so the rounds are not what protects the game —
 * they are what keeps a hash that somehow escaped from being a password.
 */
const PROOF_ROUNDS = 2048;

/** Derive one proof. `scope` keeps a host's password and a player's code apart. */
const derive = (scope: string, pin: string, secret: string): string => {
  let digest = sha256Hex(`omnitrivia:${scope}:${pin}:${secret}`);
  for (let round = 1; round < PROOF_ROUNDS; round++) {
    digest = sha256Hex(`${digest}:${pin}`);
  }
  return digest;
};

/** The proof that a device knows this room's host password. */
export const hostProof = (pin: string, password: string): string =>
  derive("host", pin, password);

/**
 * The proof that a device knows a player's rejoin code.
 *
 * Scoped to the game rather than to the player, because a player coming back
 * on a new phone has no player id to scope it to — their name and this are
 * the whole of what they bring.
 */
export const playerProof = (pin: string, code: string): string =>
  derive("player", pin, code);

/** Shortest host password worth calling one. Enforced where it is set. */
export const MIN_HOST_PASSWORD_LENGTH = 4;

/** How many digits a player's rejoin code is. Short: it is typed on a phone. */
export const PLAYER_CODE_LENGTH = 4;

/** A password a host can read off the screen and type again on a phone. */
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const suggestHostPassword = (length = 6): string => {
  const values = new Uint32Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < length; i++) values[i] = Math.floor(Math.random() * 2 ** 32);
  }

  return Array.from(
    values,
    (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length],
  ).join("");
};

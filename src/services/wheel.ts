/**
 * Where a spin lands.
 *
 * The wheel used to be theatre. Every round's category was decided when the
 * game was generated — round one played `roundsConfig[0]`, round two played
 * `roundsConfig[1]` — and the spin was animated to land on whichever one was
 * already its turn. The room watched a result that had been settled minutes
 * before anybody touched the wheel.
 *
 * Now the spin decides. The flick's speed and a random offset set the final
 * rotation, this works out which slice ends up under the pointer, and *that*
 * is the category the round is played on. Which means the geometry is game
 * logic rather than decoration, so it lives here where it can be checked
 * (`npm run check-game-setup`) instead of inside an animation callback.
 */

/**
 * Which slice is under the pointer at a given rotation.
 *
 * Degrees run clockwise from 12 o'clock, where the pointer sits, and slice `i`
 * spans `[i * sliceAngle, (i + 1) * sliceAngle)` before the wheel is turned.
 * Turning the wheel by `rotation` moves the slices, not the pointer, so the
 * slice under it is the one covering `-rotation`.
 */
export const landedSliceIndex = (
  rotation: number,
  sliceCount: number,
): number => {
  if (sliceCount <= 0) return 0;
  const sliceAngle = 360 / sliceCount;
  const normalized = ((-rotation % 360) + 360) % 360;
  // Clamped rather than trusted: floating point at a boundary can put
  // `normalized / sliceAngle` a hair over the last slice.
  return Math.min(sliceCount - 1, Math.floor(normalized / sliceAngle));
};

export interface SpinPlan {
  /** Absolute rotation, in degrees, the wheel comes to rest at. */
  finalRotation: number;
  /** The slice under the pointer once it stops. */
  landedIndex: number;
}

/**
 * Plan a spin from where the wheel is and how hard it was flicked.
 *
 * `random` is injectable so the checks can pin a landing; nothing in the app
 * passes it.
 */
export const planSpin = (
  currentRotation: number,
  velocity: number,
  sliceCount: number,
  random: () => number = Math.random,
): SpinPlan => {
  const slices = Math.max(1, sliceCount);
  const sliceAngle = 360 / slices;

  // A harder flick spins for longer. It does not spin for *further* in any way
  // that matters — the offset below is a whole turn wide, so every slice stays
  // reachable from any starting angle at any speed.
  const turns = 3 + Math.min(Math.floor(Math.abs(velocity) / 400), 8);
  const raw = currentRotation + turns * 360 + random() * 360;

  const landedIndex = landedSliceIndex(raw, slices);

  // Settle on the slice's centre line rather than wherever the offset fell, so
  // the winning label comes to rest upright under the pointer instead of on
  // the boundary between two category names. This only ever rewinds by less
  // than a full turn, and never off the slice it landed on.
  const centre = -((landedIndex + 0.5) * sliceAngle);
  const overshoot = (((raw - centre) % 360) + 360) % 360;

  return { finalRotation: raw - overshoot, landedIndex };
};

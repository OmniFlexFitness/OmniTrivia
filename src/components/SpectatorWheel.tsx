import React, { useEffect, useMemo, useRef, useState } from "react";
import { Category } from "../types";
import { restingRotation } from "../services/wheel";
import WheelFace from "./WheelFace";

/**
 * The wheel on a screen that is not spinning it — the projector, and every
 * player's phone.
 *
 * These screens are deliberately not told where the host's wheel is going. The
 * round's category is kept out of the published snapshot until the wheel has
 * stopped, because a result sitting in a snapshot while the room is still
 * watching it turn is a result anybody can read early. So this cannot mirror
 * the host's angle, and does not try to: it turns freely for as long as the
 * host's wheel is turning, and the moment the category is announced it eases
 * to rest with that category under the pointer.
 *
 * Which means these wheels stop on the same category as the host's, having
 * travelled a different way round to it. Nobody in the room is comparing
 * angles; they are watching a wheel stop on a category, and it does.
 */

/** How fast a watching wheel turns while it has nothing to land on yet. */
const FREE_SPIN_DEG_PER_SEC = 540;
/** How long it takes to come to rest once the category is known. */
const SETTLE_MS = 1500;

/** Fast, then easing off — a wheel losing its momentum, not a slider. */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    // No matchMedia (or no window at all): animate, which is the default
    // everyone else gets.
    return false;
  }
};

export interface SpectatorWheelProps {
  /** The categories still to be played, as the host published them. */
  categories: Category[];
  /** The host's wheel is in flight. */
  spinning: boolean;
  /** The category the spin landed on, once there is one. */
  landed: Category | null;
  /** A new round is a new wheel; this is what resets it. */
  roundNumber: number;
  /**
   * The category *this* wheel has come to rest on, which is a beat behind the
   * one the host announced — and null again while the next round's wheel is
   * still turning.
   *
   * The screen around a wheel wants to announce the category too, and if it
   * does so the moment the host's wheel stops it gives the answer away while
   * this one is still travelling to it. So the caption waits for the wheel it
   * is captioning, and this is how it knows.
   */
  onSettled?: (category: Category | null) => void;
  className?: string;
}

const SpectatorWheel: React.FC<SpectatorWheelProps> = ({
  categories,
  spinning,
  landed,
  roundNumber,
  onSettled,
  className,
}) => {
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  // The snapshot arrives whole and new every time the host publishes, so the
  // category list is a fresh array several times a second. Keyed on its
  // contents instead, it is a stable value — which is what keeps a spinning
  // wheel to one style write a frame rather than a full redraw of its slices.
  const signature = categories.map((category) => category.id).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const liveSlices = useMemo(() => categories, [signature]);

  /**
   * The slices as they were when this spin started.
   *
   * Landing moves the category that won into this round's slot, which reorders
   * the very list these are published from. Locking them is what stops the
   * wheel re-labelling itself under a stationary pointer at the exact moment
   * it stops — the same lock the host's wheel takes, for the same reason.
   */
  const [locked, setLocked] = useState<Category[] | null>(null);
  const slices = locked ?? liveSlices;

  /** What this wheel has actually stopped on — not what the host announced. */
  const [settled, setSettled] = useState<Category | null>(null);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);
  useEffect(() => {
    onSettledRef.current?.(settled);
  }, [settled]);

  useEffect(() => {
    if (!spinning) return;
    setLocked((current) => current ?? liveSlices);
    setSettled(null);
  }, [spinning, liveSlices]);

  // A new round is a new wheel: new slices, nothing landed, back to the top.
  useEffect(() => {
    setLocked(null);
    setSettled(null);
    rotationRef.current = 0;
    setRotation(0);
  }, [roundNumber]);

  /* --- turning, while the host's wheel is turning --- */
  useEffect(() => {
    if (!spinning || prefersReducedMotion()) return;

    let last = performance.now();
    const step = (now: number) => {
      rotationRef.current += ((now - last) / 1000) * FREE_SPIN_DEG_PER_SEC;
      last = now;
      setRotation(rotationRef.current);
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [spinning]);

  /* --- coming to rest, once there is something to rest on --- */
  const landedId = landed?.id ?? null;
  useEffect(() => {
    if (spinning || !landedId) return;

    const index = slices.findIndex((category) => category.id === landedId);
    if (index < 0) return;

    const from = rotationRef.current;
    const to = restingRotation(from, index, slices.length);
    const stop = () => {
      // Land exactly on the slice's centre line rather than wherever the last
      // frame happened to fall, and only now say what it landed on.
      rotationRef.current = to;
      setRotation(to);
      setSettled(slices[index]);
    };

    if (prefersReducedMotion()) {
      stop();
      return;
    }

    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / SETTLE_MS);
      rotationRef.current = from + (to - from) * easeOut(progress);
      setRotation(rotationRef.current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      stop();
      frameRef.current = null;
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [spinning, landedId, slices]);

  if (slices.length === 0) return null;

  return (
    <WheelFace
      categories={slices}
      rotation={rotation}
      // The hub fills when this wheel stops, not when the host's did.
      landed={settled}
      className={className}
    />
  );
};

export default SpectatorWheel;

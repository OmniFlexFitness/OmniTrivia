import React, { useState, useEffect, useRef, useCallback } from "react";
import { useGame } from "../context/GameContext";
import { planSpin, wheelCategories } from "../services/wheel";
import { Category } from "../types";
import Button from "./Button";
import WheelFace from "./WheelFace";
import { ArrowRight, RotateCcw } from "lucide-react";

/**
 * The host's wheel — the only one in the game that decides anything.
 *
 * It is flicked or pressed, it comes to rest, and the slice under the pointer
 * is the round — until the host spins again. A landing is not final: the host
 * can respin as many times as they like, and only START ROUND commits it. The projector and the players' phones draw the same face (see
 * `WheelFace`) but are only watching: they are told the category once the
 * wheel has stopped, never where it is going.
 */

// Minimum velocity (deg/s) required to trigger a spin by flicking. Kept low
// enough to be reachable with a trackpad or a touchscreen; the SPIN button is
// the guaranteed path regardless.
const MIN_SPIN_VELOCITY = 250;
// Friction applied during deceleration
const FRICTION = 0.985;
// Minimum velocity to stop animation
const STOP_THRESHOLD = 0.5;
/** How long the wheel takes to come to rest once it is let go. */
const SPIN_MS = 3000;

const Wheel: React.FC = () => {
  const {
    startRound,
    beginWheelSpin,
    revealCategory,
    isHost,
    currentRound,
    totalRounds,
    roundsConfig,
  } = useGame();

  // Core state
  const [rotation, setRotation] = useState(0);
  const [winningCategory, setWinningCategory] = useState<Category | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  /**
   * The slices as they were when this spin started.
   *
   * Landing is a state change — the category the pointer stopped on is moved
   * into this round's slot — and that reorders the very list the slices are
   * drawn from. Without this the wheel silently re-labelled itself under a
   * stationary pointer the instant it stopped, so the host read one category
   * off the wheel while the game announced another. What was flicked is what
   * stays on screen.
   */
  const [lockedSlices, setLockedSlices] = useState<Category[] | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(0);
  const lastAngleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const rotationRef = useRef(0);

  // The categories still to be played, which is what every screen's wheel is
  // drawn from. Held still for the duration of a spin, because landing rewrites
  // the list they come from and a wheel that re-labels itself mid-spin is a
  // wheel that lies about where it stopped.
  const activeCategories =
    lockedSlices ?? wheelCategories(roundsConfig, currentRound);
  const sliceCount = activeCategories.length;

  // Calculate angle from center of wheel to mouse position
  const getAngleFromCenter = useCallback(
    (clientX: number, clientY: number): number => {
      if (!wheelRef.current) return 0;
      const rect = wheelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    },
    [],
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      // A landed wheel can be flicked again: that is a respin.
      if (!isHost || isSpinning) return;

      // Cancel any running animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      setIsDragging(true);
      const angle = getAngleFromCenter(clientX, clientY);
      lastAngleRef.current = angle;
      lastTimeRef.current = performance.now();
      velocityRef.current = 0;
    },
    [isHost, isSpinning, getAngleFromCenter],
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging || !isHost) return;

      const currentAngle = getAngleFromCenter(clientX, clientY);
      const currentTime = performance.now();

      // Calculate angle delta (handling wrap-around)
      let angleDelta = currentAngle - lastAngleRef.current;
      if (angleDelta > 180) angleDelta -= 360;
      if (angleDelta < -180) angleDelta += 360;

      // Calculate time delta
      const timeDelta = (currentTime - lastTimeRef.current) / 1000; // seconds

      // Update velocity (degrees per second)
      if (timeDelta > 0) {
        velocityRef.current = angleDelta / timeDelta;
      }

      // Update rotation
      rotationRef.current += angleDelta;
      setRotation(rotationRef.current);

      lastAngleRef.current = currentAngle;
      lastTimeRef.current = currentTime;
    },
    [isDragging, isHost, getAngleFromCenter],
  );

  /**
   * Spin, and play whatever it lands on.
   *
   * The category is not chosen here and then animated to — it is read off the
   * wheel once the wheel has stopped. `planSpin` turns how hard this was
   * flicked, plus a full turn of random offset, into a resting rotation, and
   * the slice under the pointer at that rotation is the round. Which is why
   * `revealCategory` is handed an index rather than an id: the pointer is the
   * authority, and the game moves that category into this round's slot.
   */
  const triggerSpin = useCallback(
    (velocity: number) => {
      if (isSpinning) return;

      // A respin: the last landing is off the table until this one stops.
      setWinningCategory(null);
      setIsSpinning(true);
      // Hold the slices still for the rest of this round. Landing rewrites the
      // list they come from, and a wheel that re-labels itself mid-spin is a
      // wheel that lies about where it stopped.
      setLockedSlices(activeCategories);
      // The broadcast window has no wheel of its own; this is what puts the
      // room on a suspense screen while the host spins.
      beginWheelSpin();

      const { finalRotation, landedIndex } = planSpin(
        rotationRef.current,
        velocity,
        sliceCount,
      );

      rotationRef.current = finalRotation;
      setRotation(finalRotation);

      // Read the result off the wheel once it has come to rest. Announcing it
      // any earlier would be the old behaviour wearing a different hat.
      setTimeout(() => {
        setIsSpinning(false);
        const landed = activeCategories[landedIndex] ?? null;
        setWinningCategory(landed);
        // The room sees the category the moment the wheel stops, rather than
        // sitting on the spinning screen until the host presses START ROUND.
        // By id as well as index: on a respin the slices on screen are still
        // in the order they had before the first landing reshuffled the game.
        revealCategory(landedIndex, landed?.id);
      }, SPIN_MS);
    },
    [
      isSpinning,
      activeCategories,
      sliceCount,
      beginWheelSpin,
      revealCategory,
    ],
  );

  // Handle drag end - trigger spin if velocity threshold met
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const velocity = Math.abs(velocityRef.current);

    if (velocity >= MIN_SPIN_VELOCITY) {
      triggerSpin(velocity);
    } else if (velocity > 0) {
      // Below threshold - gentle deceleration back to rest
      animateDeceleration();
    }
  }, [isDragging, triggerSpin]);

  // Button path: always available to the host, so a weak flick, a trackpad, or
  // a touchscreen can never leave the game stuck on category selection.
  const handleSpinClick = () => {
    triggerSpin(MIN_SPIN_VELOCITY * 4);
  };

  // Animate deceleration for sub-threshold spins
  const animateDeceleration = useCallback(() => {
    const animate = () => {
      velocityRef.current *= FRICTION;

      if (Math.abs(velocityRef.current) < STOP_THRESHOLD) {
        velocityRef.current = 0;
        animationFrameRef.current = null;
        return;
      }

      rotationRef.current += velocityRef.current * 0.016; // ~60fps
      setRotation(rotationRef.current);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    },
    [handleDragMove],
  );

  const handleMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleDragMove],
  );

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Attach global mouse/touch event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    isDragging,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // A new round is a new wheel. Both screens that show this unmount it between
  // rounds, so this is a belt to that braces — but a stale lock would draw the
  // last round's categories, which is exactly the lie this is here to prevent.
  useEffect(() => {
    setLockedSlices(null);
    setWinningCategory(null);
  }, [currentRound]);

  const handleContinue = () => {
    if (winningCategory) startRound();
  };

  // A spin eases to rest over its full three seconds; a drag follows the finger
  // exactly; anything else settles with just enough smoothing to not look rigid.
  const wheelTransition = isSpinning
    ? `transform ${SPIN_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
    : isDragging
      ? "none"
      : "transform 0.1s ease-out";

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-center mb-8">
        <div className="inline-block px-4 py-1 bg-slate-800 rounded-full text-neon-blue font-mono text-sm mb-2 border border-slate-700">
          ROUND {currentRound} OF {totalRounds}
        </div>
        <h2 className="text-3xl font-bold text-white neon-text mb-2">
          CATEGORY SELECTION
        </h2>
        <div className="flex items-center justify-center gap-2 text-slate-400">
          {isHost ? (
            <span className="text-neon-pink font-bold">
              {winningCategory
                ? "Category selected!"
                : isSpinning
                  ? "Spinning..."
                  : "Ready to reveal the category!"}
            </span>
          ) : (
            <span>Waiting for Host to spin...</span>
          )}
        </div>
      </div>

      <WheelFace
        categories={activeCategories}
        rotation={rotation}
        transition={wheelTransition}
        landed={winningCategory}
        cursor={
          isHost && !isSpinning ? (isDragging ? "grabbing" : "grab") : "default"
        }
        faceRef={wheelRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      />

      <div className="mt-12 min-h-[6rem] flex items-center justify-center w-full max-w-md">
        {winningCategory ? (
          <div className="flex flex-col items-center w-full">
            {/* Only the name bounces: buttons that move are buttons that get
                missed, and there are two of them now. */}
            <div className="text-xl font-bold mb-4 text-white animate-bounce-short">
              Category:{" "}
              <span className="text-neon-blue text-2xl ml-2">
                {winningCategory.name}
              </span>
            </div>
            {isHost && (
              <>
                <div className="flex w-full gap-3">
                  <Button
                    onClick={handleSpinClick}
                    variant="secondary"
                    className="flex items-center justify-center gap-2 shrink-0"
                  >
                    <RotateCcw size={18} /> RESPIN
                  </Button>
                  <Button
                    onClick={handleContinue}
                    variant="neon"
                    fullWidth
                    className="flex items-center justify-center gap-2"
                  >
                    START ROUND <ArrowRight size={20} />
                  </Button>
                </div>
                <div className="text-slate-500 text-xs text-center mt-2">
                  Not this one? Respin as many times as you like — nothing is
                  locked in until you start the round.
                </div>
              </>
            )}
          </div>
        ) : isHost ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <Button
              onClick={handleSpinClick}
              variant="neon"
              fullWidth
              disabled={isSpinning}
              className="flex items-center justify-center gap-2"
            >
              {isSpinning ? "SPINNING..." : "SPIN THE WHEEL"}
            </Button>
            <div className="text-slate-500 text-xs text-center">
              {isSpinning
                ? "The wheel is spinning..."
                : "Or flick the wheel with your mouse or finger."}
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-sm text-center">
            Waiting for Host...
          </div>
        )}
      </div>
    </div>
  );
};

export default Wheel;

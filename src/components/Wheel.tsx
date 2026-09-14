import React, { useState, useEffect, useRef, useCallback } from "react";
import { CATEGORIES } from "../constants";
import { useGame } from "../context/GameContext";
import { Category } from "../types";
import Button from "./Button";
import { ArrowRight } from "lucide-react";

// Minimum velocity (deg/s) required to trigger a spin by flicking. Kept low
// enough to be reachable with a trackpad or a touchscreen; the SPIN button is
// the guaranteed path regardless.
const MIN_SPIN_VELOCITY = 250;
// Friction applied during deceleration
const FRICTION = 0.985;
// Minimum velocity to stop animation
const STOP_THRESHOLD = 0.5;

/* ------------------------------------------------------------------ *
 * Slice geometry
 *
 * The slices used to be drawn with the classic CSS pie hack: a quadrant-sized
 * <div> rotated into place and then skewed by (90 - sliceAngle) degrees. That
 * trick only holds while a slice is narrower than a quadrant. A game with
 * three or fewer rounds puts the slice angle above 90deg, so `90 - angle` went
 * negative and the template literal emitted `skewY(--30deg)`. One malformed
 * function invalidates the *entire* transform declaration, which took the
 * rotate() that fans the slices out down with it: every slice stacked
 * unrotated in the same quadrant, and only the last one painted was visible.
 *
 * SVG arcs describe any slice from 1 to N exactly, with no angle ceiling, so
 * the wheel is drawn as paths instead.
 * ------------------------------------------------------------------ */

const VIEWBOX = 200;
const CENTER = VIEWBOX / 2;
const RADIUS = CENTER;
// Where the name and the icon sit along a slice's bisector. The name takes the
// outer position because a slice is widest there, which is what lets a long
// category name stay inside its own slice on a crowded wheel; the icon is
// compact enough to sit inboard of it.
const NAME_RADIUS = RADIUS * 0.8;
const ICON_RADIUS = RADIUS * 0.58;
// Below this the name stops being readable, so it gets truncated instead.
const MIN_NAME_SIZE = 4.5;
const MAX_NAME_SIZE = 12;
// Rough width of one uppercase character of a bold sans face, in ems.
const CHAR_WIDTH_EM = 0.6;
// Fraction of a slice's width the name is allowed to occupy, leaving a gutter
// so neighbouring slices never read as one run of text.
const NAME_FILL = 0.85;

// Degrees are measured clockwise from 12 o'clock, which is where the pointer
// sits. That makes slice N span [N * sliceAngle, (N + 1) * sliceAngle].
const pointOnCircle = (degrees: number, radius: number) => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
};

const slicePath = (startDeg: number, endDeg: number): string => {
  const start = pointOnCircle(startDeg, RADIUS);
  const end = pointOnCircle(endDeg, RADIUS);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    "Z",
  ].join(" ");
};

/* ------------------------------------------------------------------ *
 * Slice colour
 *
 * Category colours are stored as Tailwind utility classes because every other
 * surface (centre hub, review list, scoreboard) renders them as classes. SVG
 * needs a real fill, so the class is resolved to its palette value here.
 * ------------------------------------------------------------------ */

const TAILWIND_HUES: Record<string, Record<string, string>> = {
  red: { "400": "#f87171", "500": "#ef4444", "600": "#dc2626" },
  orange: { "400": "#fb923c", "500": "#f97316", "600": "#ea580c" },
  amber: { "400": "#fbbf24", "500": "#f59e0b", "600": "#d97706" },
  yellow: { "400": "#facc15", "500": "#eab308", "600": "#ca8a04" },
  lime: { "400": "#a3e635", "500": "#84cc16", "600": "#65a30d" },
  green: { "400": "#4ade80", "500": "#22c55e", "600": "#16a34a" },
  emerald: { "400": "#34d399", "500": "#10b981", "600": "#059669" },
  teal: { "400": "#2dd4bf", "500": "#14b8a6", "600": "#0d9488" },
  cyan: { "400": "#22d3ee", "500": "#06b6d4", "600": "#0891b2" },
  sky: { "400": "#38bdf8", "500": "#0ea5e9", "600": "#0284c7" },
  blue: { "400": "#60a5fa", "500": "#3b82f6", "600": "#2563eb" },
  indigo: { "400": "#818cf8", "500": "#6366f1", "600": "#4f46e5" },
  violet: { "400": "#a78bfa", "500": "#8b5cf6", "600": "#7c3aed" },
  purple: { "400": "#c084fc", "500": "#a855f7", "600": "#9333ea" },
  fuchsia: { "400": "#e879f9", "500": "#d946ef", "600": "#c026d3" },
  pink: { "400": "#f472b6", "500": "#ec4899", "600": "#db2777" },
  rose: { "400": "#fb7185", "500": "#f43f5e", "600": "#e11d48" },
};

// Used when a category carries no usable hue. Imported categories that aren't
// one of the built-ins all arrive as `bg-slate-500`, so resolving grey to grey
// would paint an entire wheel one flat colour; giving each slice a distinct
// colour by position keeps a custom question set readable.
const FALLBACK_SLICE_COLORS = [
  "#22c55e",
  "#eab308",
  "#3b82f6",
  "#ec4899",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#f59e0b",
];

const resolveSliceColor = (colorClass: string, index: number): string => {
  const match = /^bg-([a-z]+)-(\d{2,3})$/.exec(colorClass || "");
  if (match) {
    const shades = TAILWIND_HUES[match[1]];
    if (shades) return shades[match[2]] || shades["500"];
  }
  return FALLBACK_SLICE_COLORS[index % FALLBACK_SLICE_COLORS.length];
};

// Category names come from imported CSVs and can be any length, so they are cut
// to whatever still fits the slice at the smallest readable size.
const formatSliceName = (name: string, maxChars: number): string => {
  const upper = (name || "").toUpperCase();
  const limit = Math.max(4, Math.min(20, maxChars));
  return upper.length > limit ? `${upper.slice(0, limit - 1)}…` : upper;
};

// Chord of the wheel at `radius`, across one slice - the room a label has.
const chordAt = (radius: number, sliceAngle: number) =>
  2 * radius * Math.sin((Math.min(sliceAngle, 120) * Math.PI) / 360);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const Wheel: React.FC = () => {
  const {
    selectCategory,
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
  const [hasValidSpin, setHasValidSpin] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(0);
  const lastAngleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const rotationRef = useRef(0);

  // Get the target category for this round from config
  const targetCategoryConfig = roundsConfig[currentRound - 1];
  const targetCategory = targetCategoryConfig
    ? targetCategoryConfig.category
    : CATEGORIES[0];
  // The wheel must show the categories this game is actually playing. An
  // imported set is frequently not the built-in ten, and drawing the built-ins
  // regardless meant findIndex below returned -1 for any custom category — the
  // wheel then landed a slice off, pointing at one name while announcing
  // another. Fall back to the built-ins only before a game is configured.
  const activeCategories =
    roundsConfig.length > 0
      ? roundsConfig.map((round) => round.category)
      : CATEGORIES;

  const sliceCount = activeCategories.length;
  const sliceAngle = 360 / sliceCount;
  const nameWidth = chordAt(NAME_RADIUS, sliceAngle) * NAME_FILL;
  const iconSize = clamp(chordAt(ICON_RADIUS, sliceAngle) * 0.4, 9, 20);
  const maxNameChars = Math.floor(nameWidth / (CHAR_WIDTH_EM * MIN_NAME_SIZE));

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
      if (!isHost || winningCategory || isSpinning) return;

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
    [isHost, winningCategory, isSpinning, getAngleFromCenter],
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

  // Run the spin animation and land on this round's pre-generated category.
  const triggerSpin = useCallback(
    (velocity: number) => {
      if (winningCategory || isSpinning) return;

      setIsSpinning(true);
      setHasValidSpin(true);
      // The broadcast window has no wheel of its own; this is what puts the
      // room on a suspense screen while the host spins.
      beginWheelSpin();

      // Which slice to land on. The wheel draws one slice per configured
      // round, in round order, and selectCategory() deals the round's questions
      // from roundsConfig[currentRound - 1] regardless of the id it is handed —
      // so that index, not an id lookup, is what the pointer has to agree with.
      // Matching by id would also pick the wrong slice whenever a category
      // repeats, which a game with more rounds than categories does.
      const foundIndex =
        roundsConfig.length > 0
          ? currentRound - 1
          : activeCategories.findIndex((c) => c.id === targetCategory.id);
      const targetIndex = clamp(foundIndex, 0, sliceCount - 1);

      // Land the pointer on the middle of the slice rather than its leading
      // edge, which is where the old `-(index * sliceAngle)` left it: dead on
      // the boundary between two categories.
      const targetSliceRotation = -((targetIndex + 0.5) * sliceAngle);

      // Add extra spins based on velocity
      const spinMultiplier = Math.min(Math.floor(velocity / 400), 8);
      const extraSpins = 360 * (3 + spinMultiplier);

      // Calculate final rotation
      const currentNormalized = rotationRef.current % 360;
      const finalRotation =
        rotationRef.current -
        currentNormalized +
        extraSpins +
        targetSliceRotation;

      rotationRef.current = finalRotation;
      setRotation(finalRotation);

      // Set winning category after animation completes
      setTimeout(() => {
        setIsSpinning(false);
        setWinningCategory(targetCategory);
        // The room sees the category the moment the wheel stops, rather than
        // sitting on the spinning screen until the host presses START ROUND.
        revealCategory();
      }, 3000);
    },
    [
      winningCategory,
      isSpinning,
      activeCategories,
      targetCategory,
      roundsConfig,
      currentRound,
      sliceCount,
      sliceAngle,
      beginWheelSpin,
      revealCategory,
    ],
  );

  // Handle drag end - trigger spin if velocity threshold met
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const velocity = Math.abs(velocityRef.current);

    if (velocity >= MIN_SPIN_VELOCITY && !winningCategory) {
      triggerSpin(velocity);
    } else if (velocity > 0) {
      // Below threshold - gentle deceleration back to rest
      animateDeceleration();
    }
  }, [isDragging, winningCategory, triggerSpin]);

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

  const handleContinue = () => {
    if (winningCategory) {
      selectCategory(winningCategory.id);
    }
  };

  // Determine wheel cursor and transition style
  const wheelStyle: React.CSSProperties = {
    transform: `rotate(${rotation}deg)`,
    transition: isSpinning
      ? "transform 3s cubic-bezier(0.2, 0.8, 0.2, 1)"
      : isDragging
        ? "none"
        : "transform 0.1s ease-out",
    cursor:
      isHost && !winningCategory
        ? isDragging
          ? "grabbing"
          : "grab"
        : "default",
  };

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

      <div className="relative w-80 h-80 md:w-96 md:h-96 select-none">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-20 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[40px] border-t-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>

        {/* Wheel */}
        <div
          ref={wheelRef}
          className="w-full h-full rounded-full border-4 border-slate-700 relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          style={wheelStyle}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <svg
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            className="w-full h-full"
            role="img"
            aria-label={`Category wheel: ${activeCategories
              .map((cat) => cat.name)
              .join(", ")}`}
          >
            {activeCategories.map((cat, index) => {
              const startAngle = index * sliceAngle;
              const bisector = startAngle + sliceAngle / 2;
              const fill = resolveSliceColor(cat.color, index);
              const name = formatSliceName(cat.name, maxNameChars);
              // Shrink the name until it fits the slice it belongs to.
              const nameSize = clamp(
                nameWidth / (CHAR_WIDTH_EM * Math.max(name.length, 1)),
                MIN_NAME_SIZE,
                MAX_NAME_SIZE,
              );
              return (
                // Keyed by position as well as id: a game with more rounds
                // than categories reuses a category, and duplicate React keys
                // drop the repeated slices from the DOM entirely.
                <g key={`${cat.id}-${index}`}>
                  {sliceCount === 1 ? (
                    <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={fill} />
                  ) : (
                    <path
                      d={slicePath(startAngle, startAngle + sliceAngle)}
                      fill={fill}
                      stroke="#0f172a"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Rotating the label frame by the bisector puts the icon and
                      name on the slice's centre line — and because the wheel
                      lands on that same bisector, the winning label comes to
                      rest upright under the pointer. */}
                  <g transform={`rotate(${bisector} ${CENTER} ${CENTER})`}>
                    <text
                      x={CENTER}
                      y={CENTER - ICON_RADIUS}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={iconSize}
                    >
                      {cat.icon}
                    </text>
                    <text
                      x={CENTER}
                      y={CENTER - NAME_RADIUS}
                      textAnchor="middle"
                      fontSize={nameSize}
                      fontWeight={700}
                      fill="#ffffff"
                      stroke="rgba(15, 23, 42, 0.85)"
                      strokeWidth={nameSize * 0.22}
                      style={{ paintOrder: "stroke" }}
                    >
                      {name}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Center Hub */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-slate-900 rounded-full border-4 border-white z-10 flex items-center justify-center shadow-lg pointer-events-none">
          <div
            className={`w-16 h-16 rounded-full ${winningCategory ? winningCategory.color : "bg-neon-pink"} flex items-center justify-center transition-colors`}
          >
            {winningCategory && (
              <span className="text-2xl">{winningCategory.icon}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 h-24 flex items-center justify-center w-full max-w-md">
        {winningCategory ? (
          <div className="flex flex-col items-center animate-bounce-short w-full">
            <div className="text-xl font-bold mb-4 text-white">
              Category:{" "}
              <span className="text-neon-blue text-2xl ml-2">
                {winningCategory.name}
              </span>
            </div>
            {isHost && (
              <Button
                onClick={handleContinue}
                variant="neon"
                fullWidth
                className="flex items-center justify-center gap-2"
              >
                START ROUND <ArrowRight size={20} />
              </Button>
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

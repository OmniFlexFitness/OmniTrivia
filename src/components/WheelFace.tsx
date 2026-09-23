import React from "react";
import { Category } from "../types";

/**
 * The wheel itself: slices, pointer, hub. Nothing that decides anything.
 *
 * Slices carry an icon and a colour, never a name (see `Slices`).
 *
 * Three screens turn a wheel and only one of them owns it. The host's wheel is
 * flicked and its resting angle picks the round's category; the projector's
 * and every player's phone are watching that happen and are told the outcome
 * afterwards. They must draw the same object, so the drawing lives here on its
 * own and takes an angle rather than working one out.
 */

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
// Where the icon sits along a slice's bisector: out towards the rim, where a
// slice is widest, but clear of the hub.
const ICON_RADIUS = RADIUS * 0.66;
const MIN_ICON_SIZE = 10;
const MAX_ICON_SIZE = 34;

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

// Chord of the wheel at `radius`, across one slice - the room a label has.
const chordAt = (radius: number, sliceAngle: number) =>
  2 * radius * Math.sin((Math.min(sliceAngle, 120) * Math.PI) / 360);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * One fill per slice, with no two neighbours the same.
 *
 * Colour is half of what tells one slice from the next now the names are
 * gone, and two categories can share a hue. Deterministic, so every screen
 * drawing the same list paints the same wheel.
 */
const sliceFills = (categories: Category[]): string[] => {
  const fills = categories.map((cat, index) => resolveSliceColor(cat.color, index));
  if (fills.length < 2) return fills;

  for (let i = 0; i < fills.length; i++) {
    const prev = fills[(i - 1 + fills.length) % fills.length];
    const next = i === fills.length - 1 ? fills[0] : null;
    if (fills[i] !== prev && fills[i] !== next) continue;
    fills[i] =
      FALLBACK_SLICE_COLORS.find(
        (color) => color !== prev && color !== fills[(i + 1) % fills.length],
      ) ?? fills[i];
  }
  return fills;
};

/**
 * The slices, drawn once per category list.
 *
 * Icons and colours only — never the category's name. The wheel is the
 * suspense: a name on every slice lets the room read where the pointer is
 * heading before it gets there, and on a crowded wheel it was also the part
 * nobody could read. The name is announced once the wheel has stopped, by the
 * screen around it.
 *
 * Memoised because a wheel in flight is re-rendered on every animation frame
 * and none of this changes while it turns — only the angle of the box around
 * it does. Pass a stable array and a spinning wheel costs one style write a
 * frame instead of rebuilding its SVG nodes.
 */
const Slices = React.memo<{ categories: Category[] }>(({ categories }) => {
  const sliceCount = categories.length;
  const sliceAngle = 360 / sliceCount;
  const fills = sliceFills(categories);
  const iconSize = clamp(
    chordAt(ICON_RADIUS, sliceAngle) * 0.62,
    MIN_ICON_SIZE,
    MAX_ICON_SIZE,
  );

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      className="w-full h-full"
      role="img"
      // Counted, not named: a screen reader reading the slices out would be
      // the one way left to learn the categories before the spin.
      aria-label={`Category wheel with ${sliceCount} categor${sliceCount === 1 ? "y" : "ies"}`}
    >
      {categories.map((cat, index) => {
        const startAngle = index * sliceAngle;
        const bisector = startAngle + sliceAngle / 2;
        const fill = fills[index];
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
            {/* Rotating the icon's frame by the bisector puts it on the
                slice's centre line — and because the wheel lands on that same
                bisector, the winning icon comes to rest upright under the
                pointer. */}
            <g transform={`rotate(${bisector} ${CENTER} ${CENTER})`}>
              <text
                x={CENTER}
                y={CENTER - ICON_RADIUS}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={iconSize}
                style={{ filter: "drop-shadow(0 0 2px rgba(15, 23, 42, 0.9))" }}
              >
                {cat.icon}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
});
Slices.displayName = "Slices";

export interface WheelFaceProps {
  categories: Category[];
  /** Absolute rotation in degrees. Positive turns the slices clockwise. */
  rotation: number;
  /** CSS transition for that rotation. Omit for a wheel driven frame by frame. */
  transition?: string;
  /** Painted into the hub once the round's category is known. */
  landed?: Category | null;
  /** Sizing, since a phone, a desk and a projector all want different ones. */
  className?: string;
  cursor?: string;
  /** The rotating box, for the one wheel that is dragged rather than watched. */
  faceRef?: React.Ref<HTMLDivElement>;
  onMouseDown?: (event: React.MouseEvent) => void;
  onTouchStart?: (event: React.TouchEvent) => void;
}

const WheelFace: React.FC<WheelFaceProps> = ({
  categories,
  rotation,
  transition,
  landed = null,
  className = "w-80 h-80 md:w-96 md:h-96",
  cursor,
  faceRef,
  onMouseDown,
  onTouchStart,
}) => (
  <div className={`relative select-none ${className}`}>
    {/* Pointer */}
    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-20 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[40px] border-t-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>

    {/* Wheel */}
    <div
      ref={faceRef}
      className="w-full h-full rounded-full border-4 border-slate-700 relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
      style={{
        transform: `rotate(${rotation}deg)`,
        transition: transition ?? "none",
        cursor: cursor ?? "default",
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <Slices categories={categories} />
    </div>

    {/* Center Hub */}
    {/* Sized as a fraction of the wheel rather than in pixels: the same face is
        drawn at phone size, desk size and projector size. */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/5 h-1/5 bg-slate-900 rounded-full border-4 border-white z-10 flex items-center justify-center shadow-lg pointer-events-none">
      <div
        className={`w-4/5 h-4/5 rounded-full ${landed ? landed.color : "bg-neon-pink"} flex items-center justify-center transition-colors`}
      >
        {landed && <span className="text-2xl">{landed.icon}</span>}
      </div>
    </div>
  </div>
);

export default WheelFace;

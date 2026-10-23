import React from "react";
import { useTheme } from "../services/theme";

/**
 * Code Red's set dressing, laid over whichever screen this window is showing:
 * an alarm-red glow breathing around the edge, blood along the top, cobwebs in
 * the corners with a spider on a thread, bats crossing now and then, and red
 * mist on the floor.
 *
 * It is drawn once at the root of every kind of window — host, projector,
 * remote, phone — so every screen gets it without any of them knowing. It
 * takes no clicks and keeps to the edges; the styling and the motion are in
 * `index.html` (`.cr-*`), and all of the motion stops for anyone who has asked
 * their device for less of it.
 */

/**
 * Drips along the top edge: where each hangs (% across), how long it is and
 * how wide (px), and how far out of step it runs. Kept short so they stay in
 * the strip above every screen's header instead of running into it.
 */
const DRIPS: { x: number; length: number; width: number; delay: number }[] = [
  { x: 3, length: 18, width: 6, delay: 0 },
  { x: 9, length: 10, width: 4, delay: 2.4 },
  { x: 17, length: 26, width: 7, delay: 1.1 },
  { x: 26, length: 13, width: 5, delay: 4.2 },
  { x: 34, length: 21, width: 6, delay: 0.6 },
  { x: 43, length: 9, width: 4, delay: 3.3 },
  { x: 52, length: 24, width: 7, delay: 5.1 },
  { x: 60, length: 12, width: 5, delay: 1.8 },
  { x: 69, length: 19, width: 6, delay: 3.9 },
  { x: 77, length: 9, width: 4, delay: 0.3 },
  { x: 85, length: 25, width: 7, delay: 2.9 },
  { x: 94, length: 14, width: 5, delay: 4.8 },
];

/** One drip, drawn in its own box so it keeps its shape at any screen width. */
const DRIP_PATH = "M0 0 H10 C10 14 8.6 26 7.4 31 A3.6 3.6 0 1 1 2.6 31 C1.4 26 0 14 0 0 Z";

const BloodDrips: React.FC = () => (
  <div className="cr-drips" aria-hidden="true">
    <svg width="0" height="0" className="absolute">
      <defs>
        <linearGradient id="cr-blood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5c0008" />
          <stop offset="55%" stopColor="#b3001b" />
          <stop offset="100%" stopColor="#e0142e" />
        </linearGradient>
      </defs>
    </svg>
    {/* The band the drips run from, with a ragged lower edge. Stretching it
        to the width of the screen only stretches the raggedness. */}
    <svg className="cr-drip-band" viewBox="0 0 100 10" preserveAspectRatio="none">
      <path
        d="M0 0 H100 V5 C96 7 93 4 89 6 C85 8 82 5 78 6.5 C74 8 70 5 66 6 C62 7.5 58 4.5 54 6 C50 7.5 46 5 42 6.5 C38 8 34 5 30 6 C26 7 22 4.5 18 6 C14 7.5 10 5 6 6.5 C3 7.5 1 6 0 6 Z"
        fill="url(#cr-blood)"
      />
    </svg>
    {DRIPS.map((drip) => (
      <svg
        key={drip.x}
        className="cr-drip"
        viewBox="0 0 10 35"
        preserveAspectRatio="none"
        style={{
          left: `${drip.x}%`,
          width: `${drip.width}px`,
          height: `${drip.length}px`,
          animationDelay: `${drip.delay}s`,
        }}
      >
        <path d={DRIP_PATH} fill="url(#cr-blood)" />
      </svg>
    ))}
  </div>
);

/** A corner web: spokes out of the corner, and sagging rings across them. */
const Cobweb: React.FC<{ side: "left" | "right" }> = ({ side }) => {
  const spokes = [0, 15, 30, 45, 60, 75, 90];
  const rings = [28, 52, 78, 104, 130];
  const point = (angle: number, radius: number) => {
    const radians = (angle * Math.PI) / 180;
    return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
  };
  return (
    <svg
      className={`cr-web cr-web-${side}`}
      viewBox="0 0 150 150"
      fill="none"
      stroke="rgba(255, 235, 230, 0.75)"
      strokeWidth={0.9}
      aria-hidden="true"
    >
      {spokes.map((angle) => {
        const end = point(angle, 150);
        return <line key={angle} x1={0} y1={0} x2={end.x} y2={end.y} />;
      })}
      {rings.map((radius) => (
        <path
          key={radius}
          d={spokes
            .slice(1)
            .map((angle, i) => {
              const from = point(spokes[i], radius);
              const to = point(angle, radius);
              // Each thread sags back towards the corner between two spokes.
              const mid = point((spokes[i] + angle) / 2, radius * 0.86);
              return `${i === 0 ? `M${from.x} ${from.y}` : ""} Q${mid.x} ${mid.y} ${to.x} ${to.y}`;
            })
            .join(" ")}
        />
      ))}
    </svg>
  );
};

const Spider: React.FC = () => (
  <div className="cr-spider" aria-hidden="true">
    {/* The thread runs up off the top of the screen, so it is always there
        however far down the spider has let itself. */}
    <span
      className="absolute left-1/2 -translate-x-1/2 w-px"
      style={{ bottom: "60%", height: "60vh", background: "rgba(255, 235, 230, 0.45)" }}
    />
    <svg viewBox="0 0 40 40" className="relative block w-full" style={{ marginTop: "clamp(46px, 7vw, 110px)" }}>
      <g stroke="#1a0204" strokeWidth={2.2} strokeLinecap="round" fill="none">
        <path d="M14 18 Q6 12 3 4" />
        <path d="M13 21 Q4 19 1 12" />
        <path d="M13 24 Q4 27 2 35" />
        <path d="M15 27 Q9 33 8 39" />
        <path d="M26 18 Q34 12 37 4" />
        <path d="M27 21 Q36 19 39 12" />
        <path d="M27 24 Q36 27 38 35" />
        <path d="M25 27 Q31 33 32 39" />
      </g>
      <ellipse cx={20} cy={25} rx={8} ry={9} fill="#1a0204" stroke="#ff2d3d" strokeWidth={0.8} />
      <circle cx={20} cy={15} r={5} fill="#1a0204" stroke="#ff2d3d" strokeWidth={0.8} />
      <circle cx={18.2} cy={14.4} r={1.1} fill="#ff2d3d" />
      <circle cx={21.8} cy={14.4} r={1.1} fill="#ff2d3d" />
      {/* An hourglass on its back, because of course it is. */}
      <path d="M18 22 L22 22 L20 25 L22 28 L18 28 L20 25 Z" fill="#ff2d3d" />
    </svg>
  </div>
);

/** Bats in flight: when each leaves, how fast, and how high it flies. */
const BATS: { delay: number; duration: number; top: string }[] = [
  { delay: 0, duration: 22, top: "8vh" },
  { delay: 7, duration: 26, top: "2vh" },
  { delay: 15, duration: 19, top: "14vh" },
];

const Bat: React.FC<{ delay: number; duration: number; top: string }> = ({ delay, duration, top }) => (
  <div
    className="cr-bat"
    style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s`, top }}
    aria-hidden="true"
  >
    <svg viewBox="0 0 64 32">
      <path
        d="M32 10 C30 6 28 6 27 9 C22 4 12 3 2 8 C8 10 10 14 9 18 C13 15 18 16 20 20 C23 16 27 16 29 19 L32 23 L35 19 C37 16 41 16 44 20 C46 16 51 15 55 18 C54 14 56 10 62 8 C52 3 42 4 37 9 C36 6 34 6 32 10 Z"
        fill="#2a0408"
        stroke="#ff2d3d"
        strokeWidth={0.8}
      />
      <circle cx={30.5} cy={12} r={0.9} fill="#ff4d4d" />
      <circle cx={33.5} cy={12} r={0.9} fill="#ff4d4d" />
    </svg>
  </div>
);

const HalloweenDecor: React.FC = () => {
  const theme = useTheme();
  if (theme !== "code-red") return null;

  return (
    <div className="cr-decor" aria-hidden="true">
      <div className="cr-vignette" />
      <div className="cr-fog" />
      {BATS.map((bat) => (
        <Bat key={bat.delay} {...bat} />
      ))}
      <Cobweb side="left" />
      <Cobweb side="right" />
      <Spider />
      <BloodDrips />
    </div>
  );
};

export default HalloweenDecor;

import React from "react";

/**
 * The neon-noir pieces a question is drawn with, on every screen that shows
 * one: a player's phone, the host's own seat, and the projector.
 *
 * They live together so a question looks like the same object wherever it is
 * — the same panel, the same colour for option B on the phone in your hand and
 * on the wall. The styling itself is in `index.html` (`.cyber-*`), because the
 * clipped corners, scanlines and per-option accents are plain CSS that
 * Tailwind's utility classes would only make harder to read.
 *
 * Colour never carries a verdict here. An accent is which option it is, not
 * whether it was right: nobody is told that until their match is over.
 */

export interface OptionAccent {
  hex: string;
  /** For rgba() — the CSS reads `--accent-rgb`. */
  rgb: string;
}

/** A, B, C, D, E, F — each its own neon, readable on near-black. */
export const OPTION_ACCENTS: OptionAccent[] = [
  { hex: "#00f0ff", rgb: "0, 240, 255" }, // cyan
  { hex: "#ff2bd6", rgb: "255, 43, 214" }, // magenta
  { hex: "#f5ff3b", rgb: "245, 255, 59" }, // acid yellow
  { hex: "#39ff88", rgb: "57, 255, 136" }, // green
  { hex: "#ff8a00", rgb: "255, 138, 0" }, // orange
  { hex: "#a855ff", rgb: "168, 85, 255" }, // violet
];

export const CHOICE_KEYS = ["A", "B", "C", "D", "E", "F"];

/** The CSS custom properties that colour one option. */
export const accentStyle = (index: number): React.CSSProperties =>
  ({
    "--accent": OPTION_ACCENTS[index % OPTION_ACCENTS.length].hex,
    "--accent-rgb": OPTION_ACCENTS[index % OPTION_ACCENTS.length].rgb,
  }) as React.CSSProperties;

type PanelSize = "phone" | "desk" | "room";

const TEXT_SIZE: Record<PanelSize, string> = {
  phone: "text-xl sm:text-2xl leading-snug",
  desk: "text-2xl md:text-4xl leading-tight",
  room: "text-4xl md:text-6xl leading-tight",
};

const PAD: Record<PanelSize, string> = {
  phone: "px-5 py-5",
  desk: "px-8 py-8",
  room: "px-10 py-9",
};

/**
 * The question itself, in its panel: a HUD strip saying where in the round it
 * sits, then the wording at full contrast.
 */
export const QuestionPanel: React.FC<{
  text: string;
  /** 1-based. Omitted, the HUD strip shows only what it is given. */
  number?: number;
  total?: number;
  category?: string | null;
  size?: PanelSize;
  className?: string;
}> = ({ text, number, total, category, size = "phone", className = "" }) => {
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    <div className={`cyber-panel ${PAD[size]} ${className}`}>
      {(number !== undefined || category) && (
        <div
          className={`cyber-hud flex items-center justify-between gap-3 mb-3 ${
            size === "room" ? "text-sm" : "text-[10px] sm:text-[11px]"
          }`}
        >
          {number !== undefined ? (
            <span className="text-[#00f0ff]">
              Q{pad(number)}
              {total ? <span className="text-slate-500"> / {pad(total)}</span> : null}
            </span>
          ) : (
            <span />
          )}
          {category && (
            <span className="text-[#ff2bd6] truncate">// {category}</span>
          )}
        </div>
      )}
      <h1 className={`cyber-question text-center ${TEXT_SIZE[size]}`}>{text}</h1>
    </div>
  );
};

/**
 * A player's own clock, as a bar with the seconds beside it. Turns hot in the
 * last five seconds.
 */
export const CyberTimer: React.FC<{
  timeLeft: number;
  duration: number;
  paused?: boolean;
  size?: "sm" | "lg";
  className?: string;
}> = ({ timeLeft, duration, paused = false, size = "sm", className = "" }) => {
  const fraction = Math.max(0, Math.min(1, duration ? timeLeft / duration : 0));
  const urgent = timeLeft <= 5;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`cyber-timer flex-1 ${size === "lg" ? "h-4" : "h-2.5"}`}>
        <div
          className={`cyber-timer-fill ${urgent ? "is-urgent" : ""}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span
        className={`cyber-hud tabular-nums shrink-0 text-right ${
          size === "lg" ? "text-lg w-16" : "text-xs w-10"
        } ${urgent ? "text-[#ff3b3b] animate-pulse" : "text-[#00f0ff]"}`}
      >
        {paused ? "II" : `${Math.max(0, timeLeft)}s`}
      </span>
    </div>
  );
};

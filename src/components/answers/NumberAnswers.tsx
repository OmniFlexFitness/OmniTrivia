import React, { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Answer } from "../../types";
import { formatNumber } from "../../services/questionTypes";
import {
  RANGE_FULL_WIDTH,
  RANGE_MAX_WIDTH,
  RANGE_MIN_CREDIT,
  readNumber,
} from "../../services/scoring";
import { AnswerProps, LockButton, MarginChip } from "./shared";

/**
 * The answers that are a number: a slider, a range you bracket, and a plain
 * closest-guess. Plus the strip the answer key draws them on.
 */

/**
 * The HUD font is set in capitals, which is right for labels and wrong for a
 * unit: "8,849 M" is megametres.
 */
export const KEEP_CASE: React.CSSProperties = { textTransform: "none" };

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/** How many decimals a step has, so 0.1 + 0.2 shows as 0.3. */
const decimalsOf = (step: number): number => (String(step).split(".")[1] ?? "").length;

/** A slider's scale off the published options: [min, max, step]. */
const scaleOf = (options: string[]) => {
  const [min, max, rawStep] = options.map(Number);
  const step = rawStep > 0 ? rawStep : 1;
  const places = decimalsOf(step);
  const snap = (value: number): number =>
    Number(clamp(Math.round((value - min) / step) * step + min, min, max).toFixed(places));
  return { min, max, step, snap };
};

/* ------------------------------------------------------------------ *
 * Slider
 * ------------------------------------------------------------------ */

/**
 * One value on a scale. It starts in the middle rather than at the bottom, so
 * nobody's guess is pulled toward the low end by where the handle happened
 * to sit, and the ± buttons nudge a step at a time — a fingertip on a long
 * scale cannot land on 1969 by itself.
 */
export const SliderAnswer: React.FC<AnswerProps> = ({ question, onSubmit, isSubmitted, compact = false }) => {
  const { min, max, step, snap } = scaleOf(question.options);
  const [value, setValue] = useState(() => snap((min + max) / 2));
  const nudge = (direction: 1 | -1) => setValue((current) => snap(current + direction * step));

  return (
    <div className="flex flex-col items-center gap-5">
      <MarginChip margin={question.margin} type={question.type} />
      <div
        className={`cyber-hud font-black text-[#00f0ff] text-neon-shadow tracking-normal tabular-nums ${
          compact ? "text-5xl" : "text-6xl"
        }`}
        style={KEEP_CASE}
      >
        {formatNumber(value, question.unit)}
      </div>
      <div className="w-full max-w-xl flex items-center gap-3">
        <NudgeButton label="Down a step" onClick={() => nudge(-1)} disabled={isSubmitted}>
          <Minus size={18} />
        </NudgeButton>
        <div className="flex-1">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => setValue(snap(Number(event.target.value)))}
            disabled={isSubmitted}
            aria-label="Your answer"
            className="w-full h-4 bg-slate-800 rounded-full appearance-none cursor-pointer accent-neon-blue disabled:accent-slate-600"
          />
          <div className="cyber-hud flex justify-between mt-2 text-xs text-slate-500 tracking-normal">
            <span>{formatNumber(min)}</span>
            <span>{formatNumber(max)}</span>
          </div>
        </div>
        <NudgeButton label="Up a step" onClick={() => nudge(1)} disabled={isSubmitted}>
          <Plus size={18} />
        </NudgeButton>
      </div>
      {!isSubmitted && <LockButton compact={compact} onClick={() => onSubmit(value)} />}
    </div>
  );
};

const NudgeButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center border-2 border-[#00e5ff]/70 text-[#00e5ff] bg-[#070817] shadow-[0_0_10px_rgba(0,229,255,0.3)] active:scale-95 disabled:opacity-40"
  >
    {children}
  </button>
);

/* ------------------------------------------------------------------ *
 * Range
 * ------------------------------------------------------------------ */

/** What a range of this width earns if it catches the answer, 0–1. */
export const rangePayout = (width: number): number =>
  width <= RANGE_FULL_WIDTH
    ? 1
    : width > RANGE_MAX_WIDTH
      ? 0
      : 1 - ((1 - RANGE_MIN_CREDIT) * (width - RANGE_FULL_WIDTH)) / (RANGE_MAX_WIDTH - RANGE_FULL_WIDTH);

/**
 * Two handles, and the answer has to land between them. The meter under it
 * says what the range is worth if it does — worked out from its width alone,
 * so it tells the player about their own bet and nothing about the answer.
 */
export const RangeAnswer: React.FC<AnswerProps> = ({ question, onSubmit, isSubmitted, compact = false }) => {
  const { min, max, step, snap } = scaleOf(question.options);
  const span = max - min || 1;
  const [ends, setEnds] = useState<[number, number]>(() => [
    snap(min + span * 0.3),
    snap(min + span * 0.7),
  ]);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<0 | 1 | null>(null);

  const valueAt = (clientX: number): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    return snap(min + ((clientX - rect.left) / rect.width) * span);
  };

  const place = (handle: 0 | 1, value: number) => {
    setEnds((current) => {
      const next: [number, number] = [...current];
      next[handle] = value;
      // Dragging one handle past the other swaps which one it is.
      if (next[0] > next[1]) {
        dragging.current = handle === 0 ? 1 : 0;
        return [next[1], next[0]];
      }
      return next;
    });
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (isSubmitted) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const value = valueAt(event.clientX);
    const handle: 0 | 1 = Math.abs(value - ends[0]) <= Math.abs(value - ends[1]) ? 0 : 1;
    dragging.current = handle;
    place(handle, value);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (dragging.current === null || isSubmitted) return;
    place(dragging.current, valueAt(event.clientX));
  };
  const onPointerUp = () => {
    dragging.current = null;
  };

  const onKey = (handle: 0 | 1) => (event: React.KeyboardEvent) => {
    const by = event.key === "PageUp" || event.key === "PageDown" ? step * 10 : step;
    if (["ArrowRight", "ArrowUp", "PageUp"].includes(event.key)) place(handle, snap(ends[handle] + by));
    else if (["ArrowLeft", "ArrowDown", "PageDown"].includes(event.key)) place(handle, snap(ends[handle] - by));
    else return;
    event.preventDefault();
  };

  const at = (value: number) => `${((value - min) / span) * 100}%`;
  const width = (ends[1] - ends[0]) / span;
  const payout = rangePayout(width);

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className={`cyber-hud font-black text-[#00f0ff] text-neon-shadow tracking-normal tabular-nums text-center ${
          compact ? "text-3xl" : "text-5xl"
        }`}
        style={KEEP_CASE}
      >
        {formatNumber(ends[0])} <span className="text-slate-500">–</span> {formatNumber(ends[1], question.unit)}
      </div>

      <div className="w-full max-w-xl px-3">
        <div
          ref={trackRef}
          className={`relative h-12 ${isSubmitted ? "" : "cursor-pointer"}`}
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full bg-slate-800 border border-[#00e5ff]/30" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 rounded-full bg-gradient-to-r from-[#9d4dff] to-[#00e5ff] shadow-[0_0_14px_rgba(0,229,255,0.7)]"
            style={{ left: at(ends[0]), width: `calc(${at(ends[1])} - ${at(ends[0])})` }}
          />
          {([0, 1] as const).map((handle) => (
            <div
              key={handle}
              role="slider"
              tabIndex={isSubmitted ? -1 : 0}
              aria-label={handle === 0 ? "Low end of your range" : "High end of your range"}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={ends[handle]}
              onKeyDown={onKey(handle)}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#070817] border-[3px] border-[#00f0ff] shadow-[0_0_14px_rgba(0,240,255,0.85)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#00f0ff]/40"
              style={{ left: at(ends[handle]) }}
            />
          ))}
        </div>
        <div className="cyber-hud flex justify-between mt-1 text-xs text-slate-500 tracking-normal">
          <span>{formatNumber(min)}</span>
          <span>{formatNumber(max)}</span>
        </div>
      </div>

      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between cyber-hud text-[10px] tracking-[0.15em] mb-1">
          <span className="text-slate-400">If the answer is inside</span>
          <span className={payout > 0 ? "text-[#39ff88]" : "text-[#ff3b5c]"}>
            {payout > 0 ? `${Math.round(payout * 100)}% of the points` : "too wide to score"}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all ${payout > 0 ? "bg-[#39ff88]" : "bg-[#ff3b5c]"}`}
            style={{ width: `${Math.max(4, payout * 100)}%` }}
          />
        </div>
        <p className="text-center text-xs text-slate-500 mt-2">
          Tighter is worth more — miss the answer and it is worth nothing.
        </p>
      </div>

      {!isSubmitted && <LockButton compact={compact} label="LOCK IN THIS RANGE" onClick={() => onSubmit([...ends])} />}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Closest number
 * ------------------------------------------------------------------ */

/**
 * A number, typed, with no scale to hint at where it is. The preview shows it
 * back with its thousands separated, because 38400 and 384000 look alike on a
 * phone keyboard and are a long way apart.
 */
export const NumberAnswer: React.FC<AnswerProps> = ({ question, onSubmit, isSubmitted, compact = false }) => {
  const [text, setText] = useState("");
  const value = readNumber(text);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (value !== null) onSubmit(value);
  };

  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-4">
      <MarginChip margin={question.margin} type={question.type} />
      <div className="relative w-full max-w-md">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(event) => setText(event.target.value.replace(/[^\d.,\s-]/g, ""))}
          disabled={isSubmitted}
          placeholder="Your best guess"
          autoComplete="off"
          aria-label="Your answer, as a number"
          className={`cyber-input w-full text-center p-4 tabular-nums ${compact ? "text-2xl" : "text-3xl"} ${
            question.unit ? "pr-20" : ""
          }`}
        />
        {question.unit && (
          <span className="cyber-hud absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 tracking-normal" style={KEEP_CASE}>
            {question.unit}
          </span>
        )}
      </div>
      <div className="h-6 cyber-hud text-sm text-[#00f0ff] tracking-normal" style={KEEP_CASE}>
        {value !== null ? formatNumber(value, question.unit) : ""}
      </div>
      {!isSubmitted && <LockButton compact={compact} disabled={value === null} label="LOCK IN GUESS" onClick={() => value !== null && onSubmit(value)} />}
    </form>
  );
};

/* ------------------------------------------------------------------ *
 * The strip the answer key draws numbers on
 * ------------------------------------------------------------------ */

/**
 * The right band, and where every guess landed: dots for single numbers,
 * bars for ranges, the viewer's own in cyan. A closest-number question has
 * no scale of its own, so one is made from the answer and the guesses.
 */
export const NumberStrip: React.FC<{
  band: [number, number];
  scale?: [number, number] | null;
  responses?: Answer[];
  mine?: Answer | null;
  unit?: string;
  size?: "phone" | "room";
}> = ({ band, scale = null, responses = [], mine = null, unit, size = "phone" }) => {
  const asValue = (answer: Answer | null): number | [number, number] | null => {
    if (answer === null || answer === undefined) return null;
    if (Array.isArray(answer) && answer.length === 2 && answer.every((v) => typeof v === "number")) {
      const [a, b] = answer as number[];
      return [Math.min(a, b), Math.max(a, b)];
    }
    return readNumber(answer as unknown);
  };
  const values = responses.map(asValue).filter((v): v is number | [number, number] => v !== null);
  const own = asValue(mine);

  let [low, high] = scale ?? [Infinity, -Infinity];
  if (!scale) {
    const all = [band[0], band[1], ...values.flatMap((v) => (Array.isArray(v) ? v : [v]))];
    low = Math.min(...all);
    high = Math.max(...all);
    const pad = (high - low || Math.abs(high) || 1) * 0.12;
    low -= pad;
    high += pad;
  }
  const span = high - low || 1;
  const at = (value: number) => `${clamp(((value - low) / span) * 100, 0, 100)}%`;
  const rows = values.filter(Array.isArray).length;

  return (
    <div className={size === "room" ? "py-3" : "py-2"}>
      <div className="relative" style={{ height: `${(size === "room" ? 34 : 26) + rows * 7}px` }}>
        <div className="absolute inset-x-0 top-3 h-2 rounded-full bg-slate-800" />
        <div
          className="absolute top-1.5 h-5 rounded-md bg-[#39ff88]/30 border-2 border-[#39ff88] shadow-[0_0_12px_rgba(57,255,136,0.5)]"
          style={{ left: at(band[0]), width: `max(8px, calc(${at(band[1])} - ${at(band[0])}))`, transform: "translateX(-4px)" }}
        />
        {values.map((value, i) =>
          Array.isArray(value) ? (
            <div
              key={i}
              className="absolute h-1 rounded-full bg-[#ff2bd6]/80"
              style={{
                left: at(value[0]),
                width: `calc(${at(value[1])} - ${at(value[0])})`,
                top: `${28 + values.slice(0, i).filter(Array.isArray).length * 7}px`,
              }}
            />
          ) : (
            <div
              key={i}
              className="absolute top-2.5 w-3 h-3 -translate-x-1/2 rounded-full bg-[#ff2bd6] border border-[#05060f]"
              style={{ left: at(value) }}
            />
          ),
        )}
        {own !== null &&
          (Array.isArray(own) ? (
            <div
              className="absolute top-0 h-8 border-x-[3px] border-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.8)]"
              style={{ left: at(own[0]), width: `calc(${at(own[1])} - ${at(own[0])})` }}
            />
          ) : (
            <div
              className="absolute top-0 w-1 h-8 -translate-x-1/2 rounded bg-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.9)]"
              style={{ left: at(own) }}
            />
          ))}
      </div>
      <div className={`cyber-hud flex justify-between text-slate-500 tracking-normal ${size === "room" ? "text-xs" : "text-[10px]"}`} style={KEEP_CASE}>
        <span>{formatNumber(Number(low.toPrecision(4)), unit)}</span>
        <span>{formatNumber(Number(high.toPrecision(4)), unit)}</span>
      </div>
    </div>
  );
};

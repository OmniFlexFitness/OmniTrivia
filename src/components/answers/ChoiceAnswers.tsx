import React, { useEffect, useState } from "react";
import { Check, CheckSquare, Lock, Square, X } from "lucide-react";
import { CHOICE_KEYS, accentStyle } from "../CyberQuestion";
import { AnswerProps, LockButton, isTypingTarget } from "./shared";
import Button from "../Button";

/**
 * The answers you pick: one option, true or false, every right option, or
 * a word you type.
 */

/** One option out of the list, locked in the moment it is tapped. */
export const MultipleChoiceAnswer: React.FC<AnswerProps> = ({
  question,
  onSubmit,
  isSubmitted,
  compact = false,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleSelect = (index: number) => {
    if (isSubmitted || selectedIndex !== null) return;
    setSelectedIndex(index);
    onSubmit(index);
  };

  return (
    <div className={`grid grid-cols-1 ${compact ? "sm:grid-cols-2 gap-2.5" : "md:grid-cols-2 gap-5"}`}>
      {question.options.map((option, index) => {
        const picked = isSubmitted && index === selectedIndex;
        const muted = isSubmitted && index !== selectedIndex;
        return (
          <button
            key={index}
            onClick={() => handleSelect(index)}
            disabled={isSubmitted}
            style={accentStyle(index)}
            className={`cyber-option ${picked ? "is-picked" : ""} ${muted ? "is-muted" : ""} ${
              compact ? "min-h-[3.5rem] px-3 py-3 gap-3" : "min-h-[5.5rem] px-5 py-5 gap-5"
            }`}
          >
            <span className={`cyber-option-key ${compact ? "w-8 h-8 text-sm" : "w-12 h-12 text-xl"}`}>
              {CHOICE_KEYS[index] ?? index + 1}
            </span>
            <span className={`flex-1 ${compact ? "text-base sm:text-lg" : "text-2xl"} leading-snug`}>
              {option}
            </span>
            {picked && <Lock size={compact ? 16 : 22} className="shrink-0 text-[var(--accent)]" />}
          </button>
        );
      })}
    </div>
  );
};

/**
 * True or false, as its own thing rather than a two-option multiple choice:
 * two big slabs a thumb cannot miss, a ✓ and a ✕ as well as the words, and
 * T / F (or ← / →) on a keyboard. Cyan and magenta, never green and red —
 * colour here says which button it is, not whether it was right.
 */
export const TrueFalseAnswer: React.FC<AnswerProps> = ({ onSubmit, isSubmitted, compact = false }) => {
  const [picked, setPicked] = useState<0 | 1 | null>(null);

  const choose = (index: 0 | 1) => {
    if (isSubmitted || picked !== null) return;
    setPicked(index);
    onSubmit(index);
  };

  useEffect(() => {
    if (isSubmitted || picked !== null) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "t" || key === "arrowleft") choose(0);
      if (key === "f" || key === "arrowright") choose(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const slab = (index: 0 | 1) => {
    const isTrue = index === 0;
    const chosen = picked === index;
    const muted = picked !== null && !chosen;
    const Icon = isTrue ? Check : X;
    return (
      <button
        type="button"
        onClick={() => choose(index)}
        disabled={isSubmitted || picked !== null}
        style={accentStyle(index)}
        aria-label={isTrue ? "True" : "False"}
        aria-keyshortcuts={isTrue ? "T" : "F"}
        className={`cyber-option flex-col justify-center gap-3 ${chosen ? "is-picked" : ""} ${muted ? "is-muted" : ""} ${
          compact ? "min-h-[9.5rem] py-5" : "min-h-[14rem] py-8"
        }`}
      >
        <span
          className={`flex items-center justify-center rounded-full border-[3px] border-current ${
            compact ? "w-16 h-16" : "w-24 h-24"
          }`}
        >
          <Icon size={compact ? 38 : 58} strokeWidth={3} />
        </span>
        <span className={`cyber-hud font-black ${compact ? "text-2xl" : "text-4xl"} tracking-[0.18em]`}>
          {isTrue ? "True" : "False"}
        </span>
        {!compact && !isSubmitted && (
          <span className="cyber-hud text-[10px] opacity-60 tracking-[0.2em]">press {isTrue ? "T" : "F"}</span>
        )}
      </button>
    );
  };

  return (
    <div className="relative grid grid-cols-2 gap-3 sm:gap-5">
      {slab(0)}
      {slab(1)}
      {/* The "or" between them, sitting on the seam. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-[#070817] border-2 border-[#9d4dff] text-white font-hud font-black italic shadow-[0_0_18px_rgba(157,77,255,0.6)] ${
          compact ? "w-10 h-10 text-xs" : "w-14 h-14 text-base"
        } ${picked !== null ? "opacity-0" : ""}`}
      >
        OR
      </span>
    </div>
  );
};

/**
 * Every right answer, ticked. Nobody is told how many there are — that is the
 * question — and a wrong tick cancels a right one, so ticking everything is
 * worth nothing.
 */
export const MultiSelectAnswer: React.FC<AnswerProps> = ({
  question,
  onSubmit,
  isSubmitted,
  compact = false,
}) => {
  const [picked, setPicked] = useState<number[]>([]);

  const toggle = (index: number) => {
    if (isSubmitted) return;
    setPicked((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="cyber-hud text-center text-[10px] sm:text-[11px] text-[#00f0ff]">
        Select all that apply · {picked.length} picked
      </div>
      <div className={`grid grid-cols-1 ${compact ? "sm:grid-cols-2 gap-2.5" : "md:grid-cols-2 gap-5"}`}>
        {question.options.map((option, index) => {
          const on = picked.includes(index);
          const Box = on ? CheckSquare : Square;
          return (
            <button
              key={index}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(index)}
              disabled={isSubmitted}
              style={accentStyle(index)}
              className={`cyber-option ${on ? "is-picked" : ""} ${isSubmitted && !on ? "is-muted" : ""} ${
                compact ? "min-h-[3.5rem] px-3 py-3 gap-3" : "min-h-[5.5rem] px-5 py-5 gap-5"
              }`}
            >
              <span className={`cyber-option-key ${compact ? "w-8 h-8 text-sm" : "w-12 h-12 text-xl"}`}>
                {CHOICE_KEYS[index] ?? index + 1}
              </span>
              <span className={`flex-1 ${compact ? "text-base sm:text-lg" : "text-2xl"} leading-snug`}>{option}</span>
              <Box size={compact ? 22 : 28} className="shrink-0" />
            </button>
          );
        })}
      </div>
      {!isSubmitted && (
        <div className="flex justify-center">
          <LockButton
            compact={compact}
            disabled={picked.length === 0}
            label={picked.length === 0 ? "PICK AT LEAST ONE" : `LOCK IN ${picked.length}`}
            onClick={() => onSubmit([...picked].sort((a, b) => a - b))}
          />
        </div>
      )}
    </div>
  );
};

/** Free text, matched against the spellings the host accepts. */
export const TypeAnswer: React.FC<AnswerProps> = ({ onSubmit, isSubmitted, compact = false }) => {
  const [answer, setAnswer] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (answer.trim()) onSubmit(answer);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
      <input
        type="text"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        disabled={isSubmitted}
        placeholder="Type your answer…"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={`cyber-input w-full max-w-lg text-center p-4 ${compact ? "text-xl" : "text-2xl"} ${isSubmitted ? "opacity-80" : ""}`}
      />
      {!isSubmitted && (
        <Button type="submit" variant="neon" disabled={!answer.trim()}>
          LOCK IT IN
        </Button>
      )}
    </form>
  );
};

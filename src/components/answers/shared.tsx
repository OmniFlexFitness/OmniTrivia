import React from "react";
import { Lock } from "lucide-react";
import { Answer, AnswerMargin, PublicQuestion } from "../../types";
import Button from "../Button";

/**
 * What every answer panel is handed.
 *
 * Always the *public* question — the one with its answer key taken out —
 * even on the host's own seat, where the full question is sitting in memory.
 * A panel that can only see what a phone sees cannot show the host anything
 * a phone would not.
 */
export interface AnswerProps {
  question: PublicQuestion;
  onSubmit: (answer: Answer) => void;
  isSubmitted: boolean;
  /** A phone, or the host's narrow seat beside their controls. */
  compact?: boolean;
}

/** The one button every multi-step answer ends on. */
export const LockButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}> = ({ onClick, disabled = false, label = "LOCK IT IN", compact = false }) => (
  <Button
    type="button"
    onClick={onClick}
    disabled={disabled}
    variant="neon"
    fullWidth={compact}
    className={`flex items-center justify-center gap-2 ${compact ? "h-14 text-lg" : "min-w-[16rem] text-lg"}`}
  >
    <Lock size={18} /> {label}
  </Button>
);

const MARGIN_WORDS: Record<AnswerMargin, string> = {
  none: "Exact answers only",
  low: "Close counts a little",
  medium: "Close counts",
  high: "Close counts a lot",
  maximum: "Every answer scores — closer scores more",
};

/** How forgiving the question is, said before anyone answers. */
export const MarginChip: React.FC<{ margin?: AnswerMargin; className?: string }> = ({
  margin,
  className = "",
}) =>
  margin ? (
    <span
      className={`cyber-hud inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] tracking-[0.15em] ${
        margin === "none"
          ? "border-slate-600 text-slate-400"
          : "border-[#f5ff3b]/60 text-[#f5ff3b] shadow-[0_0_10px_rgba(245,255,59,0.25)]"
      } ${className}`}
    >
      {MARGIN_WORDS[margin]}
    </span>
  ) : null;

/**
 * True when a key press belongs to a field someone is typing in, so a
 * keyboard shortcut does not steal it.
 */
export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

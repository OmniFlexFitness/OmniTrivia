import React from "react";
import { ListOrdered, Minus, Plus } from "lucide-react";
import { MAX_QUALIFYING_ROUNDS, WIN_MULTIPLIER } from "../constants";

/**
 * How many qualifying rounds come before the bracket.
 *
 * Shown on the setup screen and again in the lobby, beside the loser's
 * bracket switch — the two together are the shape of the night, and the
 * lobby's rounds-needed line counts both.
 */
const QualifyingRoundsControl: React.FC<{
  rounds: number;
  onChange: (rounds: number) => void;
  disabled?: boolean;
}> = ({ rounds, onChange, disabled = false }) => {
  const step = (by: number) =>
    onChange(Math.max(0, Math.min(MAX_QUALIFYING_ROUNDS, rounds + by)));

  return (
    <div
      className={`w-full flex items-center gap-3 rounded-lg border p-3 ${
        rounds > 0
          ? "border-cyan-400/60 bg-cyan-400/5"
          : "border-slate-600 bg-slate-900"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <ListOrdered
        size={20}
        className={rounds > 0 ? "text-cyan-300 shrink-0" : "text-slate-500 shrink-0"}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm uppercase tracking-wider text-slate-300">
          Qualifying rounds
        </span>
        <span className="block text-xs text-slate-500">
          {rounds > 0
            ? `Nobody goes out of the first ${rounds === 1 ? "round" : `${rounds} rounds`}. Beat your opponent and the round's points count ×${WIN_MULTIPLIER}; the totals seed the bracket.`
            : "None — the bracket starts in round one, drawn at random, and every loss counts."}
        </span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          aria-label="Fewer qualifying rounds"
          disabled={disabled || rounds <= 0}
          onClick={() => step(-1)}
          className="w-8 h-8 rounded border border-slate-600 text-slate-300 flex items-center justify-center hover:border-slate-400 disabled:opacity-30"
        >
          <Minus size={14} />
        </button>
        <span className="w-6 text-center font-mono text-lg text-white tabular-nums">
          {rounds}
        </span>
        <button
          type="button"
          aria-label="More qualifying rounds"
          disabled={disabled || rounds >= MAX_QUALIFYING_ROUNDS}
          onClick={() => step(1)}
          className="w-8 h-8 rounded border border-slate-600 text-slate-300 flex items-center justify-center hover:border-slate-400 disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

export default QualifyingRoundsControl;

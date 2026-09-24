import React from "react";
import { ShieldAlert } from "lucide-react";
import { roundsToDecide } from "../services/bracket";

/**
 * The switch between single and double elimination.
 *
 * Shown on the setup screen and again in the lobby — the lobby is where the
 * host finally knows how many people turned up, and so how many rounds a
 * loser's bracket is going to need. `players` turns that count on.
 */
const LosersBracketToggle: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** Players in the lobby, when there is one. */
  players?: number;
  /** Rounds loaded, to compare against what the bracket needs. */
  rounds?: number;
  disabled?: boolean;
}> = ({ enabled, onChange, players, rounds, disabled = false }) => {
  const needed =
    players !== undefined ? roundsToDecide(players, enabled) : null;
  const short = needed !== null && rounds !== undefined && needed > rounds;

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
          enabled
            ? "border-orange-400/70 bg-orange-500/10"
            : "border-slate-600 bg-slate-900 hover:border-slate-400"
        }`}
      >
        <ShieldAlert
          size={20}
          className={enabled ? "text-orange-300 shrink-0" : "text-slate-500 shrink-0"}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm uppercase tracking-wider text-slate-300">
            Loser's bracket
          </span>
          <span className="block text-xs text-slate-500">
            {enabled
              ? "Double elimination — lose once and you drop to the loser's bracket, lose twice and you're out."
              : "Single elimination — lose a matchup and you're out."}
          </span>
        </span>
        <span
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
            enabled ? "bg-orange-400" : "bg-slate-700"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      <p className={`text-xs mt-2 ${short ? "text-amber-300" : "text-slate-500"}`}>
        {needed === null
          ? "Both sides play every round on the same category, and the last player on each side meets in a grand final. It takes roughly twice as many rounds to settle — the lobby tells you exactly how many once people are in."
          : needed === 0
            ? "Needs at least two players to draw a bracket."
            : short
              ? `${players} players need up to ${needed} rounds to settle this bracket, and ${rounds} are loaded. If the rounds run out first, the leader still standing wins — unbeaten players ahead of the loser's bracket.`
              : `${players} players need up to ${needed} round${needed === 1 ? "" : "s"} to settle this bracket; ${rounds} are loaded.`}
      </p>
    </div>
  );
};

export default LosersBracketToggle;

import React from "react";
import { Repeat } from "lucide-react";
import { roundRobinRounds } from "../services/bracket";
import { WIN_MULTIPLIER } from "../constants";

/**
 * The switch between a bracket night and a round robin.
 *
 * Shown on the setup screen and again in the lobby, above the bracket's own
 * settings — on, it replaces the bracket altogether, so qualifying rounds and
 * the loser's bracket have nothing to apply to. In the lobby `players` turns
 * on the count of rounds it takes for everybody to meet everybody.
 */
const RoundRobinToggle: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** Players in the lobby, when there is one. */
  players?: number;
  /** Rounds loaded, to compare against what a full round robin needs. */
  rounds?: number;
  disabled?: boolean;
}> = ({ enabled, onChange, players, rounds, disabled = false }) => {
  const needed = players !== undefined ? roundRobinRounds(players) : null;
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
            ? "border-violet-400/70 bg-violet-500/10"
            : "border-slate-600 bg-slate-900 hover:border-slate-400"
        }`}
      >
        <Repeat
          size={20}
          className={enabled ? "text-violet-300 shrink-0" : "text-slate-500 shrink-0"}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm uppercase tracking-wider text-slate-300">
            Round robin
          </span>
          <span className="block text-xs text-slate-500">
            {enabled
              ? `No bracket — everybody plays everybody, nobody goes out, and the highest total wins. Beat your opponent and the round counts ×${WIN_MULTIPLIER}.`
              : "Off — the night is a bracket. Switch on to have everyone play everyone instead."}
          </span>
        </span>
        <span
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
            enabled ? "bg-violet-400" : "bg-slate-700"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      {enabled && (
        <p className={`text-xs mt-2 ${short ? "text-amber-300" : "text-slate-500"}`}>
          {needed === null
            ? "Everyone meets everyone in one round fewer than the number of players — one per player when the number is odd, since each sits one round out. The lobby gives the exact count."
            : needed === 0
              ? "Needs at least two players to pair anybody off."
              : short
                ? `${players} players need ${needed} rounds for everyone to play everyone, and ${rounds} are loaded — not everybody will meet. The highest total still wins, and you can end the game whenever you like.`
                : `${players} players need ${needed} round${needed === 1 ? "" : "s"} for everyone to play everyone; ${rounds} are loaded.${
                    rounds !== undefined && rounds > needed ? " The rounds after that are rematches." : ""
                  }`}
        </p>
      )}
    </div>
  );
};

export default RoundRobinToggle;

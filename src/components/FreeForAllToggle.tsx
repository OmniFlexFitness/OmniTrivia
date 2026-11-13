import React from "react";
import { Users } from "lucide-react";
import { PLACE_MULTIPLIERS } from "../constants";

/** "×1.5 / ×1.25 / ×1.1" — the placement bonus, as every screen words it. */
export const PLACE_MULTIPLIER_TEXT = PLACE_MULTIPLIERS.map((m) => `×${m}`).join(" / ");

/**
 * The switch for a free-for-all night: no opponents, every round ranked
 * across the whole room, the round's 1st, 2nd and 3rd paid a placement bonus,
 * and the highest total after the last round takes the night.
 *
 * Shown on the setup screen, in the lobby, and (as its own card) on the
 * remote — above every other format switch, because on it replaces them all:
 * a free-for-all has nobody to pair, so there is no bracket, no round robin,
 * no qualifying and no loser's bracket. The number of rounds is the
 * NUMBER OF ROUNDS slider: the night is exactly as long as the rounds loaded.
 */
const FreeForAllToggle: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** Rounds loaded, when there are some — the length of the night. */
  rounds?: number;
  disabled?: boolean;
}> = ({ enabled, onChange, rounds, disabled = false }) => (
  <div>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
        enabled
          ? "border-neon-purple/70 bg-neon-purple/10"
          : "border-slate-600 bg-slate-900 hover:border-slate-400"
      }`}
    >
      <Users
        size={20}
        className={enabled ? "text-neon-purple shrink-0" : "text-slate-500 shrink-0"}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm uppercase tracking-wider text-slate-300">
          Free-for-all
        </span>
        <span className="block text-xs text-slate-500">
          {enabled
            ? `No matchups — everyone plays against the whole room. After every round the leaderboard goes up, and that round's 1st, 2nd and 3rd count ${PLACE_MULTIPLIER_TEXT}. Highest total after the last round wins.`
            : "Off — players are paired off each round. Switch on to have everyone play against everyone at once, Kahoot style."}
        </span>
      </span>
      <span
        className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
          enabled ? "bg-neon-purple" : "bg-slate-700"
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
      <p className="text-xs mt-2 text-slate-500">
        {rounds !== undefined
          ? `${rounds} round${rounds === 1 ? "" : "s"} loaded — the game runs all of them and the highest total wins. END GAME stops it early on the totals so far.`
          : "The night lasts exactly the number of rounds set above. Nobody goes out, and anyone who joins late plays from the next round."}
      </p>
    )}
  </div>
);

export default FreeForAllToggle;

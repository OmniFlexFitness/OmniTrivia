import React from "react";
import { Bot } from "lucide-react";

/**
 * The switch for bots.
 *
 * Shown on the setup screen, in the lobby, and on round one's wheel — every
 * point up to the first round being dealt. `stage` changes what the caption
 * promises, because turning bots off means something different at each.
 */
const BotsToggle: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** How many bots are sitting in the game right now. */
  botCount?: number;
  stage?: "setup" | "lobby" | "first-round";
}> = ({ enabled, onChange, botCount = 0, stage = "setup" }) => {
  const caption = enabled
    ? stage === "first-round"
      ? botCount > 0
        ? `${botCount} bot${botCount === 1 ? "" : "s"} in the draw. Switch off to take them out and redraw round one.`
        : "No bots in this game — they can only join in the lobby."
      : "The lobby seats bots until there are three players, and ADD BOT adds more. Good for testing alone."
    : stage === "first-round"
      ? "Off — round one was drawn without bots."
      : "Off — only real players. No bots join, and ADD BOT is hidden.";

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Bots"
        onClick={() => onChange(!enabled)}
        className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
          enabled
            ? "border-neon-blue/60 bg-neon-blue/10"
            : "border-slate-600 bg-slate-900 hover:border-slate-400"
        }`}
      >
        <Bot size={20} className={enabled ? "text-neon-blue shrink-0" : "text-slate-500 shrink-0"} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm uppercase tracking-wider text-slate-300">
            Bots {enabled ? "on" : "off"}
          </span>
          <span className="block text-xs text-slate-500">{caption}</span>
        </span>
        <span
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
            enabled ? "bg-neon-blue" : "bg-slate-700"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
};

export default BotsToggle;

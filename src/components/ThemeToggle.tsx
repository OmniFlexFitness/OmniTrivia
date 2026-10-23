import React from "react";
import { Siren } from "lucide-react";
import { Theme } from "../services/theme";

/**
 * The host's switch for Code Red, the Halloween theme.
 *
 * Shown wherever the host already has their other switches — setup, the
 * lobby, the desk during the game, the remote — and open the whole night:
 * it is only how the screens look, so flipping it mid-round changes nothing
 * about the game. `compact` is the slim version for the home screen.
 */
const ThemeToggle: React.FC<{
  theme: Theme;
  onChange: (theme: Theme) => void;
  compact?: boolean;
}> = ({ theme, onChange, compact = false }) => {
  const on = theme === "code-red";
  const flip = () => onChange(on ? "neon" : "code-red");

  if (compact) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Code Red Halloween theme"
        onClick={flip}
        className={`flex items-center gap-2 text-xs font-mono uppercase tracking-widest transition-colors ${
          on ? "text-neon-blue" : "text-slate-500 hover:text-orange-400"
        }`}
      >
        <span aria-hidden="true">🎃</span> code red {on ? "on" : "off"}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Code Red Halloween theme"
        onClick={flip}
        className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
          on
            ? "border-neon-blue/60 bg-neon-blue/10"
            : "border-slate-600 bg-slate-900 hover:border-slate-400"
        }`}
      >
        <Siren size={20} className={on ? "text-neon-blue shrink-0" : "text-slate-500 shrink-0"} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm uppercase tracking-wider text-slate-300">
            🎃 Code Red {on ? "on" : "off"}
          </span>
          <span className="block text-xs text-slate-500">
            {on
              ? "Halloween on every screen — the big screen, the remote and every phone. Looks only; the game plays the same."
              : "Dress every screen for Halloween: blood red, cobwebs and bats. Switch it any time."}
          </span>
        </span>
        <span
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
            on ? "bg-neon-blue" : "bg-slate-700"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
              on ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
};

export default ThemeToggle;

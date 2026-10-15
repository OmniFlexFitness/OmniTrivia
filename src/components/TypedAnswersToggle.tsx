import React from "react";
import { Keyboard } from "lucide-react";

/**
 * The switch for typed answers.
 *
 * Off by default: most of a room does not enjoy spelling an answer out on a
 * phone keyboard, a typo is a wrong answer, and it is the slowest format on
 * the clock. One switch covers every way questions come in — Claude is not
 * asked to write them, and an imported file's or the bank's typed rows are
 * left out — so a host decides once, before any questions are loaded.
 */
const TypedAnswersToggle: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ enabled, onChange }) => (
  <div>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Typed answers"
      onClick={() => onChange(!enabled)}
      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
        enabled
          ? "border-yellow-400/60 bg-yellow-400/10"
          : "border-slate-600 bg-slate-900 hover:border-slate-400"
      }`}
    >
      <Keyboard size={20} className={enabled ? "text-yellow-300 shrink-0" : "text-slate-500 shrink-0"} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm uppercase tracking-wider text-slate-300">
          Typed answers {enabled ? "on" : "off"}
        </span>
        <span className="block text-xs text-slate-500">
          {enabled
            ? "Questions players spell out on their phone are in: Claude may write them, and an import's typed rows are kept."
            : "Off — nobody types an answer. Claude is not asked to write them, and typed rows in an import or the question bank are left out."}
        </span>
      </span>
      <span
        className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
          enabled ? "bg-yellow-400" : "bg-slate-700"
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

export default TypedAnswersToggle;

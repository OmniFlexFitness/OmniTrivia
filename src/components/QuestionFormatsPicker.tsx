import React from "react";
import { QuestionType } from "../types";
import { QUESTION_TYPES } from "../services/questionTypes";
import { ALL_FORMATS, isTypedFormat } from "../services/formatPreference";

/**
 * Which formats GENERATE & REVIEW writes questions in: a chip per format,
 * on by default. At least one stays on — a game written in no format is no
 * game at all.
 *
 * While typed answers are switched off their chips are not offered at all:
 * the switch above this picker is the one decision, and a chip that could
 * turn them back on behind it would be two.
 */
const QuestionFormatsPicker: React.FC<{
  selected: QuestionType[];
  onChange: (formats: QuestionType[]) => void;
  /** Whether typed-answer formats may be picked. */
  typedAnswers?: boolean;
}> = ({ selected, onChange, typedAnswers = true }) => {
  const offered = typedAnswers ? ALL_FORMATS : ALL_FORMATS.filter((t) => !isTypedFormat(t));
  const shown = selected.filter((t) => offered.includes(t));
  const toggle = (type: QuestionType) => {
    const on = selected.includes(type);
    if (on && shown.length === 1) return;
    onChange(on ? selected.filter((t) => t !== type) : ALL_FORMATS.filter((t) => t === type || selected.includes(t)));
  };
  const everything = offered.every((t) => selected.includes(t));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="block text-slate-400 text-sm uppercase tracking-wider">Question formats</label>
        <button
          type="button"
          onClick={() => onChange(everything ? [QuestionType.MULTIPLE_CHOICE, QuestionType.TRUE_FALSE] : offered)}
          className="text-[11px] font-mono uppercase tracking-widest text-slate-500 hover:text-neon-blue"
        >
          {everything ? "classic only" : "use them all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {offered.map((type) => {
          const info = QUESTION_TYPES[type];
          const on = selected.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              aria-pressed={on}
              title={info.prompt}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono uppercase tracking-wide border transition-colors ${
                on ? `${info.tone} border-current` : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}
            >
              {info.badge}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-2">
        What generated rounds are written in: mostly multiple choice and
        true/false, with the others rationed to a question or two a round. An
        import or the question bank plays whatever formats its rows use
        {typedAnswers ? "" : ", typed answers aside"}.
      </p>
    </div>
  );
};

export default QuestionFormatsPicker;

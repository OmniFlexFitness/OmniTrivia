import React from "react";
import { GraduationCap } from "lucide-react";
import {
  DIFFICULTY,
  DIFFICULTY_LEVELS,
  QuestionDifficulty,
} from "../services/difficulty";

/**
 * How hard GENERATE & REVIEW pitches its questions: three levels named for a
 * reader everybody can picture, high school in the middle and the default.
 * It only shapes what Claude writes — an import or the bank plays whatever
 * its rows hold.
 */
const DifficultyPicker: React.FC<{
  level: QuestionDifficulty;
  onChange: (level: QuestionDifficulty) => void;
}> = ({ level, onChange }) => (
  <div>
    <label className="flex items-center gap-2 text-slate-400 text-sm uppercase tracking-wider mb-2">
      <GraduationCap size={16} className="text-neon-blue" /> Question difficulty
    </label>
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Question difficulty">
      {DIFFICULTY_LEVELS.map((candidate) => {
        const on = candidate === level;
        return (
          <button
            key={candidate}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(candidate)}
            className={`rounded-lg border px-2 py-2 text-xs font-mono uppercase tracking-wide transition-colors ${
              on
                ? "border-neon-blue bg-neon-blue/10 text-neon-blue"
                : "border-slate-600 text-slate-400 hover:text-white hover:border-slate-400"
            }`}
          >
            {DIFFICULTY[candidate].label}
          </button>
        );
      })}
    </div>
    <p className="text-xs text-slate-500 mt-2">
      {DIFFICULTY[level].blurb} Only generated questions follow this — an
      import or the question bank plays whatever its rows hold.
    </p>
  </div>
);

export default DifficultyPicker;

import React, { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { GLOSSARY, GUIDES, GuideKey, SCORING_RULES } from "../content/instructions";

/**
 * The rules, on the screen they apply to.
 *
 * Every screen in the game carries one of these. A trivia night is run in
 * front of people who have not read anything, so "how does this work" has to
 * be answerable from the screen in front of them rather than from the host
 * shouting over a room.
 *
 * It starts closed, and remembers being opened, per screen. Open was the
 * original default, on the theory that a first-time player should meet the
 * explanation without asking for it — but on a phone this card is taller than
 * the screen it sits on, so the first thing everyone who scanned the QR code
 * actually did was close it to reach the form underneath. Closed, the header
 * still carries the title and the one line that says what the screen is for,
 * which is the part worth reading at a glance; the rest is one tap away and
 * stays open for that screen once someone has asked for it.
 */

const stateKey = (guide: GuideKey) => `omnitrivia:guide-closed:${guide}`;

/**
 * Whether this browser has an opinion about this guide, and what it is.
 *
 * `null` means it has never been touched here, which is what the default is
 * for. "1" is the value the earlier build wrote when the card was dismissed —
 * closed is now the default anyway, so it reads as "still closed" and nothing
 * has to be migrated.
 */
const wasOpened = (guide: GuideKey): boolean | null => {
  try {
    const value = window.localStorage.getItem(stateKey(guide));
    if (value === "0") return true;
    if (value === "1") return false;
    return null;
  } catch {
    return null;
  }
};

const remember = (guide: GuideKey, open: boolean): void => {
  try {
    window.localStorage.setItem(stateKey(guide), open ? "0" : "1");
  } catch {
    // Private mode. The card simply starts closed again next time.
  }
};

const Instructions: React.FC<{
  guide: GuideKey;
  /** Adds the scoring rules and the glossary — for the screens with room. */
  full?: boolean;
  className?: string;
}> = ({ guide, full = false, className = "" }) => {
  const [open, setOpen] = useState(() => wasOpened(guide) ?? false);
  const content = GUIDES[guide];

  const toggle = () => {
    setOpen((value) => {
      remember(guide, !value);
      return !value;
    });
  };

  return (
    <div
      className={`bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/70 transition-colors"
      >
        <HelpCircle size={18} className="text-neon-blue shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{content.title}</div>
          {!open && (
            <div className="text-xs text-slate-400 truncate">{content.lead}</div>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-slate-300">{content.lead}</p>

          <ul className="space-y-1.5">
            {content.points.map((point) => (
              <li key={point} className="flex gap-2 text-sm text-slate-400">
                <span className="text-neon-pink shrink-0">▸</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>

          {full && (
            <>
              <div className="pt-2 border-t border-slate-700/70">
                <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                  Scoring
                </div>
                <ul className="space-y-1.5">
                  {SCORING_RULES.map((rule) => (
                    <li key={rule} className="flex gap-2 text-sm text-slate-400">
                      <span className="text-neon-green shrink-0">▸</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-slate-700/70">
                <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                  The words this game uses
                </div>
                <dl className="space-y-2">
                  {GLOSSARY.map((entry) => (
                    <div key={entry.term}>
                      <dt className="text-sm font-bold text-white">
                        {entry.term}
                      </dt>
                      <dd className="text-sm text-slate-400">
                        {entry.definition}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Instructions;

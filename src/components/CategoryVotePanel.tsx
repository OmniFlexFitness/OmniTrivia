import React from "react";
import { PublicCategoryPoll } from "../types";
import { CheckCircle2, Vote } from "lucide-react";

/**
 * The end-of-round ballot: what should we play in future?
 *
 * The options are drawn once by the host and published, so this renders what
 * it is given rather than picking anything itself. That is the whole reason
 * the poll travels in the snapshot: every phone and the projector have to be
 * showing the same four categories, or a vote is four separate votes.
 *
 * Tallies are shown live and to everyone. This is a preference poll, not a
 * quiz question — there is nothing to spoil, and a room watching a bar climb
 * is a room that votes.
 */
const CategoryVotePanel: React.FC<{
  poll: PublicCategoryPoll;
  /** This player's pick, or null. Ignored when `readOnly`. */
  myVote?: string | null;
  onVote?: (categoryId: string) => void;
  /** The projector: shows the ballot, cannot cast anything. */
  readOnly?: boolean;
  /** The big screen wants this large; a phone does not. */
  size?: "md" | "lg";
  className?: string;
}> = ({
  poll,
  myVote = null,
  onVote,
  readOnly = false,
  size = "md",
  className = "",
}) => {
  const large = size === "lg";
  const leading = Math.max(0, ...poll.options.map((o) => poll.tallies[o.id] ?? 0));

  return (
    <div
      className={`bg-slate-900/70 border border-slate-700 rounded-2xl p-4 ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Vote size={large ? 22 : 16} className="text-neon-blue shrink-0" />
          <div>
            <div
              className={`font-black text-white ${large ? "text-2xl" : "text-sm"}`}
            >
              What should we play next?
            </div>
            <div
              className={`text-slate-400 ${large ? "text-base" : "text-[11px]"}`}
            >
              {readOnly
                ? "Vote on your phone — the same four options are on every screen."
                : "Pick one. You can change it while the round is on the results screen."}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={`font-mono font-black text-neon-green leading-none ${large ? "text-4xl" : "text-xl"}`}
          >
            {poll.totalVotes}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            {poll.totalVotes === 1 ? "vote" : "votes"}
          </div>
        </div>
      </div>

      <div className={`grid gap-2 ${large ? "md:grid-cols-2" : "grid-cols-1"}`}>
        {poll.options.map((option) => {
          const count = poll.tallies[option.id] ?? 0;
          const share = poll.totalVotes ? (count / poll.totalVotes) * 100 : 0;
          const mine = myVote === option.id;
          const winning = count > 0 && count === leading;

          return (
            <button
              key={option.id}
              type="button"
              disabled={readOnly || !onVote}
              onClick={() => onVote?.(option.id)}
              aria-pressed={mine}
              className={`relative overflow-hidden flex items-center gap-3 rounded-xl border text-left transition-all disabled:cursor-default ${
                large ? "p-4" : "p-3"
              } ${
                mine
                  ? "border-neon-green bg-neon-green/10"
                  : winning
                    ? "border-neon-blue/50 bg-slate-800"
                    : "border-slate-700 bg-slate-800/60"
              } ${readOnly || !onVote ? "" : "hover:border-neon-blue"}`}
            >
              {/* The share bar sits behind the label rather than beside it, so
                  a long category name never squeezes the bar into nothing. */}
              <div
                className="absolute inset-y-0 left-0 bg-neon-blue/10 transition-all duration-500"
                style={{ width: `${share}%` }}
              />
              <span className={`relative shrink-0 ${large ? "text-3xl" : "text-xl"}`}>
                {option.icon}
              </span>
              <span
                className={`relative flex-1 font-bold text-white truncate ${large ? "text-xl" : "text-sm"}`}
              >
                {option.name}
              </span>
              {mine && (
                <CheckCircle2
                  size={large ? 22 : 16}
                  className="relative text-neon-green shrink-0"
                />
              )}
              <span
                className={`relative font-mono font-black tabular-nums shrink-0 ${
                  count > 0 ? "text-neon-green" : "text-slate-600"
                } ${large ? "text-2xl" : "text-base"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryVotePanel;

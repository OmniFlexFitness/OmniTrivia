import React, { useMemo, useState } from "react";
import {
  CategoryInsight,
  clearCategoryInsights,
  insightsAsCsv,
  readCategoryInsights,
} from "../services/insights";
import Button from "./Button";
import Instructions from "./Instructions";
import { Download, Heart, Trash2, Vote, X } from "lucide-react";

/**
 * What the room keeps asking for, across every game hosted from this browser.
 *
 * Two columns and they are not the same question. **Likes** come from rounds
 * people have played — that round was good. **Votes** come from the
 * end-of-round ballot — we want that next. A category can be high on one and
 * low on the other, and knowing which is which is the difference between
 * writing more of what worked and writing what nobody has tried yet.
 */

type SortKey = "likes" | "votes" | "roundsPlayed";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "likes", label: "Most liked" },
  { key: "votes", label: "Most voted for" },
  { key: "roundsPlayed", label: "Most played" },
];

const Bar: React.FC<{ value: number; max: number; tone: string }> = ({
  value,
  max,
  tone,
}) => (
  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
    <div
      className={`h-full ${tone} transition-all duration-500`}
      style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
    />
  </div>
);

const InsightRow: React.FC<{
  insight: CategoryInsight;
  maxLikes: number;
  maxVotes: number;
}> = ({ insight, maxLikes, maxVotes }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
    <div className="flex items-center gap-3 mb-2">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 ${insight.color}`}
      >
        {insight.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-white truncate">{insight.name}</div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
          {insight.roundsPlayed} round{insight.roundsPlayed === 1 ? "" : "s"}{" "}
          played · offered on {insight.ballots} ballot
          {insight.ballots === 1 ? "" : "s"}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right">
          <div className="flex items-center gap-1 justify-end font-mono font-black text-neon-pink">
            <Heart size={13} className="fill-current" />
            {insight.likes}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-600">
            likes
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 justify-end font-mono font-black text-neon-blue">
            <Vote size={13} />
            {insight.votes}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-600">
            votes
          </div>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <Bar value={insight.likes} max={maxLikes} tone="bg-neon-pink" />
      <Bar value={insight.votes} max={maxVotes} tone="bg-neon-blue" />
    </div>
  </div>
);

const InsightsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [rows, setRows] = useState<CategoryInsight[]>(() =>
    readCategoryInsights(),
  );
  const [sort, setSort] = useState<SortKey>("likes");
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name),
      ),
    [rows, sort],
  );

  const maxLikes = Math.max(1, ...rows.map((row) => row.likes));
  const maxVotes = Math.max(1, ...rows.map((row) => row.votes));
  const totalLikes = rows.reduce((sum, row) => sum + row.likes, 0);
  const totalVotes = rows.reduce((sum, row) => sum + row.votes, 0);

  const download = () => {
    // A blob rather than a data: URL — a season of categories is more than
    // some browsers will follow in a URL bar.
    const blob = new Blob([insightsAsCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `omnitrivia-categories-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="max-w-3xl mx-auto my-6 bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-black text-white">CATEGORY DATA</h2>
            <p className="text-sm text-slate-400">
              {totalLikes} like{totalLikes === 1 ? "" : "s"} and {totalVotes}{" "}
              vote{totalVotes === 1 ? "" : "s"} across{" "}
              {rows.length} categor{rows.length === 1 ? "y" : "ies"}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white"
            title="Close"
          >
            <X />
          </button>
        </div>

        <Instructions guide="insights" className="mb-4" />

        {rows.length === 0 ? (
          <p className="text-center text-slate-500 py-12 text-sm">
            Nothing recorded yet. Likes come in during a round, votes at the end
            of one.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {SORTS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setSort(option.key)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono uppercase tracking-widest transition-colors ${
                    sort === option.key
                      ? "border-neon-blue text-neon-blue bg-neon-blue/10"
                      : "border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
              {sorted.map((insight) => (
                <InsightRow
                  key={insight.categoryId}
                  insight={insight}
                  maxLikes={maxLikes}
                  maxVotes={maxVotes}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex flex-wrap justify-between items-center gap-3 mt-5 pt-4 border-t border-slate-700">
          {confirmingWipe ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-red-300">
                Delete every like and vote recorded so far?
              </span>
              <button
                onClick={() => {
                  clearCategoryInsights();
                  setRows([]);
                  setConfirmingWipe(false);
                }}
                className="font-mono uppercase tracking-widest text-red-400 hover:text-red-300"
              >
                yes, wipe it
              </button>
              <button
                onClick={() => setConfirmingWipe(false)}
                className="font-mono uppercase tracking-widest text-slate-500 hover:text-white"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingWipe(true)}
              disabled={rows.length === 0}
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-600 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 size={14} /> clear the record
            </button>
          )}

          <div className="flex gap-2">
            <Button
              onClick={download}
              variant="secondary"
              disabled={rows.length === 0}
              className="flex items-center gap-2 py-2 text-sm"
            >
              <Download size={16} /> CSV
            </Button>
            <Button onClick={onClose} variant="secondary" className="py-2">
              DONE
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightsPanel;

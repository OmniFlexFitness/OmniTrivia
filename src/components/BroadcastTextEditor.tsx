import React, { useEffect, useState } from "react";
import { useGame } from "../context/GameContext";
import {
  DEFAULT_BROADCAST_SUBTITLE,
  DEFAULT_BROADCAST_TITLE,
  MAX_BROADCAST_SUBTITLE_LENGTH,
  MAX_BROADCAST_TITLE_LENGTH,
  renderBroadcastText,
} from "../services/broadcastText";
import { Check, RotateCcw, Tv } from "lucide-react";

/**
 * The words on the big screen while the room is joining: a headline and the
 * line under it.
 *
 * Edited as a draft and applied with a press, rather than live on every
 * keystroke — a host clearing the box to retype it should not see the
 * projector flash back to the default in front of the room halfway through.
 */
const BroadcastTextEditor: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { broadcastTitle, broadcastSubtitle, setBroadcastText } = useGame();
  const [title, setTitle] = useState(broadcastTitle);
  const [subtitle, setSubtitle] = useState(broadcastSubtitle);

  // Follow a change made somewhere else — a reset, or a game taken back.
  useEffect(() => setTitle(broadcastTitle), [broadcastTitle]);
  useEffect(() => setSubtitle(broadcastSubtitle), [broadcastSubtitle]);

  const dirty = title !== broadcastTitle || subtitle !== broadcastSubtitle;
  const isDefault =
    broadcastTitle === DEFAULT_BROADCAST_TITLE &&
    broadcastSubtitle === DEFAULT_BROADCAST_SUBTITLE;

  const apply = () => setBroadcastText({ title, subtitle });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      className="space-y-2"
    >
      {!compact && (
        <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
          <Tv size={14} className="text-neon-blue" /> Big screen text
        </div>
      )}

      <label className="block">
        <span className="block text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
          Headline
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_BROADCAST_TITLE_LENGTH}
          placeholder={DEFAULT_BROADCAST_TITLE}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-neon-blue outline-none"
        />
      </label>

      <label className="block">
        <span className="block text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
          Line under it
        </span>
        <input
          value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)}
          maxLength={MAX_BROADCAST_SUBTITLE_LENGTH}
          placeholder={DEFAULT_BROADCAST_SUBTITLE}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-neon-blue outline-none"
        />
      </label>

      <p className="text-[11px] text-slate-500 leading-snug">
        <span className="font-mono text-slate-400">{"{date}"}</span> becomes
        today's date. Shows as:{" "}
        <span className="text-slate-300">
          {renderBroadcastText(title, DEFAULT_BROADCAST_TITLE)} —{" "}
          {renderBroadcastText(subtitle, DEFAULT_BROADCAST_SUBTITLE)}
        </span>
      </p>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!dirty}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-neon-blue text-neon-blue text-xs font-bold uppercase tracking-widest py-2 disabled:opacity-40"
        >
          <Check size={14} /> Put it up
        </button>
        <button
          type="button"
          disabled={isDefault && !dirty}
          onClick={() => {
            setTitle(DEFAULT_BROADCAST_TITLE);
            setSubtitle(DEFAULT_BROADCAST_SUBTITLE);
            setBroadcastText({ title: "", subtitle: "" });
          }}
          title="Back to Trivia / Elevate with today's date"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 text-slate-400 hover:text-white text-xs uppercase tracking-widest px-3 py-2 disabled:opacity-40"
        >
          <RotateCcw size={14} /> Default
        </button>
      </div>
    </form>
  );
};

export default BroadcastTextEditor;

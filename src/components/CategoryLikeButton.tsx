import React from "react";
import { Heart } from "lucide-react";

/**
 * "More of this, please."
 *
 * A like is about a category a room has actually played, which is why it lives
 * on the playing screens rather than anywhere near the ballot: the ballot asks
 * what people think they want, a like says what they enjoyed once it was in
 * front of them. The host's category data keeps both, separately.
 *
 * Presentational on purpose — whether this player has liked it is read from
 * the host's state on the host's own screen and from the published snapshot on
 * a phone, and this component should not have to know which.
 */
const CategoryLikeButton: React.FC<{
  category: { id: string; name: string; icon: string };
  count: number;
  liked: boolean;
  onToggle: (liked: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}> = ({ category, count, liked, onToggle, disabled = false, compact = false, className = "" }) => (
  <button
    type="button"
    onClick={() => onToggle(!liked)}
    disabled={disabled}
    aria-pressed={liked}
    title={
      liked
        ? `You liked ${category.name}. Tap to take it back.`
        : `Tell the host you want more ${category.name}`
    }
    className={`group flex items-center gap-2 rounded-full border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
      compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
    } ${
      liked
        ? "border-neon-pink bg-neon-pink/15 text-neon-pink shadow-[0_0_14px_rgba(255,0,255,0.25)]"
        : "border-slate-700 bg-slate-900 text-slate-400 hover:border-neon-pink/60 hover:text-neon-pink"
    } ${className}`}
  >
    <Heart
      size={compact ? 14 : 16}
      className={`shrink-0 transition-transform group-active:scale-90 ${liked ? "fill-current" : ""}`}
    />
    <span className="font-bold truncate">
      {liked ? "Liked" : "Like"} {category.icon} {category.name}
    </span>
    {count > 0 && (
      <span className="font-mono font-black tabular-nums">{count}</span>
    )}
  </button>
);

export default CategoryLikeButton;

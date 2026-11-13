import React from "react";
import { BracketRound, PublicPlayer } from "../types";
import { PLACE_MULTIPLIERS } from "../constants";
import { roundPlacings } from "../services/bracket";
import AvatarDisplay from "./AvatarDisplay";

/**
 * One free-for-all round as a leaderboard: everybody who played it, best
 * round first, with the round's 1st, 2nd and 3rd marked and the placement
 * bonus each of them banked.
 *
 * This is the screen the format is built around — the moment between rounds
 * when the room finds out who took the round — so the projector, the host's
 * desk, the remote and every phone draw it from the same settled round.
 */

type PlacingsSize = "phone" | "desk" | "room";

/** The medal, colour and name of each paid place, 1st first. */
export const PLACE_STYLES = [
  { medal: "🥇", label: "1st", tone: "text-yellow-300", ring: "border-yellow-400/70 bg-yellow-400/10" },
  { medal: "🥈", label: "2nd", tone: "text-slate-200", ring: "border-slate-300/60 bg-slate-300/10" },
  { medal: "🥉", label: "3rd", tone: "text-orange-300", ring: "border-orange-400/60 bg-orange-400/10" },
] as const;

const RoundPlacings: React.FC<{
  round: BracketRound | undefined;
  players: PublicPlayer[];
  size?: PlacingsSize;
  /** Show only this many rows — the podium end of a long room. */
  limit?: number;
  /** A phone's own player: their row is picked out, and shown even past `limit`. */
  meId?: string | null;
}> = ({ round, players, size = "desk", limit, meId = null }) => {
  const rows = roundPlacings(round);
  if (rows.length === 0) return null;

  const room = size === "room";
  const phone = size === "phone";
  const byId = new Map(players.map((p) => [p.id, p]));

  // Standing positions as a race reads them: tied rows share a number.
  const positionOf = (index: number): number => {
    let i = index;
    while (i > 0 && rows[i - 1].points === rows[index].points) i -= 1;
    return i + 1;
  };

  const indexed = rows.map((row, index) => ({ row, position: positionOf(index) }));
  const visible =
    limit === undefined
      ? indexed
      : indexed.filter(
          ({ row }, index) => index < limit || (meId !== null && row.playerId === meId),
        );
  const hidden = indexed.length - visible.length;

  return (
    <div className={room ? "space-y-2" : "space-y-1.5"}>
      {visible.map(({ row, position }) => {
        const player = byId.get(row.playerId);
        const style = row.place ? PLACE_STYLES[row.place - 1] : null;
        const mine = meId !== null && row.playerId === meId;

        return (
          <div
            key={row.playerId}
            className={`flex items-center gap-3 rounded-xl border ${
              room ? "p-3" : "p-2"
            } ${
              style
                ? style.ring
                : mine
                  ? "border-neon-blue/60 bg-neon-blue/10"
                  : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <div
              className={`shrink-0 text-center font-black ${
                room ? "w-12 text-3xl" : "w-8 text-lg"
              } ${style ? style.tone : "text-slate-500"}`}
            >
              {style ? style.medal : `#${position}`}
            </div>
            <AvatarDisplay
              avatar={player?.avatar ?? "❔"}
              color={player?.avatarColor}
              accessory={player?.avatarAccessory}
              size={room ? "md" : "sm"}
            />
            <div className="flex-1 min-w-0">
              <div
                className={`font-bold truncate ${room ? "text-2xl" : phone ? "text-sm" : "text-base"} ${
                  mine ? "text-neon-blue" : "text-white"
                }`}
              >
                {player?.name ?? "Unknown"}
                {mine && (
                  <span className="ml-2 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                    you
                  </span>
                )}
              </div>
              {style && row.bonus > 0 && (
                <div
                  className={`font-mono uppercase tracking-widest ${style.tone} ${
                    room ? "text-xs" : "text-[10px]"
                  }`}
                >
                  {style.label} · ×{PLACE_MULTIPLIERS[row.place! - 1]} · +{row.bonus} bonus
                </div>
              )}
            </div>
            <div
              className={`shrink-0 text-right font-mono font-black ${
                room ? "text-3xl w-28" : "text-lg w-16"
              } ${style ? style.tone : "text-slate-400"}`}
            >
              {row.points}
            </div>
          </div>
        );
      })}
      {hidden > 0 && (
        <div className="text-center text-[10px] font-mono uppercase tracking-widest text-slate-500">
          + {hidden} more
        </div>
      )}
    </div>
  );
};

export default RoundPlacings;

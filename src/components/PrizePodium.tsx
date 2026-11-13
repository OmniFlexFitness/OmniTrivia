import React from "react";
import { Crown, Flame, Medal } from "lucide-react";
import { BracketRound } from "../types";
import {
  GameFormat,
  StandingLike,
  formatOfRounds,
  matchRecords,
  placeCounts,
  podium,
} from "../services/bracket";
import AvatarDisplay from "./AvatarDisplay";

/**
 * The night's three prize places — 1st, 2nd and 3rd — on whichever screen is
 * showing the end of the game. In a bracket game they are the champion, the
 * runner-up and the redemption winner; in a round robin or a free-for-all,
 * the top three totals.
 *
 * Worked out by `podium` from the bracket and the scores, so the projector,
 * the host's desk and every phone call the same three names — a host reading
 * the winners out should never have three screens that disagree.
 */

interface PodiumPlayer extends StandingLike {
  name: string;
  avatar: string;
  avatarColor?: string;
  avatarAccessory?: string;
}

type PodiumSize = "phone" | "desk" | "room";

const PLACES = [
  {
    key: "championId",
    place: "1st",
    label: "Champion",
    Icon: Crown,
    tone: "text-yellow-400",
    border: "border-yellow-400/70",
    detail: (p: PodiumPlayer) => `${p.score} pts`,
  },
  {
    key: "runnerUpId",
    place: "2nd",
    label: "Runner-up",
    Icon: Medal,
    tone: "text-slate-200",
    border: "border-slate-400/60",
    detail: (p: PodiumPlayer) => `${p.score} pts`,
  },
  {
    key: "redemptionId",
    place: "3rd",
    label: "Redemption",
    Icon: Flame,
    tone: "text-orange-300",
    border: "border-orange-400/60",
    detail: (p: PodiumPlayer) => `${p.redemptionScore ?? 0} redemption pts`,
  },
] as const;

const PrizePodium: React.FC<{
  players: PodiumPlayer[];
  bracket: BracketRound[];
  championId: string | null;
  /**
   * The game's format, from its settings. Read off the bracket when absent —
   * which cannot tell for a game ended before a round was played.
   */
  format?: GameFormat;
  size?: PodiumSize;
  /** Leave the champion out, for a screen that already headlines them. */
  hideChampion?: boolean;
  className?: string;
}> = ({
  players,
  bracket,
  championId,
  format: formatSetting,
  size = "phone",
  hideChampion = false,
  className = "",
}) => {
  // A round robin or a free-for-all has no bracket to have won or a
  // redemption table to have played on: its places are the standings, and
  // the record behind them is worth showing — wins and losses in a round
  // robin, rounds won in a free-for-all.
  const format = formatSetting ?? formatOfRounds(bracket);
  const onTotals = format !== "bracket";
  const places = podium(players, bracket, championId, format);
  const records = format === "roundRobin" ? matchRecords(bracket) : null;
  const roundWins = format === "freeForAll" ? placeCounts(bracket) : null;
  const recordOf = (player: PodiumPlayer): string | null => {
    if (records) {
      const record = records.get(player.id);
      return `${player.score} pts · ${record?.wins ?? 0}–${record?.losses ?? 0}`;
    }
    if (roundWins) {
      const won = roundWins.get(player.id)?.[0] ?? 0;
      return `${player.score} pts · ${won} round${won === 1 ? "" : "s"} won`;
    }
    return null;
  };
  const shown = PLACES.filter(
    (place) => !(hideChampion && place.key === "championId"),
  )
    .map((place) => ({
      ...place,
      player: players.find((p) => p.id === places[place.key]),
    }))
    .filter((place) => place.player);

  if (shown.length === 0) return null;

  const room = size === "room";

  return (
    <div
      className={`grid gap-3 ${
        shown.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
      } ${className}`}
    >
      {shown.map(({ key, place, label, Icon, tone, border, detail, player }) =>
        player ? (
          <div
            key={key}
            className={`cyber-panel border ${border} flex flex-col items-center text-center gap-2 ${
              room ? "px-6 py-5" : "px-4 py-4"
            }`}
          >
            <div className={`flex items-center gap-2 cyber-hud ${tone} ${room ? "text-sm" : "text-[10px]"}`}>
              <Icon size={room ? 22 : 14} /> {place}
              {onTotals ? " place" : ` · ${label}`}
            </div>
            <AvatarDisplay
              avatar={player.avatar}
              color={player.avatarColor}
              accessory={player.avatarAccessory}
              size={room ? "lg" : "md"}
            />
            <div className={`font-black text-white truncate max-w-full ${room ? "text-3xl" : "text-lg"}`}>
              {player.name}
            </div>
            <div className={`font-mono ${tone} ${room ? "text-lg" : "text-xs"}`}>
              {recordOf(player) ?? detail(player)}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
};

export default PrizePodium;

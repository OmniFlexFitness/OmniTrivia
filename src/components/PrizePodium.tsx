import React from "react";
import { Crown, Flame, Medal } from "lucide-react";
import { BracketRound } from "../types";
import { StandingLike, podium } from "../services/bracket";
import AvatarDisplay from "./AvatarDisplay";

/**
 * The night's three prize places, on whichever screen is showing the end of
 * the game: the champion, the runner-up, and the redemption winner.
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
    label: "Champion",
    Icon: Crown,
    tone: "text-yellow-400",
    border: "border-yellow-400/70",
    detail: (p: PodiumPlayer) => `${p.score} pts`,
  },
  {
    key: "runnerUpId",
    label: "Runner-up",
    Icon: Medal,
    tone: "text-slate-200",
    border: "border-slate-400/60",
    detail: (p: PodiumPlayer) => `${p.score} pts`,
  },
  {
    key: "redemptionId",
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
  size?: PodiumSize;
  /** Leave the champion out, for a screen that already headlines them. */
  hideChampion?: boolean;
  className?: string;
}> = ({
  players,
  bracket,
  championId,
  size = "phone",
  hideChampion = false,
  className = "",
}) => {
  const places = podium(players, bracket, championId);
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
      {shown.map(({ key, label, Icon, tone, border, detail, player }) =>
        player ? (
          <div
            key={key}
            className={`cyber-panel border ${border} flex flex-col items-center text-center gap-2 ${
              room ? "px-6 py-5" : "px-4 py-4"
            }`}
          >
            <div className={`flex items-center gap-2 cyber-hud ${tone} ${room ? "text-sm" : "text-[10px]"}`}>
              <Icon size={room ? 22 : 14} /> {label}
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
              {detail(player)}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
};

export default PrizePodium;

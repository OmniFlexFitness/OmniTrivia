import React from "react";
import { BracketRound, Matchup, PublicPlayer } from "../types";
import AvatarDisplay from "./AvatarDisplay";
import { Crown, Swords } from "lucide-react";

/**
 * The head-to-head bracket, drawn one column per round.
 *
 * Shared by the host's control panel and the broadcast so the room and the
 * host are never looking at two different versions of who is still alive.
 */

interface BracketViewProps {
  bracket: BracketRound[];
  players: PublicPlayer[];
  /** Round currently being played — its column is highlighted as live. */
  currentRound: number;
  championId?: string | null;
  size?: "sm" | "lg";
}

interface SeatProps {
  player: PublicPlayer | undefined;
  score: number | null;
  isWinner: boolean;
  isDecided: boolean;
  isBye: boolean;
  size: "sm" | "lg";
}

const Seat: React.FC<SeatProps> = ({
  player,
  score,
  isWinner,
  isDecided,
  isBye,
  size,
}) => {
  const large = size === "lg";

  if (isBye) {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-dashed border-slate-700 text-slate-500 italic ${large ? "p-3 text-xl" : "p-2 text-sm"}`}
      >
        Bye — advances unopposed
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border transition-colors ${large ? "p-3" : "p-2"} ${
        isDecided && isWinner
          ? "bg-green-500/10 border-green-500"
          : isDecided
            ? "bg-slate-900 border-slate-800 opacity-50"
            : "bg-slate-800 border-slate-700"
      }`}
    >
      <AvatarDisplay
        avatar={player?.avatar ?? "❔"}
        color={player?.avatarColor}
        accessory={player?.avatarAccessory}
        size={large ? "md" : "sm"}
      />
      <div
        className={`flex-1 truncate font-bold ${large ? "text-xl" : "text-sm"} ${
          isDecided && isWinner ? "text-green-300" : "text-white"
        }`}
      >
        {player?.name ?? "Unknown"}
      </div>
      {score !== null && (
        <div
          className={`font-mono font-bold ${large ? "text-2xl" : "text-base"} ${
            isDecided && isWinner ? "text-green-400" : "text-slate-400"
          }`}
        >
          {score}
        </div>
      )}
      {isDecided && isWinner && (
        <Crown size={large ? 22 : 16} className="text-yellow-400 shrink-0" />
      )}
    </div>
  );
};

export const MatchupCard: React.FC<{
  matchup: Matchup;
  players: PublicPlayer[];
  isLive: boolean;
  size: "sm" | "lg";
}> = ({ matchup, players, isLive, size }) => {
  const byId = (id: string | null) =>
    id ? players.find((p) => p.id === id) : undefined;

  const a = byId(matchup.playerAId);
  const b = byId(matchup.playerBId);
  const isDecided = matchup.winnerId !== null;

  // A settled matchup shows the points it was decided on; a live one shows the
  // running round score. A matchup that has not started yet shows neither.
  const liveScore = (player: PublicPlayer | undefined) =>
    isLive ? (player?.roundScore ?? 0) : null;

  return (
    <div
      className={`rounded-xl border p-2 space-y-1 ${
        isLive
          ? "border-neon-blue bg-slate-900 shadow-[0_0_12px_rgba(0,255,255,0.15)]"
          : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <Seat
        player={a}
        score={matchup.scoreA ?? liveScore(a)}
        isWinner={matchup.winnerId === matchup.playerAId}
        isDecided={isDecided}
        isBye={false}
        size={size}
      />
      <div className="flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-600">
        <Swords size={12} /> vs
      </div>
      <Seat
        player={b}
        score={matchup.scoreB ?? liveScore(b)}
        isWinner={matchup.winnerId === matchup.playerBId}
        isDecided={isDecided}
        isBye={matchup.playerBId === null}
        size={size}
      />
      {matchup.tiebreak && matchup.tiebreak !== "Bye" && (
        <div className="pt-1 text-center text-[10px] font-mono uppercase tracking-wide text-neon-yellow">
          {matchup.tiebreak}
        </div>
      )}
    </div>
  );
};

const BracketView: React.FC<BracketViewProps> = ({
  bracket,
  players,
  currentRound,
  championId,
  size = "sm",
}) => {
  const champion = championId
    ? players.find((p) => p.id === championId)
    : undefined;

  if (bracket.length === 0) {
    return (
      <div className="text-center text-slate-500 font-mono py-8">
        The draw is made when the game starts.
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-2">
      {bracket.map((round) => {
        const isLive = round.roundNumber === currentRound && !round.resolved;

        return (
          <div
            key={round.roundNumber}
            className="shrink-0 w-64 md:w-72 space-y-2"
          >
            <div
              className={`flex items-center justify-between px-1 text-xs font-mono uppercase tracking-widest ${
                isLive ? "text-neon-blue" : "text-slate-500"
              }`}
            >
              <span>Round {round.roundNumber}</span>
              {isLive && <span className="animate-pulse">● live</span>}
            </div>
            {round.matchups.map((matchup) => (
              <MatchupCard
                key={matchup.id}
                matchup={matchup}
                players={players}
                isLive={isLive}
                size={size}
              />
            ))}
          </div>
        );
      })}

      {champion && (
        <div className="shrink-0 w-64 md:w-72 flex flex-col justify-center">
          <div className="rounded-xl border-2 border-yellow-400 bg-yellow-400/10 p-4 text-center shadow-[0_0_25px_rgba(250,204,21,0.3)]">
            <Crown size={32} className="mx-auto text-yellow-400 mb-2" />
            <div className="text-xs font-mono uppercase tracking-widest text-yellow-400 mb-2">
              Champion
            </div>
            <div className="flex items-center justify-center mb-2">
              <AvatarDisplay
                avatar={champion.avatar}
                color={champion.avatarColor}
                accessory={champion.avatarAccessory}
                size="lg"
              />
            </div>
            <div className="text-2xl font-black text-white">
              {champion.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BracketView;

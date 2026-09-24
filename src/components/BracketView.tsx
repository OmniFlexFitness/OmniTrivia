import React from "react";
import { BracketRound, BracketSide, Matchup, PublicPlayer } from "../types";
import { SIDE_LABELS, sideOf } from "../services/bracket";
import AvatarDisplay from "./AvatarDisplay";
import { Crown, ShieldAlert, Swords, Trophy } from "lucide-react";

/**
 * The head-to-head bracket, drawn one column per round.
 *
 * Shared by the host's control panel and the broadcast so the room and the
 * host are never looking at two different versions of who is still alive.
 *
 * A game with a loser's bracket plays both sides in the same round, so it is
 * drawn as two rows of columns — the winners' side over the loser's side —
 * with the grand final after them. A single-elimination game is one row, the
 * way it always was.
 */

/** The small chip that says which bracket a matchup belongs to. */
export const SideTag: React.FC<{ side: BracketSide; size?: "sm" | "lg" }> = ({
  side,
  size = "sm",
}) => {
  if (side === "winners") return null;
  const large = size === "lg";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-mono uppercase tracking-widest ${
        large ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[9px]"
      } ${
        side === "final"
          ? "border-yellow-400/70 text-yellow-300 bg-yellow-400/10"
          : "border-orange-400/60 text-orange-300 bg-orange-500/10"
      }`}
    >
      {side === "final" ? <Trophy size={large ? 12 : 10} /> : <ShieldAlert size={large ? 12 : 10} />}
      {SIDE_LABELS[side]}
    </span>
  );
};

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
  /** Label a loser's-bracket or grand-final matchup, where nothing else does. */
  showSide?: boolean;
}> = ({ matchup, players, isLive, size, showSide = false }) => {
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
      {showSide && sideOf(matchup) !== "winners" && (
        <div className="flex justify-center pb-1">
          <SideTag side={sideOf(matchup)} size={size} />
        </div>
      )}
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

  const sides: BracketSide[] = ["winners", "losers", "final"];
  const present = sides.filter((side) =>
    bracket.some((round) => round.matchups.some((m) => sideOf(m) === side)),
  );
  // A single-elimination game has one side and draws no headings at all.
  const split = present.some((side) => side !== "winners");

  const columns = (side: BracketSide) =>
    bracket
      .map((round) => ({
        round,
        matchups: round.matchups.filter((m) => !split || sideOf(m) === side),
      }))
      .filter(({ matchups }) => matchups.length > 0)
      .map(({ round, matchups }) => {
        const isLive = round.roundNumber === currentRound && !round.resolved;

        return (
          <div
            key={`${side}-${round.roundNumber}`}
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
            {matchups.map((matchup) => (
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
      });

  const championCard = champion && (
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
        <div className="text-2xl font-black text-white">{champion.name}</div>
      </div>
    </div>
  );

  if (!split) {
    return (
      <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-2">
        {columns("winners")}
        {championCard}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {present.map((side) => (
        <div key={side}>
          <div className="mb-2">
            {side === "winners" ? (
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-neon-green">
                {SIDE_LABELS.winners} · unbeaten
              </span>
            ) : (
              <SideTag side={side} size={size} />
            )}
          </div>
          <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-2">
            {columns(side)}
            {side === present[present.length - 1] && championCard}
          </div>
        </div>
      ))}
    </div>
  );
};

export default BracketView;

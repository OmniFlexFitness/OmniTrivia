import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BroadcastSnapshot,
  GamePhase,
  Matchup,
  PublicPlayer,
  QuestionType,
} from "../types";
import {
  postMessage,
  readStoredSnapshot,
  subscribeToMessages,
} from "../services/broadcastBus";
import AvatarDisplay from "./AvatarDisplay";
import BracketView, { MatchupCard } from "./BracketView";
import JoinCode from "./JoinCode";
import {
  CheckCircle2,
  Crown,
  Hourglass,
  Radio,
  Swords,
  Trophy,
  Users,
} from "lucide-react";

/**
 * The broadcast interface: the screen on the projector that the whole room
 * watches. It renders the host's snapshot and nothing else — there are no
 * controls here, and no way for anything on this screen to change the game.
 */

/** No word from the host window for this long and we say so on screen. */
const HOST_TIMEOUT_MS = 8000;

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

const CountdownRing: React.FC<{
  timeLeft: number;
  duration: number;
  paused: boolean;
}> = ({ timeLeft, duration, paused }) => {
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, duration ? timeLeft / duration : 0));
  const urgent = timeLeft <= 5;

  return (
    <div className="relative w-48 h-48">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 180 180">
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth="14"
        />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={urgent ? "#ef4444" : "#00ffff"}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{
            transition: "stroke-dashoffset 1s linear, stroke 0.3s ease",
            filter: `drop-shadow(0 0 8px ${urgent ? "#ef4444" : "#00ffff"})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={`text-6xl font-black font-mono ${urgent ? "text-red-500 animate-pulse-fast" : "text-white"}`}
        >
          {Math.max(0, timeLeft)}
        </div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
          {paused ? "paused" : "seconds"}
        </div>
      </div>
    </div>
  );
};

/**
 * The room needs to know how much longer it is waiting and on whom, so this
 * shows both halves: locked in, and still out.
 */
const AnswerTally: React.FC<{
  snapshot: BroadcastSnapshot;
  players: PublicPlayer[];
}> = ({ snapshot, players }) => {
  const active = snapshot.activePlayerIds;
  const answered = new Set(snapshot.answeredPlayerIds);
  const answeredCount = active.filter((id) => answered.has(id)).length;
  const waitingCount = active.length - answeredCount;
  const progress = active.length ? (answeredCount / active.length) * 100 : 0;

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-5xl font-black font-mono text-neon-green leading-none">
            {answeredCount}
            <span className="text-2xl text-slate-600">/{active.length}</span>
          </div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500 mt-1">
            answered
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-5xl font-black font-mono leading-none ${waitingCount > 0 ? "text-neon-yellow" : "text-slate-700"}`}
          >
            {waitingCount}
          </div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500 mt-1">
            still answering
          </div>
        </div>
      </div>

      <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
        <div
          className="h-full bg-neon-green transition-all duration-500 shadow-[0_0_10px_#0aff00]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {active.map((id) => {
          const player = players.find((p) => p.id === id);
          if (!player) return null;
          const isIn = answered.has(id);
          const wasRight = snapshot.correctPlayerIds.includes(id);
          const revealing = !!snapshot.reveal;

          return (
            <div
              key={id}
              className={`relative transition-all duration-300 ${
                isIn || revealing
                  ? "opacity-100 scale-100"
                  : "opacity-30 grayscale scale-95"
              }`}
              title={player.name}
            >
              <AvatarDisplay
                avatar={player.avatar}
                color={player.avatarColor}
                accessory={player.avatarAccessory}
                size="md"
              />
              {/* Running out of time is an outcome too — it is scored as a
                  miss, so it gets a mark rather than being left blank. */}
              {revealing && (
                <span
                  className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-slate-900 ${
                    !isIn
                      ? "bg-slate-600 text-slate-300"
                      : wasRight
                        ? "bg-green-500"
                        : "bg-red-500"
                  }`}
                >
                  {!isIn ? "–" : wasRight ? "✓" : "✕"}
                </span>
              )}
              {isIn && !revealing && (
                <CheckCircle2
                  size={18}
                  className="absolute -bottom-1 -right-1 text-neon-green bg-slate-900 rounded-full"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** The pairing strip: who each player is up against this round. */
const MatchupStrip: React.FC<{
  matchups: Matchup[];
  players: PublicPlayer[];
  title: string;
}> = ({ matchups, players, title }) => {
  const nameOf = (id: string | null) =>
    id ? (players.find((p) => p.id === id)?.name ?? "Unknown") : null;
  const playerOf = (id: string | null) =>
    id ? players.find((p) => p.id === id) : undefined;

  if (matchups.length === 0) return null;

  return (
    <div className="w-full">
      <div className="text-center text-xs font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
        {title}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {matchups.map((matchup) => {
          const a = playerOf(matchup.playerAId);
          const b = playerOf(matchup.playerBId);

          return (
            <div
              key={matchup.id}
              className="flex items-center gap-3 bg-slate-900/70 border border-slate-800 rounded-full pl-2 pr-4 py-2"
            >
              <AvatarDisplay
                avatar={a?.avatar ?? "❔"}
                color={a?.avatarColor}
                accessory={a?.avatarAccessory}
                size="sm"
              />
              <span
                className={`font-bold ${matchup.winnerId === matchup.playerAId ? "text-green-400" : "text-white"}`}
              >
                {nameOf(matchup.playerAId)}
              </span>
              <Swords size={14} className="text-neon-pink" />
              {matchup.playerBId ? (
                <>
                  <span
                    className={`font-bold ${matchup.winnerId === matchup.playerBId ? "text-green-400" : "text-white"}`}
                  >
                    {nameOf(matchup.playerBId)}
                  </span>
                  <AvatarDisplay
                    avatar={b?.avatar ?? "❔"}
                    color={b?.avatarColor}
                    accessory={b?.avatarAccessory}
                    size="sm"
                  />
                </>
              ) : (
                <span className="italic text-slate-500">bye</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Phase views
 * ------------------------------------------------------------------ */

const StandbyStage: React.FC<{ snapshot: BroadcastSnapshot | null }> = ({
  snapshot,
}) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
    <div className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink">
      OMNI<span className="text-white">TRIVIA</span>
    </div>

    {snapshot?.gamePin ? (
      <>
        {snapshot.gameName && (
          <div className="text-4xl md:text-5xl font-black text-white">
            {snapshot.gameName}
          </div>
        )}
        <div className="text-2xl text-slate-400 font-mono uppercase tracking-widest">
          Scan to join, or type the PIN
        </div>
        <JoinCode pin={snapshot.gamePin} size="lg" />
        <div className="flex items-center gap-3 text-2xl text-slate-300">
          <Users className="text-neon-pink" />
          {snapshot.players.length} in the room
        </div>
        <div className="flex flex-wrap justify-center gap-4 max-w-4xl mt-4">
          {snapshot.players.map((player) => (
            <div key={player.id} className="flex flex-col items-center gap-1">
              <AvatarDisplay
                avatar={player.avatar}
                color={player.avatarColor}
                accessory={player.avatarAccessory}
                size="lg"
              />
              <span className="font-bold text-slate-200">{player.name}</span>
            </div>
          ))}
        </div>
      </>
    ) : (
      <div className="max-w-xl space-y-3">
        <div className="text-2xl text-slate-300 animate-pulse font-mono">
          WAITING FOR THE HOST
        </div>
        <p className="text-slate-500">
          Keep this window open on the big screen. It follows the host window
          automatically — they have to be the same browser on the same machine.
        </p>
      </div>
    )}
  </div>
);

const RoundIntroStage: React.FC<{ snapshot: BroadcastSnapshot }> = ({
  snapshot,
}) => {
  const bracketRound = snapshot.bracket[snapshot.roundNumber - 1];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
      <div className="text-3xl font-mono uppercase tracking-[0.4em] text-slate-500">
        Round {snapshot.roundNumber} of {snapshot.totalRounds}
      </div>

      {snapshot.wheelSpinning ? (
        <div className="flex flex-col items-center gap-6">
          <div className="text-8xl animate-spin-slow">🎡</div>
          <div className="text-4xl font-black text-white animate-pulse">
            SPINNING FOR THE CATEGORY…
          </div>
        </div>
      ) : !snapshot.category ? (
        <div className="flex flex-col items-center gap-6">
          <div className="text-8xl">🎡</div>
          <div className="text-4xl font-black text-slate-400">
            CATEGORY UP NEXT
          </div>
          <div className="text-xl font-mono uppercase tracking-widest text-slate-600">
            Waiting on the host to spin
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 animate-bounce-short">
          <div
            className={`w-40 h-40 rounded-full flex items-center justify-center text-8xl ${snapshot.category.color} shadow-[0_0_60px_rgba(255,255,255,0.25)]`}
          >
            {snapshot.category.icon}
          </div>
          <div className="text-7xl font-black text-white neon-text">
            {snapshot.category.name}
          </div>
        </div>
      )}

      {bracketRound && (
        <MatchupStrip
          matchups={bracketRound.matchups}
          players={snapshot.players}
          title="This round's head-to-heads"
        />
      )}
    </div>
  );
};

/** Options as the room sees them, with the answer marked once it is up. */
const BroadcastOptions: React.FC<{ snapshot: BroadcastSnapshot }> = ({
  snapshot,
}) => {
  const question = snapshot.question;
  if (!question) return null;

  const reveal = snapshot.reveal;
  const tallies = snapshot.optionTallies;
  const totalAnswers = tallies?.reduce((sum, n) => sum + n, 0) ?? 0;

  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      return (
        <div className="flex items-center justify-center py-8">
          {reveal ? (
            <div className="px-12 py-8 rounded-2xl bg-green-600/20 border-4 border-green-500 text-center">
              <div className="text-sm font-mono uppercase tracking-widest text-green-400 mb-2">
                Answer
              </div>
              <div className="text-6xl font-black text-white">
                {reveal.label}
              </div>
            </div>
          ) : (
            <div className="px-12 py-8 rounded-2xl border-4 border-dashed border-slate-700 text-4xl font-bold text-slate-500">
              ✍️ Type your answer
            </div>
          )}
        </div>
      );

    case QuestionType.SLIDER: {
      const [min, max] = question.options.map(Number);
      const span = max - min || 1;
      const range = reveal?.correctRange;

      return (
        <div className="py-10 px-6">
          <div className="relative h-8 w-full rounded-full bg-slate-800 border border-slate-700">
            {range && (
              <div
                className="absolute top-0 h-full rounded-full bg-green-500/70 shadow-[0_0_20px_#22c55e]"
                style={{
                  left: `${((range[0] - min) / span) * 100}%`,
                  width: `${Math.max(2, ((range[1] - range[0]) / span) * 100)}%`,
                }}
              />
            )}
          </div>
          <div className="flex justify-between mt-3 text-2xl font-mono text-slate-400">
            <span>{min}</span>
            {range && (
              <span className="text-3xl font-black text-green-400">
                {reveal?.label}
              </span>
            )}
            <span>{max}</span>
          </div>
        </div>
      );
    }

    case QuestionType.PUZZLE: {
      const order = reveal?.correctOrder ?? question.options;
      return (
        <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full py-4">
          {order.map((item, index) => (
            <div
              key={item}
              className={`flex items-center gap-5 p-5 rounded-2xl border-4 ${
                reveal
                  ? "bg-green-600/20 border-green-500"
                  : "bg-slate-800 border-slate-700"
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center font-mono font-black text-2xl text-neon-blue shrink-0">
                {reveal ? index + 1 : "?"}
              </div>
              <span className="text-3xl font-bold text-white">{item}</span>
            </div>
          ))}
          {!reveal && (
            <div className="text-center text-slate-500 font-mono uppercase tracking-widest">
              Put them in the right order
            </div>
          )}
        </div>
      );
    }

    default:
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {question.options.map((option, index) => {
            const isCorrect = reveal?.correctIndex === index;
            const picked = tallies?.[index] ?? 0;
            const share = totalAnswers ? (picked / totalAnswers) * 100 : 0;

            return (
              <div
                key={index}
                className={`relative overflow-hidden p-7 rounded-2xl border-4 flex items-center transition-all duration-300 ${
                  !reveal
                    ? "bg-slate-800 border-slate-600"
                    : isCorrect
                      ? "bg-green-600/30 border-green-400 shadow-[0_0_30px_rgba(34,197,94,0.4)] scale-[1.02]"
                      : "bg-slate-900 border-slate-800 opacity-40"
                }`}
              >
                {reveal && tallies && (
                  <div
                    className="absolute inset-y-0 left-0 bg-white/5"
                    style={{ width: `${share}%` }}
                  />
                )}
                <div className="relative w-14 h-14 rounded-full border-4 border-current flex items-center justify-center mr-6 font-black text-2xl shrink-0 opacity-70">
                  {CHOICE_LETTERS[index] ?? index + 1}
                </div>
                <span className="relative flex-1 font-bold text-white text-3xl">
                  {option}
                </span>
                {reveal && tallies && (
                  <span className="relative font-mono text-xl text-slate-400 ml-4">
                    {picked}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
  }
};

const QuestionStage: React.FC<{ snapshot: BroadcastSnapshot }> = ({
  snapshot,
}) => {
  const reveal = snapshot.reveal;
  const correctCount = snapshot.correctPlayerIds.length;
  const answeredCount = snapshot.answeredPlayerIds.length;
  const bracketRound = snapshot.bracket[snapshot.roundNumber - 1];

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
      {/* Question + answers */}
      <div className="flex-1 flex flex-col justify-center gap-6 min-w-0">
        <div className="bg-white text-slate-900 p-8 rounded-3xl shadow-2xl text-center border-4 border-slate-200">
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
            Question {snapshot.questionNumber} of {snapshot.questionsInRound}
            {snapshot.category?.name ?? snapshot.question?.category
              ? ` — ${snapshot.category?.name ?? snapshot.question?.category}`
              : ""}
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight">
            {snapshot.question?.text}
          </h1>
        </div>

        <BroadcastOptions snapshot={snapshot} />

        {reveal && (
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {correctCount} of {answeredCount || 0} answered correctly
            </div>
            {reveal.explanation && (
              <p className="text-xl text-slate-300 mt-2 max-w-4xl mx-auto">
                {reveal.explanation}
              </p>
            )}
            {snapshot.autoAdvance && (
              <div className="mt-3 text-lg font-mono uppercase tracking-widest text-neon-blue animate-pulse">
                Next question in {snapshot.revealSecondsLeft}…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clock and the room's progress */}
      <div className="w-full lg:w-96 shrink-0 flex flex-col items-center gap-6">
        {reveal ? (
          <div className="w-48 h-48 rounded-full border-8 border-green-500 flex flex-col items-center justify-center bg-green-500/10 shadow-[0_0_40px_rgba(34,197,94,0.35)]">
            <CheckCircle2 size={56} className="text-green-400" />
            <div className="mt-2 font-mono uppercase tracking-widest text-green-400 text-sm">
              {snapshot.revealReason === "all-in"
                ? "All in"
                : snapshot.revealReason === "host"
                  ? "Revealed"
                  : "Time's up"}
            </div>
          </div>
        ) : (
          <CountdownRing
            timeLeft={snapshot.timeLeft}
            duration={snapshot.timerDuration}
            paused={snapshot.timerPaused}
          />
        )}

        <AnswerTally snapshot={snapshot} players={snapshot.players} />

        {bracketRound && (
          <div className="w-full">
            <MatchupStrip
              matchups={bracketRound.matchups}
              players={snapshot.players}
              title="Head-to-head"
            />
          </div>
        )}
      </div>
    </div>
  );
};

const StandingsList: React.FC<{
  players: PublicPlayer[];
  showRoundScore: boolean;
}> = ({ players, showRoundScore }) => {
  const sorted = [...players].sort((a, b) =>
    showRoundScore ? b.roundScore - a.roundScore : b.score - a.score,
  );

  return (
    <div className="space-y-2">
      {sorted.map((player, index) => (
        <div
          key={player.id}
          className={`flex items-center gap-4 p-3 rounded-xl border ${
            player.eliminated
              ? "bg-slate-900/40 border-slate-800 opacity-50"
              : "bg-slate-800 border-slate-700"
          }`}
        >
          <div className="w-10 text-center font-black text-xl text-slate-500">
            {index === 0 ? (
              <Trophy className="text-yellow-400 mx-auto" size={24} />
            ) : (
              `#${index + 1}`
            )}
          </div>
          <AvatarDisplay
            avatar={player.avatar}
            color={player.avatarColor}
            accessory={player.avatarAccessory}
            size="md"
          />
          <div className="flex-1 text-2xl font-bold text-white truncate">
            {player.name}
            {player.eliminated && (
              <span className="ml-3 text-xs font-mono uppercase tracking-widest text-red-500">
                out
              </span>
            )}
          </div>
          {showRoundScore && (
            <div className="text-xl font-mono text-neon-green">
              +{player.roundScore}
            </div>
          )}
          <div className="text-3xl font-mono font-black text-neon-pink w-28 text-right">
            {player.score}
          </div>
        </div>
      ))}
    </div>
  );
};

const RoundEndStage: React.FC<{ snapshot: BroadcastSnapshot }> = ({
  snapshot,
}) => {
  const round = snapshot.bracket[snapshot.roundNumber - 1];

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto custom-scrollbar">
      <div className="text-center">
        <h1 className="text-6xl font-black text-white neon-text">
          ROUND {snapshot.roundNumber} COMPLETE
        </h1>
        {snapshot.category && (
          <div className="text-2xl text-slate-400 mt-2">
            {snapshot.category.icon} {snapshot.category.name}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <div className="text-center text-xs font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
            Round results
          </div>
          {round && (
            <div className="space-y-3">
              {round.matchups.map((matchup) => (
                <MatchupCard
                  key={matchup.id}
                  matchup={matchup}
                  players={snapshot.players}
                  isLive={false}
                  size="lg"
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-center text-xs font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
            Standings
          </div>
          <StandingsList players={snapshot.players} showRoundScore />
        </div>
      </div>

      {snapshot.nextRoundMatchups && snapshot.nextRoundMatchups.length > 0 && (
        <div className="bg-slate-900/60 border border-neon-blue/40 rounded-2xl p-5">
          <MatchupStrip
            matchups={snapshot.nextRoundMatchups}
            players={snapshot.players}
            title={`Advancing to round ${snapshot.roundNumber + 1}`}
          />
        </div>
      )}

      {snapshot.bracket.length > 0 && (
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
            Bracket
          </div>
          <BracketView
            bracket={snapshot.bracket}
            players={snapshot.players}
            currentRound={snapshot.roundNumber}
            championId={snapshot.championId}
          />
        </div>
      )}
    </div>
  );
};

const GameOverStage: React.FC<{ snapshot: BroadcastSnapshot }> = ({
  snapshot,
}) => {
  const champion = snapshot.players.find((p) => p.id === snapshot.championId);

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto custom-scrollbar">
      <div className="text-center">
        {champion ? (
          <>
            <Crown size={72} className="mx-auto text-yellow-400 mb-2" />
            <div className="text-sm font-mono uppercase tracking-[0.4em] text-yellow-400">
              Champion
            </div>
            <div className="flex flex-col items-center gap-3 mt-4">
              <AvatarDisplay
                avatar={champion.avatar}
                color={champion.avatarColor}
                accessory={champion.avatarAccessory}
                size="2xl"
              />
              <div className="text-7xl font-black text-white neon-text">
                {champion.name}
              </div>
              <div className="text-3xl font-mono text-neon-pink">
                {champion.score} pts
              </div>
            </div>
          </>
        ) : (
          <h1 className="text-6xl font-black text-white neon-text">
            FINAL STANDINGS
          </h1>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
            Final standings
          </div>
          <StandingsList players={snapshot.players} showRoundScore={false} />
        </div>
        {snapshot.bracket.length > 0 && (
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
              How it played out
            </div>
            <BracketView
              bracket={snapshot.bracket}
              players={snapshot.players}
              currentRound={snapshot.roundNumber}
            />
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

const BroadcastScreen: React.FC = () => {
  const [snapshot, setSnapshot] = useState<BroadcastSnapshot | null>(() =>
    readStoredSnapshot(),
  );
  const [hostSeenAt, setHostSeenAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  // The channel is shared by the whole origin, so a second host tab would
  // otherwise flip this screen between two different games. Follow the first
  // host we hear from, and only switch once it has gone quiet.
  const latchedHost = useRef<string | null>(null);
  const lastHeard = useRef(0);

  useEffect(() => {
    const claim = (id: string | undefined): boolean => {
      if (!id) return true; // A host from before this handshake existed.

      const stale = Date.now() - lastHeard.current > HOST_TIMEOUT_MS;
      if (latchedHost.current === null || stale) {
        const switching = latchedHost.current !== id;
        latchedHost.current = id;
        // A heartbeat is not a game. Without asking, this screen could sit on
        // the previous host's round until the new one happens to change state.
        if (switching) postMessage({ type: "broadcast-hello", hostId: id });
      }
      if (latchedHost.current !== id) return false;
      lastHeard.current = Date.now();
      return true;
    };

    const unsubscribe = subscribeToMessages((message) => {
      if (message.type === "snapshot") {
        if (!claim(message.snapshot.hostId)) return;
        setSnapshot(message.snapshot);
        setHostSeenAt(Date.now());
      } else if (message.type === "host-heartbeat") {
        if (!claim(message.hostId)) return;
        setHostSeenAt(message.at);
      }
    });

    // Announce ourselves so the host replies with a fresh snapshot rather than
    // leaving us on whatever localStorage happened to be holding.
    postMessage({ type: "broadcast-hello", hostId: latchedHost.current });
    const heartbeat = setInterval(
      () =>
        postMessage({
          type: "broadcast-heartbeat",
          at: Date.now(),
          hostId: latchedHost.current,
        }),
      2000,
    );
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      unsubscribe();
      clearInterval(heartbeat);
      clearInterval(clock);
    };
  }, []);

  const hostLive = hostSeenAt > 0 && now - hostSeenAt < HOST_TIMEOUT_MS;

  const stage = useMemo(() => {
    if (!snapshot) return <StandbyStage snapshot={null} />;

    switch (snapshot.phase) {
      case GamePhase.CATEGORY_SELECT:
        return <RoundIntroStage snapshot={snapshot} />;
      case GamePhase.PLAYING:
      case GamePhase.QUESTION_REVEAL:
        return snapshot.question ? (
          <QuestionStage snapshot={snapshot} />
        ) : (
          <StandbyStage snapshot={snapshot} />
        );
      case GamePhase.ROUND_END:
        return <RoundEndStage snapshot={snapshot} />;
      case GamePhase.GAME_OVER:
        return <GameOverStage snapshot={snapshot} />;
      default:
        return <StandbyStage snapshot={snapshot} />;
    }
  }, [snapshot]);

  return (
    <div className="min-h-screen h-screen bg-slate-900 text-white p-6 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between mb-5 shrink-0">
        <div className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink">
          OMNI<span className="text-white">TRIVIA</span>
        </div>

        <div className="flex items-center gap-5 text-sm font-mono uppercase tracking-widest text-slate-500">
          {snapshot && snapshot.roundNumber > 0 && (
            <span>
              Round {snapshot.roundNumber}/{snapshot.totalRounds}
            </span>
          )}
          {snapshot?.gameName && (
            <span className="text-slate-300 normal-case tracking-normal font-sans font-bold">
              {snapshot.gameName}
            </span>
          )}
          {snapshot?.gamePin && (
            <span className="text-slate-400">PIN {snapshot.gamePin}</span>
          )}
          <span
            className={`flex items-center gap-2 ${hostLive ? "text-neon-green" : "text-red-500 animate-pulse"}`}
          >
            {hostLive ? <Radio size={14} /> : <Hourglass size={14} />}
            {hostLive ? "live" : "no host"}
          </span>
        </div>
      </header>

      {stage}
    </div>
  );
};

export default BroadcastScreen;

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BroadcastSnapshot,
  Category,
  GamePhase,
  LaneStatus,
  Matchup,
  PublicLane,
  PublicPlayer,
  QuestionType,
  RoundReviewItem,
} from "../types";
import {
  PLAYER_ATTACH_TIMEOUT_MS,
  attachRoomChannel,
  canReachOtherDevices,
  detachRoomChannel,
  pinFromUrl,
  pinViewToUrl,
  postMessage,
  readStoredSnapshot,
  reloadForNewBuild,
  roomFailureReason,
  snapshotFit,
  subscribeToMessages,
} from "../services/broadcastBus";
import { seatsOf } from "../services/snapshot";
import AvatarDisplay from "./AvatarDisplay";
import BracketView, { MatchupCard, SideTag } from "./BracketView";
import { sideOf } from "../services/bracket";
import {
  DEFAULT_BROADCAST_SUBTITLE,
  DEFAULT_BROADCAST_TITLE,
  renderBroadcastText,
} from "../services/broadcastText";
import JoinCode from "./JoinCode";
import CategoryVotePanel from "./CategoryVotePanel";
import SpectatorWheel from "./SpectatorWheel";
import { GLOSSARY, SCORING_RULES } from "../content/instructions";
import { CHOICE_KEYS, QuestionPanel, accentStyle } from "./CyberQuestion";
import {
  CheckCircle2,
  Crown,
  Flag,
  Heart,
  Hourglass,
  Lock,
  Radio,
  Swords,
  Trophy,
  Users,
} from "lucide-react";

/**
 * The broadcast interface: the screen on the projector that the whole room
 * watches. It renders the host's snapshot and nothing else — there are no
 * controls here, and no way for anything on this screen to change the game.
 *
 * It follows the field rather than setting its pace. Each matchup plays at its
 * own speed, so the big screen holds whichever question the slowest table is
 * still working on, and says so when every table is through it — nothing
 * more. Nobody is told whether they were right until their match is over, and
 * the answers themselves go up as an answer key once the whole round is. The
 * race board is where the room watches the faster tables pull ahead.
 */

/** No word from the host window for this long and we say so on screen. */
const HOST_TIMEOUT_MS = 8000;

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
    <div className="relative w-48 h-48 shrink-0">
      {/* Unclipped, so the glow fades out on its own instead of stopping dead
          at the edge of the drawing — the ring sits only 7 units inside it. */}
      <svg className="w-full h-full -rotate-90 overflow-visible" viewBox="0 0 180 180" overflow="visible">
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
            // A tight core and a wide, faint halo: a soft falloff rather
            // than one heavy blur with a visible outer edge.
            filter: `drop-shadow(0 0 4px ${urgent ? "#ef4444" : "#00ffff"}) drop-shadow(0 0 14px ${urgent ? "rgba(239,68,68,0.55)" : "rgba(0,255,255,0.5)"})`,
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
 * Where the room is on the question it is being shown: how many matchups are
 * through it, and which players have locked an answer in. Locked in, never
 * right or wrong — that is for the end of the match.
 */
const RoomProgress: React.FC<{
  snapshot: BroadcastSnapshot;
  players: PublicPlayer[];
}> = ({ snapshot, players }) => {
  const answered = new Set(snapshot.answeredPlayerIds);
  const lockedIn = snapshot.roomLockedIn;
  const waiting = Math.max(0, snapshot.lanesInPlay - snapshot.lanesCompleted);
  const progress = snapshot.lanesInPlay
    ? (snapshot.lanesCompleted / snapshot.lanesInPlay) * 100
    : 0;

  return (
    <div className="w-full cyber-panel p-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="font-hud text-5xl font-black text-[#39ff88] leading-none">
            {snapshot.lanesCompleted}
            <span className="text-2xl text-slate-600">
              /{snapshot.lanesInPlay}
            </span>
          </div>
          <div className="cyber-hud text-[10px] text-slate-500 mt-2">
            matchups through it
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-hud text-5xl font-black leading-none ${waiting > 0 ? "text-[#f5ff3b]" : "text-slate-700"}`}
          >
            {waiting}
          </div>
          <div className="cyber-hud text-[10px] text-slate-500 mt-2">
            still on it
          </div>
        </div>
      </div>

      <div className="cyber-timer h-3">
        <div
          className="cyber-timer-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {snapshot.activePlayerIds.map((id) => {
          const player = players.find((p) => p.id === id);
          if (!player) return null;
          const isIn = answered.has(id) || lockedIn;

          return (
            <div
              key={id}
              className={`relative transition-all duration-300 ${
                isIn ? "opacity-100 scale-100" : "opacity-30 grayscale scale-95"
              }`}
              title={player.name}
            >
              <AvatarDisplay
                avatar={player.avatar}
                color={player.avatarColor}
                accessory={player.avatarAccessory}
                size="md"
              />
              {isIn && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-slate-950 border border-[#00f0ff] text-[#00f0ff]">
                  <Lock size={10} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * The race board: every player, and how far through the round they are.
 *
 * This is the part of the screen that makes an asynchronous round readable
 * from the back of the room. Players inside one matchup are stacked together
 * so the duel still reads as a duel — but they get a bar each, because one of
 * them being three questions clear of the other is the whole drama of the
 * format and a single bar per table would hide it.
 */
const LaneRace: React.FC<{
  lanes: PublicLane[];
  players: PublicPlayer[];
  questionsInRound: number;
}> = ({ lanes, players, questionsInRound }) => {
  if (lanes.length === 0) return null;

  const playerOf = (id: string) => players.find((p) => p.id === id);
  const total = questionsInRound || 1;

  // The table with the furthest-along player first, so the leaders sit at the
  // top of the board.
  const ordered = [...lanes].sort(
    (a, b) =>
      Math.max(0, ...seatsOf(b).map((seat) => seat.completed)) -
      Math.max(0, ...seatsOf(a).map((seat) => seat.completed)),
  );

  return (
    <div className="w-full cyber-panel p-4">
      <div className="cyber-hud text-[10px] text-slate-500 mb-3">
        The field
      </div>
      <div className="space-y-3">
        {ordered.map((lane) => (
          <div
            key={lane.id}
            className="space-y-1.5 border-l-2 border-slate-800 pl-2"
          >
            {seatsOf(lane).map((seat) => {
              const player = playerOf(seat.playerId);
              const done = seat.status === LaneStatus.DONE;

              return (
                <div key={seat.playerId} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate font-bold text-white">
                      {player?.name ?? "Unknown"}
                    </span>
                    {/* Points only once this match is over — a live score
                        is a verdict on every answer. */}
                    {seat.roundPoints !== null && (
                      <span className="font-mono text-neon-green shrink-0">
                        {seat.roundPoints}
                      </span>
                    )}
                    <span
                      className={`font-mono text-xs shrink-0 w-16 text-right ${done ? "text-neon-green" : "text-slate-500"}`}
                    >
                      {done ? (
                        <span className="flex items-center justify-end gap-1">
                          <Flag size={11} /> done
                        </span>
                      ) : (
                        `Q${Math.min(seat.completed + 1, total)}/${total}`
                      )}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-700 ${done ? "bg-neon-green" : "bg-neon-pink"}`}
                      style={{ width: `${(seat.completed / total) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {seatsOf(lane).length === 0 && (
              <div className="text-xs font-mono uppercase tracking-widest text-slate-600">
                nobody answering at this table
              </div>
            )}
          </div>
        ))}
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
              className={`flex items-center gap-3 bg-slate-900/70 border rounded-full pl-2 pr-4 py-2 ${
                sideOf(matchup) === "final"
                  ? "border-yellow-400/70"
                  : sideOf(matchup) === "losers"
                    ? "border-orange-400/50"
                    : "border-slate-800"
              }`}
            >
              <SideTag side={sideOf(matchup)} />
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

/**
 * The rules, on the wall.
 *
 * Nobody in the room has read anything, and the format is unusual enough that
 * "why is she on question five and I'm on question two" is the first thing
 * somebody asks. Answering it on the big screen, before the first question,
 * saves the host explaining it over a microphone.
 */
const RoomRules: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-lg text-slate-400">
        <span>
          <span className="text-neon-pink font-bold">One opponent</span> per
          round
        </span>
        <span>
          <span className="text-neon-blue font-bold">Your own pace</span> — no
          waiting
        </span>
        <span>
          <span className="text-neon-green font-bold">Answer fast</span> for more
          points
        </span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
      <div className="text-center text-sm font-mono uppercase tracking-[0.3em] text-slate-500 mb-4">
        How this works
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        {GLOSSARY.slice(0, 4).map((entry) => (
          <div key={entry.term} className="flex gap-3">
            <span className="text-neon-pink font-black shrink-0 w-24 text-right">
              {entry.term}
            </span>
            <span className="text-slate-300 text-left flex-1">
              {entry.definition}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap justify-center gap-x-8 gap-y-2 text-slate-400">
        {SCORING_RULES.slice(0, 3).map((rule) => (
          <span key={rule} className="text-base">
            <span className="text-neon-green">▸</span> {rule}
          </span>
        ))}
      </div>
    </div>
  );
};

/** What the room has liked so far, for the between-rounds screens. */
const LikedStrip: React.FC<{ snapshot: BroadcastSnapshot }> = ({ snapshot }) => {
  const liked = snapshot.categoryLikes.filter((row) => row.count > 0);
  if (liked.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center items-center gap-3">
      <span className="text-xs font-mono uppercase tracking-[0.3em] text-slate-500">
        Liked tonight
      </span>
      {liked.map((row) => (
        <span
          key={row.categoryId}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-neon-pink/40 text-white"
        >
          <span>{row.icon}</span>
          <span className="font-bold">{row.name}</span>
          <span className="flex items-center gap-1 font-mono text-neon-pink">
            <Heart size={13} className="fill-current" />
            {row.count}
          </span>
        </span>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Phase views
 * ------------------------------------------------------------------ */

/**
 * How a display on its own device is getting on with reaching the room.
 * "local" is the projector window beside the host's own, which needs no
 * network at all.
 */
type RoomLink = "local" | "connecting" | "connected" | "unreachable" | "denied";

/**
 * Pointing a screen at a game from scratch.
 *
 * A TV's browser, a second laptop, a projector's own stick: none of them is
 * the host's machine, so none of them can hear the host's window directly.
 * Typing the PIN reaches the room the same way a phone does.
 */
const CastPinForm: React.FC<{ onPin: (pin: string) => void }> = ({ onPin }) => {
  const [value, setValue] = useState("");
  const valid = /^\d{4}$/.test(value);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onPin(value);
      }}
      className="flex items-center justify-center gap-3"
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder="PIN"
        aria-label="Game PIN"
        className="w-48 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-4xl text-center font-mono tracking-[0.3em] text-white focus:border-neon-blue outline-none"
      />
      <button
        type="submit"
        disabled={!valid}
        className="px-6 py-4 rounded-xl border border-neon-blue text-neon-blue font-bold uppercase tracking-widest disabled:opacity-40"
      >
        Show this game
      </button>
    </form>
  );
};

const StandbyStage: React.FC<{
  snapshot: BroadcastSnapshot | null;
  pin?: string | null;
  link?: RoomLink;
  onPin?: (pin: string) => void;
}> = ({ snapshot, pin = null, link = "local", onPin }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
    {/* The host's words, not the app's: "Trivia" and "Elevate · today's
        date" until they change them from the desk. */}
    <div className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink pb-2">
      {renderBroadcastText(snapshot?.broadcastTitle, DEFAULT_BROADCAST_TITLE)}
    </div>

    {snapshot?.gamePin ? (
      <>
        <div className="text-4xl md:text-5xl font-black text-white">
          {renderBroadcastText(snapshot.broadcastSubtitle, DEFAULT_BROADCAST_SUBTITLE)}
        </div>
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

        <RoomRules />
      </>
    ) : (
      <div className="max-w-2xl space-y-5">
        <div className="text-2xl text-slate-300 animate-pulse font-mono">
          {pin
            ? link === "connecting"
              ? `CONNECTING TO PIN ${pin}…`
              : link === "denied"
                ? "THE GAME SERVER IS REFUSING THIS SCREEN"
                : link === "unreachable"
                  ? `CAN'T REACH PIN ${pin} YET`
                  : `WAITING FOR PIN ${pin}`
            : "WAITING FOR THE HOST"}
        </div>
        <p className="text-slate-500">
          {pin
            ? link === "denied"
              ? "The room database's rules have not been published, so no device can follow a game. The host has to run npm run rules:deploy (see MULTIPLAYER.md)."
              : link === "unreachable"
                ? "This screen has no working connection to the game server. It keeps trying — check the Wi-Fi on this device."
                : "Keep this window open and full screen. It picks the game up as soon as the host publishes it, and follows it from here on."
            : canReachOtherDevices()
              ? "Opened on the host's own machine, this follows the host window by itself. On any other screen — a TV's browser, a second laptop — type the game's PIN."
              : "Keep this window open on the big screen. It follows the host window automatically — they have to be the same browser on the same machine."}
        </p>
        {onPin && canReachOtherDevices() && <CastPinForm onPin={onPin} />}
      </div>
    )}
  </div>
);

/**
 * Between rounds, on the big screen.
 *
 * The room used to watch a spinning emoji here. It now watches the wheel
 * itself: the same slices the host is turning, turning with them, stopping on
 * the same category. Nothing about which category that will be reaches this
 * window before the host's wheel has stopped — see `SpectatorWheel`.
 */
const RoundIntroStage: React.FC<{ snapshot: BroadcastSnapshot }> = ({
  snapshot,
}) => {
  const bracketRound = snapshot.bracket[snapshot.roundNumber - 1];
  // Absent from a snapshot written by a build older than the wheel; that game
  // still runs, it just gets the screen it had before.
  const slices = snapshot.wheelSlices ?? [];
  // Named by the wheel on *this* screen once it has stopped, so the room is not
  // read the answer while it is still watching the wheel travel to it.
  const [settled, setSettled] = useState<Category | null>(null);

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 text-center">
      <div className="text-3xl font-mono uppercase tracking-[0.4em] text-slate-500">
        Round {snapshot.roundNumber} of {snapshot.totalRounds}
      </div>

      {slices.length > 0 ? (
        <>
          <SpectatorWheel
            categories={slices}
            spinning={snapshot.wheelSpinning}
            landed={snapshot.category}
            roundNumber={snapshot.roundNumber}
            onSettled={setSettled}
            className="w-[30vh] h-[30vh] shrink-0"
          />
          {settled ? (
            <div className="cyber-question text-7xl text-white neon-text neon-pop">
              {settled.icon} {settled.name}
            </div>
          ) : (
            <div
              className={`text-4xl font-black ${
                snapshot.wheelSpinning || snapshot.category
                  ? "text-white animate-pulse"
                  : "text-slate-400"
              }`}
            >
              {snapshot.wheelSpinning || snapshot.category
                ? "SPINNING FOR THE CATEGORY…"
                : "CATEGORY UP NEXT"}
            </div>
          )}
        </>
      ) : snapshot.wheelSpinning ? (
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
        <div className="flex flex-col items-center gap-4 neon-pop">
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

      <RoomRules compact />
    </div>
  );
};

/**
 * Options as the room sees them. Never marked: the answer waits for the end
 * of the round, where it goes up in the answer key.
 */
const BroadcastOptions: React.FC<{ snapshot: BroadcastSnapshot }> = ({
  snapshot,
}) => {
  const question = snapshot.question;
  if (!question) return null;

  switch (question.type) {
    case QuestionType.TYPE_ANSWER:
      return (
        <div className="flex items-center justify-center py-6">
          <div className="cyber-panel px-12 py-8 text-center">
            <div className="cyber-hud text-sm text-[#00f0ff]">Typed answer</div>
            <div className="cyber-question text-4xl mt-2">✍️ Type it on your phone</div>
          </div>
        </div>
      );

    case QuestionType.SLIDER: {
      const [min, max] = question.options.map(Number);
      return (
        <div className="py-8 px-6">
          <div className="cyber-timer h-8">
            <div className="cyber-timer-fill opacity-30" style={{ width: "100%" }} />
          </div>
          <div className="font-hud flex justify-between mt-3 text-3xl text-slate-300">
            <span>{min}</span>
            <span className="cyber-hud text-sm self-center text-slate-500">
              slide to your guess
            </span>
            <span>{max}</span>
          </div>
        </div>
      );
    }

    case QuestionType.PUZZLE:
      return (
        <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full py-2">
          {question.options.map((item, index) => (
            <div
              key={item}
              style={accentStyle(index)}
              className="cyber-option gap-5 px-5 py-4"
            >
              <span className="cyber-option-key w-12 h-12 text-2xl">?</span>
              <span className="text-3xl">{item}</span>
            </div>
          ))}
          <div className="cyber-hud text-center text-sm text-slate-500">
            Put them in the right order
          </div>
        </div>
      );

    default: {
      const isTrueFalse = question.type === QuestionType.TRUE_FALSE;
      return (
        <div className={`grid gap-5 ${isTrueFalse ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}>
          {question.options.map((option, index) => (
            <div
              key={index}
              style={accentStyle(index)}
              className={`cyber-option min-h-[6rem] px-6 py-5 gap-6 ${isTrueFalse ? "justify-center" : ""}`}
            >
              {!isTrueFalse && (
                <span className="cyber-option-key w-14 h-14 text-2xl">
                  {CHOICE_KEYS[index] ?? index + 1}
                </span>
              )}
              <span
                className={`leading-snug ${isTrueFalse ? "text-5xl uppercase tracking-wider" : "flex-1 text-3xl"}`}
              >
                {option}
              </span>
            </div>
          ))}
        </div>
      );
    }
  }
};

/**
 * The room's question.
 *
 * The header says plainly which question of the round this is, and the
 * caption under the options says it is the field's slowest table rather than
 * anybody's live question, so nobody reads it as the one they should be on.
 */
const QuestionStage: React.FC<{ snapshot: BroadcastSnapshot }> = ({
  snapshot,
}) => {
  const lockedIn = snapshot.roomLockedIn;
  const waiting = Math.max(0, snapshot.lanesInPlay - snapshot.lanesCompleted);
  // Everyone still answering is paused, so the room's clock is too.
  const answering = snapshot.lanes
    .flatMap(seatsOf)
    .filter((seat) => seat.status === LaneStatus.ANSWERING);
  const paused = answering.length > 0 && answering.every((seat) => seat.timerPaused);

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
      {/* Question + answers */}
      <div className="flex-1 flex flex-col justify-center gap-6 min-w-0">
        <QuestionPanel
          text={snapshot.question?.text ?? ""}
          number={snapshot.questionNumber}
          total={snapshot.questionsInRound}
          category={snapshot.category?.name ?? snapshot.question?.category}
          size="room"
        />

        <BroadcastOptions snapshot={snapshot} />

        {lockedIn ? (
          <div className="text-center">
            <div className="cyber-question text-3xl text-[#00f0ff] neon-text">
              Everyone is locked in
            </div>
            <div className="cyber-hud text-sm text-slate-400 mt-2">
              Answers revealed when the round is over
            </div>
            {snapshot.autoAdvance && (
              <div className="cyber-hud mt-3 text-base text-[#ff2bd6] animate-pulse">
                Next question in {snapshot.revealSecondsLeft}…
              </div>
            )}
          </div>
        ) : (
          <div className="cyber-hud text-center text-sm text-slate-500">
            {waiting > 0
              ? `Moves on when the last ${waiting === 1 ? "match is" : `${waiting} matches are`} through it`
              : "Everyone is through — moving on"}
          </div>
        )}
      </div>

      {/* Clock and the field's progress */}
      {/* The column scrolls, and a scrolling box clips whatever spills past
          its edges — so the padding is room for the timer's glow to fade out
          inside it rather than be sliced off along the top. */}
      <div className="w-full lg:w-96 shrink-0 flex flex-col items-center gap-5 overflow-y-auto custom-scrollbar pt-8 px-2">
        {lockedIn ? (
          <div className="w-48 h-48 shrink-0 rounded-full border-4 border-[#00f0ff] flex flex-col items-center justify-center bg-[#00f0ff]/5 shadow-[0_0_40px_rgba(0,240,255,0.35)]">
            <Lock size={52} className="text-[#00f0ff]" />
            <div className="cyber-hud mt-3 text-[10px] text-[#00f0ff] text-center px-4">
              All locked in
            </div>
          </div>
        ) : (
          <CountdownRing
            // The room is waiting on the table with the most clock left, so
            // that — not any one player's timer — is the honest countdown.
            timeLeft={snapshot.timeLeft}
            duration={snapshot.timerDuration}
            paused={paused}
          />
        )}

        <RoomProgress snapshot={snapshot} players={snapshot.players} />

        <LaneRace
          lanes={snapshot.lanes}
          players={snapshot.players}
          questionsInRound={snapshot.questionsInRound}
        />
      </div>
    </div>
  );
};

/**
 * The round's answers, once there is no match left to spoil: every question,
 * its answer, and how many in the room got it.
 */
const AnswerKey: React.FC<{ review: RoundReviewItem[] }> = ({ review }) => (
  <div>
    <div className="cyber-hud text-center text-xs text-slate-500 mb-3">
      Answer key
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {review.map((item, index) => (
        <div key={`${item.question.id}-${index}`} className="cyber-panel px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="cyber-hud text-xs text-[#00f0ff]">
              Q{String(index + 1).padStart(2, "0")}
            </span>
            <span className="cyber-hud text-[10px] text-slate-400 tracking-normal">
              {item.correctCount}/{item.answeredCount} got it
            </span>
          </div>
          <div className="cyber-question text-xl mt-1 leading-snug">
            {item.question.text}
          </div>
          <div className="cyber-question text-2xl mt-2 text-[#39ff88]">
            {item.reveal.label}
          </div>
          {item.reveal.explanation && (
            <p className="text-sm text-slate-400 mt-1">{item.reveal.explanation}</p>
          )}
        </div>
      ))}
    </div>
  </div>
);

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
            {!player.eliminated && player.losersBracket && (
              <span className="ml-3 text-xs font-mono uppercase tracking-widest text-orange-300">
                loser's bracket
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
        <h1 className="text-6xl font-black text-white neon-text neon-room">
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
                  showSide
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

      {snapshot.roundReview && snapshot.roundReview.length > 0 && (
        <AnswerKey review={snapshot.roundReview} />
      )}

      <LikedStrip snapshot={snapshot} />

      {snapshot.categoryPoll && (
        <CategoryVotePanel poll={snapshot.categoryPoll} readOnly size="lg" />
      )}

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
          <h1 className="text-6xl font-black text-white neon-text neon-room">
            FINAL STANDINGS
          </h1>
        )}
      </div>

      <LikedStrip snapshot={snapshot} />

      {snapshot.categoryPoll && (
        <CategoryVotePanel poll={snapshot.categoryPoll} readOnly size="lg" />
      )}

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
  const [outOfDate, setOutOfDate] = useState(false);
  // The channel is shared by the whole origin, so a second host tab would
  // otherwise flip this screen between two different games. Follow the first
  // host we hear from, and only switch once it has gone quiet.
  const latchedHost = useRef<string | null>(null);
  const lastHeard = useRef(0);

  /**
   * The room this screen follows over the network, when it is not the
   * projector window on the host's own machine. Carried on the URL, so a TV
   * that reloads comes straight back to the same game.
   */
  const [pin, setPin] = useState<string | null>(pinFromUrl);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const [link, setLink] = useState<RoomLink>(
    pin && canReachOtherDevices() ? "connecting" : "local",
  );

  // Anything this browser was holding from a different game is not this one.
  useEffect(() => {
    if (pin) {
      setSnapshot((current) =>
        current && current.gamePin !== pin ? null : current,
      );
    }
  }, [pin]);

  useEffect(() => {
    if (!pin || !canReachOtherDevices()) return;

    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setLink("connecting");

    const connect = async () => {
      const attached = await attachRoomChannel(pin, false, PLAYER_ATTACH_TIMEOUT_MS);
      if (cancelled) return;
      if (attached) {
        setLink("connected");
        // Ask for the game rather than waiting for its next change.
        postMessage({ type: "broadcast-hello", hostId: latchedHost.current });
        return;
      }
      const denied = roomFailureReason() === "denied";
      setLink(denied ? "denied" : "unreachable");
      // A screen on the wall has nobody standing at it to press retry.
      if (!denied) retry = setTimeout(() => void connect(), 5000);
    };

    void connect();

    return () => {
      cancelled = true;
      clearTimeout(retry);
      void detachRoomChannel();
    };
  }, [pin]);

  const followPin = (next: string) => {
    pinViewToUrl(next);
    latchedHost.current = null;
    setSnapshot(null);
    setPin(next);
  };

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
        // Rendering a snapshot from a build this window does not understand is
        // how a projector goes black in front of a room. Fetch the build that
        // wrote it instead.
        if (snapshotFit(message.snapshot) !== "ok") {
          setOutOfDate(true);
          reloadForNewBuild();
          return;
        }

        // A screen following one game by PIN ignores every other game this
        // browser can hear — including a host running on this same machine.
        if (pinRef.current && message.snapshot.gamePin !== pinRef.current) return;
        if (!claim(message.snapshot.hostId)) return;
        setSnapshot(message.snapshot);
        setHostSeenAt(Date.now());
      } else if (message.type === "host-heartbeat") {
        // A heartbeat carries no PIN, so a screen following one game only
        // takes them from the host whose snapshot it has already accepted.
        if (pinRef.current && latchedHost.current === null) return;
        if (!claim(message.hostId)) return;
        // When it got here, not the time the host stamped on it: that is the
        // host's clock, and a phone or projector running a few seconds ahead
        // of it would read every heartbeat as stale and show "no host" for
        // the whole game.
        setHostSeenAt(Date.now());
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
    if (outOfDate) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
          <div className="text-5xl font-black text-white">
            This display is out of date
          </div>
          <p className="text-2xl text-slate-400 max-w-3xl">
            The game was updated while this window was open. Reload it — the
            host's screen and the players are unaffected.
          </p>
          <div className="text-xl font-mono uppercase tracking-widest text-neon-blue animate-pulse">
            Trying to update itself…
          </div>
        </div>
      );
    }

    if (!snapshot) {
      return (
        <StandbyStage snapshot={null} pin={pin} link={link} onPin={followPin} />
      );
    }

    switch (snapshot.phase) {
      case GamePhase.CATEGORY_SELECT:
        return <RoundIntroStage snapshot={snapshot} />;
      case GamePhase.PLAYING:
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, outOfDate, pin, link]);

  return (
    <div className="min-h-screen h-screen tron-backdrop text-white p-6 flex flex-col overflow-hidden">
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

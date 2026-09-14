import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BroadcastSnapshot,
  GamePhase,
  LaneStatus,
  PublicLane,
  PublicQuestion,
  Question,
} from "../types";
import { useGame } from "../context/GameContext";
import {
  postMessage,
  readStoredSnapshot,
  subscribeToMessages,
} from "../services/broadcastBus";
import AvatarDisplay from "./AvatarDisplay";
import QuestionCard from "./QuestionCard";
import { CheckCircle2, Flag, Hourglass, Pause, Radio, Swords, Trophy } from "lucide-react";

/**
 * What a guest player sees after joining with a PIN.
 *
 * This tab holds no game of its own: it renders the host's snapshot and posts
 * answers back. That is the same one-way arrangement the projector uses, with
 * an answer panel added — so a player can never see or change anything the
 * host has not published.
 *
 * Everything on this screen comes from *this player's matchup*, never from the
 * room. The big screen is a question or two behind on purpose; a player who is
 * flying through their round should not be dragged back to it, and a player
 * taking their time should not see the answer to the question in front of them
 * because the table next door has finished.
 */

const HOST_TIMEOUT_MS = 8000;

/**
 * The snapshot's question carries no answer key, which is the point. Handing
 * it to QuestionCard needs a Question shape, so it gets one that cannot grade
 * anything — `canGrade={false}` keeps the card from pretending otherwise.
 */
const asAnswerable = (question: PublicQuestion): Question => ({
  id: question.id,
  category: question.category,
  text: question.text,
  options: question.options,
  correctIndex: -1,
  type: question.type,
});

/** This round's opponent, and where they have got to. */
const OpponentStrip: React.FC<{
  lane: PublicLane;
  snapshot: BroadcastSnapshot;
  playerId: string;
}> = ({ lane, snapshot, playerId }) => {
  const opponentId = lane.playerIds.find((id) => id !== playerId) ?? null;
  const opponent = opponentId
    ? snapshot.players.find((p) => p.id === opponentId)
    : null;
  const me = snapshot.players.find((p) => p.id === playerId);

  return (
    <div className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-bold text-white truncate">You</span>
        <span className="font-mono font-black text-neon-green">
          {me?.roundScore ?? 0}
        </span>
      </div>

      <Swords size={16} className="text-neon-pink shrink-0" />

      {opponent ? (
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-black text-neon-blue">
            {opponent.roundScore}
          </span>
          <span className="font-bold text-white truncate">{opponent.name}</span>
          <AvatarDisplay
            avatar={opponent.avatar}
            color={opponent.avatarColor}
            accessory={opponent.avatarAccessory}
            size="sm"
          />
          {lane.answeredPlayerIds.includes(opponent.id) ? (
            <CheckCircle2 size={16} className="text-neon-green shrink-0" />
          ) : (
            <Hourglass size={14} className="text-slate-500 shrink-0" />
          )}
        </div>
      ) : (
        <span className="italic text-slate-500 text-sm">bye — no opponent</span>
      )}
    </div>
  );
};

/** How far into the round this matchup is, against the rest of the field. */
const LaneProgress: React.FC<{ lane: PublicLane; snapshot: BroadcastSnapshot }> = ({
  lane,
  snapshot,
}) => {
  const total = snapshot.questionsInRound || 1;
  const ahead = snapshot.lanes.filter(
    (other) => other.id !== lane.id && other.completed > lane.completed,
  ).length;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-slate-500 mb-1">
        <span>
          Question {Math.min(lane.completed + 1, total)} of {total}
        </span>
        <span>
          {ahead === 0
            ? "you're leading the field"
            : `${ahead} matchup${ahead === 1 ? " is" : "s are"} ahead`}
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-neon-pink transition-all duration-500"
          style={{ width: `${(lane.completed / total) * 100}%` }}
        />
      </div>
    </div>
  );
};

const PlayerScreen: React.FC = () => {
  const { clientPin, currentPlayerId, gameName, restartGame } = useGame();
  const [snapshot, setSnapshot] = useState<BroadcastSnapshot | null>(() => {
    const stored = readStoredSnapshot();
    return stored?.gamePin === clientPin ? stored : null;
  });
  const [hostSeenAt, setHostSeenAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const latchedHost = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMessages((message) => {
      // Only this room's host, so a second game in another tab cannot take
      // the player's screen over.
      if (message.type === "snapshot") {
        if (message.snapshot.gamePin !== clientPin) return;
        latchedHost.current = message.snapshot.hostId;
        setSnapshot(message.snapshot);
        setHostSeenAt(Date.now());
      } else if (message.type === "host-heartbeat") {
        if (latchedHost.current && message.hostId !== latchedHost.current) return;
        setHostSeenAt(message.at);
      }
    });

    // Ask for a snapshot rather than waiting for the host's next change.
    postMessage({ type: "broadcast-hello", hostId: null });
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      unsubscribe();
      clearInterval(clock);
    };
  }, [clientPin]);

  const leave = () => {
    if (clientPin && currentPlayerId) {
      postMessage({ type: "player-leave", pin: clientPin, playerId: currentPlayerId });
    }
    restartGame();
  };

  const hostLive = hostSeenAt > 0 && now - hostSeenAt < HOST_TIMEOUT_MS;
  const me = snapshot?.players.find((p) => p.id === currentPlayerId);

  // The one thing this screen is built around: the lane this player is in.
  const lane = useMemo(
    () =>
      snapshot?.lanes.find((candidate) =>
        candidate.playerIds.includes(currentPlayerId ?? ""),
      ) ?? null,
    [snapshot, currentPlayerId],
  );
  const answering = lane?.answeringIds.includes(currentPlayerId ?? "") ?? false;
  const answered = lane?.answeredPlayerIds.includes(currentPlayerId ?? "") ?? false;
  const question = useMemo(
    () => (lane?.question ? asAnswerable(lane.question) : null),
    [lane?.question],
  );

  const roundBody = () => {
    if (!lane) {
      return (
        <div className="text-center py-12 text-slate-400">
          You are out of the bracket — watching this one on the big screen.
        </div>
      );
    }

    if (lane.status === LaneStatus.DONE) {
      return (
        <div className="text-center py-12">
          <Flag size={40} className="mx-auto text-neon-green mb-3" />
          <div className="text-3xl font-black text-white mb-2">
            Round done
          </div>
          <p className="text-slate-400">
            You are through all {snapshot?.questionsInRound} questions.{" "}
            {snapshot && snapshot.lanesInPlay - snapshot.lanesCompleted > 0
              ? "Waiting on the other matchups to finish theirs."
              : "Results are coming up."}
          </p>
        </div>
      );
    }

    if (lane.status === LaneStatus.REVEAL) {
      const wasRight = lane.correctPlayerIds.includes(currentPlayerId ?? "");
      return (
        <div className="text-center py-8">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">
            Answer
          </div>
          <div className="text-3xl font-black text-green-400 mb-3">
            {lane.reveal?.label}
          </div>
          {lane.reveal?.explanation && (
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
              {lane.reveal.explanation}
            </p>
          )}
          <div
            className={`text-xl font-bold ${wasRight ? "text-green-400" : "text-red-400"}`}
          >
            {wasRight ? "You got it" : answered ? "Not this time" : "No answer"}
          </div>
          <div className="mt-4 text-sm font-mono uppercase tracking-widest text-neon-blue animate-pulse">
            Next question in {lane.revealSecondsLeft}…
          </div>
        </div>
      );
    }

    if (!answering) {
      return (
        <div className="text-center py-12 text-slate-400">
          You are not answering this round — watching your matchup play out.
        </div>
      );
    }

    if (answered) {
      const waiting = lane.answeringIds.filter(
        (id) => !lane.answeredPlayerIds.includes(id),
      ).length;
      return (
        <div className="text-center py-12">
          <div className="text-3xl font-black text-neon-green mb-2">
            Locked in
          </div>
          <p className="text-slate-400">
            {waiting > 0
              ? "Waiting on your opponent — the answer comes up as soon as they are in."
              : "Scoring it now…"}
          </p>
        </div>
      );
    }

    if (!question) return null;

    return (
      <>
        {lane.timerPaused && (
          <div className="flex items-center justify-center gap-2 text-neon-yellow font-mono uppercase tracking-widest text-xs mb-3">
            <Pause size={14} /> the host paused your clock
          </div>
        )}
        <QuestionCard
          key={question.id}
          question={question}
          timeLeft={lane.timeLeft}
          duration={lane.timerDuration}
          canGrade={false}
          compact
        />
      </>
    );
  };

  const body = () => {
    if (!snapshot) {
      return (
        <div className="text-center text-slate-400 py-16">
          <Hourglass className="mx-auto mb-4 animate-pulse" size={40} />
          <p className="font-mono uppercase tracking-widest">
            Waiting for the host
          </p>
        </div>
      );
    }

    switch (snapshot.phase) {
      case GamePhase.LOBBY:
        return (
          <div className="text-center py-12">
            <div className="text-2xl font-black text-white mb-2">You're in</div>
            <p className="text-slate-400">
              {snapshot.players.length} in the room. The host starts when
              everyone has joined.
            </p>
          </div>
        );

      case GamePhase.CATEGORY_SELECT:
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎡</div>
            <div className="text-xl font-bold text-white">
              Round {snapshot.roundNumber}
              {snapshot.category ? ` — ${snapshot.category.name}` : ""}
            </div>
            <p className="text-slate-500 font-mono uppercase tracking-widest mt-2 text-sm">
              {snapshot.category ? "Get ready" : "Waiting on the spin"}
            </p>
            <p className="text-slate-500 text-sm mt-4 max-w-sm mx-auto">
              You play this round against your own opponent, at your own pace —
              answer as fast as you like.
            </p>
          </div>
        );

      case GamePhase.PLAYING:
        return roundBody();

      default:
        return (
          <div className="space-y-2 py-6">
            {[...snapshot.players]
              .sort((a, b) => b.score - a.score)
              .map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    player.id === currentPlayerId
                      ? "bg-slate-800 border-neon-blue"
                      : "bg-slate-900 border-slate-800"
                  } ${player.eliminated ? "opacity-50" : ""}`}
                >
                  <span className="w-8 text-center font-mono text-slate-500">
                    {index === 0 ? (
                      <Trophy size={16} className="text-yellow-400 mx-auto" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <AvatarDisplay
                    avatar={player.avatar}
                    color={player.avatarColor}
                    accessory={player.avatarAccessory}
                    size="sm"
                  />
                  <span className="flex-1 truncate font-bold text-white">
                    {player.name}
                  </span>
                  <span className="font-mono font-bold text-neon-pink">
                    {player.score}
                  </span>
                </div>
              ))}
          </div>
        );
    }
  };

  const showingQuestion =
    snapshot?.phase === GamePhase.PLAYING &&
    lane?.status === LaneStatus.ANSWERING &&
    !!lane.question;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col">
      <header className="flex items-center justify-between mb-4">
        <div>
          <div className="text-lg font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink">
            OMNI<span className="text-white">TRIVIA</span>
          </div>
          <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
            {snapshot?.gameName || gameName} · PIN {clientPin}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {me && (
            <div className="flex items-center gap-2">
              <AvatarDisplay
                avatar={me.avatar}
                color={me.avatarColor}
                accessory={me.avatarAccessory}
                size="sm"
              />
              <div className="text-right">
                <div className="text-sm font-bold leading-none">{me.name}</div>
                <div className="text-xs font-mono text-neon-pink">
                  {me.score}
                </div>
              </div>
            </div>
          )}
          <span
            className={`flex items-center gap-1 text-xs font-mono uppercase ${
              hostLive ? "text-neon-green" : "text-red-500 animate-pulse"
            }`}
          >
            <Radio size={12} />
            {hostLive ? "live" : "no host"}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center max-w-3xl w-full mx-auto">
        {snapshot?.phase === GamePhase.PLAYING && lane && (
          <>
            <OpponentStrip
              lane={lane}
              snapshot={snapshot}
              playerId={currentPlayerId ?? ""}
            />
            <LaneProgress lane={lane} snapshot={snapshot} />
          </>
        )}

        {showingQuestion && (
          <div className="bg-white text-slate-900 p-5 rounded-2xl mb-4 text-center">
            <h1 className="text-xl md:text-2xl font-black leading-snug">
              {lane?.question?.text}
            </h1>
          </div>
        )}
        {body()}
      </main>

      <footer className="pt-4 text-center">
        <button
          onClick={leave}
          className="text-xs font-mono uppercase tracking-widest text-slate-600 hover:text-slate-300"
        >
          Leave game
        </button>
      </footer>
    </div>
  );
};

export default PlayerScreen;

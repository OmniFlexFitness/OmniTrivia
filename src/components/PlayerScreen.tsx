import React, { useEffect, useMemo, useRef, useState } from "react";
import { BroadcastSnapshot, GamePhase, Question } from "../types";
import { useGame } from "../context/GameContext";
import {
  postMessage,
  readStoredSnapshot,
  subscribeToMessages,
} from "../services/broadcastBus";
import AvatarDisplay from "./AvatarDisplay";
import QuestionCard from "./QuestionCard";
import { Hourglass, Radio, Trophy } from "lucide-react";

/**
 * What a guest player sees after joining with a PIN.
 *
 * This tab holds no game of its own: it renders the host's snapshot and posts
 * answers back. That is the same one-way arrangement the projector uses, with
 * an answer panel added — so a player can never see or change anything the
 * host has not published.
 */

const HOST_TIMEOUT_MS = 8000;

/**
 * The snapshot's question carries no answer key, which is the point. Handing
 * it to QuestionCard needs a Question shape, so it gets one that cannot grade
 * anything — `canGrade={false}` keeps the card from pretending otherwise.
 */
const asAnswerable = (snapshot: BroadcastSnapshot): Question | null => {
  const question = snapshot.question;
  if (!question) return null;

  return {
    id: question.id,
    category: question.category,
    text: question.text,
    options: question.options,
    correctIndex: -1,
    type: question.type,
  };
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
  const answered = snapshot?.answeredPlayerIds.includes(currentPlayerId ?? "");
  const inThisQuestion = snapshot?.activePlayerIds.includes(currentPlayerId ?? "");
  const question = useMemo(
    () => (snapshot ? asAnswerable(snapshot) : null),
    [snapshot],
  );

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
          </div>
        );

      case GamePhase.PLAYING:
        if (!question) return null;
        if (!inThisQuestion) {
          return (
            <div className="text-center py-12 text-slate-400">
              You are out of the bracket — watching this one.
            </div>
          );
        }
        if (answered) {
          return (
            <div className="text-center py-12">
              <div className="text-3xl font-black text-neon-green mb-2">
                Locked in
              </div>
              <p className="text-slate-400">
                {snapshot.answeredPlayerIds.length}/
                {snapshot.activePlayerIds.length} answered — eyes on the big
                screen.
              </p>
            </div>
          );
        }
        return (
          <QuestionCard
            key={question.id}
            question={question}
            canGrade={false}
            compact
          />
        );

      case GamePhase.QUESTION_REVEAL:
        return (
          <div className="text-center py-10">
            <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">
              Answer
            </div>
            <div className="text-3xl font-black text-green-400 mb-4">
              {snapshot.reveal?.label}
            </div>
            <div
              className={`text-xl font-bold ${
                snapshot.correctPlayerIds.includes(currentPlayerId ?? "")
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {snapshot.correctPlayerIds.includes(currentPlayerId ?? "")
                ? "You got it"
                : answered
                  ? "Not this time"
                  : "No answer"}
            </div>
          </div>
        );

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
        {snapshot?.question && snapshot.phase === GamePhase.PLAYING && (
          <div className="bg-white text-slate-900 p-5 rounded-2xl mb-4 text-center">
            <h1 className="text-xl md:text-2xl font-black leading-snug">
              {snapshot.question.text}
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

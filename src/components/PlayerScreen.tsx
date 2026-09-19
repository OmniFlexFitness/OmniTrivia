import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BroadcastSnapshot,
  Category,
  GamePhase,
  LaneStatus,
  Matchup,
  PublicLane,
  PublicQuestion,
  PublicSeat,
  Question,
} from "../types";
import { useGame } from "../context/GameContext";
import { seatsOf } from "../services/snapshot";
import {
  postMessage,
  readStoredSnapshot,
  reloadForNewBuild,
  snapshotFit,
  subscribeToMessages,
} from "../services/broadcastBus";
import AvatarDisplay from "./AvatarDisplay";
import QuestionCard from "./QuestionCard";
import Instructions from "./Instructions";
import CategoryLikeButton from "./CategoryLikeButton";
import CategoryVotePanel from "./CategoryVotePanel";
import SpectatorWheel from "./SpectatorWheel";
import Button from "./Button";
import {
  ArrowRight,
  Flag,
  Hourglass,
  Pause,
  Radio,
  Swords,
  Trophy,
} from "lucide-react";

/**
 * What a guest player sees after joining with a PIN.
 *
 * This tab holds no game of its own: it renders the host's snapshot and posts
 * answers back. That is the same one-way arrangement the projector uses, with
 * an answer panel added — so a player can never see or change anything the
 * host has not published.
 *
 * Everything on this screen comes from *this player's own seat*, never from
 * the room and not even from the person they are playing. Answer, see how you
 * did, take the next one: the only thing that ever holds this screen up is the
 * player holding it.
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

/**
 * Who this player is drawn against, for a round that has not started yet.
 *
 * Between rounds a phone has nothing in front of it — no question, no clock —
 * and the one thing its owner wants to know is who they are playing. The
 * bracket travels on the snapshot, so it can be answered here rather than left
 * to whoever can read the projector from where they are sitting.
 */
const MyMatchup: React.FC<{
  matchups: Matchup[];
  snapshot: BroadcastSnapshot;
  playerId: string | null;
  label: string;
}> = ({ matchups, snapshot, playerId, label }) => {
  if (!playerId) return null;

  const matchup = matchups.find(
    (candidate) =>
      candidate.playerAId === playerId || candidate.playerBId === playerId,
  );

  const opponentId = matchup
    ? matchup.playerAId === playerId
      ? matchup.playerBId
      : matchup.playerAId
    : null;
  const opponent = opponentId
    ? snapshot.players.find((player) => player.id === opponentId)
    : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
      <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500 mb-2">
        {label}
      </div>

      {!matchup ? (
        <div className="text-sm text-slate-400">
          Not in this one — you are out of the bracket, watching from the
          leaderboard.
        </div>
      ) : opponent ? (
        <div className="flex items-center justify-center gap-3">
          <span className="font-bold text-white">You</span>
          <Swords size={16} className="text-neon-pink shrink-0" />
          <AvatarDisplay
            avatar={opponent.avatar}
            color={opponent.avatarColor}
            accessory={opponent.avatarAccessory}
            size="sm"
          />
          <span className="font-bold text-neon-blue truncate">
            {opponent.name}
          </span>
        </div>
      ) : (
        <div className="text-sm text-neon-green font-bold">
          Bye — you go through without playing anyone.
        </div>
      )}
    </div>
  );
};

/**
 * The wheel, on a player's phone, between rounds.
 *
 * Everyone in the room is looking at the same spin; there is no reason the
 * people holding the phones should be the only ones watching an emoji. The
 * wheel here turns with the host's and stops on the same category — and, like
 * the projector, is never told which one that is until it has stopped.
 */
const RoundIntro: React.FC<{
  snapshot: BroadcastSnapshot;
  playerId: string | null;
  /** Shown once the wheel has stopped — it names the category. */
  children?: React.ReactNode;
}> = ({ snapshot, playerId, children }) => {
  // Missing from a snapshot written by a build older than the wheel, which is
  // a game that keeps running — it just gets the screen it had before.
  const slices = snapshot.wheelSlices ?? [];
  const round = snapshot.bracket[snapshot.roundNumber - 1];
  // What this phone's own wheel has stopped on. Naming the category the moment
  // the host's wheel stops would spoil the one on the screen in front of them.
  const [settled, setSettled] = useState<Category | null>(null);
  // Without a wheel there is nothing to spoil, so the caption follows the host.
  const announced = slices.length > 0 ? settled : snapshot.category;
  const turning = snapshot.wheelSpinning || (!!snapshot.category && !announced);

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className="text-xs font-mono uppercase tracking-[0.3em] text-slate-500">
        Round {snapshot.roundNumber} of {snapshot.totalRounds}
      </div>

      {slices.length > 0 ? (
        <SpectatorWheel
          categories={slices}
          spinning={snapshot.wheelSpinning}
          landed={snapshot.category}
          roundNumber={snapshot.roundNumber}
          onSettled={setSettled}
          className="w-56 h-56 sm:w-64 sm:h-64"
        />
      ) : (
        <div
          className={`text-6xl ${snapshot.wheelSpinning ? "animate-spin-slow" : ""}`}
        >
          🎡
        </div>
      )}

      <div className="text-center">
        {announced ? (
          <div className="text-2xl font-black text-white">
            {announced.icon} {announced.name}
          </div>
        ) : (
          <div className="text-xl font-bold text-slate-300">
            {turning ? "Spinning…" : "Waiting on the spin"}
          </div>
        )}
        <p className="text-slate-500 font-mono uppercase tracking-widest mt-1 text-xs">
          {announced ? "Get ready" : "Category up next"}
        </p>
      </div>

      {round && (
        <div className="w-full max-w-sm">
          <MyMatchup
            matchups={round.matchups}
            snapshot={snapshot}
            playerId={playerId}
            label="Your matchup this round"
          />
        </div>
      )}

      <p className="text-slate-500 text-sm text-center max-w-sm">
        You play this round against one opponent, at your own pace. Answer fast
        — every second left on your clock is worth points.
      </p>

      {announced && children}
    </div>
  );
};

/** This round's opponent, and where they have got to in their own match. */
const OpponentStrip: React.FC<{
  lane: PublicLane;
  snapshot: BroadcastSnapshot;
  playerId: string;
}> = ({ lane, snapshot, playerId }) => {
  const opponentId = lane.playerIds.find((id) => id !== playerId) ?? null;
  const opponent = opponentId
    ? snapshot.players.find((p) => p.id === opponentId)
    : null;
  const opponentSeat = seatsOf(lane).find((seat) => seat.playerId === opponentId);
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
          {/* Where they are, not whether you are waiting on them — you never
              are. It is a scoreboard, not a queue. */}
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 shrink-0">
            {opponentSeat?.status === LaneStatus.DONE
              ? "done"
              : `Q${opponentSeat?.questionNumber ?? 1}`}
          </span>
        </div>
      ) : (
        <span className="italic text-slate-500 text-sm">bye — no opponent</span>
      )}
    </div>
  );
};

/** How far into the round this player is, against the rest of the field. */
const SeatProgress: React.FC<{
  seat: PublicSeat;
  snapshot: BroadcastSnapshot;
}> = ({ seat, snapshot }) => {
  const total = snapshot.questionsInRound || 1;
  const ahead = snapshot.lanes
    .flatMap(seatsOf)
    .filter(
      (other) =>
        other.playerId !== seat.playerId && other.completed > seat.completed,
    ).length;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-slate-500 mb-1">
        {/* Which question this is about, not which one is next: on the reveal
            these two differ, and the answer on screen belongs to the one just
            closed. */}
        <span>
          {seat.status === LaneStatus.REVEAL
            ? `Answer to question ${seat.questionNumber} of ${total}`
            : seat.status === LaneStatus.DONE
              ? `All ${total} questions done`
              : `Question ${Math.min(seat.completed + 1, total)} of ${total}`}
        </span>
        <span>
          {ahead === 0
            ? "you're leading the field"
            : `${ahead} player${ahead === 1 ? " is" : "s are"} ahead`}
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-neon-pink transition-all duration-500"
          style={{ width: `${(seat.completed / total) * 100}%` }}
        />
      </div>
    </div>
  );
};

const PlayerScreen: React.FC = () => {
  const {
    clientPin,
    currentPlayerId,
    gameName,
    restartGame,
    advanceMyQuestion,
    setCategoryLike,
    voteForCategory,
  } = useGame();
  const [snapshot, setSnapshot] = useState<BroadcastSnapshot | null>(() => {
    const stored = readStoredSnapshot();
    return stored?.gamePin === clientPin ? stored : null;
  });
  const [hostSeenAt, setHostSeenAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [outOfDate, setOutOfDate] = useState(false);
  const latchedHost = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMessages((message) => {
      // Only this room's host, so a second game in another tab cannot take
      // the player's screen over.
      if (message.type === "snapshot") {
        if (message.snapshot.gamePin !== clientPin) return;

        // A snapshot from a build this one does not understand is not rendered
        // — it is what turns a phone black in the middle of a round. Fields
        // move between versions, and a moved field reads as `undefined` right
        // up until something calls a method on it.
        if (snapshotFit(message.snapshot) !== "ok") {
          setOutOfDate(true);
          // The game has been redeployed under this phone; go and get it.
          reloadForNewBuild();
          return;
        }

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

  // The two things this screen is built around: the match this player is in,
  // and their own seat at it.
  const lane = useMemo(
    () =>
      snapshot?.lanes.find((candidate) =>
        candidate.playerIds.includes(currentPlayerId ?? ""),
      ) ?? null,
    [snapshot, currentPlayerId],
  );
  const seat = useMemo(
    () =>
      (lane ? seatsOf(lane) : []).find(
        (candidate) => candidate.playerId === currentPlayerId,
      ) ?? null,
    [lane, currentPlayerId],
  );
  const question = useMemo(
    () => (seat?.question ? asAnswerable(seat.question) : null),
    [seat?.question],
  );

  /* --- liking the category this game is on --- */
  const category = snapshot?.category ?? null;
  const likeRow = category
    ? snapshot?.categoryLikes.find((row) => row.categoryId === category.id)
    : undefined;
  const liked = Boolean(
    currentPlayerId && likeRow?.playerIds.includes(currentPlayerId),
  );

  const likeStrip = category && (
    <div className="flex justify-center mt-5">
      <CategoryLikeButton
        category={category}
        count={likeRow?.count ?? 0}
        liked={liked}
        onToggle={(next) => setCategoryLike(category.id, next)}
        compact
      />
    </div>
  );

  const poll = snapshot?.categoryPoll ?? null;
  const ballot = poll && (
    <div className="mt-5">
      <CategoryVotePanel
        poll={poll}
        myVote={currentPlayerId ? (poll.votes[currentPlayerId] ?? null) : null}
        onVote={(categoryId) => voteForCategory(poll.id, categoryId)}
      />
    </div>
  );

  const roundBody = () => {
    if (!lane) {
      return (
        <div className="text-center py-12 text-slate-400">
          You are out of the bracket — watching this one on the big screen.
        </div>
      );
    }

    if (!seat) {
      return (
        <div className="text-center py-12 text-slate-400">
          You are not answering this round — watching your match play out.
        </div>
      );
    }

    if (seat.status === LaneStatus.DONE) {
      const stillGoing = snapshot
        ? snapshot.lanes
            .flatMap(seatsOf)
            .filter((other) => other.status !== LaneStatus.DONE).length
        : 0;

      return (
        <div className="text-center py-12">
          <Flag size={40} className="mx-auto text-neon-green mb-3" />
          <div className="text-3xl font-black text-white mb-2">Round done</div>
          <p className="text-slate-400">
            You are through all {snapshot?.questionsInRound} questions.{" "}
            {stillGoing > 0
              ? `${stillGoing} player${stillGoing === 1 ? " is" : "s are"} still going.`
              : "Results are coming up."}
          </p>
        </div>
      );
    }

    if (seat.status === LaneStatus.REVEAL) {
      const wasRight = seat.wasCorrect === true;
      return (
        <div className="text-center py-6">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">
            Answer
          </div>
          <div className="text-3xl font-black text-green-400 mb-3">
            {seat.reveal?.label}
          </div>
          {seat.reveal?.explanation && (
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
              {seat.reveal.explanation}
            </p>
          )}
          <div
            className={`text-xl font-bold ${wasRight ? "text-green-400" : "text-red-400"}`}
          >
            {wasRight
              ? `You got it — +${seat.lastPoints ?? 0}`
              : seat.answered
                ? "Not this time"
                : "No answer"}
          </div>

          {/* The whole point of the format: read it, move on, keep the clock
              on your side. The countdown below is only a backstop. */}
          <Button
            onClick={advanceMyQuestion}
            variant="neon"
            fullWidth
            className="mt-6 h-14 text-lg flex items-center justify-center gap-2"
          >
            {seat.questionNumber >= (snapshot?.questionsInRound ?? 0)
              ? "FINISH THE ROUND"
              : "NEXT QUESTION"}
            <ArrowRight size={20} />
          </Button>
          <div className="mt-2 text-[11px] font-mono uppercase tracking-widest text-slate-600">
            moves on by itself in {seat.revealSecondsLeft}s
          </div>
        </div>
      );
    }

    if (seat.answered) {
      return (
        <div className="text-center py-12">
          <div className="text-3xl font-black text-neon-green mb-2">
            Locked in
          </div>
          <p className="text-slate-400">Scoring it…</p>
        </div>
      );
    }

    if (!question) return null;

    return (
      <>
        {seat.timerPaused && (
          <div className="flex items-center justify-center gap-2 text-neon-yellow font-mono uppercase tracking-widest text-xs mb-3">
            <Pause size={14} /> the host paused your clock
          </div>
        )}
        <QuestionCard
          key={`${question.id}-${seat.questionNumber}`}
          question={question}
          timeLeft={seat.timeLeft}
          duration={seat.timerDuration}
          canGrade={false}
          compact
        />
      </>
    );
  };

  const body = () => {
    if (outOfDate) {
      return (
        <div className="text-center py-16 space-y-4">
          <div className="text-2xl font-black text-white">
            This page is out of date
          </div>
          <p className="text-slate-400 max-w-sm mx-auto">
            The game was updated while you had it open, so this phone is
            running an older version of it. Reload to join back in — your seat
            and your score are kept.
          </p>
          <Button
            onClick={() => window.location.reload()}
            variant="neon"
            className="mx-auto"
          >
            RELOAD
          </Button>
        </div>
      );
    }

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
          <RoundIntro snapshot={snapshot} playerId={currentPlayerId}>
            {likeStrip}
          </RoundIntro>
        );

      case GamePhase.PLAYING:
        return (
          <>
            {roundBody()}
            {likeStrip}
          </>
        );

      default:
        return (
          <>
            {/* The pairings for the round after this one are drawn the moment
                this one is settled, so the wait between rounds can at least
                say who you are playing next. */}
            {snapshot.nextRoundMatchups && (
              <MyMatchup
                matchups={snapshot.nextRoundMatchups}
                snapshot={snapshot}
                playerId={currentPlayerId}
                label="Next round"
              />
            )}

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
            {likeStrip}
            {ballot}
          </>
        );
    }
  };

  const guide = (() => {
    switch (snapshot?.phase) {
      case GamePhase.PLAYING:
        return "playing" as const;
      case GamePhase.CATEGORY_SELECT:
        return "categorySelect" as const;
      case GamePhase.ROUND_END:
        return "roundEnd" as const;
      case GamePhase.GAME_OVER:
        return "gameOver" as const;
      default:
        return "join" as const;
    }
  })();

  const showingQuestion =
    snapshot?.phase === GamePhase.PLAYING &&
    seat?.status === LaneStatus.ANSWERING &&
    !seat.answered &&
    !!seat.question;

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
        <Instructions guide={guide} className="mb-4" />

        {snapshot?.phase === GamePhase.PLAYING && lane && seat && (
          <>
            <OpponentStrip
              lane={lane}
              snapshot={snapshot}
              playerId={currentPlayerId ?? ""}
            />
            <SeatProgress seat={seat} snapshot={snapshot} />
          </>
        )}

        {showingQuestion && (
          <div className="bg-white text-slate-900 p-5 rounded-2xl mb-4 text-center">
            <h1 className="text-xl md:text-2xl font-black leading-snug">
              {seat?.question?.text}
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

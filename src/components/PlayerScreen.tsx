import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Answer,
  BroadcastSnapshot,
  Category,
  GamePhase,
  LaneStatus,
  Matchup,
  PublicLane,
  PublicPlayer,
  PublicQuestion,
  PublicSeat,
  Question,
  QuestionType,
  RoundReviewItem,
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
import VersusIntro, { VersusStrip } from "./VersusIntro";
import { QuestionPanel } from "./CyberQuestion";
import Button from "./Button";
import {
  ArrowRight,
  Check,
  Flag,
  Hourglass,
  Lock,
  Minus,
  Pause,
  Radio,
  Swords,
  TimerOff,
  Trophy,
  X,
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
 * the room and not even from the person they are playing. Answer, lock it in,
 * take the next one: the only thing that ever holds this screen up is the
 * player holding it.
 *
 * What it does not do is say how an answer went. Nobody learns whether they
 * were right until their match is over — then the whole round lands at once,
 * and the answer key follows when every match in the room has finished.
 */

const HOST_TIMEOUT_MS = 8000;

/**
 * The snapshot's question carries no answer key, which is the point. Handing
 * it to QuestionCard needs a Question shape, so it gets one that cannot grade
 * anything — and the card never grades anyway.
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

/** How long the VS intro holds, at least, before the wheel may replace it. */
const VERSUS_MIN_MS = 3200;

/** This player's pairing in a round, and the two people in it. */
const pairingFor = (
  matchups: Matchup[] | undefined,
  snapshot: BroadcastSnapshot,
  playerId: string | null,
): { me: PublicPlayer; opponent: PublicPlayer | null } | null => {
  if (!playerId || !matchups) return null;
  const matchup = matchups.find(
    (candidate) =>
      candidate.playerAId === playerId || candidate.playerBId === playerId,
  );
  const me = snapshot.players.find((player) => player.id === playerId);
  if (!matchup || !me) return null;

  const opponentId =
    matchup.playerAId === playerId ? matchup.playerBId : matchup.playerAId;
  return {
    me,
    opponent: opponentId
      ? (snapshot.players.find((player) => player.id === opponentId) ?? null)
      : null,
  };
};

/**
 * Between rounds, on a player's phone: first who they are playing, then the
 * wheel.
 *
 * The phone opens on the matchup — a VS screen — because that is the thing
 * its owner wants to know, and it is the one screen in the room that is only
 * about them. When the host spins, the wheel takes over, turning with the
 * host's and stopping on the same category; like the projector's, it is never
 * told which one that is until it has stopped. The pairing stays above it.
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
  const pairing = pairingFor(round?.matchups, snapshot, playerId);
  // What this phone's own wheel has stopped on. Naming the category the moment
  // the host's wheel stops would spoil the one on the screen in front of them.
  const [settled, setSettled] = useState<Category | null>(null);
  // Without a wheel there is nothing to spoil, so the caption follows the host.
  const announced = slices.length > 0 ? settled : snapshot.category;
  const turning = snapshot.wheelSpinning || (!!snapshot.category && !announced);

  // The VS gets its moment even if the host spins straight away: the wheel
  // joins mid-turn and still lands on the same slice.
  const [versusHeld, setVersusHeld] = useState(true);
  useEffect(() => {
    setVersusHeld(true);
    const timer = setTimeout(() => setVersusHeld(false), VERSUS_MIN_MS);
    return () => clearTimeout(timer);
  }, [snapshot.roundNumber]);

  const spinStarted = snapshot.wheelSpinning || !!snapshot.category;
  if (pairing && (versusHeld || !spinStarted)) {
    return (
      <VersusIntro
        me={pairing.me}
        opponent={pairing.opponent}
        roundNumber={snapshot.roundNumber}
        totalRounds={snapshot.totalRounds}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className="cyber-hud text-[11px] text-slate-500">
        Round {snapshot.roundNumber} of {snapshot.totalRounds}
      </div>

      {pairing && <VersusStrip me={pairing.me} opponent={pairing.opponent} />}

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
          <div className="cyber-question text-3xl text-white neon-text">
            {announced.icon} {announced.name}
          </div>
        ) : (
          <div className="cyber-hud text-sm text-slate-300 animate-pulse">
            {turning ? "Spinning…" : "Waiting on the spin"}
          </div>
        )}
        <p className="cyber-hud text-slate-500 mt-2 text-[10px]">
          {announced ? "Get ready" : "Category up next"}
        </p>
      </div>

      {round && !pairing && (
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
        — every second left on your clock is worth points. You find out how you
        did when your match is over.
      </p>

      {announced && children}
    </div>
  );
};

/**
 * This round's opponent, and where they have got to in their own match.
 *
 * Progress only — no scores. A score that jumps after an answer is a verdict
 * on it, and nobody gets one of those until the match is over.
 */
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
  const mySeat = seatsOf(lane).find((seat) => seat.playerId === playerId);
  const total = snapshot.questionsInRound || 1;

  const where = (seat: PublicSeat | undefined) =>
    seat?.status === LaneStatus.DONE
      ? "done"
      : `Q${Math.min((seat?.completed ?? 0) + 1, total)}/${total}`;

  return (
    <div className="cyber-panel flex items-center justify-between gap-3 px-4 py-3 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className="cyber-question text-base text-[#00f0ff] truncate">You</span>
        <span className="cyber-hud text-[10px] text-slate-400 tracking-normal">
          {where(mySeat)}
        </span>
      </div>

      <span
        className="font-hud font-black italic text-lg shrink-0"
        style={{ textShadow: "-2px 0 0 #00f0ff, 2px 0 0 #ff2bd6" }}
      >
        VS
      </span>

      {opponent ? (
        <div className="flex items-center gap-2 min-w-0">
          {/* Where they are, not whether you are waiting on them — you never
              are. It is a scoreboard of pace, not of points. */}
          <span className="cyber-hud text-[10px] text-slate-400 tracking-normal shrink-0">
            {where(opponentSeat)}
          </span>
          <span className="cyber-question text-base text-[#ff2bd6] truncate">
            {opponent.name}
          </span>
          <AvatarDisplay
            avatar={opponent.avatar}
            color={opponent.avatarColor}
            accessory={opponent.avatarAccessory}
            size="sm"
          />
        </div>
      ) : (
        <span className="italic text-slate-500 text-sm">bye — no opponent</span>
      )}
    </div>
  );
};

/** One question's outcome as a small chip: ✓, ✕, or – for no answer. */
const ResultChip: React.FC<{ index: number; answered: boolean; correct: boolean; points: number }> = ({
  index,
  answered,
  correct,
  points,
}) => (
  <div
    className={`flex flex-col items-center justify-center gap-0.5 w-14 py-2 border ${
      correct
        ? "border-[#39ff88] bg-[#39ff88]/10 text-[#39ff88]"
        : answered
          ? "border-[#ff3b5c] bg-[#ff3b5c]/10 text-[#ff3b5c]"
          : "border-slate-600 bg-slate-800/60 text-slate-400"
    }`}
  >
    <span className="cyber-hud text-[9px] tracking-normal text-slate-400">Q{index + 1}</span>
    {correct ? <Check size={18} /> : answered ? <X size={18} /> : <Minus size={18} />}
    <span className="font-mono text-[10px]">{correct ? `+${points}` : "0"}</span>
  </div>
);

/**
 * The end of a match, on the phone of someone in it.
 *
 * This is where a player finds out how they did — every question at once, and
 * where they finished against their opponent. The answers themselves follow
 * at the end of the round, once no other match can still be on them.
 */
const MatchResult: React.FC<{
  lane: PublicLane;
  seat: PublicSeat;
  snapshot: BroadcastSnapshot;
  playerId: string;
}> = ({ lane, seat, snapshot, playerId }) => {
  const results = seat.results ?? [];
  const mine = seat.roundPoints ?? 0;
  const correct = results.filter((result) => result.correct).length;

  const opponentId = lane.playerIds.find((id) => id !== playerId) ?? null;
  const opponent = opponentId
    ? snapshot.players.find((p) => p.id === opponentId)
    : null;
  const opponentSeat = seatsOf(lane).find((candidate) => candidate.playerId === opponentId);
  const theirs = opponentSeat?.roundPoints ?? opponent?.roundScore ?? 0;
  const theirCorrect = (opponentSeat?.results ?? []).filter((r) => r.correct).length;

  // Matchups are settled on this round's points; a tie falls to total score,
  // which is decided on the desk when the round closes.
  const verdict = !opponent
    ? { text: "Bye — you advance", tone: "text-[#39ff88]" }
    : mine > theirs
      ? { text: "You win the match", tone: "text-[#39ff88]" }
      : mine < theirs
        ? { text: "You lose the match", tone: "text-[#ff3b5c]" }
        : { text: "Dead level — settled on total score", tone: "text-[#f5ff3b]" };

  return (
    <div className="py-4 space-y-5">
      <div className="text-center">
        <div className="cyber-hud text-[11px] text-slate-500">Match complete</div>
        <div className={`cyber-question text-3xl mt-1 ${verdict.tone}`}>{verdict.text}</div>
      </div>

      <div className="cyber-panel grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4">
        <div className="text-center min-w-0">
          <div className="cyber-hud text-[10px] text-[#00f0ff]">You</div>
          <div className="font-hud font-black text-3xl text-white tabular-nums">{mine}</div>
          <div className="text-xs text-slate-400">
            {correct}/{results.length} correct
          </div>
        </div>
        <span
          className="font-hud font-black italic text-xl"
          style={{ textShadow: "-2px 0 0 #00f0ff, 2px 0 0 #ff2bd6" }}
        >
          VS
        </span>
        <div className="text-center min-w-0">
          <div className="cyber-hud text-[10px] text-[#ff2bd6] truncate">
            {opponent?.name ?? "No opponent"}
          </div>
          <div className="font-hud font-black text-3xl text-white tabular-nums">
            {opponent ? theirs : "—"}
          </div>
          {opponent && opponentSeat?.results && (
            <div className="text-xs text-slate-400">
              {theirCorrect}/{opponentSeat.results.length} correct
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="cyber-hud text-[10px] text-slate-500 mb-2 text-center">
          Your answers
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {results.map((result, index) => (
            <ResultChip
              key={index}
              index={index}
              answered={result.answered}
              correct={result.correct}
              points={result.points}
            />
          ))}
        </div>
      </div>

      {snapshot.phase === GamePhase.PLAYING && (
        <p className="text-center text-sm text-slate-400">
          The correct answers go up once every match in the room has finished.
        </p>
      )}
    </div>
  );
};

/** A player's answer, as words, for the end-of-round review. */
const describeAnswer = (answer: Answer | null, question: PublicQuestion): string => {
  if (answer === null) return "No answer";
  if (Array.isArray(answer)) return answer.join("  →  ");
  if (
    typeof answer === "number" &&
    (question.type === QuestionType.MULTIPLE_CHOICE ||
      question.type === QuestionType.TRUE_FALSE)
  ) {
    return question.options[answer] ?? "No answer";
  }
  return String(answer);
};

/**
 * The round, question by question, once it is over: what was asked, the
 * answer, and — for a player who played it — what they said.
 */
const RoundReview: React.FC<{
  review: RoundReviewItem[];
  seat: PublicSeat | null;
}> = ({ review, seat }) => (
  <div className="space-y-3">
    <div className="cyber-hud text-[11px] text-slate-500 text-center">
      Answer key
    </div>
    {review.map((item, index) => {
      const result = seat?.results?.[index] ?? null;
      return (
        <div key={`${item.question.id}-${index}`} className="cyber-panel px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="cyber-hud text-[9px] text-[#00f0ff] mb-1">
                Q{String(index + 1).padStart(2, "0")}
              </div>
              <div className="cyber-question text-base leading-snug">
                {item.question.text}
              </div>
            </div>
            {result && (
              <span
                className={`shrink-0 mt-1 ${
                  result.correct
                    ? "text-[#39ff88]"
                    : result.answered
                      ? "text-[#ff3b5c]"
                      : "text-slate-500"
                }`}
              >
                {result.correct ? <Check size={20} /> : result.answered ? <X size={20} /> : <Minus size={20} />}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm">
            <span className="text-slate-500">Answer: </span>
            <span className="font-bold text-[#39ff88]">{item.reveal.label}</span>
          </div>
          {result && !result.correct && (
            <div className="text-sm">
              <span className="text-slate-500">You said: </span>
              <span className="text-slate-300">
                {describeAnswer(result.answer, item.question)}
              </span>
            </div>
          )}
          {result?.correct && (
            <div className="text-xs font-mono text-[#39ff88]">+{result.points}</div>
          )}
          {item.reveal.explanation && (
            <p className="text-xs text-slate-400 mt-1">{item.reveal.explanation}</p>
          )}
        </div>
      );
    })}
  </div>
);

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
        {/* Which question this is about, not which one is next: on the
            locked-in beat these two differ, and the beat belongs to the one
            just closed. */}
        <span>
          {seat.status === LaneStatus.REVEAL
            ? `Question ${seat.questionNumber} of ${total} locked in`
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
        // When it got here, not the time the host stamped on it: that is the
        // host's clock, and a phone or projector running a few seconds ahead
        // of it would read every heartbeat as stale and show "no host" for
        // the whole game.
        setHostSeenAt(Date.now());
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
      // The match is over once both players are through — that is when the
      // seat publishes how it went.
      if (seat.results && snapshot) {
        return (
          <MatchResult
            lane={lane}
            seat={seat}
            snapshot={snapshot}
            playerId={currentPlayerId ?? ""}
          />
        );
      }

      const opponentId = lane.playerIds.find((id) => id !== currentPlayerId);
      const opponent = snapshot?.players.find((p) => p.id === opponentId);

      return (
        <div className="text-center py-12">
          <Flag size={40} className="mx-auto text-[#39ff88] mb-3" />
          <div className="cyber-question text-3xl text-white mb-2">You're through</div>
          <p className="text-slate-400 max-w-sm mx-auto">
            All {snapshot?.questionsInRound} questions locked in.{" "}
            {opponent
              ? `Your results land when ${opponent.name} finishes too.`
              : "Your results are on their way."}
          </p>
        </div>
      );
    }

    if (seat.status === LaneStatus.REVEAL) {
      // A beat to mark the handover, not a verdict: whether it was right is
      // for the end of the match.
      const timedOut = !seat.answered;
      return (
        <div className="text-center py-8">
          <div
            className={`inline-flex items-center justify-center w-20 h-20 rounded-full border-2 mb-4 ${
              timedOut
                ? "border-[#f5ff3b] text-[#f5ff3b] shadow-[0_0_24px_rgba(245,255,59,0.35)]"
                : "border-[#00f0ff] text-[#00f0ff] shadow-[0_0_24px_rgba(0,240,255,0.4)]"
            }`}
          >
            {timedOut ? <TimerOff size={34} /> : <Lock size={34} />}
          </div>
          <div className="cyber-question text-3xl text-white">
            {timedOut ? "Time's up" : "Locked in"}
          </div>
          <p className="cyber-hud text-[10px] text-slate-500 mt-2">
            Results at the end of the match
          </p>

          {/* Keep the clock on your side: take the next one now. The countdown
              below is only a backstop. */}
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
          <Lock size={36} className="mx-auto text-[#00f0ff] mb-3" />
          <div className="cyber-question text-3xl text-white mb-1">Locked in</div>
          <p className="cyber-hud text-[10px] text-slate-500">Sending it…</p>
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
          paused={seat.timerPaused}
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
            {/* How this player's match went — the verdicts they were not
                given during it. */}
            {lane && seat?.results && (
              <MatchResult
                lane={lane}
                seat={seat}
                snapshot={snapshot}
                playerId={currentPlayerId ?? ""}
              />
            )}

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
            {/* Every match is finished, so the answers can go up without
                spoiling anyone's question. */}
            {snapshot.roundReview && snapshot.roundReview.length > 0 && (
              <div className="pb-4">
                <RoundReview review={snapshot.roundReview} seat={seat} />
              </div>
            )}
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
    <div className="min-h-screen tron-backdrop text-white p-4 flex flex-col">
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

        {showingQuestion && seat?.question && (
          <QuestionPanel
            text={seat.question.text}
            number={seat.questionNumber}
            total={snapshot?.questionsInRound}
            category={snapshot?.category?.name ?? seat.question.category}
            className="mb-4"
          />
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

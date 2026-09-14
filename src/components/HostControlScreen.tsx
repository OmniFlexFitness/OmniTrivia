import React from "react";
import { useGame } from "../context/GameContext";
import {
  GamePhase,
  LaneStatus,
  MatchupLane,
  Player,
  Question,
  QuestionType,
} from "../types";
import { buildReveal, publicOptions } from "../services/snapshot";
import {
  broadcastIndex,
  everyLaneCompleted,
  laneAnswers,
  laneCompletedCount,
  laneForPlayer,
  laneHasCompleted,
  liveAnswers,
} from "../services/lanes";
import Button from "./Button";
import AvatarDisplay from "./AvatarDisplay";
import BracketView from "./BracketView";
import QuestionCard from "./QuestionCard";
import Wheel from "./Wheel";
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  Flag,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Swords,
  Trophy,
  Tv,
  Zap,
} from "lucide-react";

/**
 * The hosting interface: everything needed to run a round, and nothing the
 * room is meant to see.
 *
 * A round is no longer one question the host walks the room through — every
 * matchup runs at its own pace — so this screen is a board of tables rather
 * than a single set of transport controls. Each matchup gets its own card with
 * its own clock, its own answer and its own pause/reveal, and the panel on the
 * right shows what the projector is currently holding up, which trails the
 * fastest tables by design.
 */

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];

const Panel: React.FC<{
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, children, action, className = "" }) => (
  <div
    className={`bg-slate-800/50 border border-slate-700 rounded-2xl p-4 ${className}`}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-slate-400">
        {title}
      </h3>
      {action}
    </div>
    {children}
  </div>
);

/**
 * How far the host's own matchup has got.
 *
 * A host who is also playing must not read an answer off their own desk before
 * their table has been through the question. Once they are knocked out, or
 * have switched answering off, they are running the game rather than playing
 * it and the whole reading copy comes back.
 */
const useHostProgress = (): number | null => {
  const { players, currentPlayerId, lanes, questionsQueue, hostAnsweringEnabled } =
    useGame();

  const hostPlayer = players.find((p) => p.id === currentPlayerId);
  if (!hostPlayer || hostPlayer.eliminated || !hostAnsweringEnabled) return null;

  const lane = laneForPlayer(lanes, hostPlayer.id);
  if (!lane || !lane.answeringIds.includes(hostPlayer.id)) return null;

  const completed = laneCompletedCount(lane, questionsQueue.length);
  // A question their matchup has closed is already theirs to read. The live
  // one joins it the moment they lock an answer in, and not before — which is
  // only ever a question their lane is still answering, so the count must not
  // be nudged again for a lane that is revealing or done.
  const readingTheirOwn =
    lane.status === LaneStatus.ANSWERING &&
    liveAnswers(lane).some((a) => a.playerId === hostPlayer.id);

  return completed + (readingTheirOwn ? 1 : 0);
};

/** The host's reading copy of one question, with the answer held back if due. */
const QuestionReference: React.FC<{
  question: Question;
  withheld: boolean;
  compact?: boolean;
}> = ({ question, withheld, compact = false }) => {
  const [hidden, setHidden] = React.useState(false);
  const reveal = buildReveal(question);
  const options = publicOptions(question);
  const type = question.type ?? QuestionType.MULTIPLE_CHOICE;
  const showAnswer = !withheld && !hidden;

  return (
    <div className="space-y-3">
      <p
        className={`font-bold text-white leading-snug ${compact ? "text-base" : "text-xl"}`}
      >
        {question.text}
      </p>

      {!compact && options.length > 0 && type !== QuestionType.SLIDER && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {options.map((option, index) => (
            <div
              key={`${option}-${index}`}
              className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
                showAnswer && reveal.correctIndex === index
                  ? "bg-green-600/20 border-green-500 text-green-300"
                  : "bg-slate-800 border-slate-700 text-slate-300"
              }`}
            >
              <span className="font-mono font-bold opacity-60">
                {CHOICE_LETTERS[index] ?? index + 1}
              </span>
              {option}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3 bg-slate-800/70 border border-slate-700 rounded-xl p-3">
        <button
          onClick={() => setHidden((value) => !value)}
          disabled={withheld}
          className="text-slate-400 hover:text-white disabled:opacity-40 mt-0.5"
          title={hidden ? "Show the answer" : "Hide the answer"}
        >
          {showAnswer ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            Answer
          </div>
          {withheld ? (
            <div className="text-slate-500 italic text-sm">
              Held back until your own matchup is through this one.
            </div>
          ) : showAnswer ? (
            <>
              <div className="text-lg font-bold text-green-400">
                {reveal.label}
              </div>
              {question.explanation && (
                <p className="text-sm text-slate-400 mt-1">
                  {question.explanation}
                </p>
              )}
            </>
          ) : (
            <div className="text-slate-600 text-sm">Hidden</div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * One matchup's table: where it has got to, who is in, and the controls that
 * act on it alone.
 */
const LaneCard: React.FC<{ lane: MatchupLane }> = ({ lane }) => {
  const {
    players,
    questionsQueue,
    revealLaneNow,
    toggleLanePaused,
    addLaneTime,
  } = useGame();
  const hostProgress = useHostProgress();

  const question = questionsQueue[lane.questionIndex];
  const answers = laneAnswers(lane, lane.questionIndex);
  const completed = laneCompletedCount(lane, questionsQueue.length);
  const answeredIds = new Set(answers.map((a) => a.playerId));
  const playerOf = (id: string): Player | undefined =>
    players.find((p) => p.id === id);

  const statusPill = () => {
    switch (lane.status) {
      case LaneStatus.DONE:
        return (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-700/60 text-slate-300 text-[10px] font-mono uppercase tracking-widest">
            <Flag size={11} /> through the round
          </span>
        );
      case LaneStatus.REVEAL:
        return (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-600/20 text-green-400 text-[10px] font-mono uppercase tracking-widest">
            <CheckCircle2 size={11} /> answer up · {lane.revealSecondsLeft}s
          </span>
        );
      default:
        return (
          <span
            className={`px-2 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest ${
              lane.timerPaused
                ? "bg-neon-yellow/10 text-neon-yellow"
                : "bg-neon-blue/10 text-neon-blue"
            }`}
          >
            {lane.timerPaused ? "paused" : `${lane.timeLeft}s left`}
          </span>
        );
    }
  };

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        lane.status === LaneStatus.DONE
          ? "bg-slate-900/40 border-slate-800"
          : "bg-slate-900 border-slate-700"
      }`}
    >
      {/* Who, and where they stand this round */}
      <div className="flex items-center gap-2">
        {lane.playerIds.map((playerId, index) => {
          const player = playerOf(playerId);
          if (!player) return null;
          const isIn = answeredIds.has(playerId);
          const answering = lane.answeringIds.includes(playerId);

          return (
            <React.Fragment key={playerId}>
              {index > 0 && (
                <Swords size={12} className="text-neon-pink shrink-0" />
              )}
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative shrink-0">
                  <AvatarDisplay
                    avatar={player.avatar}
                    color={player.avatarColor}
                    accessory={player.avatarAccessory}
                    size="sm"
                  />
                  {lane.status === LaneStatus.ANSWERING && answering && isIn && (
                    <CheckCircle2
                      size={14}
                      className="absolute -bottom-1 -right-1 text-neon-green bg-slate-900 rounded-full"
                    />
                  )}
                </div>
                <span
                  className={`font-bold truncate ${answering ? "text-white" : "text-slate-500"}`}
                >
                  {player.name}
                </span>
                <span className="font-mono font-black text-neon-green shrink-0">
                  {player.roundScore}
                </span>
              </div>
            </React.Fragment>
          );
        })}
        {lane.playerIds.length < 2 && (
          <span className="italic text-slate-500 text-sm">· bye</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
          Q{Math.min(completed + 1, questionsQueue.length)} of{" "}
          {questionsQueue.length} · {completed} done
        </span>
        {statusPill()}
      </div>

      {lane.status === LaneStatus.ANSWERING && (
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              lane.timeLeft < 5 ? "bg-red-500" : "bg-neon-blue"
            }`}
            style={{
              width: `${Math.min(100, (lane.timeLeft / lane.questionDuration) * 100)}%`,
            }}
          />
        </div>
      )}

      {question && lane.status !== LaneStatus.DONE && (
        <QuestionReference
          question={question}
          compact
          withheld={hostProgress !== null && lane.questionIndex >= hostProgress}
        />
      )}

      {lane.status === LaneStatus.ANSWERING && (
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            onClick={() => toggleLanePaused(lane.id)}
            className="flex items-center justify-center gap-1 py-1.5 text-xs"
          >
            {lane.timerPaused ? <Play size={14} /> : <Pause size={14} />}
            {lane.timerPaused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => addLaneTime(lane.id, 10)}
            className="flex items-center justify-center py-1.5 text-xs"
          >
            +10s
          </Button>
          <Button
            variant="neon"
            onClick={() => revealLaneNow(lane.id)}
            className="flex items-center justify-center gap-1 py-1.5 text-xs"
          >
            <SkipForward size={14} /> Reveal
          </Button>
        </div>
      )}

      {lane.status === LaneStatus.REVEAL && (
        <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
          {lane.revealReason === "all-in"
            ? "both in — moving on by itself"
            : lane.revealReason === "host"
              ? "revealed from the desk"
              : "time ran out"}
        </div>
      )}
    </div>
  );
};

/** Every matchup, side by side. */
const LaneBoard: React.FC = () => {
  const { lanes, setAllLanesPaused, addTimeToAllLanes, revealAllLanesNow } =
    useGame();

  if (lanes.length === 0) {
    return (
      <p className="text-slate-500 text-sm">The round has not been dealt yet.</p>
    );
  }

  const anyRunning = lanes.some(
    (lane) => lane.status === LaneStatus.ANSWERING && !lane.timerPaused,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => setAllLanesPaused(anyRunning)}
          className="flex items-center gap-2 py-1.5 px-3 text-xs"
        >
          {anyRunning ? <Pause size={14} /> : <Play size={14} />}
          {anyRunning ? "Pause every table" : "Resume every table"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => addTimeToAllLanes(10)}
          className="py-1.5 px-3 text-xs"
        >
          +10s to every table
        </Button>
        <Button
          variant="secondary"
          onClick={revealAllLanesNow}
          className="py-1.5 px-3 text-xs"
        >
          Reveal every table
        </Button>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
        {lanes.map((lane) => (
          <LaneCard key={lane.id} lane={lane} />
        ))}
      </div>
    </div>
  );
};

/**
 * What the projector is holding up.
 *
 * The room's screen deliberately trails the field: it stays on whichever
 * question the slowest matchup is still working on, and only puts the answer
 * up once every table is through it. This panel is where the host watches that
 * happen, and steps in if they would rather move the room along themselves.
 */
const RoomScreenPanel: React.FC = () => {
  const game = useGame();
  const {
    lanes,
    questionsQueue,
    broadcastRevealing,
    broadcastRevealSecondsLeft,
    autoAdvance,
    advanceBroadcastNow,
    endRoundNow,
  } = game;

  const index = broadcastIndex(game);
  const question = questionsQueue[index];
  const through = lanes.filter((lane) => laneHasCompleted(lane, index)).length;
  const revealing = broadcastRevealing && everyLaneCompleted(lanes, index);
  const allDone = lanes.every((lane) => lane.status === LaneStatus.DONE);

  if (!question) {
    return <p className="text-slate-500 text-sm">Nothing on the big screen.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest">
        <span className="text-slate-500">
          Showing Q{index + 1} of {questionsQueue.length}
        </span>
        <span className={revealing ? "text-green-400" : "text-neon-yellow"}>
          {through}/{lanes.length} matchups through it
        </span>
      </div>

      <p className="text-sm text-slate-300 leading-snug">{question.text}</p>

      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-neon-green transition-all duration-500"
          style={{
            width: `${lanes.length ? (through / lanes.length) * 100 : 0}%`,
          }}
        />
      </div>

      {revealing ? (
        <>
          <div className="text-xs font-mono uppercase tracking-widest text-green-400">
            Answer is up on the big screen
            {autoAdvance ? ` · moves on in ${broadcastRevealSecondsLeft}s` : ""}
          </div>
          <Button
            variant="neon"
            fullWidth
            onClick={advanceBroadcastNow}
            className="flex items-center justify-center gap-2 py-2 text-sm"
          >
            MOVE THE ROOM ON <ArrowRight size={16} />
          </Button>
        </>
      ) : (
        <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
          Waiting on the slowest matchup — the answer goes up when every table
          is through it.
        </div>
      )}

      {allDone && (
        <Button
          variant="secondary"
          fullWidth
          onClick={endRoundNow}
          className="flex items-center justify-center gap-2 py-2 text-sm"
        >
          <Flag size={16} /> CUT TO ROUND RESULTS
        </Button>
      )}
    </div>
  );
};

/** How the field is spread across the round's questions. */
const RoundProgressPanel: React.FC = () => {
  const { lanes, questionsQueue } = useGame();

  if (questionsQueue.length === 0) {
    return <p className="text-slate-500 text-sm">No questions dealt yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      {questionsQueue.map((question, index) => {
        const through = lanes.filter((lane) =>
          laneHasCompleted(lane, index),
        ).length;
        const share = lanes.length ? (through / lanes.length) * 100 : 0;

        return (
          <div
            key={question.id}
            className="relative overflow-hidden flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs"
          >
            <div
              className="absolute inset-y-0 left-0 bg-neon-green/10"
              style={{ width: `${share}%` }}
            />
            <span className="relative font-mono text-slate-500 w-6">
              Q{index + 1}
            </span>
            <span className="relative flex-1 truncate text-slate-300">
              {question.text}
            </span>
            <span className="relative font-mono text-slate-400">
              {through}/{lanes.length}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const RoundEndControls: React.FC = () => {
  const {
    players,
    bracket,
    currentRound,
    totalRounds,
    championId,
    nextRound,
  } = useGame();

  const round = bracket[currentRound - 1];
  const next = bracket[currentRound];
  const isLastRound = championId !== null || currentRound >= totalRounds;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
        <h2 className="text-2xl font-black text-white mb-1">
          Round {currentRound} complete
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          {championId
            ? "The bracket is decided — one player is left standing."
            : next
              ? `${next.matchups.length} matchup(s) drawn for round ${currentRound + 1}.`
              : currentRound < totalRounds
                ? `Round ${currentRound + 1} of ${totalRounds} is up next.`
                : "No further rounds are configured."}
        </p>

        {round && (
          <BracketView
            bracket={[round]}
            players={players}
            currentRound={currentRound}
          />
        )}
      </div>

      <Button
        variant="neon"
        fullWidth
        onClick={nextRound}
        className="flex items-center justify-center gap-2 h-16 text-lg"
      >
        {isLastRound ? "SHOW FINAL RESULTS" : `START ROUND ${currentRound + 1}`}
        <ArrowRight size={20} />
      </Button>
    </div>
  );
};

const GameOverControls: React.FC = () => {
  const { players, bracket, currentRound, championId, playAgain, restartGame } =
    useGame();
  const champion = players.find((p) => p.id === championId);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-yellow-600/50 rounded-2xl p-5 text-center">
        <Crown size={40} className="mx-auto text-yellow-400 mb-2" />
        <div className="text-xs font-mono uppercase tracking-[0.3em] text-yellow-400">
          Champion
        </div>
        <div className="text-3xl font-black text-white mt-1">
          {champion?.name ?? "No one"}
        </div>
      </div>

      {bracket.length > 0 && (
        <BracketView
          bracket={bracket}
          players={players}
          currentRound={currentRound}
          championId={championId}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={playAgain}
          className="flex items-center justify-center gap-2"
        >
          <RotateCcw size={18} /> PLAY AGAIN
        </Button>
        <Button
          variant="danger"
          onClick={restartGame}
          className="flex items-center justify-center gap-2"
        >
          NEW GAME
        </Button>
      </div>
    </div>
  );
};

/**
 * The host's own seat at the game.
 *
 * The host is always a player, so this pane runs beside the controls rather
 * than replacing them — and it follows the host's own matchup, not the room's
 * screen, which is what lets a host click through a whole round solo and feel
 * exactly what the pacing is like for one of the tables.
 */
const HostPlayerPane: React.FC = () => {
  const {
    phase,
    players,
    currentPlayerId,
    lanes,
    questionsQueue,
    hostAnsweringEnabled,
    toggleHostAnswering,
  } = useGame();

  const hostPlayer = players.find((p) => p.id === currentPlayerId);
  if (!hostPlayer) return null;

  const lane = laneForPlayer(lanes, hostPlayer.id);
  const record = lane
    ? liveAnswers(lane).find((a) => a.playerId === hostPlayer.id)
    : undefined;
  const question = lane ? questionsQueue[lane.questionIndex] : undefined;
  const opponentId = lane?.playerIds.find((id) => id !== hostPlayer.id) ?? null;
  const opponent = opponentId ? players.find((p) => p.id === opponentId) : null;
  const answering = lane?.answeringIds.includes(hostPlayer.id) ?? false;

  const status = () => {
    if (!hostAnsweringEnabled)
      return "Answering is off — your matchup will not wait for you.";
    if (hostPlayer.eliminated) return "You are out of the bracket.";
    if (!lane) return "You are not in this round.";
    if (lane.status === LaneStatus.DONE)
      return "Your matchup is through the round.";
    if (lane.status === LaneStatus.REVEAL)
      return record
        ? record.isCorrect
          ? `Correct — +${record.points}`
          : "Missed that one"
        : "You let that one time out";
    if (phase !== GamePhase.PLAYING) return "Waiting for the next round.";
    return record ? "Locked in — waiting on your opponent." : "Your turn.";
  };

  return (
    <Panel
      title="Your matchup"
      action={
        <button
          onClick={toggleHostAnswering}
          className={`px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-widest transition-colors ${
            hostAnsweringEnabled
              ? "border-neon-green text-neon-green bg-neon-green/10"
              : "border-slate-600 text-slate-400 hover:text-white"
          }`}
          title="Take yourself in or out of your matchup's answer count"
        >
          answering {hostAnsweringEnabled ? "on" : "off"}
        </button>
      }
    >
      <div className="flex items-center gap-3 mb-3">
        <AvatarDisplay
          avatar={hostPlayer.avatar}
          color={hostPlayer.avatarColor}
          accessory={hostPlayer.avatarAccessory}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white truncate">{hostPlayer.name}</div>
          <div className="text-xs text-slate-400 truncate">
            {opponent ? `vs ${opponent.name}` : lane ? "Bye" : "No matchup"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-neon-pink">
            {hostPlayer.score}
          </div>
          <div className="text-[10px] font-mono text-neon-green">
            +{hostPlayer.roundScore}
          </div>
        </div>
      </div>

      <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">
        {status()}
      </div>

      {lane?.status === LaneStatus.REVEAL && question && (
        <div className="bg-slate-900 border border-green-700 rounded-xl p-3 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            Answer
          </div>
          <div className="text-lg font-bold text-green-400">
            {buildReveal(question).label}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-neon-blue mt-1">
            next question in {lane.revealSecondsLeft}s
          </div>
        </div>
      )}

      {phase === GamePhase.PLAYING &&
        lane?.status === LaneStatus.ANSWERING &&
        question &&
        answering &&
        !record && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
            <QuestionCard
              key={`${question.id}-${lane.questionIndex}`}
              question={question}
              timeLeft={lane.timeLeft}
              duration={lane.questionDuration}
              compact
            />
          </div>
        )}
    </Panel>
  );
};

const HostControlScreen: React.FC = () => {
  const {
    phase,
    currentRound,
    totalRounds,
    players,
    gamePin,
    autoAdvance,
    toggleAutoAdvance,
    openBroadcast,
    broadcastConnected,
    gameName,
    bracket,
    lanes,
    championId,
    loading,
  } = useGame();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Zap size={56} className="text-neon-blue animate-pulse mb-4" />
        <p className="text-xl font-mono animate-pulse">PREPARING THE ROUND…</p>
      </div>
    );
  }

  const lanesDone = lanes.filter(
    (lane) => lane.status === LaneStatus.DONE,
  ).length;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-4">
          <div className="text-xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink">
            OMNI<span className="text-white">TRIVIA</span>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono uppercase tracking-widest text-neon-yellow">
            host control
          </span>
          {gameName && (
            <span className="text-sm font-bold text-slate-300 truncate max-w-[16rem]">
              {gameName}
            </span>
          )}
          {gamePin && (
            <span className="text-xs font-mono text-slate-500">
              PIN {gamePin}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
            Round {currentRound}/{totalRounds}
          </span>
          {phase === GamePhase.PLAYING && lanes.length > 0 && (
            <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
              {lanesDone}/{lanes.length} matchups finished
            </span>
          )}

          <button
            onClick={toggleAutoAdvance}
            className={`px-3 py-2 rounded-lg border text-xs font-mono uppercase tracking-widest transition-colors ${
              autoAdvance
                ? "border-neon-green text-neon-green bg-neon-green/10"
                : "border-slate-600 text-slate-400 hover:text-white"
            }`}
            title="Move the room's screen on by itself once every matchup is through a question"
          >
            auto-advance {autoAdvance ? "on" : "off"}
          </button>

          <button
            onClick={openBroadcast}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-colors ${
              broadcastConnected
                ? "border-neon-green text-neon-green bg-neon-green/10"
                : "border-neon-pink text-neon-pink bg-neon-pink/10 animate-pulse"
            }`}
          >
            <Monitor size={16} />
            {broadcastConnected ? "BROADCAST LIVE" : "OPEN BROADCAST DISPLAY"}
          </button>
        </div>
      </header>

      {!broadcastConnected && (
        <div className="mb-5 rounded-xl border border-neon-pink/40 bg-neon-pink/5 p-3 text-sm text-slate-300">
          The room cannot see anything yet. Open the broadcast display and drag
          that window to the projector or TV before you start the round.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Run controls, with the host's own matchup beside them */}
        <div className="lg:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          <div className="space-y-5">
            {phase === GamePhase.CATEGORY_SELECT && (
              <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4">
                <Wheel />
              </div>
            )}

            {phase === GamePhase.PLAYING && (
              <Panel title={`Round ${currentRound} — every matchup`}>
                <LaneBoard />
              </Panel>
            )}

            {phase === GamePhase.ROUND_END && <RoundEndControls />}
            {phase === GamePhase.GAME_OVER && <GameOverControls />}
          </div>

          <HostPlayerPane />
        </div>

        {/* Live read on the room */}
        <div className="space-y-5">
          {phase === GamePhase.PLAYING && (
            <>
              <Panel
                title="On the big screen"
                action={<Tv size={14} className="text-slate-500" />}
              >
                <RoomScreenPanel />
              </Panel>

              <Panel title="Where the field is">
                <RoundProgressPanel />
              </Panel>
            </>
          )}

          <Panel title="Scores">
            <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {[...players]
                .sort((a, b) => b.score - a.score)
                .map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                      player.eliminated
                        ? "opacity-40 bg-slate-900/40"
                        : "bg-slate-900"
                    }`}
                  >
                    <span className="w-6 text-center font-mono text-slate-500">
                      {index === 0 ? (
                        <Trophy size={14} className="text-yellow-400 mx-auto" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="flex-1 truncate font-bold">
                      {player.name}
                    </span>
                    <span className="font-mono text-neon-green text-xs">
                      +{player.roundScore}
                    </span>
                    <span className="font-mono font-bold text-neon-pink w-14 text-right">
                      {player.score}
                    </span>
                  </div>
                ))}
            </div>
          </Panel>

          {bracket.length > 0 && (
            <Panel title="Bracket">
              <BracketView
                bracket={bracket}
                players={players}
                currentRound={currentRound}
                championId={championId}
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
};

export default HostControlScreen;

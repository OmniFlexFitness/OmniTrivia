import React from "react";
import { useGame } from "../context/GameContext";
import {
  GamePhase,
  LaneSeat,
  LaneStatus,
  MatchupLane,
  Player,
  Question,
  QuestionType,
} from "../types";
import { buildReveal, publicOptions, publicPoll } from "../services/snapshot";
import {
  answerBy,
  broadcastIndex,
  everyLaneCompleted,
  laneCompletedCount,
  laneForPlayer,
  laneHasCompleted,
  laneIsRunning,
  laneStatus,
  seatCompletedCount,
  seatFor,
} from "../services/lanes";
import Button from "./Button";
import AvatarDisplay from "./AvatarDisplay";
import BracketView, { SideTag } from "./BracketView";
import { matchupById, sideOf } from "../services/bracket";
import QuestionCard from "./QuestionCard";
import { QuestionPanel } from "./CyberQuestion";
import Wheel from "./Wheel";
import Instructions from "./Instructions";
import CategoryLikeButton from "./CategoryLikeButton";
import CategoryVotePanel from "./CategoryVotePanel";
import CategoryPoolManager from "./CategoryPoolManager";
import InsightsPanel from "./InsightsPanel";
import HostScreensPanel from "./HostScreensPanel";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  Flag,
  Heart,
  ListPlus,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
  Swords,
  Tablet,
  Trophy,
  Tv,
  Zap,
} from "lucide-react";

/**
 * The hosting interface: everything needed to run a round, and nothing the
 * room is meant to see.
 *
 * A round is not one question the host walks the room through, and it is not
 * even one question per table: every player is on their own question, on their
 * own clock. So this screen is a board of tables, each showing both seats at
 * it, plus a panel showing what the projector is holding up — which trails the
 * fastest players by design.
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
 * How far the host's own seat has got.
 *
 * A host who is also playing must not read an answer off their own desk before
 * they have been through the question themselves. Once they are knocked out,
 * or have switched answering off, they are running the game rather than
 * playing it and the whole reading copy comes back.
 */
const useHostProgress = (): number | null => {
  const { players, currentPlayerId, lanes, questionsQueue, hostAnsweringEnabled } =
    useGame();

  const hostPlayer = players.find((p) => p.id === currentPlayerId);
  if (!hostPlayer || hostPlayer.eliminated || !hostAnsweringEnabled) return null;

  const lane = laneForPlayer(lanes, hostPlayer.id);
  const seat = lane ? seatFor(lane, hostPlayer.id) : undefined;
  if (!lane || !seat) return null;

  const completed = seatCompletedCount(seat, questionsQueue.length);
  // A question they have closed is already theirs to read. The live one joins
  // it the moment they lock an answer in, and not before.
  const readingTheirOwn =
    seat.status === LaneStatus.ANSWERING &&
    Boolean(answerBy(lane, hostPlayer.id, seat.questionIndex));

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
              Held back until you are through this one yourself.
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

/** One player's row inside a match: where they are and what they are doing. */
const SeatRow: React.FC<{
  seat: LaneSeat;
  lane: MatchupLane;
  player: Player | undefined;
  questionsInRound: number;
}> = ({ seat, lane, player, questionsInRound }) => {
  if (!player) return null;

  const record = answerBy(lane, seat.playerId, seat.questionIndex);
  const completed = seatCompletedCount(seat, questionsInRound);

  const state = () => {
    switch (seat.status) {
      case LaneStatus.DONE:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-slate-400">
            <Flag size={11} /> through the round
          </span>
        );
      case LaneStatus.REVEAL:
        // Answered or not — never right or wrong. The host is often a player
        // too, and this card is on the screen in front of them: a verdict here
        // is their opponent's result, mid-match, which nobody gets until the
        // match is over. Same rule the answer key below follows.
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-slate-400">
            <CheckCircle2 size={11} />
            {record ? "locked in" : "timed out"} · {seat.revealSecondsLeft}s
          </span>
        );
      default:
        return (
          <span
            className={`text-[10px] font-mono uppercase tracking-widest ${
              seat.timerPaused
                ? "text-neon-yellow"
                : seat.timeLeft <= 5
                  ? "text-red-400"
                  : "text-neon-blue"
            }`}
          >
            {seat.timerPaused ? "paused" : `${seat.timeLeft}s left`}
            {record ? " · in" : ""}
          </span>
        );
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <AvatarDisplay
        avatar={player.avatar}
        color={player.avatarColor}
        accessory={player.avatarAccessory}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white truncate">{player.name}</span>
          <span className="font-mono font-black text-neon-green shrink-0">
            {player.roundScore}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            Q{Math.min(completed + 1, questionsInRound)}/{questionsInRound}
          </span>
          {state()}
        </div>
      </div>
      {seat.status === LaneStatus.ANSWERING && (
        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              seat.timeLeft < 5 ? "bg-red-500" : "bg-neon-blue"
            }`}
            style={{
              width: `${Math.min(100, (seat.timeLeft / seat.questionDuration) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * One match: both seats, where each of them is, and the controls that act on
 * the table as a whole.
 */
const LaneCard: React.FC<{ lane: MatchupLane }> = ({ lane }) => {
  const {
    players,
    questionsQueue,
    bracket,
    revealLaneNow,
    toggleLanePaused,
    addLaneTime,
  } = useGame();
  const hostProgress = useHostProgress();
  const matchup = matchupById(bracket, lane.matchupId);

  const status = laneStatus(lane);
  const running = laneIsRunning(lane);
  const completed = laneCompletedCount(lane, questionsQueue.length);
  const playerOf = (id: string): Player | undefined =>
    players.find((p) => p.id === id);

  // The host's reading copy follows the table's slowest seat, which is the
  // furthest-behind question anybody at it might still be looking at.
  const slowest = lane.seats.reduce<number>(
    (lowest, seat) => Math.min(lowest, seat.questionIndex),
    questionsQueue.length,
  );
  const question = questionsQueue[Math.min(slowest, questionsQueue.length - 1)];

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        status === LaneStatus.DONE
          ? "bg-slate-900/40 border-slate-800"
          : "bg-slate-900 border-slate-700"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-slate-500">
          {matchup && <SideTag side={sideOf(matchup)} />}
          {lane.playerIds.length < 2 ? "bye" : "matchup"} · {completed}/
          {questionsQueue.length} both through
        </span>
        {status === LaneStatus.DONE && (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-700/60 text-slate-300 text-[10px] font-mono uppercase tracking-widest">
            <Flag size={11} /> match over
          </span>
        )}
      </div>

      <div className="space-y-2">
        {lane.seats.map((seat, index) => (
          <React.Fragment key={seat.playerId}>
            {index > 0 && (
              <div className="flex items-center gap-2 text-neon-pink">
                <div className="flex-1 h-px bg-slate-800" />
                <Swords size={12} />
                <div className="flex-1 h-px bg-slate-800" />
              </div>
            )}
            <SeatRow
              seat={seat}
              lane={lane}
              player={playerOf(seat.playerId)}
              questionsInRound={questionsQueue.length}
            />
          </React.Fragment>
        ))}

        {/* Someone in the pairing who is not answering — a host with answering
            off, or a player who left — still belongs on the card. */}
        {lane.playerIds
          .filter((id) => !lane.seats.some((seat) => seat.playerId === id))
          .map((id) => (
            <div
              key={id}
              className="text-[11px] font-mono uppercase tracking-widest text-slate-600"
            >
              {playerOf(id)?.name ?? "Unknown"} · not answering
            </div>
          ))}
      </div>

      {question && status !== LaneStatus.DONE && (
        <QuestionReference
          question={question}
          compact
          withheld={hostProgress !== null && slowest >= hostProgress}
        />
      )}

      {status !== LaneStatus.DONE && (
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            onClick={() => toggleLanePaused(lane.id)}
            className="flex items-center justify-center gap-1 py-1.5 text-xs"
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? "Pause" : "Resume"}
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
            <SkipForward size={14} /> Close Q
          </Button>
        </div>
      )}
    </div>
  );
};

/**
 * Ending the round before the field has finished it.
 *
 * A round is scored continuously — every answer banks its points as it is
 * given — so there is nothing to settle here and nothing to wait for. Whatever
 * the scoreboard says at the moment this is pressed is what the matchups are
 * decided on, and the questions nobody reached are simply not played.
 *
 * It is still the one button on this screen that takes something away from the
 * room, so it asks first whenever anybody is still answering, and says how
 * many. Once the field is through there is nothing left to interrupt and it
 * stops asking.
 */
const EndRoundControl: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  const { lanes, endRoundNow } = useGame();
  const [confirming, setConfirming] = React.useState(false);

  const liveMatches = lanes.filter(
    (lane) => laneStatus(lane) !== LaneStatus.DONE,
  ).length;
  const livePlayers = lanes
    .flatMap((lane) => lane.seats)
    .filter((seat) => seat.status !== LaneStatus.DONE).length;

  if (livePlayers === 0) {
    return (
      <Button
        variant="secondary"
        onClick={endRoundNow}
        className={`flex items-center gap-2 py-1.5 px-3 text-xs ${className}`}
        title="Everyone is through — go straight to the results"
      >
        <Flag size={14} /> Cut to round results
      </Button>
    );
  }

  if (!confirming) {
    return (
      <Button
        variant="secondary"
        onClick={() => setConfirming(true)}
        className={`flex items-center gap-2 py-1.5 px-3 text-xs border-red-500/60 text-red-300 hover:text-white hover:bg-red-600/20 ${className}`}
        title="Stop every match and settle the round on the scores as they stand"
      >
        <Flag size={14} /> End round now
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5">
      <p className="text-xs text-red-100 leading-snug">
        {liveMatches} match{liveMatches === 1 ? "" : "es"} still going,{" "}
        {livePlayers} player{livePlayers === 1 ? "" : "s"} still answering. The
        round is settled on the scores as they stand — anything they have not
        answered yet is simply not played.
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => setConfirming(false)}
          className="py-1.5 px-3 text-xs"
        >
          Keep playing
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirming(false);
            endRoundNow();
          }}
          className="py-1.5 px-3 text-xs"
        >
          End the round
        </Button>
      </div>
    </div>
  );
};

/** Every match, side by side. */
const LaneBoard: React.FC = () => {
  const { lanes, setAllLanesPaused, addTimeToAllLanes, revealAllLanesNow } =
    useGame();

  if (lanes.length === 0) {
    return (
      <p className="text-slate-500 text-sm">The round has not been dealt yet.</p>
    );
  }

  const anyRunning = lanes.some(laneIsRunning);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => setAllLanesPaused(anyRunning)}
          className="flex items-center gap-2 py-1.5 px-3 text-xs"
        >
          {anyRunning ? <Pause size={14} /> : <Play size={14} />}
          {anyRunning ? "Pause every clock" : "Resume every clock"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => addTimeToAllLanes(10)}
          className="py-1.5 px-3 text-xs"
        >
          +10s to everyone
        </Button>
        <Button
          variant="secondary"
          onClick={revealAllLanesNow}
          className="py-1.5 px-3 text-xs"
        >
          Close every table's question
        </Button>

        {/* Away from the three buttons that only nudge the round along: this
            is the one that ends it. */}
        <EndRoundControl className="ml-auto" />
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
 * question the slowest player is still working on, and marks it "locked in"
 * once everyone is through it. It never shows an answer mid-round; the answer
 * key goes up once the round is over. This panel is where the host watches
 * that happen, and steps in if they would rather move the room along
 * themselves.
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
  } = game;

  const index = broadcastIndex(game);
  const question = questionsQueue[index];
  const through = lanes.filter((lane) => laneHasCompleted(lane, index)).length;
  const revealing = broadcastRevealing && everyLaneCompleted(lanes, index);
  const allDone = lanes.every((lane) => laneStatus(lane) === LaneStatus.DONE);

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
          {through}/{lanes.length} matches through it
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
            Big screen shows everyone locked in
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
          Waiting on the slowest player. No answers go up until the round is
          over — the answer key follows the last match.
        </div>
      )}

      {/* Ending the round lives on the match board, with the other controls
          that reach the whole field. */}
      {allDone && (
        <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
          Every player is through — the round can be ended from the match board.
        </div>
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

  const seats = lanes.flatMap((lane) => lane.seats);

  return (
    <div className="space-y-1.5">
      {questionsQueue.map((question, index) => {
        const through = seats.filter((seat) =>
          seat.status === LaneStatus.DONE
            ? true
            : seat.questionIndex > index ||
              (seat.questionIndex === index && seat.status === LaneStatus.REVEAL),
        ).length;
        const share = seats.length ? (through / seats.length) * 100 : 0;

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
              {through}/{seats.length}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** The ballot the room is voting on, with the host's own controls for it. */
const BallotPanel: React.FC = () => {
  const { categoryPoll, currentPlayerId, voteForCategory, redrawCategoryPoll } =
    useGame();
  const poll = publicPoll(categoryPoll);

  if (!poll) {
    return (
      <p className="text-slate-500 text-sm">
        No ballot this round — the category pool is empty. Add categories to it
        and the next round will offer a vote.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <CategoryVotePanel
        poll={poll}
        myVote={currentPlayerId ? (poll.votes[currentPlayerId] ?? null) : null}
        onVote={(categoryId) => voteForCategory(poll.id, categoryId)}
      />
      <button
        onClick={redrawCategoryPoll}
        className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-slate-500 hover:text-white"
        title="Draw four different options. Votes already cast stay in your data."
      >
        <Shuffle size={13} /> draw different options
      </button>
    </div>
  );
};

/** Liking the round that has just been played, from the host's own seat. */
const HostLikeStrip: React.FC = () => {
  const {
    roundsConfig,
    currentRound,
    categoryLikes,
    currentPlayerId,
    setCategoryLike,
  } = useGame();

  const category = roundsConfig[currentRound - 1]?.category;
  if (!category) return null;

  const row = categoryLikes.find((tally) => tally.category.id === category.id);
  const liked = Boolean(
    currentPlayerId && row?.playerIds.includes(currentPlayerId),
  );

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <CategoryLikeButton
        category={category}
        count={row?.playerIds.length ?? 0}
        liked={liked}
        onToggle={(next) => setCategoryLike(category.id, next)}
        compact
      />
      <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
        {row?.playerIds.length
          ? `${row.playerIds.length} liked this round`
          : "no likes on this one yet"}
      </span>
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
      <Instructions guide="roundEnd" />

      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-2xl font-black text-white mb-1">
            Round {currentRound} complete
          </h2>
          <p className="text-slate-400 text-sm">
            {championId
              ? "The bracket is decided — one player is left standing."
              : next
                ? `${next.matchups.length} matchup(s) drawn for round ${currentRound + 1}.`
                : currentRound < totalRounds
                  ? `Round ${currentRound + 1} of ${totalRounds} is up next.`
                  : "No further rounds are configured."}
          </p>
        </div>

        <HostLikeStrip />

        {round && (
          <BracketView
            bracket={[round]}
            players={players}
            currentRound={currentRound}
          />
        )}
      </div>

      <Panel title="What the room wants next">
        <BallotPanel />
      </Panel>

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

const GameOverControls: React.FC<{ onShowInsights: () => void }> = ({
  onShowInsights,
}) => {
  const { players, bracket, currentRound, championId, playAgain, restartGame } =
    useGame();
  const champion = players.find((p) => p.id === championId);

  return (
    <div className="space-y-4">
      <Instructions guide="gameOver" />

      <div className="bg-slate-900 border border-yellow-600/50 rounded-2xl p-5 text-center">
        <Crown size={40} className="mx-auto text-yellow-400 mb-2" />
        <div className="text-xs font-mono uppercase tracking-[0.3em] text-yellow-400">
          Champion
        </div>
        <div className="text-3xl font-black text-white mt-1">
          {champion?.name ?? "No one"}
        </div>
      </div>

      <Panel title="What the room wants next">
        <BallotPanel />
      </Panel>

      {bracket.length > 0 && (
        <BracketView
          bracket={bracket}
          players={players}
          currentRound={currentRound}
          championId={championId}
        />
      )}

      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="secondary"
          onClick={onShowInsights}
          className="flex items-center justify-center gap-2"
        >
          <BarChart3 size={18} /> DATA
        </Button>
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
 * than replacing them — and it follows their own seat, not the room's screen,
 * which is what lets a host click through a whole round solo and feel exactly
 * what the pacing is like for somebody at a table.
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
    advanceMyQuestion,
  } = useGame();

  const hostPlayer = players.find((p) => p.id === currentPlayerId);
  if (!hostPlayer) return null;

  const lane = laneForPlayer(lanes, hostPlayer.id);
  const seat = lane ? seatFor(lane, hostPlayer.id) : undefined;
  const record =
    lane && seat ? answerBy(lane, hostPlayer.id, seat.questionIndex) : undefined;
  const question = seat ? questionsQueue[seat.questionIndex] : undefined;
  const opponentId = lane?.playerIds.find((id) => id !== hostPlayer.id) ?? null;
  const opponent = opponentId ? players.find((p) => p.id === opponentId) : null;

  const status = () => {
    if (!hostAnsweringEnabled)
      return "Answering is off — nothing in the round waits on you.";
    if (hostPlayer.eliminated) return "You are out of the bracket.";
    if (!lane) return "You are not in this round.";
    // Switching answering back on mid-round does not deal a seat: the round is
    // already in flight and dropping someone into it halfway would hand them a
    // question everyone else has had fifteen seconds on.
    if (!seat)
      return phase === GamePhase.PLAYING
        ? "You took yourself out of this round — back in from the next one."
        : "You are in from the next round.";
    if (seat.status === LaneStatus.DONE) return "You are through the round.";
    // Locked in, not marked: the host finds out how they did when their match
    // is over, like every other player.
    if (seat.status === LaneStatus.REVEAL)
      return record
        ? "Locked in — results at the end of your match."
        : "Time's up on that one.";
    if (phase !== GamePhase.PLAYING) return "Waiting for the next round.";
    return record ? "Locked in — scoring it." : "Your turn.";
  };

  return (
    <Panel
      title="Your match"
      action={
        <button
          onClick={toggleHostAnswering}
          className={`px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-widest transition-colors ${
            hostAnsweringEnabled
              ? "border-neon-green text-neon-green bg-neon-green/10"
              : "border-slate-600 text-slate-400 hover:text-white"
          }`}
          title="Take yourself in or out of the round"
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

      {/* The same beat a player's phone gets: locked in, no verdict. The
          board beside this is the host's to read; this panel is the host
          playing, and plays by the players' rules. */}
      {seat?.status === LaneStatus.REVEAL && question && (
        <div className="bg-slate-900 border border-[#00f0ff]/50 rounded-xl p-3 text-center space-y-2">
          <div className="cyber-question text-lg text-white">
            {record ? "Locked in" : "Time's up"}
          </div>
          <div className="cyber-hud text-[9px] text-slate-500">
            Results at the end of the match
          </div>
          <Button
            variant="neon"
            fullWidth
            onClick={advanceMyQuestion}
            className="flex items-center justify-center gap-2 py-2 text-sm"
          >
            NEXT QUESTION <ArrowRight size={16} />
          </Button>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-600">
            or automatically in {seat.revealSecondsLeft}s
          </div>
        </div>
      )}

      {phase === GamePhase.PLAYING &&
        seat?.status === LaneStatus.ANSWERING &&
        question &&
        !record && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-3">
            {/* The question, where everybody else in the room has it: on a
                white card directly above the answers. The compact card draws
                the clock and the options and leaves the question to whoever is
                framing it — a player's phone does this, and the host's own seat
                was the one place that did not, so the host answered four
                lettered buttons with nothing to answer. */}
            <QuestionPanel text={question.text} />

            <QuestionCard
              key={`${question.id}-${seat.questionIndex}`}
              question={question}
              timeLeft={seat.timeLeft}
              duration={seat.questionDuration}
              paused={seat.timerPaused}
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
    categoryLikes,
    championId,
    loading,
    roomWarning,
    remotes,
  } = useGame();

  const [showPool, setShowPool] = React.useState(false);
  const [showScreens, setShowScreens] = React.useState(false);
  const [showInsights, setShowInsights] = React.useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Zap size={56} className="text-neon-blue animate-pulse mb-4" />
        <p className="text-xl font-mono animate-pulse">PREPARING THE ROUND…</p>
      </div>
    );
  }

  const seats = lanes.flatMap((lane) => lane.seats);
  const seatsDone = seats.filter(
    (seat) => seat.status === LaneStatus.DONE,
  ).length;
  const likesThisGame = categoryLikes.reduce(
    (total, row) => total + row.playerIds.length,
    0,
  );

  return (
    <div className="min-h-screen tron-backdrop text-white p-4 md:p-6">
      {showPool && <CategoryPoolManager onClose={() => setShowPool(false)} />}
      {showInsights && <InsightsPanel onClose={() => setShowInsights(false)} />}
      {showScreens && <HostScreensPanel onClose={() => setShowScreens(false)} />}

      {/* A room that cannot be reached, or one this window no longer owns
          because another device took the game back with the host password.
          Either way the host is looking at a screen that is no longer driving
          anything, and has to be told rather than left to work it out from a
          table of players who have stopped responding. */}
      {roomWarning && (
        <p className="mb-4 text-sm text-amber-300 border border-amber-500/40 bg-amber-500/10 rounded-lg px-3 py-2">
          {roomWarning}
        </p>
      )}

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
          {phase === GamePhase.PLAYING && seats.length > 0 && (
            <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
              {seatsDone}/{seats.length} players finished
            </span>
          )}

          <button
            onClick={() => setShowPool(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 text-xs font-mono uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
            title="Edit the categories the end-of-round vote draws from"
          >
            <ListPlus size={14} /> pool
          </button>

          <button
            onClick={() => setShowInsights(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 text-xs font-mono uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
            title="Likes and votes, across every game hosted from this browser"
          >
            <Heart size={14} />
            data{likesThisGame > 0 ? ` · ${likesThisGame}` : ""}
          </button>

          <button
            onClick={() => setShowScreens(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono uppercase tracking-widest transition-colors ${
              remotes.length > 0
                ? "border-neon-yellow text-neon-yellow bg-neon-yellow/10"
                : "border-slate-600 text-slate-400 hover:text-white"
            }`}
            title="Put the broadcast on another device, or run the round from a tablet"
          >
            <Tablet size={14} />
            {remotes.length > 0
              ? `remote · ${remotes.map((remote) => remote.label).join(", ")}`
              : "cast & remote"}
          </button>

          <button
            onClick={toggleAutoAdvance}
            className={`px-3 py-2 rounded-lg border text-xs font-mono uppercase tracking-widest transition-colors ${
              autoAdvance
                ? "border-neon-green text-neon-green bg-neon-green/10"
                : "border-slate-600 text-slate-400 hover:text-white"
            }`}
            title="Move the room's screen on by itself once everyone is through a question"
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
        {/* Run controls, with the host's own match beside them */}
        <div className="lg:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          <div className="space-y-5">
            {phase === GamePhase.CATEGORY_SELECT && (
              <>
                <Instructions guide="categorySelect" />
                <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4">
                  <Wheel />
                </div>
              </>
            )}

            {phase === GamePhase.PLAYING && (
              <>
                <Instructions guide="hostPlaying" />
                <Panel title={`Round ${currentRound} — every match`}>
                  <LaneBoard />
                </Panel>
              </>
            )}

            {phase === GamePhase.ROUND_END && <RoundEndControls />}
            {phase === GamePhase.GAME_OVER && (
              <GameOverControls onShowInsights={() => setShowInsights(true)} />
            )}
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
                    {player.losersBracket && !player.eliminated && (
                      <span
                        className="px-1.5 rounded border border-orange-400/60 text-[9px] font-mono uppercase tracking-widest text-orange-300"
                        title="Lost once — in the loser's bracket"
                      >
                        LB
                      </span>
                    )}
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

          {categoryLikes.length > 0 && (
            <Panel
              title="Liked this game"
              action={
                <button
                  onClick={() => setShowInsights(true)}
                  className="text-[10px] font-mono uppercase tracking-widest text-slate-500 hover:text-white"
                >
                  all data
                </button>
              }
            >
              <div className="space-y-1.5">
                {[...categoryLikes]
                  .sort((a, b) => b.playerIds.length - a.playerIds.length)
                  .map((row) => (
                    <div
                      key={row.category.id}
                      className="flex items-center gap-2 text-sm bg-slate-900 rounded-lg px-2 py-1.5"
                    >
                      <span>{row.category.icon}</span>
                      <span className="flex-1 truncate">{row.category.name}</span>
                      <span className="flex items-center gap-1 font-mono font-bold text-neon-pink">
                        <Heart size={12} className="fill-current" />
                        {row.playerIds.length}
                      </span>
                    </div>
                  ))}
              </div>
            </Panel>
          )}

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

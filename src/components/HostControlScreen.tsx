import React from "react";
import { useGame } from "../context/GameContext";
import { GamePhase, Player, QuestionType } from "../types";
import { buildReveal, publicOptions } from "../services/snapshot";
import {
  answeringRoster,
  matchupForPlayer,
  rosterForRound,
} from "../services/bracket";
import Button from "./Button";
import AvatarDisplay from "./AvatarDisplay";
import BracketView from "./BracketView";
import QuestionCard from "./QuestionCard";
import Wheel from "./Wheel";
import {
  ArrowRight,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";

/**
 * The hosting interface: everything needed to run a round, and nothing the
 * room is meant to see. The question, the clock and the scores go to the
 * broadcast window; this screen is the desk the host works from.
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

/** Who is in, who is out, and — once the answer is up — who got it. */
const AnswerTracker: React.FC = () => {
  const {
    players,
    currentAnswers,
    bracket,
    currentRound,
    phase,
    hostAnsweringEnabled,
  } = useGame();
  const active = answeringRoster(
    bracket[currentRound - 1],
    players,
    hostAnsweringEnabled,
  );
  // The answers stay on screen past the reveal, into the round and game end.
  // Anyone without a record has missed their chance by then, whichever of
  // those phases we are in.
  const revealing =
    phase === GamePhase.QUESTION_REVEAL ||
    phase === GamePhase.ROUND_END ||
    phase === GamePhase.GAME_OVER;

  if (active.length === 0) {
    return (
      <p className="text-slate-500 text-sm">No one is playing this round.</p>
    );
  }

  const answeredCount = currentAnswers.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-mono">
        <span className="text-2xl font-black text-neon-green">
          {answeredCount}
          <span className="text-slate-600 text-lg">/{active.length}</span>
          <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-500">
            answered
          </span>
        </span>
        <span className="text-2xl font-black text-neon-yellow">
          {active.length - answeredCount}
          <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-500">
            waiting
          </span>
        </span>
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        {active.map((id) => {
          const player = players.find((p) => p.id === id);
          if (!player) return null;
          const record = currentAnswers.find((a) => a.playerId === id);

          return (
            <div
              key={id}
              className={`flex items-center gap-3 p-2 rounded-lg border text-sm ${
                record
                  ? "bg-slate-900 border-slate-700"
                  : "bg-slate-900/40 border-slate-800"
              }`}
            >
              <AvatarDisplay
                avatar={player.avatar}
                color={player.avatarColor}
                accessory={player.avatarAccessory}
                size="sm"
              />
              <span className="flex-1 truncate font-bold text-white">
                {player.name}
              </span>

              {!record && !revealing && (
                <span className="font-mono text-xs uppercase tracking-widest text-slate-500 animate-pulse">
                  thinking
                </span>
              )}
              {!record && revealing && (
                <span className="font-mono text-xs uppercase tracking-widest text-slate-500">
                  no answer
                </span>
              )}
              {record && !revealing && (
                <span className="font-mono text-xs uppercase tracking-widest text-neon-green">
                  locked in
                </span>
              )}
              {record && revealing && (
                <span
                  className={`font-mono text-xs font-bold ${record.isCorrect ? "text-green-400" : "text-red-400"}`}
                >
                  {record.isCorrect ? `+${record.points}` : "MISS"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** This round's pairings with their live round scores. */
const MatchupPanel: React.FC = () => {
  const { players, bracket, currentRound } = useGame();
  const round = bracket[currentRound - 1];

  if (!round) {
    return <p className="text-slate-500 text-sm">The draw is made at kickoff.</p>;
  }

  const nameOf = (id: string | null): Player | undefined =>
    id ? players.find((p) => p.id === id) : undefined;

  return (
    <div className="space-y-2">
      {round.matchups.map((matchup) => {
        const a = nameOf(matchup.playerAId);
        const b = nameOf(matchup.playerBId);

        return (
          <div
            key={matchup.id}
            className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2 text-sm"
          >
            <span
              className={`flex-1 truncate font-bold ${matchup.winnerId === a?.id ? "text-green-400" : "text-white"}`}
            >
              {a?.name ?? "—"}
            </span>
            <span className="font-mono text-neon-blue">{a?.roundScore ?? 0}</span>
            <Swords size={12} className="text-neon-pink shrink-0" />
            {b ? (
              <>
                <span className="font-mono text-neon-blue">{b.roundScore}</span>
                <span
                  className={`flex-1 truncate text-right font-bold ${matchup.winnerId === b.id ? "text-green-400" : "text-white"}`}
                >
                  {b.name}
                </span>
              </>
            ) : (
              <span className="flex-1 text-right italic text-slate-500">bye</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** The question, its answer, and the clock — the host's reading copy. */
const QuestionControls: React.FC = () => {
  const {
    currentQuestion,
    currentQuestionIndex,
    questionsQueue,
    timeLeft,
    timerPaused,
    questionDuration,
    phase,
    revealSecondsLeft,
    autoAdvance,
    currentAnswers,
    currentPlayerId,
    players,
    bracket,
    currentRound,
    hostAnsweringEnabled,
    endQuestionNow,
    toggleTimerPaused,
    addTime,
    nextQuestion,
  } = useGame();

  const [answerHidden, setAnswerHidden] = React.useState(false);

  if (!currentQuestion) return null;

  const revealing = phase === GamePhase.QUESTION_REVEAL;
  const reveal = buildReveal(currentQuestion);
  const options = publicOptions(currentQuestion);
  const type = currentQuestion.type ?? QuestionType.MULTIPLE_CHOICE;

  // A host who is also playing must not read the answer off their own screen
  // before they have locked one in. Once they are knocked out they are running
  // the game rather than playing it, so the reference comes back — keying this
  // off `currentPlayerId` alone left an eliminated host blind for the rest of
  // the night, since they can no longer answer to unlock it.
  const hostPlayer = players.find((p) => p.id === currentPlayerId);
  const hostIsPlaying =
    !!hostPlayer &&
    !hostPlayer.eliminated &&
    answeringRoster(
      bracket[currentRound - 1],
      players,
      hostAnsweringEnabled,
    ).includes(hostPlayer.id);
  const hostAnswered = currentAnswers.some((a) => a.playerId === currentPlayerId);
  const answerWithheld = hostIsPlaying && !hostAnswered && !revealing;
  const showAnswer = !answerWithheld && !answerHidden;

  const correctCount = currentAnswers.filter((a) => a.isCorrect).length;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">
          <span>
            Question {currentQuestionIndex + 1} of {questionsQueue.length}
          </span>
          <span>{type.replace(/_/g, " ")}</span>
        </div>

        <p className="text-2xl font-bold text-white leading-snug">
          {currentQuestion.text}
        </p>

        {options.length > 0 && type !== QuestionType.SLIDER && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
            {options.map((option, index) => {
              const isCorrect =
                showAnswer && reveal.correctIndex === index;
              return (
                <div
                  key={`${option}-${index}`}
                  className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
                    isCorrect
                      ? "bg-green-600/20 border-green-500 text-green-300"
                      : "bg-slate-800 border-slate-700 text-slate-300"
                  }`}
                >
                  <span className="font-mono font-bold opacity-60">
                    {CHOICE_LETTERS[index] ?? index + 1}
                  </span>
                  {option}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-start gap-3 bg-slate-800/70 border border-slate-700 rounded-xl p-3">
          <button
            onClick={() => setAnswerHidden((hidden) => !hidden)}
            disabled={answerWithheld}
            className="text-slate-400 hover:text-white disabled:opacity-40 mt-0.5"
            title={answerHidden ? "Show the answer" : "Hide the answer"}
          >
            {showAnswer ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <div className="flex-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
              Answer
            </div>
            {answerWithheld ? (
              <div className="text-slate-500 italic text-sm">
                Held back until you lock in your own answer.
              </div>
            ) : showAnswer ? (
              <>
                <div className="text-lg font-bold text-green-400">
                  {reveal.label}
                </div>
                {currentQuestion.explanation && (
                  <p className="text-sm text-slate-400 mt-1">
                    {currentQuestion.explanation}
                  </p>
                )}
              </>
            ) : (
              <div className="text-slate-600 text-sm">Hidden</div>
            )}
          </div>
        </div>
      </div>

      {/* Clock */}
      {!revealing ? (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase tracking-widest">
              <Clock size={14} /> {timerPaused ? "paused" : "running"}
            </div>
            <div
              className={`font-mono text-4xl font-black ${timeLeft <= 5 ? "text-red-500" : "text-white"}`}
            >
              {timeLeft}s
            </div>
          </div>

          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 5 ? "bg-red-500" : "bg-neon-blue"}`}
              style={{
                width: `${Math.min(100, (timeLeft / questionDuration) * 100)}%`,
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="secondary"
              onClick={toggleTimerPaused}
              className="flex items-center justify-center gap-2 py-2 text-sm"
            >
              {timerPaused ? <Play size={16} /> : <Pause size={16} />}
              {timerPaused ? "Resume" : "Pause"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => addTime(10)}
              className="flex items-center justify-center gap-2 py-2 text-sm"
            >
              +10s
            </Button>
            <Button
              variant="neon"
              onClick={endQuestionNow}
              className="flex items-center justify-center gap-2 py-2 text-sm"
            >
              <SkipForward size={16} /> Reveal
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-green-700 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-widest text-green-400">
              Answer is on the broadcast
            </span>
            <span className="font-mono text-sm text-slate-400">
              {correctCount}/{currentAnswers.length} correct
            </span>
          </div>

          <Button
            variant="neon"
            fullWidth
            onClick={nextQuestion}
            className="flex items-center justify-center gap-2"
          >
            {currentQuestionIndex + 1 < questionsQueue.length
              ? "NEXT QUESTION"
              : "END OF ROUND"}
            <ArrowRight size={18} />
          </Button>

          <div className="text-center text-xs font-mono uppercase tracking-widest text-slate-500 mt-2">
            {autoAdvance
              ? `Auto-advancing in ${revealSecondsLeft}s`
              : "Auto-advance is off — advance when you are ready"}
          </div>
        </div>
      )}
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
 * than replacing them — one screen showing both jobs at once, which is what
 * makes it possible to click through a whole round solo and watch how the
 * question-by-question pacing actually feels.
 */
const HostPlayerPane: React.FC = () => {
  const {
    phase,
    players,
    currentPlayerId,
    currentQuestion,
    currentAnswers,
    bracket,
    currentRound,
    hostAnsweringEnabled,
    toggleHostAnswering,
  } = useGame();

  const hostPlayer = players.find((p) => p.id === currentPlayerId);
  if (!hostPlayer) return null;

  const record = currentAnswers.find((a) => a.playerId === hostPlayer.id);
  const inRoster = rosterForRound(bracket[currentRound - 1], players).includes(
    hostPlayer.id,
  );
  const matchup = matchupForPlayer(bracket[currentRound - 1], hostPlayer.id);
  const opponentId =
    matchup && matchup.playerAId === hostPlayer.id
      ? matchup.playerBId
      : matchup?.playerAId;
  const opponent = opponentId ? players.find((p) => p.id === opponentId) : null;

  const status = () => {
    if (!hostAnsweringEnabled)
      return "Answering is off — questions will not wait for you.";
    if (hostPlayer.eliminated) return "You are out of the bracket.";
    if (!inRoster) return "You are not in this round.";
    if (phase === GamePhase.QUESTION_REVEAL)
      return record
        ? record.isCorrect
          ? `Correct — +${record.points}`
          : "Missed that one"
        : "You let that one time out";
    if (phase !== GamePhase.PLAYING) return "Waiting for the next question.";
    return record ? "Locked in — waiting on the rest." : "Your turn.";
  };

  return (
    <Panel
      title="Your player view"
      action={
        <button
          onClick={toggleHostAnswering}
          className={`px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-widest transition-colors ${
            hostAnsweringEnabled
              ? "border-neon-green text-neon-green bg-neon-green/10"
              : "border-slate-600 text-slate-400 hover:text-white"
          }`}
          title="Take yourself in or out of the answer count"
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
            {opponent ? `vs ${opponent.name}` : matchup ? "Bye" : "No matchup"}
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

      {phase === GamePhase.PLAYING &&
        currentQuestion &&
        hostAnsweringEnabled &&
        inRoster &&
        !record && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
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

          <button
            onClick={toggleAutoAdvance}
            className={`px-3 py-2 rounded-lg border text-xs font-mono uppercase tracking-widest transition-colors ${
              autoAdvance
                ? "border-neon-green text-neon-green bg-neon-green/10"
                : "border-slate-600 text-slate-400 hover:text-white"
            }`}
            title="Advance automatically once everyone has answered"
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
        {/* Run controls, with the host's own player view beside them */}
        <div className="lg:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          <div className="space-y-5">
            {phase === GamePhase.CATEGORY_SELECT && (
              <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4">
                <Wheel />
              </div>
            )}

            {(phase === GamePhase.PLAYING ||
              phase === GamePhase.QUESTION_REVEAL) && <QuestionControls />}

            {phase === GamePhase.ROUND_END && <RoundEndControls />}
            {phase === GamePhase.GAME_OVER && <GameOverControls />}
          </div>

          <HostPlayerPane />

        </div>

        {/* Live read on the room */}
        <div className="space-y-5">
          <Panel title="Answers in">
            <AnswerTracker />
          </Panel>

          {bracket.length > 0 && (
            <Panel title={`Round ${currentRound} matchups`}>
              <MatchupPanel />
            </Panel>
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

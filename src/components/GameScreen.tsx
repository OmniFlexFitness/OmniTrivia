import React from 'react';
import { useGame } from '../context/GameContext';
import { GamePhase, LaneStatus } from '../types';
import { answerBy, laneForPlayer, seatFor } from '../services/lanes';
import { publicPoll } from '../services/snapshot';
import Wheel from './Wheel';
import QuestionCard from './QuestionCard';
import Leaderboard from './Leaderboard';
import Instructions from './Instructions';
import CategoryLikeButton from './CategoryLikeButton';
import CategoryVotePanel from './CategoryVotePanel';
import Button from './Button';
import { ArrowRight, Loader2 } from 'lucide-react';

/**
 * The plain in-browser view of a game, for a tab that is neither hosting nor
 * joined to someone else's room.
 *
 * Like every other playing surface it follows this player's own seat rather
 * than the room: their question, their clock, their "locked in" beat — and
 * their own button off it, because a player who is ready should not be kept
 * sitting. How the answers went is only shown once their match is over.
 */
const GameScreen: React.FC = () => {
  const {
    phase,
    lanes,
    questionsQueue,
    currentPlayerId,
    loading,
    roundsConfig,
    currentRound,
    categoryLikes,
    categoryPoll,
    advanceMyQuestion,
    setCategoryLike,
    voteForCategory,
  } = useGame();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 size={64} className="text-neon-blue animate-spin mb-4" />
        <p className="text-xl font-mono animate-pulse">GENERATING TRIVIA...</p>
      </div>
    );
  }

  const lane = laneForPlayer(lanes, currentPlayerId);
  const seat = lane ? seatFor(lane, currentPlayerId) : undefined;
  const question = seat ? questionsQueue[seat.questionIndex] : undefined;
  const answered =
    lane && seat && currentPlayerId
      ? Boolean(answerBy(lane, currentPlayerId, seat.questionIndex))
      : false;

  const poll = publicPoll(categoryPoll);
  const roundCategory = roundsConfig[currentRound - 1]?.category ?? null;
  const likes = roundCategory
    ? categoryLikes.find((tally) => tally.category.id === roundCategory.id)
    : undefined;
  const liked = Boolean(
    currentPlayerId && likes?.playerIds.includes(currentPlayerId),
  );

  const likeStrip = roundCategory && (
    <div className="flex justify-center mt-6">
      <CategoryLikeButton
        category={roundCategory}
        count={likes?.playerIds.length ?? 0}
        liked={liked}
        onToggle={(next) => setCategoryLike(roundCategory.id, next)}
      />
    </div>
  );

  const round = () => {
    // A finished seat parks past the last question, so it has no question to
    // show — which is why it is checked for by status, not by `question`.
    if (!seat || (!question && seat.status !== LaneStatus.DONE)) {
      return (
        <div className="text-center text-slate-500 font-mono animate-pulse">
          WAITING ON THE REST OF THE FIELD…
        </div>
      );
    }

    if (seat.status === LaneStatus.REVEAL) {
      // A beat between questions, not a verdict: how it went is for the end of
      // the match.
      const record = currentPlayerId
        ? answerBy(lane!, currentPlayerId, seat.questionIndex)
        : undefined;

      return (
        <div className="text-center">
          <p className="cyber-question text-3xl text-white">
            {record ? 'Locked in' : "Time's up"}
          </p>
          <p className="cyber-hud text-[10px] text-slate-500 mt-2">
            Results at the end of the match
          </p>
          <Button
            onClick={advanceMyQuestion}
            variant="neon"
            className="mt-5 flex items-center justify-center gap-2 mx-auto"
          >
            NEXT QUESTION <ArrowRight size={18} />
          </Button>
          <p className="text-xs font-mono uppercase tracking-widest text-slate-600 mt-2">
            or it moves on by itself in {seat.revealSecondsLeft}s
          </p>
        </div>
      );
    }

    if (seat.status === LaneStatus.DONE) {
      const matchOver = lane!.seats.every((other) => other.status === LaneStatus.DONE);
      if (!matchOver || !currentPlayerId) {
        return (
          <div className="text-center text-slate-400 font-mono">
            YOU ARE THROUGH THE ROUND — RESULTS WHEN YOUR MATCH IS OVER
          </div>
        );
      }

      const records = questionsQueue.map((_, index) =>
        answerBy(lane!, currentPlayerId, index),
      );
      const right = records.filter((record) => record?.isCorrect).length;
      const points = records.reduce((total, record) => total + (record?.points ?? 0), 0);

      return (
        <div className="text-center space-y-2">
          <p className="cyber-hud text-[11px] text-slate-500">Match complete</p>
          <p className="cyber-question text-3xl text-white">
            {right}/{questionsQueue.length} correct · {points} pts
          </p>
          <p className="text-slate-400 text-sm">
            The answers go up when every match has finished.
          </p>
        </div>
      );
    }

    if (answered) {
      return (
        <div className="text-center text-neon-green font-mono animate-pulse">
          SCORING IT…
        </div>
      );
    }

    if (!question) return null;

    return (
      <QuestionCard
        key={`${question.id}-${seat.questionIndex}`}
        question={question}
        timeLeft={seat.timeLeft}
        duration={seat.questionDuration}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink">
          OMNI<span className="text-white">TRIVIA</span>
        </div>
        <div className="text-sm font-mono text-slate-500">
          PHASE: {phase}
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto mb-5">
        <Instructions
          guide={
            phase === GamePhase.PLAYING
              ? 'playing'
              : phase === GamePhase.CATEGORY_SELECT
                ? 'categorySelect'
                : phase === GamePhase.GAME_OVER
                  ? 'gameOver'
                  : 'roundEnd'
          }
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col justify-center">
        {phase === GamePhase.CATEGORY_SELECT && <Wheel />}

        {phase === GamePhase.PLAYING && (
          <>
            {round()}
            {likeStrip}
          </>
        )}

        {(phase === GamePhase.ROUND_END || phase === GamePhase.GAME_OVER) && (
          <>
            <Leaderboard />
            {likeStrip}
            {poll && (
              <div className="w-full max-w-2xl mx-auto mt-6">
                <CategoryVotePanel
                  poll={poll}
                  myVote={
                    currentPlayerId ? (poll.votes[currentPlayerId] ?? null) : null
                  }
                  onVote={(categoryId) => voteForCategory(poll.id, categoryId)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GameScreen;

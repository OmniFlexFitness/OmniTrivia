import React from 'react';
import { useGame } from '../context/GameContext';
import { GamePhase, LaneStatus } from '../types';
import { answerBy, laneForPlayer, seatFor } from '../services/lanes';
import { buildReveal, publicPoll } from '../services/snapshot';
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
 * than the room: their question, their clock, their reveal — and their own
 * button off the reveal, because a player who has read the answer should not
 * be sitting on it.
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
    if (!seat || !question) {
      return (
        <div className="text-center text-slate-500 font-mono animate-pulse">
          WAITING ON THE REST OF THE FIELD…
        </div>
      );
    }

    if (seat.status === LaneStatus.REVEAL) {
      const reveal = buildReveal(question);
      const record = currentPlayerId
        ? answerBy(lane!, currentPlayerId, seat.questionIndex)
        : undefined;

      return (
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-1">Correct answer:</p>
          <p className="text-green-400 font-bold text-2xl">{reveal.label}</p>
          {reveal.explanation && (
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-2">
              {reveal.explanation}
            </p>
          )}
          <p
            className={`mt-3 font-bold ${record?.isCorrect ? 'text-green-400' : 'text-red-400'}`}
          >
            {record?.isCorrect
              ? `You got it — +${record.points}`
              : record
                ? 'Not this time'
                : 'No answer'}
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
      return (
        <div className="text-center text-slate-400 font-mono">
          YOU ARE THROUGH THE ROUND
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

import React from 'react';
import { useGame } from '../context/GameContext';
import { GamePhase, LaneStatus } from '../types';
import { laneForPlayer, liveAnswers } from '../services/lanes';
import { buildReveal } from '../services/snapshot';
import Wheel from './Wheel';
import QuestionCard from './QuestionCard';
import Leaderboard from './Leaderboard';
import { Loader2 } from 'lucide-react';

/**
 * The plain in-browser view of a game, for a tab that is neither hosting nor
 * joined to someone else's room.
 *
 * Like every other playing surface it follows this player's own matchup rather
 * than the room: its question, its clock, its reveal.
 */
const GameScreen: React.FC = () => {
  const { phase, lanes, questionsQueue, currentPlayerId, loading } = useGame();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 size={64} className="text-neon-blue animate-spin mb-4" />
        <p className="text-xl font-mono animate-pulse">GENERATING TRIVIA...</p>
      </div>
    );
  }

  const lane = laneForPlayer(lanes, currentPlayerId);
  const question = lane ? questionsQueue[lane.questionIndex] : undefined;
  const answered = lane
    ? liveAnswers(lane).some((a) => a.playerId === currentPlayerId)
    : false;

  const round = () => {
    if (!lane || !question) {
      return (
        <div className="text-center text-slate-500 font-mono animate-pulse">
          WAITING ON THE OTHER MATCHUPS…
        </div>
      );
    }

    if (lane.status === LaneStatus.REVEAL) {
      const reveal = buildReveal(question);
      return (
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-1">Correct answer:</p>
          <p className="text-green-400 font-bold text-2xl">{reveal.label}</p>
          <p className="text-neon-blue font-mono mt-4 animate-pulse">
            NEXT QUESTION IN {lane.revealSecondsLeft}…
          </p>
        </div>
      );
    }

    if (lane.status === LaneStatus.DONE) {
      return (
        <div className="text-center text-slate-400 font-mono">
          YOUR MATCHUP IS THROUGH THE ROUND
        </div>
      );
    }

    if (answered) {
      return (
        <div className="text-center text-neon-green font-mono animate-pulse">
          LOCKED IN — WAITING ON YOUR OPPONENT
        </div>
      );
    }

    return (
      <QuestionCard
        key={`${question.id}-${lane.questionIndex}`}
        question={question}
        timeLeft={lane.timeLeft}
        duration={lane.questionDuration}
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

      {/* Content Area */}
      <div className="flex-1 flex flex-col justify-center">
        {phase === GamePhase.CATEGORY_SELECT && <Wheel />}

        {phase === GamePhase.PLAYING && round()}

        {(phase === GamePhase.ROUND_END || phase === GamePhase.GAME_OVER) && (
          <Leaderboard />
        )}
      </div>
    </div>
  );
};

export default GameScreen;

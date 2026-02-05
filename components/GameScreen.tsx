import React from 'react';
import { useGame } from '../context/GameContext';
import { GamePhase } from '../types';
import Wheel from './Wheel';
import QuestionCard from './QuestionCard';
import Leaderboard from './Leaderboard';
import { Loader2 } from 'lucide-react';

const GameScreen: React.FC = () => {
  const { phase, currentQuestion, loading } = useGame();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 size={64} className="text-neon-blue animate-spin mb-4" />
        <p className="text-xl font-mono animate-pulse">GENERATING TRIVIA...</p>
      </div>
    );
  }

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
        
        {phase === GamePhase.PLAYING && currentQuestion && (
          <QuestionCard question={currentQuestion} />
        )}

        {(phase === GamePhase.ROUND_RESULT || phase === GamePhase.ROUND_END || phase === GamePhase.GAME_OVER) && (
          <Leaderboard />
        )}
      </div>
    </div>
  );
};

export default GameScreen;
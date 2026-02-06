import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import Button from './Button';
import { Settings, ArrowRight, Loader2 } from 'lucide-react';

const HostConfigScreen: React.FC = () => {
  const { generateGame, loading } = useGame();
  const [rounds, setRounds] = useState(3);
  const [questions, setQuestions] = useState(5);

  const handleGenerate = () => {
    generateGame(rounds, questions);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 size={64} className="text-neon-blue animate-spin mb-4" />
        <p className="text-xl font-mono animate-pulse">GENERATING GAME CONTENT...</p>
        <p className="text-slate-400 mt-2">Creating {rounds} rounds of trivia</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="text-neon-blue" size={32} />
          <h2 className="text-3xl font-bold text-white">GAME SETUP</h2>
        </div>

        <div className="space-y-8">
          <div>
            <label className="block text-slate-400 mb-2 text-sm uppercase tracking-wider">Number of Rounds</label>
            <div className="flex items-center gap-4">
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={rounds} 
                onChange={(e) => setRounds(parseInt(e.target.value))}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-neon-pink"
              />
              <span className="text-2xl font-mono font-bold text-neon-pink w-12 text-center">{rounds}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-2 text-sm uppercase tracking-wider">Questions per Round</label>
            <div className="flex items-center gap-4">
              <input 
                type="range" 
                min="1" 
                max="20" 
                value={questions} 
                onChange={(e) => setQuestions(parseInt(e.target.value))}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-neon-blue"
              />
              <span className="text-2xl font-mono font-bold text-neon-blue w-12 text-center">{questions}</span>
            </div>
          </div>

          <div className="pt-4">
            <Button onClick={handleGenerate} fullWidth variant="neon" className="flex items-center justify-center gap-2">
              GENERATE & REVIEW <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostConfigScreen;
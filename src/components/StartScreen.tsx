import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import Button from './Button';
import Instructions from './Instructions';
import CategoryPoolManager from './CategoryPoolManager';
import InsightsPanel from './InsightsPanel';
import { readHostSession } from '../services/hostSession';
import { BarChart3, Gamepad2, KeyRound, ListPlus, Server } from 'lucide-react';

const StartScreen: React.FC = () => {
  const { initHost, initJoin, initHostResume } = useGame();
  const [showPool, setShowPool] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

  // A host does not always arrive here on purpose. A page whose bundle was
  // replaced mid-game reloads itself, and lands on this screen with a game
  // still running behind it — so if this browser was hosting one, say so
  // rather than making them remember that "resume" is a thing.
  const [pending] = useState(() => readHostSession());

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"></div>

      {showPool && <CategoryPoolManager onClose={() => setShowPool(false)} />}
      {showInsights && <InsightsPanel onClose={() => setShowInsights(false)} />}

      <div className="relative z-10 w-full max-w-md flex flex-col items-center py-10">
        <div className="p-6 bg-slate-900 rounded-full border-4 border-neon-pink mb-8 shadow-[0_0_30px_#ff00ff] animate-pulse-fast">
          <Gamepad2 size={64} className="text-neon-blue" />
        </div>

        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink tracking-tighter mb-2 text-center">
          OMNI<span className="text-white">TRIVIA</span>
        </h1>
        <p className="text-slate-400 mb-8 text-xl tracking-widest uppercase">Elevate</p>

        <div className="w-full space-y-4">
          <Button
            onClick={initJoin}
            variant="neon"
            fullWidth
            className="h-16 text-xl flex items-center justify-center gap-3"
          >
            <Gamepad2 /> JOIN GAME
          </Button>

          <Button
            onClick={initHost}
            variant="secondary"
            fullWidth
            className="h-16 text-xl flex items-center justify-center gap-3 border-slate-600 hover:border-neon-blue hover:text-neon-blue transition-colors"
          >
            <Server /> HOST GAME
          </Button>

          {/* A host whose window went away is not starting a game — their
              game is still running, with a room sitting in front of it. This
              is the way back in, and it belongs beside the other two doors
              rather than buried in the host's setup. */}
          {pending ? (
            <Button
              onClick={initHostResume}
              variant="secondary"
              fullWidth
              className="h-16 flex flex-col items-center justify-center gap-0.5 border-neon-yellow text-neon-yellow hover:bg-neon-yellow/10 transition-colors"
            >
              <span className="flex items-center gap-2 text-lg">
                <KeyRound size={18} /> RESUME PIN {pending.pin}
              </span>
              <span className="text-[11px] font-mono uppercase tracking-widest opacity-70">
                a game you were hosting is still running
              </span>
            </Button>
          ) : (
            <button
              onClick={initHostResume}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-mono uppercase tracking-widest text-slate-400 hover:text-neon-yellow transition-colors"
            >
              <KeyRound size={16} /> resume hosting a game
            </button>
          )}
        </div>

        {/* The host's own tools. They are not part of playing a game, so they
            sit below the two buttons that are. */}
        <div className="flex gap-6 mt-6">
          <button
            onClick={() => setShowInsights(true)}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-neon-pink transition-colors"
          >
            <BarChart3 size={14} /> category data
          </button>
          <button
            onClick={() => setShowPool(true)}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-neon-blue transition-colors"
          >
            <ListPlus size={14} /> category pool
          </button>
        </div>

        <Instructions guide="start" full className="w-full mt-8" />
      </div>
    </div>
  );
};

export default StartScreen;
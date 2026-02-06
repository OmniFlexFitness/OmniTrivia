import React from 'react';
import { useGame } from '../context/GameContext';
import Button from './Button';
import { Gamepad2, Server } from 'lucide-react';

const StartScreen: React.FC = () => {
  const { initHost, initJoin } = useGame();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"></div>
      
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <div className="p-6 bg-slate-900 rounded-full border-4 border-neon-pink mb-8 shadow-[0_0_30px_#ff00ff] animate-pulse-fast">
          <Gamepad2 size={64} className="text-neon-blue" />
        </div>
        
        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink tracking-tighter mb-2 text-center">
          OMNI<span className="text-white">TRIVIA</span>
        </h1>
        <p className="text-slate-400 mb-12 text-xl tracking-widest uppercase">Neon Edition</p>

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
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
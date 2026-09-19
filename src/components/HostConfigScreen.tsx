import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import Button from './Button';
import Instructions from './Instructions';
import CategoryPoolManager from './CategoryPoolManager';
import { MIN_HOST_PASSWORD_LENGTH, suggestHostPassword } from '../services/proof';
import { Settings, ArrowRight, KeyRound, ListPlus, Loader2, RefreshCw, Upload, AlertTriangle } from 'lucide-react';

const HostConfigScreen: React.FC = () => {
  const {
    generateGame,
    loading,
    error,
    initImport,
    gameName,
    setGameName,
    hostPassword,
    setHostPassword,
  } = useGame();
  const [rounds, setRounds] = useState(3);
  const [questions, setQuestions] = useState(5);
  const [showPool, setShowPool] = useState(false);

  // Blank is fine — a password is suggested when the lobby opens, and the
  // lobby shows whatever it ended up being. Two characters is not fine, and
  // the place to say so is before a room is waiting on this game.
  const password = hostPassword.trim();
  const passwordTooShort =
    password.length > 0 && password.length < MIN_HOST_PASSWORD_LENGTH;

  const handleGenerate = () => {
    if (passwordTooShort) return;
    generateGame(rounds, questions);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 size={64} className="text-neon-blue animate-spin mb-4" />
        <p className="text-xl font-mono animate-pulse">GENERATING GAME CONTENT...</p>
        <p className="text-slate-400 mt-2">Creating {rounds} rounds of trivia</p>
        <p className="text-slate-600 text-sm mt-4">This falls back to placeholder questions if the API cannot be reached.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900">
      {showPool && <CategoryPoolManager onClose={() => setShowPool(false)} />}

      <div className="w-full max-w-md mb-4">
        <Instructions guide="hostConfig" />
      </div>

      <div className="w-full max-w-md bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="text-neon-blue" size={32} />
          <h2 className="text-3xl font-bold text-white">GAME SETUP</h2>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-300 p-4 rounded-lg mb-6 flex items-center gap-3">
            <AlertTriangle className="shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="space-y-8">
          <div>
            <label className="block text-slate-400 mb-2 text-sm uppercase tracking-wider">Game Name</label>
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Thursday Night Trivia"
              maxLength={60}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-neon-blue outline-none"
            />
            <p className="text-xs text-slate-500 mt-2">
              What this game is called. The PIN is just the code players type to
              get in — it is not the name of the room.
            </p>
          </div>

          {/* The one thing on this screen that is not about the questions.
              A host's window is the whole game, so a host who loses it needs
              something to prove the game is theirs — and the moment to decide
              that is before there is a room waiting on them. */}
          <div>
            <label className="block text-slate-400 mb-2 text-sm uppercase tracking-wider">
              Host Password
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={hostPassword}
                onChange={(e) => setHostPassword(e.target.value)}
                placeholder="something you will remember"
                maxLength={64}
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white font-mono focus:border-neon-yellow outline-none"
              />
              <button
                type="button"
                onClick={() => setHostPassword(suggestHostPassword())}
                title="Suggest another"
                className="px-3 rounded-lg border border-slate-600 text-slate-400 hover:text-neon-yellow hover:border-neon-yellow transition-colors"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <p
              className={`text-xs mt-2 flex items-start gap-1.5 ${
                passwordTooShort ? 'text-amber-300' : 'text-slate-500'
              }`}
            >
              <KeyRound size={13} className="shrink-0 mt-0.5 text-neon-yellow" />
              <span>
                {passwordTooShort
                  ? `At least ${MIN_HOST_PASSWORD_LENGTH} characters — this is the only thing that gets the game back if this window dies.`
                  : 'Write this down. With it and the PIN you can take this game back from any device — after a reload, a closed tab, or a dead laptop.'}
              </span>
            </p>
          </div>

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

          <div className="pt-4 space-y-3">
            <Button onClick={handleGenerate} fullWidth variant="neon" disabled={passwordTooShort} className="flex items-center justify-center gap-2">
              GENERATE & REVIEW <ArrowRight />
            </Button>
            <Button onClick={initImport} fullWidth variant="secondary" disabled={passwordTooShort} className="flex items-center justify-center gap-2 border-slate-600">
              <Upload size={18} /> IMPORT MY OWN QUESTIONS
            </Button>
            {/* The pool is not part of this game's setup — it is the standing
                list the end-of-round vote offers — but this is where a host is
                already thinking about categories. */}
            <button
              onClick={() => setShowPool(true)}
              className="w-full flex items-center justify-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-neon-blue transition-colors pt-1"
            >
              <ListPlus size={14} /> edit the category pool
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostConfigScreen;
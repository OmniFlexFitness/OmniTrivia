import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import Button from './Button';
import Instructions from './Instructions';
import { readHostSession } from '../services/hostSession';
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, Server } from 'lucide-react';

/**
 * The door back into a game that is already running.
 *
 * A host who closed the tab, hit back, or lost a laptop is not starting a
 * game — the room is still there, the players are still in their seats, and
 * the scores are still real. This asks for the two things that prove the game
 * is theirs and puts them back at the controls.
 *
 * The PIN comes pre-filled when this machine is the one that lost the game,
 * because in that case it already knows which game it was; the password is
 * always typed, because that is the part being checked.
 */
const HostResumeScreen: React.FC = () => {
  const { resumeHosting, resuming, resumeError, clearResumeError, restartGame } =
    useGame();

  // Read once: a host mid-typing should not have the field move under them
  // when the saved copy is written again a second later.
  const [saved] = useState(() => readHostSession());
  const [pin, setPin] = useState(saved?.pin ?? '');
  const [password, setPassword] = useState('');

  const handleResume = (event: React.FormEvent) => {
    event.preventDefault();
    if (resuming) return;
    void resumeHosting(pin, password);
  };

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (resumeError) clearResumeError();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900">
      <div className="w-full max-w-md bg-slate-800 border border-neon-blue p-8 rounded-2xl shadow-[0_0_30px_rgba(0,255,255,0.2)] relative">
        <button
          onClick={restartGame}
          className="absolute top-4 left-4 text-slate-400 hover:text-white"
          aria-label="Back"
        >
          <ArrowLeft />
        </button>

        <div className="flex flex-col items-center mb-6">
          <div className="p-4 bg-slate-900 rounded-full border-2 border-neon-blue mb-4">
            <Server size={32} className="text-neon-blue" />
          </div>
          <h2 className="text-2xl font-black text-white text-center">
            TAKE THE GAME BACK
          </h2>
          <p className="text-slate-400 text-sm text-center mt-2">
            The room, the scores and the bracket are still where you left them.
          </p>
        </div>

        {resumeError && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg mb-6 flex items-start gap-2 text-sm">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>{resumeError}</span>
          </div>
        )}

        <form onSubmit={handleResume} className="space-y-5">
          <div>
            <label className="block text-slate-400 mb-2 text-xs uppercase tracking-widest">
              Game PIN
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              value={pin}
              onChange={(e) =>
                edit(setPin)(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono text-white focus:border-neon-blue outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-2 text-xs uppercase tracking-widest">
              Host password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              maxLength={64}
              placeholder="the password you set when you opened the game"
              value={password}
              onChange={(e) => edit(setPassword)(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-center text-lg font-mono text-white focus:border-neon-pink outline-none transition-colors"
            />
          </div>

          <Button
            type="submit"
            variant="neon"
            fullWidth
            disabled={resuming || pin.length !== 4 || !password.trim()}
            className="h-14 flex items-center justify-center gap-3"
          >
            {resuming ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <KeyRound size={18} />
            )}
            {resuming ? 'LOOKING FOR THAT GAME…' : 'RESUME HOSTING'}
          </Button>
        </form>

        {saved && (
          <p className="text-xs text-slate-500 mt-4 text-center font-mono">
            this browser was last hosting PIN {saved.pin}
          </p>
        )}

        <Instructions guide="hostResume" className="mt-6" />
      </div>
    </div>
  );
};

export default HostResumeScreen;

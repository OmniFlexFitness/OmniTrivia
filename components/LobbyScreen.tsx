import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { AVATARS } from '../constants';
import Button from './Button';
import { Users, Zap, Settings, UserPlus, PlayCircle } from 'lucide-react';

const LobbyScreen: React.FC = () => {
  const { players, startGame, isHost, totalRounds, questionsPerRound, gamePin, addBot, hostJoinAsPlayer, currentPlayerId } = useGame();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [hostName, setHostName] = useState('Host');
  const [hostAvatar, setHostAvatar] = useState(AVATARS[0]);

  const handleHostJoin = (e: React.FormEvent) => {
    e.preventDefault();
    hostJoinAsPlayer(hostName, hostAvatar);
    setShowJoinModal(false);
  };

  const isHostJoined = !!currentPlayerId;

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center relative">
      {/* Host Join Modal */}
      {showJoinModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-neon-blue p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-4">Join as Player</h3>
            <form onSubmit={handleHostJoin} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input 
                  type="text" 
                  value={hostName} 
                  onChange={e => setHostName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Avatar</label>
                <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto">
                  {AVATARS.map(av => (
                    <button 
                      key={av}
                      type="button"
                      onClick={() => setHostAvatar(av)}
                      className={`p-2 rounded hover:bg-slate-700 ${hostAvatar === av ? 'bg-neon-blue/20 border border-neon-blue' : ''}`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button type="button" variant="secondary" onClick={() => setShowJoinModal(false)} fullWidth>Cancel</Button>
                <Button type="submit" variant="neon" fullWidth>Join</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header className="w-full max-w-6xl flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-bold text-neon-blue">LOBBY <span className="text-white animate-pulse">///</span> WAITING</h2>
          {gamePin && (
            <div className="text-slate-400 mt-1 flex flex-col md:flex-row items-center gap-2">
              <span>JOIN AT <span className="text-white font-bold">omnitrivia.game</span> WITH PIN:</span>
              <span className="text-5xl font-mono font-black text-white tracking-widest text-neon-shadow">{gamePin}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 bg-slate-800 px-6 py-3 rounded-full border border-slate-700 shadow-lg">
          <Users size={24} className="text-neon-pink" />
          <span className="font-mono text-2xl font-bold">{players.length}</span>
        </div>
      </header>

      <div className="w-full max-w-6xl flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
        {/* Players Grid */}
        <div className="flex-1 bg-slate-800/30 rounded-2xl border border-slate-700 p-4 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {players.map((player) => (
              <div 
                key={player.id}
                className={`bg-slate-800 border p-4 rounded-xl flex flex-col items-center animate-bounce-short transition-colors ${player.isHost ? 'border-neon-yellow shadow-[0_0_10px_rgba(250,255,0,0.3)]' : 'border-slate-700 hover:border-neon-blue'}`}
                style={{ animationDelay: `${Math.random()}s`, animationDuration: '3s' }}
              >
                <div className="text-5xl mb-2 filter drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">
                  {player.avatar}
                </div>
                <div className="font-bold text-slate-200 truncate w-full text-center text-lg">
                  {player.name}
                </div>
                {player.isHost && <span className="text-xs text-neon-yellow font-bold mt-1 font-mono">HOST</span>}
                {player.isBot && <span className="text-xs text-slate-500 uppercase mt-1 font-mono">AI PLAYER</span>}
              </div>
            ))}
            
            {players.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center text-slate-500 py-20">
                <div className="animate-spin-slow mb-4 text-4xl">⏳</div>
                <p>Waiting for players to join...</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Controls (Host Only) */}
        <div className="w-full md:w-80 flex flex-col gap-4 shrink-0">
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
            <div className="flex items-center gap-2 text-slate-300 font-bold mb-4">
              <Settings size={20} className="text-neon-blue" /> <span>GAME INFO</span>
            </div>
            <div className="flex justify-between text-white font-mono text-lg mb-2">
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase">Rounds</span>
                <span>{totalRounds}</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-xs text-slate-500 uppercase">Questions</span>
                <span>{questionsPerRound}</span>
              </div>
            </div>
          </div>

          {isHost ? (
            <div className="space-y-3 mt-auto">
              {!isHostJoined && (
                <Button 
                  onClick={() => setShowJoinModal(true)} 
                  fullWidth 
                  variant="secondary"
                  className="flex items-center justify-center gap-3 border-slate-600 hover:border-white"
                >
                  <PlayCircle size={20} />
                  JOIN AS PLAYER
                </Button>
              )}
              
              <Button 
                onClick={addBot} 
                fullWidth 
                variant="secondary"
                className="flex items-center justify-center gap-3 border-slate-600 hover:border-white"
              >
                <UserPlus size={20} />
                ADD BOT
              </Button>
              
              <Button 
                onClick={startGame} 
                fullWidth 
                className="flex items-center justify-center gap-3 h-20 text-xl shadow-[0_0_20px_rgba(250,255,0,0.3)]"
                variant="neon"
                disabled={players.length < 1}
              >
                <Zap className="text-yellow-400 fill-yellow-400 animate-pulse" />
                START GAME
              </Button>
            </div>
          ) : (
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 text-center">
              <div className="animate-pulse text-neon-blue font-bold mb-2">WAITING FOR HOST</div>
              <p className="text-slate-400 text-sm">The game will begin shortly.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LobbyScreen;
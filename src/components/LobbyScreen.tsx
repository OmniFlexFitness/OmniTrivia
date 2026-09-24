import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { AVATARS } from '../constants';
import Button from './Button';
import AvatarDisplay from './AvatarDisplay';
import JoinCode from './JoinCode';
import Instructions from './Instructions';
import LosersBracketToggle from './LosersBracketToggle';
import HostScreensPanel from './HostScreensPanel';
import BroadcastTextEditor from './BroadcastTextEditor';
import { Users, Zap, Settings, UserPlus, PlayCircle, Monitor, KeyRound, Eye, EyeOff, Tablet } from 'lucide-react';

const LobbyScreen: React.FC = () => {
  const { players, startGame, isHost, totalRounds, questionsPerRound, gamePin, gameName, hostPassword, addBot, hostJoinAsPlayer, currentPlayerId, openBroadcast, broadcastConnected, roomWarning, losersBracket, setLosersBracket, remotes } = useGame();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showScreens, setShowScreens] = useState(false);
  // Codes are hidden until asked for, for the same reason the password is:
  // this laptop is on a table people walk past.
  const [showCodes, setShowCodes] = useState(false);
  // Held back by default: this screen is the host's, but a laptop on a desk in
  // a bar is read over shoulders, and the password is the game itself.
  const [showPassword, setShowPassword] = useState(false);
  const [hostName, setHostName] = useState('Host');
  const [hostAvatar, setHostAvatar] = useState(AVATARS[0]);

  const handleHostJoin = (e: React.FormEvent) => {
    e.preventDefault();
    hostJoinAsPlayer(hostName, hostAvatar);
    setShowJoinModal(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center relative">
      {showScreens && <HostScreensPanel onClose={() => setShowScreens(false)} />}

      {/* Host Join Modal */}
      {showJoinModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-neon-blue p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-4">Your player</h3>
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
          <div className="text-3xl font-black text-white mt-1">{gameName}</div>
          {gamePin && (
            <div className="mt-4">
              <JoinCode pin={gamePin} />
            </div>
          )}
          {/* The QR code promises that scanning it joins the game. When the
              room never reached the network it does not, and the host needs to
              know that here rather than from a table of confused players. */}
          {roomWarning && (
            <p className="mt-3 max-w-md text-sm text-amber-300 border border-amber-500/40 bg-amber-500/10 rounded-lg px-3 py-2">
              {roomWarning}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 bg-slate-800 px-6 py-3 rounded-full border border-slate-700 shadow-lg">
          <Users size={24} className="text-neon-pink" />
          <span className="font-mono text-2xl font-bold">{players.length}</span>
        </div>
      </header>

      <Instructions guide="lobby" className="w-full max-w-6xl mb-4" />

      <div className="w-full max-w-6xl flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
        {/* Players Grid */}
        <div className="flex-1 bg-slate-800/30 rounded-2xl border border-slate-700 p-4 overflow-y-auto custom-scrollbar">
          {isHost && players.some((p) => p.rejoinCode) && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setShowCodes((shown) => !shown)}
                className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-slate-400 hover:text-neon-yellow transition-colors"
              >
                {showCodes ? <EyeOff size={14} /> : <Eye size={14} />}
                {showCodes ? 'hide rejoin codes' : 'show rejoin codes'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {players.map((player) => (
              <div 
                key={player.id}
                className={`bg-slate-800 border p-4 rounded-xl flex flex-col items-center animate-bounce-short transition-colors ${player.isHost ? 'border-neon-yellow shadow-[0_0_10px_rgba(250,255,0,0.3)]' : 'border-slate-700 hover:border-neon-blue'}`}
                style={{ animationDelay: `${Math.random()}s`, animationDuration: '3s' }}
              >
                <div className="mb-2 filter drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">
                  <AvatarDisplay
                    avatar={player.avatar}
                    color={player.avatarColor}
                    accessory={player.avatarAccessory}
                    size="lg"
                  />
                </div>
                <div className="font-bold text-slate-200 truncate w-full text-center text-lg">
                  {player.name}
                </div>
                {player.isHost && <span className="text-xs text-neon-yellow font-bold mt-1 font-mono">HOST</span>}
                {player.isBot && <span className="text-xs text-slate-500 uppercase mt-1 font-mono">AI PLAYER</span>}
                {isHost && showCodes && player.rejoinCode && (
                  <span
                    className="mt-1 font-mono text-sm tracking-[0.25em] text-neon-yellow"
                    title="This player's rejoin code"
                  >
                    {player.rejoinCode}
                  </span>
                )}
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

            {isHost && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <BroadcastTextEditor />
              </div>
            )}

            {/* Still the host's call until the draw is made: this is where
                they can see how many people turned up, and so how many rounds
                a loser's bracket is going to take. */}
            {isHost ? (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <LosersBracketToggle
                  enabled={losersBracket}
                  onChange={setLosersBracket}
                  players={players.length}
                  rounds={totalRounds}
                />
              </div>
            ) : (
              losersBracket && (
                <div className="mt-3 text-xs font-mono uppercase tracking-widest text-orange-300">
                  Loser's bracket on — lose twice to go out
                </div>
              )
            )}

            {/* The last time this is on a screen. A host who loses this window
                needs the PIN and this to get the game back, and the window
                that knows it is the one that might be about to disappear. */}
            {isHost && hostPassword && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500 uppercase flex items-center gap-1.5">
                    <KeyRound size={12} className="text-neon-yellow" /> host password
                  </span>
                  <button
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="text-slate-500 hover:text-white transition-colors"
                    aria-label={showPassword ? 'Hide host password' : 'Show host password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="font-mono text-lg text-neon-yellow tracking-widest select-all">
                  {showPassword ? hostPassword : '•'.repeat(hostPassword.length)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Write it down. With the PIN it takes this game back from any
                  device if this window goes away.
                </p>
              </div>
            )}
          </div>

          {isHost ? (
            <div className="space-y-3 mt-auto">
              {/* The room sees the game through this window, so it wants to be
                  open and dragged onto the projector before kickoff. */}
              <Button
                onClick={openBroadcast}
                fullWidth
                variant="secondary"
                className={`flex items-center justify-center gap-3 ${
                  broadcastConnected
                    ? 'border-neon-green text-neon-green'
                    : 'border-neon-pink text-neon-pink animate-pulse'
                }`}
              >
                <Monitor size={20} />
                {broadcastConnected ? 'BROADCAST LIVE' : 'OPEN BROADCAST DISPLAY'}
              </Button>

              {/* A TV that is not plugged into this laptop, and a tablet to run
                  the round from the floor. */}
              <Button
                onClick={() => setShowScreens(true)}
                fullWidth
                variant="secondary"
                className="flex items-center justify-center gap-3 border-slate-600 hover:border-neon-blue"
              >
                <Tablet size={20} />
                CAST &amp; REMOTE{remotes.length > 0 ? ` · ${remotes.length} linked` : ''}
              </Button>

              <Button
                onClick={() => setShowJoinModal(true)}
                fullWidth
                variant="secondary"
                className="flex items-center justify-center gap-3 border-slate-600 hover:border-white"
              >
                <PlayCircle size={20} />
                EDIT MY PLAYER
              </Button>
              
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
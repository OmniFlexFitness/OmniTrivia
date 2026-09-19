import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { AVATARS, AVATAR_COLORS, AVATAR_ACCESSORIES } from '../constants';
import Button from './Button';
import AvatarDisplay from './AvatarDisplay';
import Instructions from './Instructions';
import { readSeat } from '../services/seat';
import { PLAYER_CODE_LENGTH } from '../services/proof';
import { ArrowLeft, Palette, Smile, Glasses, AlertTriangle, KeyRound, Loader2 } from 'lucide-react';

const JoinScreen: React.FC = () => {
  const { joinGame, isHost, restartGame, initialPin, joining, joinError, clearJoinError } = useGame();

  // What this device was playing, if anything. A player coming back on the
  // phone they started on gets their name, their code and their face back in
  // the form; one coming back on a borrowed phone types them in, which is the
  // case the code exists for.
  const [remembered] = useState(() => readSeat(initialPin));

  const [name, setName] = useState(remembered?.name ?? '');
  const [pin, setPin] = useState(initialPin || remembered?.pin || '');
  const [rejoinCode, setRejoinCode] = useState(remembered?.code ?? '');
  
  // Avatar State
  const [selectedAvatar, setSelectedAvatar] = useState(remembered?.avatar ?? AVATARS[0]);
  const [selectedColor, setSelectedColor] = useState(remembered?.avatarColor ?? AVATAR_COLORS[0]);
  const [selectedAccessory, setSelectedAccessory] = useState(
    remembered?.avatarAccessory ?? AVATAR_ACCESSORIES[0],
  );
  const [activeTab, setActiveTab] = useState<'avatar' | 'color' | 'accessory'>('avatar');

  const codeReady = isHost || rejoinCode.length === PLAYER_CODE_LENGTH;
  const ready = Boolean(name.trim()) && (isHost || pin.length === 4) && codeReady;

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joining || !ready) return;
    joinGame(
      name,
      selectedAvatar,
      selectedColor,
      selectedAccessory,
      pin,
      rejoinCode,
    );
  };

  const handlePinChange = (value: string) => {
    setPin(value.replace(/\D/g, '').slice(0, 4));
    if (joinError) clearJoinError();
  };

  const handleCodeChange = (value: string) => {
    setRejoinCode(value.replace(/\D/g, '').slice(0, PLAYER_CODE_LENGTH));
    if (joinError) clearJoinError();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"></div>
      
      <div className="relative z-10 w-full max-w-md bg-slate-800/90 border border-neon-blue p-6 rounded-2xl shadow-[0_0_30px_rgba(0,255,255,0.2)] flex flex-col max-h-[95vh]">
        <button onClick={restartGame} className="absolute top-4 left-4 text-slate-400 hover:text-white">
          <ArrowLeft />
        </button>

        <div className="flex flex-col items-center mb-4 shrink-0">
          <h1 className="text-2xl font-black text-white tracking-tighter mb-1">
            {isHost ? 'HOST PROFILE' : 'PLAYER ENTRY'}
          </h1>
          {!isHost && (
            <p className="text-xs text-slate-400 text-center mb-4 max-w-xs">
              Joining for the first time, or coming back to a seat you already
              had — same form either way. Use the name and rejoin code you
              started with and you land back in your own seat.
            </p>
          )}

          {joinError && (
            <div className="w-full bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg mb-4 flex items-start gap-2 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{joinError}</span>
            </div>
          )}
          
          {/* Avatar Preview */}
          <div className="mb-2 animate-bounce-short">
            <AvatarDisplay 
              avatar={selectedAvatar} 
              color={selectedColor} 
              accessory={selectedAccessory} 
              size="xl" 
            />
          </div>
        </div>

        <form onSubmit={handleJoin} className="space-y-4 flex flex-col flex-1 overflow-hidden">
          {!isHost && (
            <div className="shrink-0">
              <input
                type="text"
                maxLength={4}
                placeholder="GAME PIN"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-mono focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
              />
            </div>
          )}

          <div className="shrink-0">
            <input
              type="text"
              maxLength={12}
              placeholder="NICKNAME"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (joinError) clearJoinError();
              }}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-lg text-center focus:border-neon-pink focus:ring-1 focus:ring-neon-pink outline-none transition-all"
            />
          </div>

          {/* The player's own code, on the same screen as their name because
              it is part of the same thought: this is who I am in this game.
              It is what gets them back into *this* seat — with their score and
              their place in the bracket — from a phone that remembers nothing,
              which is the one case a saved seat cannot cover. */}
          {!isHost && (
            <div className="shrink-0">
              <input
                type="text"
                inputMode="numeric"
                maxLength={PLAYER_CODE_LENGTH}
                placeholder="REJOIN CODE"
                value={rejoinCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-center text-lg tracking-[0.5em] font-mono focus:border-neon-yellow focus:ring-1 focus:ring-neon-yellow outline-none transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-start gap-1.5 leading-snug">
                <KeyRound size={12} className="shrink-0 mt-0.5 text-neon-yellow" />
                <span>
                  {PLAYER_CODE_LENGTH} digits you choose. Remember them: this
                  name and this code get you back into the same seat, with your
                  score, if you lose the game or switch phones.
                </span>
              </p>
            </div>
          )}

          {/* Customization Tabs */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/50 rounded-xl border border-slate-700">
            <div className="flex border-b border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('avatar')}
                className={`flex-1 py-3 flex justify-center items-center gap-2 text-sm font-bold transition-colors ${activeTab === 'avatar' ? 'bg-slate-800 text-neon-blue border-b-2 border-neon-blue' : 'text-slate-400 hover:text-white'}`}
              >
                <Smile size={16} /> Avatar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('color')}
                className={`flex-1 py-3 flex justify-center items-center gap-2 text-sm font-bold transition-colors ${activeTab === 'color' ? 'bg-slate-800 text-neon-pink border-b-2 border-neon-pink' : 'text-slate-400 hover:text-white'}`}
              >
                <Palette size={16} /> Color
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('accessory')}
                className={`flex-1 py-3 flex justify-center items-center gap-2 text-sm font-bold transition-colors ${activeTab === 'accessory' ? 'bg-slate-800 text-neon-green border-b-2 border-neon-green' : 'text-slate-400 hover:text-white'}`}
              >
                <Glasses size={16} /> Extra
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              {activeTab === 'avatar' && (
                <div className="grid grid-cols-5 gap-2">
                  {AVATARS.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      onClick={() => setSelectedAvatar(avatar)}
                      className={`text-2xl p-2 rounded-lg transition-all aspect-square flex items-center justify-center ${
                        selectedAvatar === avatar 
                          ? 'bg-white/10 scale-110 shadow-lg' 
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'color' && (
                <div className="grid grid-cols-4 gap-3">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      className={`h-12 rounded-full transition-all ${color} ${
                        selectedColor === color 
                          ? 'ring-2 ring-white scale-105 shadow-lg' 
                          : 'hover:opacity-80'
                      }`}
                    />
                  ))}
                </div>
              )}

              {activeTab === 'accessory' && (
                <div className="grid grid-cols-5 gap-2">
                  {AVATAR_ACCESSORIES.map((acc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAccessory(acc)}
                      className={`text-2xl p-2 rounded-lg transition-all aspect-square flex items-center justify-center ${
                        selectedAccessory === acc 
                          ? 'bg-white/10 scale-110 shadow-lg border border-white/20' 
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {acc || <span className="text-xs text-slate-500">None</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button 
            type="submit" 
            variant="neon" 
            fullWidth 
            disabled={!ready || joining}
            className="shrink-0 flex items-center justify-center gap-2"
          >
            {joining && <Loader2 size={18} className="animate-spin" />}
            {joining
              ? 'LOOKING FOR THAT GAME…'
              : isHost
                ? 'ENTER LOBBY'
                : remembered
                  ? 'JOIN OR REJOIN'
                  : 'JOIN GAME'}
          </Button>
        </form>

        <Instructions guide="join" className="mt-4 shrink-0" />
      </div>
    </div>
  );
};

export default JoinScreen;
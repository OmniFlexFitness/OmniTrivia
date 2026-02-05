import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { AVATARS, AVATAR_COLORS, AVATAR_ACCESSORIES } from '../constants';
import Button from './Button';
import AvatarDisplay from './AvatarDisplay';
import { Gamepad2, ArrowLeft, Palette, Smile, Glasses } from 'lucide-react';

const JoinScreen: React.FC = () => {
  const { joinGame, isHost, restartGame, initialPin } = useGame();
  const [name, setName] = useState('');
  const [pin, setPin] = useState(initialPin || '');
  
  // Avatar State
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [selectedAccessory, setSelectedAccessory] = useState(AVATAR_ACCESSORIES[0]);
  const [activeTab, setActiveTab] = useState<'avatar' | 'color' | 'accessory'>('avatar');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && (isHost || pin.length === 4)) {
      joinGame(name, selectedAvatar, selectedColor, selectedAccessory, pin);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"></div>
      
      <div className="relative z-10 w-full max-w-md bg-slate-800/90 border border-neon-blue p-6 rounded-2xl shadow-[0_0_30px_rgba(0,255,255,0.2)] flex flex-col max-h-[95vh]">
        <button onClick={restartGame} className="absolute top-4 left-4 text-slate-400 hover:text-white">
          <ArrowLeft />
        </button>

        <div className="flex flex-col items-center mb-4 shrink-0">
          <h1 className="text-2xl font-black text-white tracking-tighter mb-4">
            {isHost ? 'HOST PROFILE' : 'PLAYER ENTRY'}
          </h1>
          
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
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
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
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-lg text-center focus:border-neon-pink focus:ring-1 focus:ring-neon-pink outline-none transition-all"
            />
          </div>

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
            disabled={!name || (!isHost && pin.length !== 4)}
            className="shrink-0"
          >
            {isHost ? 'ENTER LOBBY' : 'JOIN GAME'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default JoinScreen;
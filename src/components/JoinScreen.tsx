import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { AVATARS, AVATAR_COLORS, AVATAR_ACCESSORIES } from '../constants';
import Button from './Button';
import AvatarDisplay from './AvatarDisplay';
import Instructions from './Instructions';
import { readSeat } from '../services/seat';
import { PLAYER_CODE_LENGTH } from '../services/proof';
import { ArrowLeft, Palette, Smile, Glasses, AlertTriangle, KeyRound, Loader2 } from 'lucide-react';

/** `bg-fuchsia-500` → `fuchsia`, so a swatch with no text still has a name. */
const colorName = (className: string): string =>
  className.replace(/^bg-/, '').replace(/-\d+$/, '').replace(/-/g, ' ');

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

  // Positioned for the same reason as the start screen: the overlay below is
  // measured against this box, and against the viewport if this box is static.
  //
  // The card is centred with `my-auto` rather than by centring the column,
  // because this form is taller than a phone and a flex-centred child that
  // overflows loses its top edge off the top of the scroll area — which is the
  // PIN field and the way back. With auto margins it centres when there is
  // room and scrolls from the top when there is not.
  return (
    <div className="relative min-h-screen flex flex-col items-center p-3 sm:p-4 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"></div>

      <div className="relative z-10 my-auto w-full max-w-md bg-slate-800/90 border border-neon-blue p-4 sm:p-6 rounded-2xl shadow-[0_0_30px_rgba(0,255,255,0.2)] flex flex-col">
        <button
          type="button"
          onClick={restartGame}
          aria-label="Back"
          className="absolute top-3 left-3 p-1 text-slate-400 hover:text-white"
        >
          <ArrowLeft />
        </button>

        <div className="flex flex-col items-center mb-3">
          <h1 className="text-2xl font-black text-white tracking-tighter mb-1">
            {isHost ? 'HOST PROFILE' : 'PLAYER ENTRY'}
          </h1>
          {!isHost && (
            <p className="text-xs text-slate-400 text-center mb-3 max-w-xs">
              New here or coming back to a seat you already had — same form
              either way.
            </p>
          )}

          {joinError && (
            <div className="w-full bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg mb-3 flex items-start gap-2 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{joinError}</span>
            </div>
          )}

          {/* Avatar Preview

              The bounce lifts the face a quarter of its own height, so the
              padding here is the room it needs to do it. Without it the avatar
              rides up over the line above — which on a phone, where every gap
              on this screen has been tightened, is the heading. */}
          <div className="pt-6">
            <div className="animate-bounce-short">
              <AvatarDisplay
                avatar={selectedAvatar}
                color={selectedColor}
                accessory={selectedAccessory}
                size="xl"
              />
            </div>
          </div>
        </div>

        <form onSubmit={handleJoin} className="space-y-3 flex flex-col">
          {!isHost && (
            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="GAME PIN"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-mono focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
              />
            </div>
          )}

          <div>
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
            <div>
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
                  {PLAYER_CODE_LENGTH} digits you choose. Your name and this
                  code get you back into the same seat, with your score, from
                  any phone.
                </span>
              </p>
            </div>
          )}

          {/* Customization Tabs

              Fixed height rather than "whatever is left of the screen". This
              panel used to be the flexible one inside a card clamped to the
              viewport, which meant every line above it — the blurb, the error,
              the code hint — came out of the picker, and on a phone there was
              nothing left of it to scroll. Now the card is as tall as it needs
              to be and the page scrolls, so the grid always gets its own
              window and every tile stays a thumb-sized target. */}
          <div className="flex flex-col bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
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

            <div className="h-56 sm:h-64 overflow-y-auto p-1.5 sm:p-3 custom-scrollbar">
              {activeTab === 'avatar' && (
                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {AVATARS.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      onClick={() => setSelectedAvatar(avatar)}
                      aria-pressed={selectedAvatar === avatar}
                      className={`text-2xl rounded-lg transition-colors aspect-square flex items-center justify-center ${
                        selectedAvatar === avatar
                          ? 'bg-white/10 ring-2 ring-neon-blue shadow-lg'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'color' && (
                <div className="grid grid-cols-5 gap-2 sm:gap-3">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      aria-pressed={selectedColor === color}
                      aria-label={colorName(color)}
                      title={colorName(color)}
                      className={`aspect-square rounded-full transition-all ${color} ${
                        selectedColor === color
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 shadow-lg'
                          : 'hover:opacity-80'
                      }`}
                    />
                  ))}
                </div>
              )}

              {activeTab === 'accessory' && (
                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {AVATAR_ACCESSORIES.map((acc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAccessory(acc)}
                      aria-pressed={selectedAccessory === acc}
                      aria-label={acc || 'No accessory'}
                      className={`text-2xl rounded-lg transition-colors aspect-square flex items-center justify-center ${
                        selectedAccessory === acc
                          ? 'bg-white/10 ring-2 ring-neon-green shadow-lg'
                          : 'hover:bg-white/5'
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
            className="flex items-center justify-center gap-2"
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

        <Instructions guide="join" className="mt-3" />
      </div>
    </div>
  );
};

export default JoinScreen;

import React from 'react';
import { useGame } from '../context/GameContext';
import { GamePhase } from '../types';
import Button from './Button';
import AvatarDisplay from './AvatarDisplay';
import { ArrowRight, Flame, RotateCw, Trophy } from 'lucide-react';

/**
 * Standings between rounds and at the end of the night.
 *
 * There is no mid-question leaderboard any more: every matchup reveals its own
 * answers on its own screen, so this only ever shows at the end of a round or
 * the end of the game.
 */

const Leaderboard: React.FC = () => {
  const { players, nextRound, playAgain, phase, isHost, currentRound, totalRounds } = useGame();

  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  const isRoundEnd = phase === GamePhase.ROUND_END;
  const isGameOver = phase === GamePhase.GAME_OVER;

  const handleAction = () => {
    // Replay the same questions with fresh scores, or draw the next round.
    if (isGameOver) playAgain();
    else nextRound();
  };

  const isFinalRound = currentRound >= totalRounds;

  const getButtonText = () => {
    if (isGameOver) return 'PLAY AGAIN';
    return isFinalRound ? 'SEE FINAL RESULTS' : `START ROUND ${currentRound + 1}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col h-full">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">
          {isGameOver ? 'FINAL STANDINGS' : 'ROUND COMPLETE'}
        </h2>

        {isRoundEnd && !isGameOver && (
           <div className="text-neon-blue font-mono text-xl animate-pulse">
             Get ready for the next category!
           </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4 custom-scrollbar">
        {sortedPlayers.map((player, index) => (
          <div 
            key={player.id}
            className={`flex items-center p-4 rounded-xl border transition-all ${
              player.id === 'user-1' || player.isHost 
                ? 'bg-slate-800 border-neon-blue shadow-[0_0_10px_rgba(0,255,255,0.2)]' 
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="w-8 font-bold text-slate-500 text-xl">
              {index === 0 ? <Trophy className="text-yellow-400" size={24} /> : `#${index + 1}`}
            </div>
            <div className="mr-4">
              <AvatarDisplay 
                avatar={player.avatar} 
                color={player.avatarColor} 
                accessory={player.avatarAccessory} 
                size="sm" 
              />
            </div>
            <div className="flex-1">
              <div className="font-bold text-white flex items-center gap-2">
                {player.name}
                {player.streak > 2 && (
                  <div className="flex items-center text-xs text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">
                    <Flame size={12} className="mr-1" /> {player.streak}
                  </div>
                )}
              </div>
            </div>
            <div className="text-2xl font-mono font-bold text-neon-pink">
              {player.score}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-slate-800">
        {isHost ? (
          <Button onClick={handleAction} fullWidth variant="neon" className="flex items-center justify-center gap-2">
            {getButtonText()} 
            {isRoundEnd ? <RotateCw size={20} /> : <ArrowRight size={20} />}
          </Button>
        ) : (
          <div className="text-center text-slate-500 animate-pulse">
            Waiting for host to continue...
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;

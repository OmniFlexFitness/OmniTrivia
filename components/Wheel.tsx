import React, { useState, useEffect } from 'react';
import { CATEGORIES } from '../constants';
import { useGame } from '../context/GameContext';
import { Category } from '../types';
import Button from './Button';
import { ArrowRight, Crown } from 'lucide-react';

const Wheel: React.FC = () => {
  const { selectCategory, isHost, currentRound, totalRounds, roundsConfig } = useGame();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winningCategory, setWinningCategory] = useState<Category | null>(null);

  // Get the target category for this round from config
  const targetCategoryConfig = roundsConfig[currentRound - 1];
  const targetCategory = targetCategoryConfig ? targetCategoryConfig.category : CATEGORIES[0];

  // We display all categories on the wheel
  const activeCategories = CATEGORIES;

  const spin = () => {
    if (isSpinning || winningCategory) return;
    
    setIsSpinning(true);
    
    // Find index of target category
    const targetIndex = activeCategories.findIndex(c => c.id === targetCategory.id);
    
    // Calculate rotation to land on target
    // 0 deg is usually 3 o'clock. 
    // We want the target index to end up at the pointer (top, -90deg or 270deg).
    // Let's assume standard CSS rotation where 0 is top for calculation simplicity if we adjust CSS.
    // But our CSS has 0 at top? Let's check the render loop.
    // render: `rotate(${index * angle}deg)`.
    // If index 0 is at 0deg (top).
    // To get index `i` to top, we need to rotate container by `-i * angle`.
    
    const sliceAngle = 360 / activeCategories.length;
    const baseRotation = -(targetIndex * sliceAngle);
    
    // Add random full spins (5 to 10)
    const extraSpins = 360 * (5 + Math.floor(Math.random() * 3));
    
    // Add a little randomness within the slice so it doesn't always land dead center?
    // Actually dead center is better for UI clarity.
    
    const finalRotation = rotation + extraSpins + baseRotation - (rotation % 360); 
    // Logic: Current + Spins + (TargetPos - CurrentPos_Normalized)
    // Simpler: Just set to absolute target value + spins.
    
    const targetRotation = extraSpins + baseRotation;
    
    setRotation(targetRotation);

    setTimeout(() => {
      setIsSpinning(false);
      setWinningCategory(targetCategory);
    }, 3000);
  };

  const handleContinue = () => {
    if (winningCategory) {
      selectCategory(winningCategory.id);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-center mb-8">
        <div className="inline-block px-4 py-1 bg-slate-800 rounded-full text-neon-blue font-mono text-sm mb-2 border border-slate-700">
          ROUND {currentRound} OF {totalRounds}
        </div>
        <h2 className="text-3xl font-bold text-white neon-text mb-2">CATEGORY SELECTION</h2>
        <div className="flex items-center justify-center gap-2 text-slate-400">
          {isHost ? (
            <span className="text-neon-pink font-bold">HOST CONTROL: Spin the wheel!</span>
          ) : (
            <span>Waiting for Host to spin...</span>
          )}
        </div>
      </div>
      
      <div className="relative w-80 h-80 md:w-96 md:h-96">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-20 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[40px] border-t-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>

        {/* Wheel */}
        <div 
          className="w-full h-full rounded-full border-4 border-slate-700 relative overflow-hidden transition-transform duration-[3000ms] cubic-bezier(0.2, 0.8, 0.2, 1) shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          {activeCategories.map((cat, index) => {
            const angle = 360 / activeCategories.length;
            const rotate = index * angle;
            return (
              <div
                key={cat.id}
                className={`absolute top-0 left-1/2 w-1/2 h-1/2 origin-bottom-left flex items-center justify-center ${cat.color}`}
                style={{ 
                  transform: `rotate(${rotate}deg) skewY(-${90 - angle}deg)`,
                }}
              >
                <div 
                  className="absolute left-8 bottom-8 text-2xl transform flex flex-col items-center" 
                  style={{ transform: `skewY(${90 - angle}deg) rotate(${angle/2}deg)` }}
                >
                  <span className="text-3xl drop-shadow-md mb-1">{cat.icon}</span>
                  <span className="text-xs font-bold uppercase text-white drop-shadow-md whitespace-nowrap">{cat.name}</span>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Center Hub */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-slate-900 rounded-full border-4 border-white z-10 flex items-center justify-center shadow-lg">
          <div className={`w-16 h-16 rounded-full ${winningCategory ? winningCategory.color : 'bg-neon-pink'} flex items-center justify-center transition-colors`}>
             {winningCategory && <span className="text-2xl">{winningCategory.icon}</span>}
          </div>
        </div>
      </div>

      <div className="mt-12 h-24 flex items-center justify-center w-full max-w-md">
        {!winningCategory ? (
          <button
            onClick={spin}
            disabled={isSpinning || !isHost}
            className="px-12 py-4 bg-gradient-to-r from-neon-blue to-neon-purple text-white font-black text-2xl rounded-full shadow-[0_0_20px_rgba(188,19,254,0.5)] hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
          >
            {isSpinning ? 'SPINNING...' : (isHost ? 'SPIN!' : 'WAITING...')}
          </button>
        ) : (
          <div className="flex flex-col items-center animate-bounce-short w-full">
            <div className="text-xl font-bold mb-4 text-white">
              Category: <span className="text-neon-blue text-2xl ml-2">{winningCategory.name}</span>
            </div>
            {isHost && (
              <Button 
                onClick={handleContinue}
                variant="neon"
                fullWidth
                className="flex items-center justify-center gap-2"
              >
                START ROUND <ArrowRight size={20} />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wheel;
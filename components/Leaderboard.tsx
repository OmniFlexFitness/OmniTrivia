import React from 'react';
import { useGame } from '../context/GameContext';
import { GamePhase, Question, QuestionType } from '../types';
import Button from './Button';
import AvatarDisplay from './AvatarDisplay';
import { ArrowRight, Flame, RotateCw, Trophy } from 'lucide-react';

const renderCorrectAnswer = (question: Question) => {
    switch (question.type) {
        case QuestionType.SLIDER:
            const [min, max, step, correctLow, correctHigh] = question.options.map(Number);
            return <p className="text-green-400 font-bold text-lg">Correct Range: {correctLow} - {correctHigh}</p>;
        case QuestionType.TYPE_ANSWER:
            return <p className="text-green-400 font-bold text-lg">Answer: {question.options[0]}</p>;
        case QuestionType.PUZZLE:
            return (
                <div className="text-center">
                    <p className="text-slate-400 text-sm mb-1">Correct Order:</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {question.options.map((item, index) => (
                            <React.Fragment key={index}>
                                <span className="font-bold text-green-400">{item}</span>
                                {index < question.options.length - 1 && <span className="text-slate-500">→</span>}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            );
        case QuestionType.MULTIPLE_CHOICE:
        case QuestionType.TRUE_FALSE:
        default:
            return <p className="text-green-400 font-bold text-lg">{question.options[question.correctIndex]}</p>;
    }
};

const Leaderboard: React.FC = () => {
  const { players, currentQuestion, nextQuestion, nextRound, phase, isHost, currentRound, totalRounds } = useGame();

  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  const isRoundEnd = phase === GamePhase.ROUND_END;
  const isGameOver = phase === GamePhase.GAME_OVER;

  const handleAction = () => {
    if (isGameOver) {
      window.location.reload(); // Simple restart
    } else if (isRoundEnd) {
      nextRound();
    } else {
      nextQuestion();
    }
  };

  const getButtonText = () => {
    if (isGameOver) return 'PLAY AGAIN';
    if (isRoundEnd) return `START ROUND ${Math.min(currentRound + 1, totalRounds)}`;
    return 'NEXT QUESTION';
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col h-full">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">
          {isGameOver ? 'FINAL STANDINGS' : (isRoundEnd ? 'ROUND COMPLETE' : 'LEADERBOARD')}
        </h2>
        
        {currentQuestion && !isGameOver && !isRoundEnd && (
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 inline-block max-w-lg">
            <p className="text-slate-400 text-sm mb-1">Correct Answer:</p>
            {renderCorrectAnswer(currentQuestion)}
          </div>
        )}

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
              {!isRoundEnd && !isGameOver && (
                <div className="text-xs text-slate-500">
                  {player.lastAnswerCorrect ? <span className="text-green-500">Correct!</span> : <span className="text-red-500">Missed it</span>}
                </div>
              )}
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

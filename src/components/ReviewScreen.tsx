import React from 'react';
import { useGame } from '../context/GameContext';
import Button from './Button';
import QuestionReviewCard from './QuestionReviewCard';
import { CheckCircle, RefreshCw, AlertTriangle } from 'lucide-react';

const ReviewScreen: React.FC = () => {
  const { roundsConfig, confirmGame, restartGame, contentWarning } = useGame();

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center">
      <header className="w-full max-w-4xl flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-white">REVIEW CONTENT</h2>
        <Button onClick={restartGame} variant="secondary" className="text-sm py-2 px-4">
          <RefreshCw size={16} className="mr-2 inline" /> RESTART
        </Button>
      </header>

      {contentWarning && (
        <div className="w-full max-w-4xl bg-amber-900/40 border border-amber-500 text-amber-200 p-4 rounded-xl mb-6 flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">These are not real questions.</p>
            <p className="text-sm mt-1 text-amber-300/90">{contentWarning}</p>
            <p className="text-sm mt-1 text-amber-300/90">
              Restart and try again, or import your own questions, before playing in front of anyone.
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-4xl space-y-6 mb-8">
        {roundsConfig.map((round) => (
          <div key={round.roundNumber} className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl ${round.category.color}`}>
                  {round.category.icon}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Round {round.roundNumber}: {round.category.name}</h3>
                  <p className="text-slate-400 text-sm">{round.questions.length} Questions</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              {round.questions.map((q, idx) => (
                <QuestionReviewCard
                  key={q.id}
                  question={q}
                  categoryId={round.category.id}
                  questionIndex={idx}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-md pb-8">
        <Button onClick={confirmGame} fullWidth variant="neon" className="h-16 text-lg flex items-center justify-center gap-2">
          <CheckCircle /> APPROVE & OPEN LOBBY
        </Button>
      </div>
    </div>
  );
};

export default ReviewScreen;
import React from 'react';
import { useGame } from '../context/GameContext';
import Button from './Button';
import QuestionReviewCard from './QuestionReviewCard';
import Instructions from './Instructions';
import { CheckCircle, RefreshCw, AlertTriangle, Trash2, ArrowLeft } from 'lucide-react';

const ReviewScreen: React.FC = () => {
  const {
    roundsConfig,
    confirmGame,
    restartGame,
    removeRound,
    reopenImportSelection,
    importPreview,
    contentWarning,
  } = useGame();

  const totalQuestions = roundsConfig.reduce(
    (sum, round) => sum + round.questions.length,
    0,
  );
  // The last round standing has no delete: a game with no rounds cannot be
  // opened, and RESTART is the way to throw the whole thing away.
  const canRemoveRound = roundsConfig.length > 1;

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center">
      <header className="w-full max-w-4xl flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">REVIEW CONTENT</h2>
          <p className="text-slate-400 text-sm mt-1">
            {roundsConfig.length} round{roundsConfig.length === 1 ? '' : 's'} ·{' '}
            {totalQuestions} question{totalQuestions === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Only for an imported game: the file is still in hand, so changing
              your mind about the mix costs a click rather than a restart. */}
          {importPreview && importPreview.length > 0 && (
            <Button
              onClick={reopenImportSelection}
              variant="secondary"
              className="text-sm py-2 px-4"
            >
              <ArrowLeft size={16} className="mr-2 inline" /> RE-CUT THE IMPORT
            </Button>
          )}
          <Button onClick={restartGame} variant="secondary" className="text-sm py-2 px-4">
            <RefreshCw size={16} className="mr-2 inline" /> RESTART
          </Button>
        </div>
      </header>

      <Instructions guide="review" className="w-full max-w-4xl mb-6" />

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
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl ${round.category.color}`}>
                  {round.category.icon}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{round.category.name}</h3>
                  <p className="text-slate-400 text-sm">
                    {round.questions.length} question
                    {round.questions.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeRound(round.roundNumber)}
                disabled={!canRemoveRound}
                className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors disabled:text-slate-700 disabled:cursor-not-allowed"
                title={
                  canRemoveRound
                    ? 'Take this category out of the game entirely'
                    : 'A game needs at least one round — RESTART to start over'
                }
              >
                <Trash2 size={14} /> drop category
              </button>
            </div>

            <div className="space-y-2">
              {round.questions.map((q, idx) => (
                <QuestionReviewCard
                  // Keyed by round as well as question: a game with more
                  // rounds than categories generates the same category twice,
                  // and two rounds sharing a question id would collide.
                  key={`${round.roundNumber}-${q.id}`}
                  question={q}
                  roundNumber={round.roundNumber}
                  questionIndex={idx}
                  canRemove={round.questions.length > 1}
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

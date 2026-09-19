import React, { useState } from 'react';
import { Question, QuestionType } from '../types';
import { useGame } from '../context/GameContext';
import { RefreshCw, Loader2, Trash2, AlertTriangle } from 'lucide-react';

interface QuestionReviewCardProps {
  question: Question;
  /**
   * The round this question belongs to, by number rather than by category. A
   * game with more rounds than categories plays one twice, and naming a round
   * by its category would edit whichever copy came first.
   */
  roundNumber: number;
  questionIndex: number;
  /**
   * False when this is the only question left in its round. The round would be
   * a spin of the wheel onto nothing, so removing the round is the way out.
   */
  canRemove: boolean;
}

const QuestionReviewCard: React.FC<QuestionReviewCardProps> = ({
  question,
  roundNumber,
  questionIndex,
  canRemove,
}) => {
  const { regenerateQuestion, removeQuestion } = useGame();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setFailed(false);
    const replaced = await regenerateQuestion(roundNumber, questionIndex);
    setIsRegenerating(false);
    // Generation falls back to placeholders rather than throwing, and the
    // question is left alone when it does. Saying so beats a spinner that
    // stops and changes nothing.
    setFailed(!replaced);
  };

  const questionType = question.type ?? QuestionType.MULTIPLE_CHOICE;

  const renderAnswer = () => {
    switch (questionType) {
      case QuestionType.SLIDER:
        const [min, max, step, correctLow, correctHigh] = question.options;
        return <p className="text-green-400 font-bold">✓ Range: {correctLow} - {correctHigh}</p>;
      case QuestionType.TYPE_ANSWER:
        return <p className="text-green-400 font-bold">✓ Answers: {question.options.join(', ')}</p>;
      case QuestionType.PUZZLE:
        return <p className="text-green-400 font-bold">✓ Order: {question.options.join(' → ')}</p>;
      case QuestionType.MULTIPLE_CHOICE:
      case QuestionType.TRUE_FALSE:
      default:
        return question.options.map((option, index) => (
          <p 
            key={index} 
            className={`flex items-center ${index === question.correctIndex ? 'text-green-400 font-bold' : 'text-slate-400'}`}
          >
            <span className="w-4 mr-2">{index === question.correctIndex ? '✓' : '•'}</span>
            {option}
          </p>
        ));
    }
  };

  return (
    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <p className="text-slate-300">
            <span className="text-neon-blue font-bold mr-2">{questionIndex + 1}.</span>
            {question.text}
          </p>
          <span className={`text-xs font-mono uppercase px-2 py-0.5 rounded ml-7 mt-2 inline-block ${
            questionType === QuestionType.TRUE_FALSE ? 'bg-purple-500/20 text-purple-300' :
            questionType === QuestionType.TYPE_ANSWER ? 'bg-yellow-500/20 text-yellow-300' :
            questionType === QuestionType.SLIDER ? 'bg-orange-500/20 text-orange-300' :
            questionType === QuestionType.PUZZLE ? 'bg-red-500/20 text-red-300' :
            'bg-sky-500/20 text-sky-300'
          }`}>
            {questionType.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-neon-yellow transition-colors disabled:cursor-wait disabled:text-slate-600"
            title="Write a different question for this slot"
          >
            {isRegenerating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
          <button
            onClick={() => removeQuestion(roundNumber, questionIndex)}
            disabled={isRegenerating || !canRemove}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors disabled:cursor-not-allowed disabled:text-slate-700 disabled:hover:bg-transparent"
            title={
              canRemove
                ? 'Drop this question from the round'
                : 'The last question in a round stays — remove the whole round instead'
            }
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      {failed && (
        <p className="mt-2 ml-7 text-xs text-amber-300 flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />
          Could not write a replacement, so this one was left alone. Check the
          API key or import your own questions.
        </p>
      )}
      <div className="mt-3 pl-7 space-y-1 text-sm">
        {renderAnswer()}
      </div>
    </div>
  );
};

export default QuestionReviewCard;

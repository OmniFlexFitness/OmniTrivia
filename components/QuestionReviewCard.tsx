import React, { useState } from 'react';
import { Question, QuestionType } from '../types';
import { useGame } from '../context/GameContext';
import { RefreshCw, Loader2 } from 'lucide-react';

interface QuestionReviewCardProps {
  question: Question;
  categoryId: string;
  questionIndex: number;
}

const QuestionReviewCard: React.FC<QuestionReviewCardProps> = ({ question, categoryId, questionIndex }) => {
  const { regenerateQuestion } = useGame();
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    await regenerateQuestion(categoryId, questionIndex);
    setIsRegenerating(false);
  };

  const renderAnswer = () => {
    switch (question.type) {
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
            question.type === QuestionType.TRUE_FALSE ? 'bg-purple-500/20 text-purple-300' :
            question.type === QuestionType.TYPE_ANSWER ? 'bg-yellow-500/20 text-yellow-300' :
            question.type === QuestionType.SLIDER ? 'bg-orange-500/20 text-orange-300' :
            question.type === QuestionType.PUZZLE ? 'bg-red-500/20 text-red-300' :
            'bg-sky-500/20 text-sky-300'
          }`}>
            {question.type.replace('_', ' ')}
          </span>
        </div>
        <button 
          onClick={handleRegenerate} 
          disabled={isRegenerating}
          className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-neon-yellow transition-colors disabled:cursor-wait disabled:text-slate-600"
          title="Regenerate this question"
        >
          {isRegenerating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
      </div>
      <div className="mt-3 pl-7 space-y-1 text-sm">
        {renderAnswer()}
      </div>
    </div>
  );
};

export default QuestionReviewCard;

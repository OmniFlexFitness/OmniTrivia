import React, { useState, useEffect } from 'react';
import { Question, QuestionType } from '../types';
import { useGame } from '../context/GameContext';
import Button from './Button';
import { Reorder } from 'framer-motion';
import { Check, GripVertical } from 'lucide-react';

const shuffleArray = <T,>(array: T[]): T[] => {
    return [...array].sort(() => Math.random() - 0.5);
};

const QuestionCard: React.FC<{ question: Question }> = ({ question }) => {
  const { submitAnswer, timeLeft, currentPlayerId } = useGame();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const isSpectator = !currentPlayerId;

  const handleSubmit = (answer: any) => {
    if (isSpectator || isSubmitted) return;
    setIsSubmitted(true);
    submitAnswer(answer);
  };

  const renderContent = () => {
    switch (question.type) {
        case QuestionType.TYPE_ANSWER:
            return <TypeAnswerQuestion question={question} onSubmit={handleSubmit} isSubmitted={isSubmitted} />;
        case QuestionType.SLIDER:
            return <SliderQuestion question={question} onSubmit={handleSubmit} isSubmitted={isSubmitted} />;
        case QuestionType.PUZZLE:
            return <PuzzleQuestion question={question} onSubmit={handleSubmit} isSubmitted={isSubmitted} />;
        case QuestionType.TRUE_FALSE:
        case QuestionType.MULTIPLE_CHOICE:
        default:
            return <MultipleChoiceQuestion question={question} onSubmit={handleSubmit} isSubmitted={isSubmitted} />;
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col h-full justify-center">
      <div className="w-full h-6 bg-slate-800 rounded-full mb-8 overflow-hidden border border-slate-700 shadow-inner">
        <div 
          className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 5 ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-neon-blue shadow-[0_0_10px_#00ffff]'}`}
          style={{ width: `${(timeLeft / 15) * 100}%` }}
        ></div>
      </div>

      <div className="bg-white text-slate-900 p-10 rounded-3xl shadow-2xl mb-10 text-center transform transition-all border-4 border-slate-200">
        <h2 className="text-3xl md:text-5xl font-black leading-tight tracking-tight">{question.text}</h2>
        <div className="mt-6 inline-block px-6 py-2 bg-slate-900 rounded-full text-sm font-bold uppercase tracking-widest text-white">
          {question.category}
        </div>
      </div>

      {renderContent()}
      
      {isSpectator && (
        <div className="mt-8 text-center text-slate-500 font-mono animate-pulse">
          PLAYERS ARE ANSWERING...
        </div>
      )}
    </div>
  );
};

// Sub-components for each question type

const MultipleChoiceQuestion: React.FC<{ question: Question, onSubmit: (answer: number) => void, isSubmitted: boolean }> = ({ question, onSubmit, isSubmitted }) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const isTrueFalse = question.type === QuestionType.TRUE_FALSE;

    const handleSelect = (index: number) => {
        if (isSubmitted || selectedIndex !== null) return;
        setSelectedIndex(index);
        onSubmit(index);
    };

    return (
        <div className={`grid grid-cols-1 ${isTrueFalse ? 'md:grid-cols-2' : 'md:grid-cols-2'} gap-6`}>
            {question.options.map((option, index) => (
                <button
                    key={index}
                    onClick={() => handleSelect(index)}
                    disabled={isSubmitted}
                    className={`p-8 rounded-2xl border-4 text-left transition-all transform hover:scale-[1.02] active:scale-95 flex items-center ${isTrueFalse ? 'justify-center' : ''} ${
                        isSubmitted && index === question.correctIndex ? 'bg-green-600 border-green-400' : 
                        isSubmitted && index === selectedIndex ? 'bg-red-600 border-red-400' : 
                        isSubmitted ? 'bg-slate-800 opacity-50' : 
                        'bg-slate-800 hover:bg-slate-700 border-slate-600'
                    }`}
                >
                    {!isTrueFalse && <div className="w-14 h-14 rounded-full border-4 border-current flex items-center justify-center mr-6 font-black text-2xl shrink-0 opacity-70">{['A', 'B', 'C', 'D'][index]}</div>}
                    <span className={`font-bold text-white ${isTrueFalse ? 'text-4xl' : 'text-2xl'}`}>{option}</span>
                </button>
            ))}
        </div>
    );
};

const TypeAnswerQuestion: React.FC<{ question: Question, onSubmit: (answer: string) => void, isSubmitted: boolean }> = ({ question, onSubmit, isSubmitted }) => {
    const [answer, setAnswer] = useState('');
    const isCorrect = isSubmitted && question.options.some(opt => opt.toLowerCase() === answer.toLowerCase().trim());

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (answer.trim()) {
            onSubmit(answer);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
            <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={isSubmitted}
                placeholder="Type your answer..."
                className={`w-full max-w-lg text-center text-2xl p-4 rounded-lg border-2 outline-none transition-all ${
                    isSubmitted && isCorrect ? 'bg-green-900/50 border-green-500 text-green-300' :
                    isSubmitted && !isCorrect ? 'bg-red-900/50 border-red-500 text-red-300' :
                    'bg-slate-800 border-slate-600 text-white focus:border-neon-blue'
                }`}
            />
            {!isSubmitted && <Button type="submit" variant="neon" disabled={!answer.trim()}>Submit</Button>}
        </form>
    );
};

const SliderQuestion: React.FC<{ question: Question, onSubmit: (answer: number) => void, isSubmitted: boolean }> = ({ question, onSubmit, isSubmitted }) => {
    const [min, max, step, correctLow, correctHigh] = question.options.map(Number);
    const [value, setValue] = useState(min);
    
    const handleSubmit = () => {
        onSubmit(value);
    };

    const isCorrect = value >= correctLow && value <= correctHigh;
    const rangeWidth = max - min;
    const correctRangeWidth = ((correctHigh - correctLow) / rangeWidth) * 100;
    const correctRangeOffset = ((correctLow - min) / rangeWidth) * 100;
    const valueOffset = ((value - min) / rangeWidth) * 100;

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="text-6xl font-black text-neon-blue text-neon-shadow">{value}</div>
            <div className="w-full max-w-lg relative h-10 flex items-center">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => setValue(Number(e.target.value))}
                    disabled={isSubmitted}
                    className="w-full h-4 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-neon-purple disabled:accent-slate-600"
                />
                {isSubmitted && (
                    <>
                        <div className="absolute top-1/2 -translate-y-1/2 h-4 rounded-full bg-green-500/50" style={{ left: `${correctRangeOffset}%`, width: `${correctRangeWidth}%` }}></div>
                        <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 ${isCorrect ? 'bg-green-400 border-white' : 'bg-red-500 border-white'}`} style={{ left: `${valueOffset}%` }}></div>
                    </>
                )}
            </div>
            {!isSubmitted && <Button onClick={handleSubmit} variant="neon">Submit</Button>}
            {isSubmitted && (
                <div className="text-xl font-bold">Correct Range: <span className="text-green-400">{correctLow} - {correctHigh}</span></div>
            )}
        </div>
    );
};

const PuzzleQuestion: React.FC<{ question: Question, onSubmit: (answer: string[]) => void, isSubmitted: boolean }> = ({ question, onSubmit, isSubmitted }) => {
    const [items, setItems] = useState<string[]>([]);

    useEffect(() => {
        setItems(shuffleArray(question.options));
    }, [question]);

    const handleSubmit = () => {
        onSubmit(items);
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <Reorder.Group axis="y" values={items} onReorder={setItems} className="w-full max-w-md space-y-2">
                {items.map((item, index) => (
                    <Reorder.Item 
                        key={item} 
                        value={item}
                        className={`flex items-center gap-4 p-3 rounded-lg border-2 ${isSubmitted ? '' : 'cursor-grab active:cursor-grabbing'} transition-colors ${
                            isSubmitted && item === question.options[index] ? 'bg-green-900/50 border-green-600' :
                            isSubmitted ? 'bg-red-900/50 border-red-600' :
                            'bg-slate-800 border-slate-700'
                        }`}
                        whileDrag={{ scale: 1.05, boxShadow: "0px 5px 15px rgba(0,0,0,0.3)" }}
                    >
                        <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center font-mono font-bold text-neon-blue text-lg shrink-0">
                            {index + 1}
                        </div>
                        <div className="flex-1 text-left text-lg font-semibold">{item}</div>
                        <GripVertical className={`text-slate-500 ${isSubmitted ? 'opacity-0' : ''}`} />
                    </Reorder.Item>
                ))}
            </Reorder.Group>
            {!isSubmitted && <Button onClick={handleSubmit} variant="neon">Submit Order</Button>}
        </div>
    );
};

export default QuestionCard;

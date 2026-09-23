import React, { useState, useEffect } from 'react';
import { Question, QuestionType } from '../types';
import { useGame } from '../context/GameContext';
import Button from './Button';
import { Reorder } from 'framer-motion';
import { GripVertical, Lock } from 'lucide-react';
import { CHOICE_KEYS, CyberTimer, QuestionPanel, accentStyle } from './CyberQuestion';

const shuffleArray = <T,>(array: T[]): T[] => {
    return [...array].sort(() => Math.random() - 0.5);
};

/**
 * The answering card, rendered inside whichever matchup the player is in.
 *
 * Submitting only ever *locks an answer in*. The card never says whether it
 * was right — not on a guest's phone, where the question arrives with its
 * answer key stripped out, and not on the host's own seat either, where the
 * key is sitting in memory. Every player finds out how they did at the end of
 * their match, all at once, so the card has no right-or-wrong state to draw.
 *
 * `compact` is for the panes that already show the question themselves — the
 * host's own player view beside their controls, and a guest's phone screen.
 * Repeating it at full size there pushed the answers off the bottom.
 *
 * The clock comes in as a prop rather than out of the context, because there
 * is no longer one clock to read: every matchup runs its own. A guest's tab
 * holds no game state at all, so reading a timer from its context left the bar
 * pinned at full for the whole question.
 */
const QuestionCard: React.FC<{
  question: Question;
  timeLeft: number;
  duration: number;
  paused?: boolean;
  compact?: boolean;
}> = ({ question, timeLeft, duration, paused = false, compact = false }) => {
  const { submitAnswer, currentPlayerId } = useGame();
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
            return <TypeAnswerQuestion onSubmit={handleSubmit} isSubmitted={isSubmitted} compact={compact} />;
        case QuestionType.SLIDER:
            return <SliderQuestion question={question} onSubmit={handleSubmit} isSubmitted={isSubmitted} />;
        case QuestionType.PUZZLE:
            return <PuzzleQuestion question={question} onSubmit={handleSubmit} isSubmitted={isSubmitted} />;
        case QuestionType.TRUE_FALSE:
        case QuestionType.MULTIPLE_CHOICE:
        default:
            return <MultipleChoiceQuestion question={question} onSubmit={handleSubmit} isSubmitted={isSubmitted} compact={compact} />;
    }
  };

  return (
    <div className={`w-full flex flex-col justify-center ${compact ? '' : 'max-w-5xl mx-auto h-full'}`}>
      <CyberTimer
        timeLeft={timeLeft}
        duration={duration}
        paused={paused}
        size={compact ? 'sm' : 'lg'}
        className={compact ? 'mb-4' : 'mb-8'}
      />

      {!compact && (
        <QuestionPanel
          text={question.text}
          category={question.category}
          size="desk"
          className="mb-10"
        />
      )}

      {renderContent()}

      {isSubmitted && (
        <div className="cyber-hud mt-4 flex items-center justify-center gap-2 text-xs text-[#00f0ff] cyber-flicker">
          <Lock size={12} /> Locked in — results at the end of the match
        </div>
      )}

      {isSpectator && (
        <div className="cyber-hud mt-8 text-center text-xs text-slate-500 animate-pulse">
          Players are answering…
        </div>
      )}
    </div>
  );
};

// Sub-components for each question type

const MultipleChoiceQuestion: React.FC<{ question: Question, onSubmit: (answer: number) => void, isSubmitted: boolean, compact?: boolean }> = ({ question, onSubmit, isSubmitted, compact = false }) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const isTrueFalse = question.type === QuestionType.TRUE_FALSE;

    const handleSelect = (index: number) => {
        if (isSubmitted || selectedIndex !== null) return;
        setSelectedIndex(index);
        onSubmit(index);
    };

    return (
        <div className={`grid ${isTrueFalse ? 'grid-cols-2' : `grid-cols-1 ${compact ? 'sm:grid-cols-2' : 'md:grid-cols-2'}`} ${compact ? 'gap-2.5' : 'gap-5'}`}>
            {question.options.map((option, index) => {
                const picked = isSubmitted && index === selectedIndex;
                const muted = isSubmitted && index !== selectedIndex;
                return (
                    <button
                        key={index}
                        onClick={() => handleSelect(index)}
                        disabled={isSubmitted}
                        style={accentStyle(index)}
                        className={`cyber-option ${picked ? 'is-picked' : ''} ${muted ? 'is-muted' : ''} ${
                            compact ? 'min-h-[3.5rem] px-3 py-3 gap-3' : 'min-h-[5.5rem] px-5 py-5 gap-5'
                        } ${isTrueFalse ? 'justify-center' : ''}`}
                    >
                        {!isTrueFalse && (
                            <span className={`cyber-option-key ${compact ? 'w-8 h-8 text-sm' : 'w-12 h-12 text-xl'}`}>
                                {CHOICE_KEYS[index] ?? index + 1}
                            </span>
                        )}
                        <span className={`flex-1 ${isTrueFalse ? 'text-center uppercase tracking-wider' : ''} ${
                            compact ? (isTrueFalse ? 'text-xl' : 'text-base sm:text-lg') : (isTrueFalse ? 'text-4xl' : 'text-2xl')
                        } leading-snug`}>
                            {option}
                        </span>
                        {picked && <Lock size={compact ? 16 : 22} className="shrink-0 text-[var(--accent)]" />}
                    </button>
                );
            })}
        </div>
    );
};

const TypeAnswerQuestion: React.FC<{ onSubmit: (answer: string) => void, isSubmitted: boolean, compact?: boolean }> = ({ onSubmit, isSubmitted, compact = false }) => {
    const [answer, setAnswer] = useState('');

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
                placeholder="Type your answer…"
                autoComplete="off"
                className={`cyber-input w-full max-w-lg text-center p-4 ${compact ? 'text-xl' : 'text-2xl'} ${isSubmitted ? 'opacity-80' : ''}`}
            />
            {!isSubmitted && <Button type="submit" variant="neon" disabled={!answer.trim()}>LOCK IT IN</Button>}
        </form>
    );
};

const SliderQuestion: React.FC<{ question: Question, onSubmit: (answer: number) => void, isSubmitted: boolean }> = ({ question, onSubmit, isSubmitted }) => {
    const [min, max, step] = question.options.map(Number);
    const [value, setValue] = useState(min);

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="cyber-hud text-6xl font-black text-[#00f0ff] text-neon-shadow tracking-normal">{value}</div>
            <div className="w-full max-w-lg">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => setValue(Number(e.target.value))}
                    disabled={isSubmitted}
                    className="w-full h-4 bg-slate-800 rounded-none appearance-none cursor-pointer accent-neon-blue disabled:accent-slate-600"
                />
                <div className="cyber-hud flex justify-between mt-2 text-xs text-slate-500 tracking-normal">
                    <span>{min}</span>
                    <span>{max}</span>
                </div>
            </div>
            {!isSubmitted && <Button onClick={() => onSubmit(value)} variant="neon">LOCK IT IN</Button>}
        </div>
    );
};

const PuzzleQuestion: React.FC<{ question: Question, onSubmit: (answer: string[]) => void, isSubmitted: boolean }> = ({ question, onSubmit, isSubmitted }) => {
    const [items, setItems] = useState<string[]>([]);

    useEffect(() => {
        setItems(shuffleArray(question.options));
    }, [question]);

    return (
        <div className="flex flex-col items-center gap-4">
            <Reorder.Group axis="y" values={items} onReorder={setItems} className="w-full max-w-md space-y-2">
                {items.map((item, index) => (
                    <Reorder.Item
                        key={item}
                        value={item}
                        style={accentStyle(index)}
                        dragListener={!isSubmitted}
                        className={`cyber-option gap-4 px-3 py-3 ${isSubmitted ? 'is-picked' : 'cursor-grab active:cursor-grabbing'}`}
                        whileDrag={{ scale: 1.04 }}
                    >
                        <span className="cyber-option-key w-8 h-8 text-sm">{index + 1}</span>
                        <span className="flex-1 text-left text-lg">{item}</span>
                        <GripVertical className={`text-slate-500 ${isSubmitted ? 'opacity-0' : ''}`} />
                    </Reorder.Item>
                ))}
            </Reorder.Group>
            {!isSubmitted && <Button onClick={() => onSubmit(items)} variant="neon">LOCK IN THIS ORDER</Button>}
        </div>
    );
};

export default QuestionCard;

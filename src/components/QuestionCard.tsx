import React, { useState } from 'react';
import { Answer, PublicQuestion, QuestionType } from '../types';
import { useGame } from '../context/GameContext';
import { Lock } from 'lucide-react';
import { CyberTimer, QuestionPanel } from './CyberQuestion';
import { AnswerProps } from './answers/shared';
import { MultipleChoiceAnswer, MultiSelectAnswer, TrueFalseAnswer, TypeAnswer } from './answers/ChoiceAnswers';
import { NumberAnswer, RangeAnswer, SliderAnswer } from './answers/NumberAnswers';
import { CategorizeAnswer, MatchAnswer, OrderAnswer, ScrambleAnswer } from './answers/PuzzleAnswers';
import { PinAnswer } from './answers/PinAnswer';
import { QuestionImage } from './answers/PinBoard';

/** The panel each type is answered on. */
const ANSWER_PANELS: Record<QuestionType, React.FC<AnswerProps>> = {
  [QuestionType.MULTIPLE_CHOICE]: MultipleChoiceAnswer,
  [QuestionType.MULTI_SELECT]: MultiSelectAnswer,
  [QuestionType.TRUE_FALSE]: TrueFalseAnswer,
  [QuestionType.TYPE_ANSWER]: TypeAnswer,
  [QuestionType.SLIDER]: SliderAnswer,
  [QuestionType.RANGE]: RangeAnswer,
  [QuestionType.NUMBER]: NumberAnswer,
  [QuestionType.PIN]: PinAnswer,
  [QuestionType.PUZZLE]: OrderAnswer,
  [QuestionType.MATCH]: MatchAnswer,
  [QuestionType.CATEGORIZE]: CategorizeAnswer,
  [QuestionType.SCRAMBLE]: ScrambleAnswer,
};

/**
 * The answering card, rendered inside whichever matchup the player is in.
 *
 * It is handed the *public* question — answer key stripped — on every
 * screen, the host's own seat included, so it can never show anyone more
 * than a phone would get.
 *
 * Submitting only ever *locks an answer in*. The card never says whether it
 * was right. Every player finds out how they did at the end of their match,
 * all at once, so the card has no right-or-wrong state to draw.
 *
 * `compact` is for the panes that already show the question themselves — the
 * host's own player view beside their controls, and a guest's phone screen.
 * Repeating it at full size there pushed the answers off the bottom.
 *
 * The clock comes in as a prop rather than out of the context, because there
 * is no longer one clock to read: every matchup runs its own.
 */
const QuestionCard: React.FC<{
  question: PublicQuestion;
  timeLeft: number;
  duration: number;
  paused?: boolean;
  compact?: boolean;
}> = ({ question, timeLeft, duration, paused = false, compact = false }) => {
  const { submitAnswer, currentPlayerId } = useGame();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const isSpectator = !currentPlayerId;

  const handleSubmit = (answer: Answer) => {
    if (isSpectator || isSubmitted) return;
    setIsSubmitted(true);
    submitAnswer(answer);
  };

  const Panel = ANSWER_PANELS[question.type] ?? MultipleChoiceAnswer;

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
          className="mb-8"
        />
      )}

      {/* A pin question's picture is the answer surface itself; any other
          question's picture goes above its options. */}
      {question.type !== QuestionType.PIN && (
        <QuestionImage image={question.image} className={compact ? 'mb-4' : 'mb-6'} />
      )}

      <Panel question={question} onSubmit={handleSubmit} isSubmitted={isSubmitted} compact={compact} />

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

export default QuestionCard;

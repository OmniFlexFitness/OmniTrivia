import React, { useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import Button from './Button';
import Instructions from './Instructions';
import { ArrowLeft, ArrowRight, AlertTriangle, Check, Shuffle } from 'lucide-react';

/**
 * What to play, out of what was imported.
 *
 * A question file is almost never a game. It is a library — a dozen
 * categories, fifty questions each, built up over months — and the importer
 * used to turn every last row of it into rounds, so a host who asked for three
 * rounds of five got twelve rounds of fifty and found out in front of a room.
 *
 * This is where the file becomes the game the host actually set up: keep the
 * categories you want, cap the rounds and the questions per round, and the
 * rest is trimmed. What gets cut is cut at random, so importing the same file
 * twice is not the same night twice.
 */
const ImportSelectScreen: React.FC = () => {
  const {
    importPreview,
    totalRounds,
    questionsPerRound,
    applyImportSelection,
    cancelImport,
    error,
  } = useGame();

  const contents = useMemo(() => importPreview ?? [], [importPreview]);

  const [kept, setKept] = useState<string[]>(() =>
    contents.map((content) => content.category.id),
  );
  const [rounds, setRounds] = useState(() =>
    Math.max(1, Math.min(totalRounds, Math.max(contents.length, 1))),
  );
  const [perRound, setPerRound] = useState(() => Math.max(1, questionsPerRound));

  // A host can land here from a reload with nothing parsed. Nothing to choose
  // from is a trip back to the file picker, not an empty screen.
  if (contents.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900 text-center">
        <p className="text-slate-300 mb-6">There is nothing imported to choose from.</p>
        <Button onClick={cancelImport} variant="neon">BACK TO IMPORT</Button>
      </div>
    );
  }

  const keptSet = new Set(kept);
  const keptContents = contents.filter((c) => keptSet.has(c.category.id));
  const questionsFound = contents.reduce((sum, c) => sum + c.questions.length, 0);
  const deepest = contents.reduce(
    (most, c) => Math.max(most, c.questions.length),
    1,
  );

  // What will actually be played, once both ceilings are applied. The
  // questions ceiling is capped at the deepest category there is — asking for
  // twenty out of a file whose best category holds five is not a game shape,
  // it is every round marked short.
  const cap = Math.min(perRound, Math.max(deepest, 1));
  const playedRounds = Math.min(rounds, keptContents.length);
  const shortRounds = keptContents.filter((c) => c.questions.length < cap);
  const overflow = keptContents.length - playedRounds;

  const toggle = (categoryId: string) =>
    setKept((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );

  const build = () =>
    applyImportSelection({
      categoryIds: kept,
      rounds: playedRounds,
      questionsPerRound: cap,
    });

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex flex-col items-center">
      <header className="w-full max-w-3xl flex items-center justify-between mb-6">
        <button
          onClick={cancelImport}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
        >
          <ArrowLeft size={18} /> back
        </button>
        <div className="text-right">
          <h2 className="text-2xl font-bold text-white">WHAT TO PLAY</h2>
          <p className="text-slate-400 text-sm">
            {contents.length} categories · {questionsFound} questions found
          </p>
        </div>
      </header>

      <Instructions guide="importSelect" className="w-full max-w-3xl mb-6" />

      {error && (
        <div className="w-full max-w-3xl bg-red-900/50 border border-red-500 text-red-300 p-4 rounded-lg mb-6 flex items-center gap-3">
          <AlertTriangle className="shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* --- the shape of the game --- */}
      <div className="w-full max-w-3xl bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6 space-y-6">
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <label className="text-slate-400 text-sm uppercase tracking-wider">
              Rounds
            </label>
            <span className="text-xs text-slate-500">
              at most {contents.length} — one per category
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={Math.max(contents.length, 1)}
              value={rounds}
              onChange={(e) => setRounds(parseInt(e.target.value))}
              className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-neon-pink"
            />
            <span className="text-2xl font-mono font-bold text-neon-pink w-12 text-center">
              {rounds}
            </span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-2">
            <label className="text-slate-400 text-sm uppercase tracking-wider">
              Questions per round
            </label>
            <span className="text-xs text-slate-500">
              deepest category has {deepest}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={Math.max(deepest, 1)}
              value={cap}
              onChange={(e) => setPerRound(parseInt(e.target.value))}
              className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-neon-blue"
            />
            <span className="text-2xl font-mono font-bold text-neon-blue w-12 text-center">
              {cap}
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-400 flex items-start gap-2">
          <Shuffle size={15} className="shrink-0 mt-0.5 text-slate-500" />
          {playedRounds === 0
            ? 'Keep at least one category.'
            : `${playedRounds} round${playedRounds === 1 ? '' : 's'} of up to ${cap} question${cap === 1 ? '' : 's'}, drawn at random from what you keep. The wheel decides which round is played when.`}
        </p>
      </div>

      {/* --- which categories --- */}
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-mono uppercase tracking-widest text-slate-400">
            Categories · keeping {keptContents.length} of {contents.length}
          </h3>
          <div className="flex gap-3 text-[11px] font-mono uppercase tracking-widest">
            <button
              onClick={() => setKept(contents.map((c) => c.category.id))}
              className="text-slate-500 hover:text-neon-blue"
            >
              keep all
            </button>
            <button
              onClick={() => setKept([])}
              className="text-slate-500 hover:text-neon-pink"
            >
              keep none
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {contents.map((content) => {
            const isKept = keptSet.has(content.category.id);
            const used = Math.min(content.questions.length, cap);
            return (
              <button
                key={content.category.id}
                onClick={() => toggle(content.category.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                  isKept
                    ? 'bg-slate-800 border-neon-blue/60'
                    : 'bg-slate-900/40 border-slate-800 opacity-60 hover:opacity-90'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xl shrink-0 ${content.category.color}`}
                >
                  {content.category.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">
                    {content.category.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {content.questions.length} question
                    {content.questions.length === 1 ? '' : 's'}
                    {isKept && used < content.questions.length && (
                      <span className="text-slate-500"> · {used} used</span>
                    )}
                    {isKept && content.questions.length < cap && (
                      <span className="text-amber-400"> · short round</span>
                    )}
                  </p>
                </div>
                <div
                  className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
                    isKept
                      ? 'bg-neon-blue/20 border-neon-blue text-neon-blue'
                      : 'border-slate-700 text-transparent'
                  }`}
                >
                  <Check size={15} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* --- what the host is about to get, said plainly --- */}
      <div className="w-full max-w-3xl space-y-3 mb-8">
        {overflow > 0 && (
          <p className="text-sm text-slate-400 bg-slate-800/60 border border-slate-700 rounded-lg p-3">
            You are keeping {keptContents.length} categories for {rounds} round
            {rounds === 1 ? '' : 's'}, so {playedRounds} of them will be drawn at
            random and the other {overflow} sit this game out. Raise the rounds
            to play them all.
          </p>
        )}
        {shortRounds.length > 0 && (
          <p className="text-sm text-amber-300 bg-amber-900/30 border border-amber-500/60 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              {shortRounds.map((c) => c.category.name).join(', ')}{' '}
              {shortRounds.length === 1 ? 'has' : 'have'} fewer than {cap}{' '}
              questions. Those rounds will just be shorter — nothing is padded.
            </span>
          </p>
        )}
      </div>

      <div className="w-full max-w-md pb-8">
        <Button
          onClick={build}
          fullWidth
          variant="neon"
          disabled={playedRounds === 0}
          className="h-16 text-lg flex items-center justify-center gap-2"
        >
          BUILD THE GAME <ArrowRight />
        </Button>
      </div>
    </div>
  );
};

export default ImportSelectScreen;

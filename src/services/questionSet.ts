import { CategoryContent, Question, QuestionType, RoundConfig } from "../types";

/**
 * Shaping the set of questions a game is about to play.
 *
 * Everything here is a pure function over content that has already been
 * written — by Claude, or by the host in a spreadsheet — and none of it knows
 * anything about a live game. That matters twice over: the review screen edits
 * this shape before a room exists, and the checks in `scripts/` can drive it
 * with no React and no browser in the way.
 *
 * The one rule worth stating out loud is that **order is never meaningful by
 * accident**. A generated set arrives in the order the model wrote it and an
 * imported set in the order the spreadsheet happened to be sorted in, and both
 * of those are orders a regular player learns. So a game is shuffled on its
 * way in rather than played in the order it was authored.
 */

/**
 * Fisher-Yates, on a copy.
 *
 * `[...items].sort(() => 0.5 - Math.random())` — which this repository used to
 * use to pick a game's categories — is not a shuffle: the comparator is
 * inconsistent, so the result is neither uniform nor stable across engines.
 */
export const shuffle = <T,>(items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Shuffle the answers under a question, keeping the correct one marked.
 *
 * Only multiple choice: everywhere else the order of `options` carries
 * meaning. TRUE_FALSE is read as True then False, SLIDER packs
 * [min, max, step, low, high], PUZZLE stores the answer *as* an order, and
 * TYPE_ANSWER lists accepted spellings with the canonical one first. Shuffling
 * any of those corrupts the question rather than varying it.
 */
export const shuffleOptions = (question: Question): Question => {
  const type = question.type ?? QuestionType.MULTIPLE_CHOICE;
  if (type !== QuestionType.MULTIPLE_CHOICE) return question;
  if (question.options.length < 2) return question;
  // A question whose correct answer is already out of range is left exactly as
  // it is. Moving its options around would turn a visible import problem into
  // an invisible one — a question that now marks a different answer correct.
  if (
    question.correctIndex < 0 ||
    question.correctIndex >= question.options.length
  ) {
    return question;
  }

  const shuffled = shuffle(
    question.options.map((option, index) => ({ option, index })),
  );

  return {
    ...question,
    options: shuffled.map((entry) => entry.option),
    correctIndex: shuffled.findIndex(
      (entry) => entry.index === question.correctIndex,
    ),
  };
};

/** Questions in a fresh order, each with its own answers re-arranged. */
export const randomizeQuestions = (questions: readonly Question[]): Question[] =>
  shuffle(questions).map(shuffleOptions);

/**
 * Number rounds by the position they are actually in.
 *
 * `roundNumber` is what the review screen labels a block with and what every
 * edit to a round names it by, so it has to agree with the index at all times.
 * A round removed in review, or a category the wheel has just pulled forward,
 * both leave it needing this.
 */
export const renumberRounds = (rounds: readonly RoundConfig[]): RoundConfig[] =>
  rounds.map((round, index) => ({ ...round, roundNumber: index + 1 }));

/**
 * A game's rounds, shuffled: the order of the categories, the order of the
 * questions inside each one, and the answers under each question.
 */
export const randomizeRounds = (rounds: readonly RoundConfig[]): RoundConfig[] =>
  renumberRounds(
    shuffle(rounds).map((round) => ({
      ...round,
      questions: randomizeQuestions(round.questions),
    })),
  );

/** What the host kept, and how much of it, when turning content into a game. */
export interface ContentSelection {
  /**
   * Category ids the host wants. Null or undefined means everything that was
   * parsed — an import nobody has pruned.
   */
  categoryIds?: readonly string[] | null;
  /** Most rounds the game may have. Zero or less is no ceiling. */
  maxCategories?: number;
  /** Most questions any one round may carry. Zero or less is no ceiling. */
  maxQuestions?: number;
}

/**
 * Turn parsed category content into the rounds a game will play, honouring the
 * shape the host asked for.
 *
 * A file with twenty categories and fifty questions each is a *library*, not a
 * game. Trimming it is the point: the rounds and questions-per-round the host
 * set are the game they meant to run, and what is cut is cut at random so that
 * importing the same file twice is not the same night twice.
 */
export const buildRoundsFromContent = (
  contents: readonly CategoryContent[],
  selection: ContentSelection = {},
): RoundConfig[] => {
  const { categoryIds, maxCategories = 0, maxQuestions = 0 } = selection;

  const wanted = categoryIds ? new Set(categoryIds) : null;
  const usable = contents.filter(
    (content) =>
      content.questions.length > 0 &&
      (!wanted || wanted.has(content.category.id)),
  );

  const drawn = shuffle(usable);
  const kept = maxCategories > 0 ? drawn.slice(0, maxCategories) : drawn;

  return kept.map((content, index) => {
    const questions = shuffle(content.questions);
    return {
      roundNumber: index + 1,
      category: content.category,
      questions: (maxQuestions > 0
        ? questions.slice(0, maxQuestions)
        : questions
      ).map(shuffleOptions),
    };
  });
};

/** Longest round in a set, which is what "questions per round" means once the
 * rounds are allowed to differ. */
export const longestRound = (rounds: readonly RoundConfig[]): number =>
  rounds.reduce((most, round) => Math.max(most, round.questions.length), 0);

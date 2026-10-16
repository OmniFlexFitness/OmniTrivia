/**
 * How hard generated questions are pitched.
 *
 * The first nights were played on questions written for people who follow
 * the subject, and a room of friends and regulars sat and guessed — twice,
 * even after "general appeal" went into the prompt, because "most adults
 * have heard of it" is a line a model draws far higher than a bar does. So
 * the level is now named for a reader everybody can picture, with a test to
 * apply to every question and examples on both sides of the line, and the
 * host can move it.
 *
 * Kept free of imports so the generator, the setup screen and the probes
 * all read one table.
 */

export type QuestionDifficulty = "everyday" | "school" | "quiz";

/** The level a host gets until they choose another. */
export const DEFAULT_DIFFICULTY: QuestionDifficulty = "school";

export const DIFFICULTY_LEVELS: QuestionDifficulty[] = ["everyday", "school", "quiz"];

export interface DifficultyInfo {
  /** What the setup screen calls it. */
  label: string;
  /** One line under the label. */
  blurb: string;
  /** What the model is told. Sent with every request at this level. */
  brief: string;
}

/**
 * The one test every question has to pass, whatever the level: is the
 * answer something the named reader knows instantly, without looking it up
 * and without working anything out? The examples are there because a model
 * draws "easy" wherever it likes until it is shown where the line is — the
 * too-hard ones are real questions from the first sets.
 */
export const DIFFICULTY: Record<QuestionDifficulty, DifficultyInfo> = {
  everyday: {
    label: "Everyday",
    blurb: "Things a 12-year-old knows. Nearly everybody gets every question; speed decides it.",
    brief:
      "Difficulty: EVERYDAY. Every question is something a typical 12-year-old " +
      "knows, or that daily life makes obvious: colours, animals, the days " +
      "and months, famous landmarks, the biggest films, the most famous people " +
      "alive, what things are called. The test for every question: would a " +
      "12-year-old and their grandparent both know this instantly, without " +
      "working anything out? If not, do not ask it — find an easier fact " +
      "about the same category. Nearly everybody in the room should get " +
      "nearly every question; the game is decided on speed, not knowledge. " +
      "Right level: 'How many legs does a spider have?', 'What colour do you " +
      "get by mixing blue and yellow?', 'Which planet do we live on?', 'What " +
      "is the name of Mickey Mouse's dog?'. Too hard: 'What is the capital of " +
      "Australia?', 'Who painted The Starry Night?', 'How many bones are in " +
      "the adult human body?'.",
  },
  school: {
    label: "High school",
    blurb: "What a typical high-school graduate remembers without studying. The default.",
    brief:
      "Difficulty: HIGH SCHOOL. Every question is something a typical " +
      "high-school graduate who paid moderate attention would know without " +
      "studying, or that everyday life makes obvious — the kind of fact that " +
      "is in a school textbook, on a famous landmark, in a blockbuster film or " +
      "a hit song everybody has heard. The test for every question: would an " +
      "average 17-year-old, and an average adult who has not followed the " +
      "subject since school, know this instantly, without looking it up or " +
      "working anything out? If not, do not ask it — find an easier fact " +
      "about the same category. About two thirds of the questions should be " +
      "ones nearly everybody gets, and the rest ones about half the room " +
      "gets. There are no stretch questions at this level: nothing that " +
      "rewards a fan, a graduate in the subject or a pub-quiz regular. " +
      "Right level: 'What is the capital of France?', 'Which planet is " +
      "closest to the Sun?', 'Who painted the Mona Lisa?', 'How many players " +
      "does a basketball team have on the court?', 'What gas do plants take " +
      "in from the air?', 'Which ocean is the largest?'. Too hard — never " +
      "write questions like these: 'Who was the last emperor of the Western " +
      "Roman Empire?', 'Which element is most abundant in the Earth's crust " +
      "by mass?', 'Who played the saxophone on Baker Street?', 'Which Bronte " +
      "sister published as Currer Bell?', 'What was the first item sold on " +
      "eBay?', 'Which African country borders the most others?'. If a " +
      "question needs a date, a measurement or a name that only a fan knows, " +
      "it is too hard.",
  },
  quiz: {
    label: "Pub quiz",
    blurb: "A proper quiz night: mostly gettable, with a few that reward someone who knows the subject.",
    brief:
      "Difficulty: PUB QUIZ. About half the questions easy (most of the room " +
      "gets them), about a third medium (half the room gets them), and at " +
      "most one in six a stretch — one a person can still reason or eliminate " +
      "their way to, never specialist knowledge. If you are not sure most " +
      "people have heard of the answer, make the question easier. Right " +
      "level for a stretch: 'Which country has the most time zones?', 'Who " +
      "wrote Pride and Prejudice?'. Too hard even here: 'Who was the last " +
      "emperor of the Western Roman Empire?', 'Who played the saxophone on " +
      "Baker Street?'.",
  },
};

export const isDifficulty = (value: unknown): value is QuestionDifficulty =>
  typeof value === "string" && (DIFFICULTY_LEVELS as string[]).includes(value);

/** What the model is told at a level — the default's brief for an unknown one. */
export const difficultyBrief = (level: QuestionDifficulty | undefined): string =>
  DIFFICULTY[level && isDifficulty(level) ? level : DEFAULT_DIFFICULTY].brief;

const DIFFICULTY_KEY = "omnitrivia:question-difficulty";

/** The level this host chose last time, or the default. */
export const readDifficultyPreference = (): QuestionDifficulty => {
  try {
    const saved = window.localStorage.getItem(DIFFICULTY_KEY);
    return isDifficulty(saved) ? saved : DEFAULT_DIFFICULTY;
  } catch {
    return DEFAULT_DIFFICULTY;
  }
};

export const saveDifficultyPreference = (level: QuestionDifficulty): void => {
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, level);
  } catch {
    // Private mode: the choice still applies to this game.
  }
};

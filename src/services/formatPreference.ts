import { QuestionType } from "../types";

/**
 * Which question formats a host wants generated games written in.
 *
 * A preference, like the bots switch: remembered on this device between
 * games, and only ever a filter on what Claude is asked to write. An
 * imported sheet or the question bank plays whatever formats it holds —
 * those were chosen by whoever wrote the rows.
 */

const PREFERENCE_KEY = "omnitrivia:question-formats";

export const ALL_FORMATS: QuestionType[] = Object.values(QuestionType);

/** What this host chose last time — every format until they say otherwise. */
export const readFormatPreference = (): QuestionType[] => {
  try {
    const raw = window.localStorage.getItem(PREFERENCE_KEY);
    if (!raw) return ALL_FORMATS;
    const saved = (JSON.parse(raw) as string[]).filter((type): type is QuestionType =>
      ALL_FORMATS.includes(type as QuestionType),
    );
    return saved.length > 0 ? saved : ALL_FORMATS;
  } catch {
    return ALL_FORMATS;
  }
};

export const saveFormatPreference = (formats: QuestionType[]): void => {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(formats));
  } catch {
    // Private mode: the choice still applies to this game.
  }
};

/* ------------------------------------------------------------------ *
 * Typed answers
 * ------------------------------------------------------------------ */

/**
 * The formats where a player has to spell an answer out on a phone keyboard.
 *
 * Off by default: most of a room does not enjoy typing, a typo is a wrong
 * answer, and the format is the slowest on the clock. The switch on the
 * setup screen turns them back on. It applies to everything — Claude is not
 * asked to write them, and an imported file's or the bank's typed rows are
 * left out — so one switch is the whole decision.
 *
 * A closest-number guess and an unscramble are not here: a number is a few
 * taps on a keypad, and a scramble is letter tiles.
 */
export const TYPED_FORMATS: QuestionType[] = [QuestionType.TYPE_ANSWER];

export const isTypedFormat = (type: QuestionType | undefined): boolean =>
  TYPED_FORMATS.includes(type ?? QuestionType.MULTIPLE_CHOICE);

const TYPED_KEY = "omnitrivia:typed-answers";

/** Whether this host wants typed answers in their games. Off until they say so. */
export const readTypedAnswersPreference = (): boolean => {
  try {
    return window.localStorage.getItem(TYPED_KEY) === "on";
  } catch {
    return false;
  }
};

export const saveTypedAnswersPreference = (enabled: boolean): void => {
  try {
    window.localStorage.setItem(TYPED_KEY, enabled ? "on" : "off");
  } catch {
    // Private mode: the choice still applies to this game.
  }
};

/**
 * The formats a game may actually be written in: the host's picks, less the
 * typed ones while typed answers are off. Never empty — a host who picked
 * only typed answers and then turned them off gets multiple choice.
 */
export const formatsToGenerate = (
  picked: readonly QuestionType[],
  typedAnswers: boolean,
): QuestionType[] => {
  const allowed = typedAnswers ? [...picked] : picked.filter((type) => !isTypedFormat(type));
  return allowed.length > 0 ? allowed : [QuestionType.MULTIPLE_CHOICE];
};

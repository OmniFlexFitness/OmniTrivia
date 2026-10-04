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

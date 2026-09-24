/**
 * The words on the big screen while the room is joining.
 *
 * Two lines, both the host's to change: a headline, and the line under it.
 * The defaults are the ones a night at OmniFlex opens with. `{date}` in either
 * line becomes today's date on the screen that shows it, so a subtitle set
 * once still reads right next week.
 */

export const DEFAULT_BROADCAST_TITLE = "Trivia";
export const DEFAULT_BROADCAST_SUBTITLE = "Elevate · {date}";

/** Long enough for a sponsor line; short enough to fit a projector. */
export const MAX_BROADCAST_TITLE_LENGTH = 40;
export const MAX_BROADCAST_SUBTITLE_LENGTH = 80;

const PREFERENCE_KEY = "omnitrivia:broadcast-text";

/** Today, the way it reads on a wall: "September 24, 2026". */
export const formatBroadcastDate = (date: Date = new Date()): string => {
  try {
    return date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date.toDateString();
  }
};

/** A line as it should appear on screen, with `{date}` filled in. */
export const renderBroadcastText = (
  text: string | undefined | null,
  fallback: string,
  date: Date = new Date(),
): string => {
  const source = typeof text === "string" && text.trim() ? text : fallback;
  return source.replace(/\{date\}/gi, formatBroadcastDate(date)).trim();
};

export interface BroadcastText {
  title: string;
  subtitle: string;
}

/**
 * What this host used last time. A host who renames the screen for a venue
 * wants it renamed next week too, so it is remembered in this browser — the
 * same place the category pool lives.
 */
export const readBroadcastTextPreference = (): BroadcastText => {
  try {
    const raw = window.localStorage.getItem(PREFERENCE_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<BroadcastText>) : {};
    return {
      title: typeof saved.title === "string" ? saved.title : DEFAULT_BROADCAST_TITLE,
      subtitle:
        typeof saved.subtitle === "string" ? saved.subtitle : DEFAULT_BROADCAST_SUBTITLE,
    };
  } catch {
    return { title: DEFAULT_BROADCAST_TITLE, subtitle: DEFAULT_BROADCAST_SUBTITLE };
  }
};

export const saveBroadcastTextPreference = (text: BroadcastText): void => {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(text));
  } catch {
    // Private mode: the text still applies to this game.
  }
};

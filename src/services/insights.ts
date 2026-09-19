import { Category } from "../types";

/**
 * What the room keeps telling the host about categories.
 *
 * Two signals are recorded here, and they answer different questions:
 *
 * - **Likes** are about a category a room has actually played. A player taps
 *   the heart during or after a round, so a like means "that was a good round",
 *   not "that sounds good".
 * - **Votes** are about categories nobody has played yet: the end-of-round
 *   ballot asks the room what it wants next, and the winner is a request.
 *
 * Both are cumulative across games, because one night's numbers are noise and
 * the point of collecting them is to see what a room asks for *often*. They are
 * stored in the host machine's localStorage — the host window is already the
 * whole game (see "What this is not" in the README), and a player's phone can
 * no more write to this than it can to the scores.
 *
 * Every write is a delta, so a player changing their vote takes one off the
 * option they left. That keeps the stored totals equal to what actually
 * happened even though nothing here re-reads the live game.
 */

const INSIGHTS_KEY = "omnitrivia:category-insights";

export interface CategoryInsight {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  /** All-time likes from players, across every game this browser has hosted. */
  likes: number;
  /** All-time votes this category has won in end-of-round ballots. */
  votes: number;
  /** How many ballots it has appeared on — votes alone would flatter a regular. */
  ballots: number;
  /** How many rounds have actually been played on it. */
  roundsPlayed: number;
  /** When it last did any of the above, so a stale favourite is visible. */
  lastSeen: number;
}

type InsightStore = Record<string, CategoryInsight>;

const readStore = (): InsightStore => {
  try {
    const raw = window.localStorage.getItem(INSIGHTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as InsightStore) : {};
  } catch {
    return {};
  }
};

const writeStore = (store: InsightStore): InsightStore => {
  try {
    window.localStorage.setItem(INSIGHTS_KEY, JSON.stringify(store));
  } catch {
    // Private mode or a full quota. The game does not depend on this.
  }
  return store;
};

const blank = (category: Category): CategoryInsight => ({
  categoryId: category.id,
  name: category.name,
  icon: category.icon,
  color: category.color,
  likes: 0,
  votes: 0,
  ballots: 0,
  roundsPlayed: 0,
  lastSeen: 0,
});

/** Apply a delta to one category's row, creating it if this is its first. */
const bump = (
  category: Category,
  patch: Partial<Pick<CategoryInsight, "likes" | "votes" | "ballots" | "roundsPlayed">>,
): void => {
  const store = readStore();
  const current = store[category.id] ?? blank(category);

  store[category.id] = {
    ...current,
    // The name and icon follow the category as it is today, so a renamed
    // category reads as itself rather than as whatever it was called in March.
    name: category.name,
    icon: category.icon,
    color: category.color,
    likes: Math.max(0, current.likes + (patch.likes ?? 0)),
    votes: Math.max(0, current.votes + (patch.votes ?? 0)),
    ballots: Math.max(0, current.ballots + (patch.ballots ?? 0)),
    roundsPlayed: Math.max(0, current.roundsPlayed + (patch.roundsPlayed ?? 0)),
    lastSeen: Date.now(),
  };

  writeStore(store);
};

/** A player liked (`+1`) or took their like back (`-1`). */
export const recordCategoryLike = (category: Category, liked: boolean): void =>
  bump(category, { likes: liked ? 1 : -1 });

/** A vote landed on a category, or moved off it. */
export const recordCategoryVote = (category: Category, delta: 1 | -1): void =>
  bump(category, { votes: delta });

/** A ballot went up with these options on it. */
export const recordBallot = (options: Category[]): void =>
  options.forEach((category) => bump(category, { ballots: 1 }));

/** A round was actually played on this category. */
export const recordRoundPlayed = (category: Category): void =>
  bump(category, { roundsPlayed: 1 });

/**
 * Everything recorded so far, most-liked first.
 *
 * Ties break on votes and then on name, so the order is stable between renders
 * rather than jumping about as the map is re-enumerated.
 */
export const readCategoryInsights = (): CategoryInsight[] =>
  Object.values(readStore()).sort(
    (a, b) =>
      b.likes - a.likes ||
      b.votes - a.votes ||
      a.name.localeCompare(b.name),
  );

/** Wipe the record. Only ever called from the host's own insights panel. */
export const clearCategoryInsights = (): void => {
  try {
    window.localStorage.removeItem(INSIGHTS_KEY);
  } catch {
    // Nothing to clean up.
  }
};

/** The data as a CSV, for a host who would rather read it in a spreadsheet. */
export const insightsAsCsv = (): string => {
  const rows = readCategoryInsights();
  const header = "category,likes,votes,ballots,rounds_played,last_seen";
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  return [
    header,
    ...rows.map((row) =>
      [
        escape(row.name),
        row.likes,
        row.votes,
        row.ballots,
        row.roundsPlayed,
        row.lastSeen ? new Date(row.lastSeen).toISOString() : "",
      ].join(","),
    ),
  ].join("\n");
};

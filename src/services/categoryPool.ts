import { Category } from "../types";
import { CATEGORY_VOTE_OPTIONS, DEFAULT_CATEGORY_POOL } from "../constants";

/**
 * The host's own list of categories a room can be asked to vote on.
 *
 * This is not the same list a game plays. A game's rounds come from whatever
 * questions were generated or imported for it; this pool is the answer to "what
 * should we play next time", and it is the host's to add to, edit and prune.
 *
 * It lives in this browser's localStorage, on the host's machine, because that
 * is where the rest of the game's authority already lives — the host window is
 * the whole game (see "What this is not" in the README). Nothing a player's
 * phone does can write to it.
 */

const POOL_KEY = "omnitrivia:category-pool";

/** Colours a new category cycles through, so a hand-added one is never grey. */
const POOL_COLORS = [
  "bg-blue-500",
  "bg-pink-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-lime-500",
  "bg-indigo-500",
  "bg-orange-500",
];

const isCategory = (value: unknown): value is Category => {
  const candidate = value as Category | null;
  return Boolean(
    candidate &&
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.icon === "string" &&
      typeof candidate.color === "string",
  );
};

/** An id derived from the name, so the same category means the same row. */
export const categoryIdFor = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `category-${Date.now()}`;

/**
 * The pool as it stands. An empty or unreadable store means the host has never
 * touched it, so they get the defaults rather than an empty vote.
 */
export const readCategoryPool = (): Category[] => {
  try {
    const raw = window.localStorage.getItem(POOL_KEY);
    if (!raw) return [...DEFAULT_CATEGORY_POOL];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_CATEGORY_POOL];
    const pool = parsed.filter(isCategory);
    // A pool deliberately emptied is respected; one that failed to parse is not.
    return pool.length > 0 || parsed.length === 0 ? pool : [...DEFAULT_CATEGORY_POOL];
  } catch {
    return [...DEFAULT_CATEGORY_POOL];
  }
};

const writeCategoryPool = (pool: Category[]): Category[] => {
  try {
    window.localStorage.setItem(POOL_KEY, JSON.stringify(pool));
  } catch {
    // Private mode or a full quota: the pool is whatever this session holds.
  }
  return pool;
};

/**
 * Add a category, or update the one that already answers to its name. Returns
 * the pool as it now stands so a caller can render it without re-reading.
 */
export const addToCategoryPool = (
  input: { name: string; icon?: string; color?: string },
): Category[] => {
  const name = input.name.trim();
  if (!name) return readCategoryPool();

  const pool = readCategoryPool();
  const id = categoryIdFor(name);
  const existing = pool.findIndex((category) => category.id === id);

  const category: Category = {
    id,
    name,
    icon: input.icon?.trim() || "❓",
    color: input.color || POOL_COLORS[pool.length % POOL_COLORS.length],
  };

  if (existing >= 0) {
    const updated = [...pool];
    updated[existing] = category;
    return writeCategoryPool(updated);
  }

  return writeCategoryPool([...pool, category]);
};

/**
 * Edit a category in place.
 *
 * The id is left alone even when the name changes: it is what the likes and
 * votes already recorded against this category are keyed by, and renaming
 * "Pop Culture" to "Movies & TV" should not orphan a season of data.
 */
export const updateInCategoryPool = (
  id: string,
  patch: Partial<Pick<Category, "name" | "icon" | "color">>,
): Category[] => {
  const pool = readCategoryPool().map((category) =>
    category.id === id
      ? {
          ...category,
          name: patch.name?.trim() || category.name,
          icon: patch.icon?.trim() || category.icon,
          color: patch.color || category.color,
        }
      : category,
  );
  return writeCategoryPool(pool);
};

export const removeFromCategoryPool = (id: string): Category[] =>
  writeCategoryPool(readCategoryPool().filter((category) => category.id !== id));

export const resetCategoryPool = (): Category[] =>
  writeCategoryPool([...DEFAULT_CATEGORY_POOL]);

/**
 * Draw the options for one vote.
 *
 * `avoid` keeps the categories this game has already played out of the ballot —
 * asking a room whether they want to play the round they have just finished is
 * a wasted option. If that would leave too few, the filter is dropped rather
 * than the vote being made smaller.
 */
export const drawPollOptions = (
  pool: Category[],
  avoid: string[] = [],
  count = CATEGORY_VOTE_OPTIONS,
): Category[] => {
  const excluded = new Set(avoid);
  const preferred = pool.filter((category) => !excluded.has(category.id));
  const source = preferred.length >= Math.min(count, pool.length) ? preferred : pool;

  const shuffled = [...source];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
};

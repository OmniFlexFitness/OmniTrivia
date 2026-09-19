import { Category, CategoryPoll, GameState } from "../types";
import { CATEGORIES } from "../constants";
import { drawPollOptions, readCategoryPool } from "./categoryPool";

/**
 * What the room tells the host it wants: likes on categories they have played,
 * and votes on categories they have not.
 *
 * These are pure state -> state transitions for the same reason the round
 * engine is: a like can arrive from a phone, from the host's own screen, or
 * twice from a phone whose first message was retried, and all three have to
 * land on exactly the same answer. The durable record in `insights` is written
 * by diffing the state these produce, so anything that is not idempotent here
 * becomes a wrong number in the host's data.
 */

/**
 * The category behind an id, from wherever this game knows it.
 *
 * A like can arrive for a category the game is playing, one it already liked,
 * a built-in, or one that only exists in the host's own pool, and all four have
 * to resolve to the same row in the data.
 */
const categoryFor = (state: GameState, categoryId: string): Category | null =>
  state.roundsConfig.find((round) => round.category.id === categoryId)?.category ??
  state.categoryLikes.find((tally) => tally.category.id === categoryId)?.category ??
  CATEGORIES.find((category) => category.id === categoryId) ??
  readCategoryPool().find((category) => category.id === categoryId) ??
  null;

/** One player's like on one category, applied to the live game. */
export const applyCategoryLike = (
  state: GameState,
  playerId: string,
  categoryId: string,
  liked: boolean,
): GameState => {
  const category = categoryFor(state, categoryId);
  if (!category) return state;

  const existing = state.categoryLikes.find(
    (tally) => tally.category.id === categoryId,
  );
  const already = existing?.playerIds.includes(playerId) ?? false;
  // Liking twice is not two likes, and a phone that re-sends is not a second
  // person — the durable record is driven off this state, so it has to be
  // idempotent here rather than hopeful downstream.
  if (already === liked) return state;

  const playerIds = liked
    ? [...(existing?.playerIds ?? []), playerId]
    : (existing?.playerIds ?? []).filter((id) => id !== playerId);

  const categoryLikes = existing
    ? state.categoryLikes.map((tally) =>
        tally.category.id === categoryId ? { category, playerIds } : tally,
      )
    : [...state.categoryLikes, { category, playerIds }];

  return { ...state, categoryLikes };
};

/** One player's vote in the open ballot. */
export const applyCategoryVote = (
  state: GameState,
  playerId: string,
  pollId: string,
  categoryId: string,
): GameState => {
  const poll = state.categoryPoll;
  // A vote for last round's ballot, or for something that is not on this one,
  // is a phone that woke up late rather than a preference.
  if (!poll || poll.id !== pollId) return state;
  if (!poll.options.some((option) => option.id === categoryId)) return state;
  if (poll.votes[playerId] === categoryId) return state;

  return {
    ...state,
    categoryPoll: { ...poll, votes: { ...poll.votes, [playerId]: categoryId } },
  };
};

/**
 * Draw the ballot the room votes on at the end of a round.
 *
 * It is drawn here, once, by the host — not per device — because every phone
 * and the big screen have to be looking at the same four options for a vote to
 * mean anything. Categories this game has already played are kept off it where
 * the pool is big enough: asking a room whether they want the round they have
 * just finished is a wasted option.
 */
export const buildCategoryPoll = (state: GameState, roundNumber: number): CategoryPoll | null => {
  const pool = readCategoryPool();
  if (pool.length === 0) return null;

  const played = state.roundsConfig
    .slice(0, state.currentRound)
    .map((round) => round.category.id);

  const options = drawPollOptions(pool, played);
  if (options.length === 0) return null;

  return {
    // New every time, so a vote cast on the last round's ballot cannot land on
    // this one after a phone has been asleep.
    id: `poll-${roundNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    roundNumber,
    options,
    votes: {},
  };
};

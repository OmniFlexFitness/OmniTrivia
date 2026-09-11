import { BracketRound, Matchup, Player } from "../types";

/**
 * Single-elimination bracket for a room of players.
 *
 * Every round pairs each surviving player against exactly one opponent. The
 * pairing is fixed for the whole round; the round's questions run against that
 * pairing, and whoever scores more of that round's points advances. The odd
 * player out gets a bye and advances without a matchup.
 */

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Pair an ordered list of player ids into matchups, last one out gets a bye. */
const pair = (roundNumber: number, playerIds: string[]): Matchup[] => {
  const matchups: Matchup[] = [];

  for (let i = 0; i < playerIds.length; i += 2) {
    const playerAId = playerIds[i];
    const playerBId = playerIds[i + 1] ?? null;
    matchups.push({
      id: `r${roundNumber}-m${matchups.length + 1}`,
      roundNumber,
      playerAId,
      playerBId,
      winnerId: null,
      scoreA: null,
      scoreB: null,
      tiebreak: null,
    });
  }

  return matchups;
};

/**
 * Seed round one. The draw is random — there is no ranking to seed from before
 * anyone has answered a question.
 */
export const buildFirstRound = (players: Player[]): BracketRound => ({
  roundNumber: 1,
  matchups: pair(
    1,
    shuffle(players.map((p) => p.id)),
  ),
  resolved: false,
});

/** Re-pair the winners of the previous round, in bracket order. */
export const buildNextRound = (
  roundNumber: number,
  advancingIds: string[],
): BracketRound => ({
  roundNumber,
  matchups: pair(roundNumber, advancingIds),
  resolved: false,
});

/** Every player still competing this round, byes included. */
export const activePlayerIds = (round: BracketRound | undefined): string[] => {
  if (!round) return [];
  return round.matchups.flatMap((m) =>
    m.playerBId ? [m.playerAId, m.playerBId] : [m.playerAId],
  );
};

/**
 * Who is playing this round.
 *
 * A game with fewer than two players has no bracket at all — there is nobody
 * to be matched against — so everyone still in the game is playing.
 */
export const rosterForRound = (
  round: BracketRound | undefined,
  players: Player[],
): string[] =>
  round
    ? activePlayerIds(round)
    : players.filter((p) => !p.eliminated).map((p) => p.id);

/** The matchup a given player is in this round, if any. */
export const matchupForPlayer = (
  round: BracketRound | undefined,
  playerId: string,
): Matchup | undefined =>
  round?.matchups.find(
    (m) => m.playerAId === playerId || m.playerBId === playerId,
  );

/**
 * Decide every matchup in a round on that round's points.
 *
 * Ties are broken on the running total and then on the draw order, rather than
 * at random: a coin flip in front of a room reads as the game being broken.
 */
export const resolveRound = (
  round: BracketRound,
  players: Player[],
): { round: BracketRound; advancingIds: string[] } => {
  const byId = new Map(players.map((p) => [p.id, p]));

  const matchups = round.matchups.map<Matchup>((matchup) => {
    const a = byId.get(matchup.playerAId);
    const b = matchup.playerBId ? byId.get(matchup.playerBId) : undefined;

    const scores = { scoreA: a?.roundScore ?? null, scoreB: b?.roundScore ?? null };

    // Bye, or an opponent who left the game: A walks through.
    if (!b) {
      return { ...matchup, ...scores, winnerId: a?.id ?? null, tiebreak: "Bye" };
    }
    if (!a) {
      return { ...matchup, ...scores, winnerId: b.id, tiebreak: "Bye" };
    }

    if (a.roundScore !== b.roundScore) {
      return {
        ...matchup,
        ...scores,
        winnerId: a.roundScore > b.roundScore ? a.id : b.id,
        tiebreak: null,
      };
    }

    if (a.score !== b.score) {
      return {
        ...matchup,
        ...scores,
        winnerId: a.score > b.score ? a.id : b.id,
        tiebreak: "Tied on the round — decided on total score",
      };
    }

    return {
      ...matchup,
      ...scores,
      winnerId: a.id,
      tiebreak: "Dead heat — advanced on the draw",
    };
  });

  return {
    round: { ...round, matchups, resolved: true },
    advancingIds: matchups
      .map((m) => m.winnerId)
      .filter((id): id is string => id !== null),
  };
};

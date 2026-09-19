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

/** Has this matchup no opponent in it — a bye rather than a duel? */
const isBye = (matchup: Matchup): boolean => matchup.playerBId === null;

/**
 * How many byes each player has already been handed this game.
 *
 * Read from the bracket itself rather than tracked alongside it: the bracket
 * is the record of what happened, and a second copy of that record is a second
 * thing to keep in step.
 */
export const byeCounts = (rounds: BracketRound[]): Map<string, number> => {
  const counts = new Map<string, number>();

  rounds.forEach((round) =>
    round.matchups.filter(isBye).forEach((matchup) => {
      counts.set(matchup.playerAId, (counts.get(matchup.playerAId) ?? 0) + 1);
    }),
  );

  return counts;
};

/**
 * Put the player who should sit this one out at the end of the list, where
 * `pair` hands out the bye.
 *
 * Without this the bye falls to whoever is last in the advancing list — and
 * the player who won a bye is *always* last, because their matchup is the last
 * one in the round. So one unlucky draw in round one became a free pass
 * through the entire bracket: in a five-player game the same person took a bye
 * in round one and round two and reached the final without facing anybody.
 *
 * The bye goes to whoever has had the fewest so far, and ties break on bracket
 * order rather than chance — after round one nothing about the draw should be
 * random.
 */
const withByeLast = (
  advancingIds: string[],
  playedRounds: BracketRound[],
): string[] => {
  if (advancingIds.length % 2 === 0) return advancingIds;

  const counts = byeCounts(playedRounds);
  const byesFor = (id: string) => counts.get(id) ?? 0;

  const sitsOut = advancingIds.reduce((fewest, id) =>
    byesFor(id) < byesFor(fewest) ? id : fewest,
  );

  return [...advancingIds.filter((id) => id !== sitsOut), sitsOut];
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

/**
 * Re-pair the winners of the previous round, in bracket order.
 *
 * Nothing here is random: round one is drawn from a hat, and from then on the
 * bracket decides who plays whom — the winner of the first matchup meets the
 * winner of the second, and so on. `playedRounds` is only read to work out who
 * is owed a bye when the field is an odd size.
 */
export const buildNextRound = (
  roundNumber: number,
  advancingIds: string[],
  playedRounds: BracketRound[] = [],
): BracketRound => ({
  roundNumber,
  matchups: pair(roundNumber, withByeLast(advancingIds, playedRounds)),
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

/**
 * Who this question is actually waiting on.
 *
 * The host always holds a seat so they can test the game from their own
 * screen, but a host who has switched answering off is running the show, not
 * playing it. Every count of the room — the engine's auto-advance, the host's
 * tracker and the projector's tally — has to agree on that, so they all come
 * through here.
 */
export const answeringRoster = (
  round: BracketRound | undefined,
  players: Player[],
  hostAnswering: boolean,
): string[] => {
  const roster = rosterForRound(round, players);
  if (hostAnswering) return roster;

  const hostPlayerId = players.find((p) => p.isHost)?.id;
  return roster.filter((id) => id !== hostPlayerId);
};

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

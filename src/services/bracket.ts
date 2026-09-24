import { BracketRound, BracketSide, Matchup, Player } from "../types";

/**
 * The bracket for a room of players: single elimination, or double
 * elimination when the host opens the game with a loser's bracket.
 *
 * Every round pairs each surviving player against exactly one opponent. The
 * pairing is fixed for the whole round; the round's questions run against that
 * pairing, and whoever scores more of that round's points advances. The odd
 * player out gets a bye and advances without a matchup.
 *
 * With a loser's bracket both halves play in the same round — one spin of the
 * wheel, one set of questions, every matchup in the room at once. A player who
 * loses in the winners' bracket drops into the loser's bracket for the next
 * round; a player who loses there is out. When one player is left on each side
 * they meet in a grand final, and whoever wins that takes the night.
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

/**
 * Matchup ids, per side. The winners' side keeps the id every matchup had
 * before there was a loser's bracket, so a game saved by an older build still
 * lines up with the lanes it dealt.
 */
const ID_PREFIX: Record<BracketSide, string> = {
  winners: "m",
  losers: "l",
  final: "f",
};

/** Which side of the bracket a matchup is on. Older matchups are all winners. */
export const sideOf = (matchup: Matchup): BracketSide =>
  matchup.bracket ?? "winners";

/** What each side is called on screen. */
export const SIDE_LABELS: Record<BracketSide, string> = {
  winners: "Winners' bracket",
  losers: "Loser's bracket",
  final: "Grand final",
};

/** The matchup a lane plays out, so a screen can say which bracket it is in. */
export const matchupById = (
  rounds: BracketRound[],
  matchupId: string | null,
): Matchup | undefined =>
  matchupId
    ? rounds.flatMap((round) => round.matchups).find((m) => m.id === matchupId)
    : undefined;

/** Pair an ordered list of player ids into matchups, last one out gets a bye. */
const pair = (
  roundNumber: number,
  playerIds: string[],
  side: BracketSide = "winners",
): Matchup[] => {
  const matchups: Matchup[] = [];

  for (let i = 0; i < playerIds.length; i += 2) {
    const playerAId = playerIds[i];
    const playerBId = playerIds[i + 1] ?? null;
    matchups.push({
      id: `r${roundNumber}-${ID_PREFIX[side]}${matchups.length + 1}`,
      roundNumber,
      bracket: side,
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
  matchups: pair(1, shuffle(players.map((p) => p.id)), "winners"),
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
  matchups: pair(roundNumber, withByeLast(advancingIds, playedRounds), "winners"),
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

/* ------------------------------------------------------------------ *
 * Settling a round, on either side of the bracket
 * ------------------------------------------------------------------ */

/** Everything a finished round decides, for the game to act on. */
export interface RoundOutcome {
  /** The round, with every matchup settled on its points. */
  round: BracketRound;
  /** Nobody has beaten these yet, in bracket order. */
  winnersIds: string[];
  /** Lost once and still alive, in the order the next draw should pair them. */
  losersIds: string[];
  /** Knocked out of the bracket by this round. */
  eliminatedIds: string[];
  /** Set once the bracket has one player left in it. */
  championId: string | null;
  /** The next round's draw, or null when the bracket is decided or out of rounds. */
  nextRound: BracketRound | null;
}

/**
 * Line the loser's bracket up for its next draw: the players who survived it
 * this round against the players who have just dropped into it.
 *
 * That is how a loser's bracket is normally fed — somebody who has already
 * come through it meets somebody fresh from the winners' side — and pairing
 * the two lists alternately gets it without chance playing any part. Whoever
 * is left over when the lists are uneven lines up at the end, where the bye
 * is handed out.
 */
const interleave = (survivors: string[], dropped: string[]): string[] => {
  const order: string[] = [];
  const longest = Math.max(survivors.length, dropped.length);
  for (let i = 0; i < longest; i++) {
    if (survivors[i]) order.push(survivors[i]);
    if (dropped[i]) order.push(dropped[i]);
  }
  return order;
};

/**
 * Decide a round and draw the next one.
 *
 * Without a loser's bracket this is exactly the single-elimination game it
 * always was: the winners are paired in bracket order and everybody else is
 * out. With one, a first loss drops a player into the loser's bracket, a loss
 * there knocks them out, and the last player on each side meet in a grand
 * final. The final is one match — there is no reset if the loser's-bracket
 * player wins it, because every round is a spin of the wheel and the wheel
 * runs out.
 *
 * While one side still has a field and the other is down to a single player,
 * that player takes a bye each round: they keep answering and banking points,
 * they simply have nobody to be drawn against until the other side catches up.
 */
export const settleRound = (
  round: BracketRound,
  players: Player[],
  options: {
    losersBracket: boolean;
    /** Every round before this one, for handing out byes fairly. */
    playedRounds: BracketRound[];
    /** False when this was the last round the game has questions for. */
    hasMoreRounds: boolean;
  },
): RoundOutcome => {
  const { round: resolved } = resolveRound(round, players);
  const present = new Set(players.map((p) => p.id));

  const winnersIds: string[] = [];
  const survivors: string[] = [];
  const dropped: string[] = [];
  const eliminatedIds: string[] = [];
  let championId: string | null = null;

  for (const matchup of resolved.matchups) {
    const ids = [matchup.playerAId, matchup.playerBId].filter(
      (id): id is string => id !== null && present.has(id),
    );
    const winner = matchup.winnerId;
    const losers = ids.filter((id) => id !== winner);

    switch (sideOf(matchup)) {
      case "winners":
        if (winner) winnersIds.push(winner);
        if (options.losersBracket) dropped.push(...losers);
        else eliminatedIds.push(...losers);
        break;
      case "losers":
        if (winner) survivors.push(winner);
        eliminatedIds.push(...losers);
        break;
      case "final":
        championId = winner;
        eliminatedIds.push(...losers);
        break;
    }
  }

  const losersIds = interleave(survivors, dropped);
  const alive = [...winnersIds, ...losersIds];

  // A final settles it, and so does a bracket with one player left in it —
  // which is how a game without a loser's bracket has always ended.
  if (!championId && alive.length <= 1) championId = alive[0] ?? null;

  const history = [...options.playedRounds, resolved];
  const roundNumber = round.roundNumber + 1;
  let nextRound: BracketRound | null = null;

  if (!championId && options.hasMoreRounds) {
    if (!options.losersBracket) {
      nextRound = buildNextRound(roundNumber, winnersIds, history);
    } else if (winnersIds.length === 1 && losersIds.length === 1) {
      nextRound = {
        roundNumber,
        matchups: pair(roundNumber, [winnersIds[0], losersIds[0]], "final"),
        resolved: false,
      };
    } else {
      nextRound = {
        roundNumber,
        matchups: [
          ...pair(roundNumber, withByeLast(winnersIds, history), "winners"),
          ...pair(roundNumber, withByeLast(losersIds, history), "losers"),
        ],
        resolved: false,
      };
    }
  }

  return {
    round: resolved,
    winnersIds,
    losersIds,
    eliminatedIds,
    championId,
    nextRound,
  };
};

/**
 * How many rounds a bracket of this size needs, at most, to be decided.
 *
 * Single elimination halves the field every round. Double elimination runs
 * both sides at once: the winners' side halves, the loser's side halves and
 * takes in everyone the winners' side just dropped, and the two champions
 * need one more round to meet. Eight players is three rounds without a
 * loser's bracket and six with one — worth knowing before loading three.
 */
export const roundsToDecide = (
  playerCount: number,
  losersBracket: boolean,
): number => {
  if (playerCount < 2) return 0;

  let winners = playerCount;
  let losers = 0;
  let rounds = 0;

  while (winners + losers > 1) {
    rounds += 1;
    if (losersBracket && winners === 1 && losers === 1) break; // the final
    const beaten = Math.floor(winners / 2);
    winners = Math.ceil(winners / 2);
    losers = losersBracket ? Math.ceil(losers / 2) + beaten : 0;
  }

  return rounds;
};

/**
 * Order the players still standing, for a night whose rounds ran out before
 * the bracket decided it.
 *
 * Somebody nobody has beaten outranks somebody who has already lost once,
 * whatever their totals — the bracket is the competition and the score is the
 * tiebreak. Then the score, then the draw.
 */
export const rankStanding = (
  players: Player[],
  drawOrder: string[],
): Player[] => {
  const seed = new Map(drawOrder.map((id, index) => [id, index]));
  const seedOf = (id: string) => seed.get(id) ?? Number.MAX_SAFE_INTEGER;

  return [...players].sort(
    (a, b) =>
      Number(Boolean(a.losersBracket)) - Number(Boolean(b.losersBracket)) ||
      b.score - a.score ||
      seedOf(a.id) - seedOf(b.id),
  );
};
